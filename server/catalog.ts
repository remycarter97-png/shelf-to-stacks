// BiblioCommons availability lookups (Boston Public Library, or any library whose
// catalog lives at <code>.bibliocommons.com).
//
// Order of attempts for each search:
//   1. Direct request to the BiblioCommons gateway.
//   2. Bright Data Web Unlocker (when BRIGHTDATA_API_KEY and BRIGHTDATA_ZONE are set).
//   3. ScraperAPI (when SCRAPERAPI_KEY is set).
//   4. ScrapingAnt (when SCRAPINGANT_KEY is set). Its free plan allows one request at a time,
//      so requests to it wait their turn (and give up after a short wait).
// Every path has a circuit breaker so one bad stretch doesn't slow every book down:
//   - Direct blocked (403/422/429) → skip direct for 2 minutes.
//   - A proxy refuses the key or has no credits (401/402/403/407) → skip that proxy for 10 minutes.
// A book that can't be checked comes back as status "error" with a catalog search link,
// so the reader always has somewhere to go.

import type { Availability, Edition } from "../shared/types.js";
import { cacheGet, cacheSet } from "./cache.js";
import { BROWSER_UA, fetchWithTimeout } from "./http.js";

const DIRECT_TIMEOUT_MS = 7_000;
const PROXY_TIMEOUT_MS = 15_000;
const RESULT_TTL_SECONDS = 15 * 60;

const breaker = { directBlockedUntil: 0, brightdataOffUntil: 0, scraperapiOffUntil: 0, scrapingantOffUntil: 0 };

/** Exposed for tests. */
export function resetBreakers() {
  breaker.directBlockedUntil = 0;
  breaker.brightdataOffUntil = 0;
  breaker.scraperapiOffUntil = 0;
  breaker.scrapingantOffUntil = 0;
}

const KEY_REFUSED = new Set([401, 402, 403, 407]);

export function safeLibraryCode(lib: unknown): string {
  const l = String(lib || "bpl").toLowerCase().trim();
  return /^[a-z0-9-]{2,40}$/.test(l) ? l : "bpl";
}

export function catalogSearchUrl(lib: string, query: string) {
  return `https://${lib}.bibliocommons.com/v2/search?query=${encodeURIComponent(query)}&searchType=keyword`;
}

export function cleanTitle(title: string) {
  // "Tress of the Emerald Sea (Hoid's Travails)" → "Tress of the Emerald Sea"
  return title.replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
}

type FetchOutcome =
  | { kind: "ok"; json: any }
  | { kind: "blocked" } // the catalog refused us
  | { kind: "failed" }; // network error, timeout, or odd reply

async function readCatalogReply(res: Response): Promise<FetchOutcome> {
  if (res.status === 403 || res.status === 422 || res.status === 429 || res.status === 202) {
    return { kind: "blocked" };
  }
  if (!res.ok) return { kind: "failed" };
  const text = await res.text();
  if (!text.trim().startsWith("{")) return { kind: "blocked" }; // usually a bot-check page
  try {
    const json = JSON.parse(text);
    return json?.entities ? { kind: "ok", json } : { kind: "failed" };
  } catch {
    return { kind: "failed" };
  }
}

async function direct(target: string, lib: string): Promise<FetchOutcome> {
  if (Date.now() < breaker.directBlockedUntil) return { kind: "blocked" };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetchWithTimeout(
        target,
        {
          headers: {
            "User-Agent": BROWSER_UA,
            Accept: "application/json",
            Referer: `https://${lib}.bibliocommons.com/`,
          },
        },
        DIRECT_TIMEOUT_MS,
      );
      const out = await readCatalogReply(res);
      if (out.kind === "blocked") {
        breaker.directBlockedUntil = Date.now() + 2 * 60_000;
        return out;
      }
      if (out.kind === "ok") return out;
    } catch {
      // timeout or network error: try once more
    }
    await new Promise((r) => setTimeout(r, 250 + Math.random() * 250));
  }
  return { kind: "failed" };
}

async function viaBrightData(target: string): Promise<FetchOutcome> {
  const key = process.env.BRIGHTDATA_API_KEY;
  const zone = process.env.BRIGHTDATA_ZONE;
  if (!key || !zone || Date.now() < breaker.brightdataOffUntil) return { kind: "failed" };
  try {
    const res = await fetchWithTimeout(
      "https://api.brightdata.com/request",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ zone, url: target, format: "raw" }),
      },
      PROXY_TIMEOUT_MS,
    );
    if (KEY_REFUSED.has(res.status)) {
      console.warn(`Bright Data refused the request (HTTP ${res.status}); pausing it for 10 minutes. Check the API key, zone name and balance.`);
      breaker.brightdataOffUntil = Date.now() + 10 * 60_000;
      return { kind: "failed" };
    }
    return await readCatalogReply(res);
  } catch {
    return { kind: "failed" };
  }
}

async function viaScraperApi(target: string): Promise<FetchOutcome> {
  const key = process.env.SCRAPERAPI_KEY;
  if (!key || Date.now() < breaker.scraperapiOffUntil) return { kind: "failed" };
  // ScraperAPI only accepts the key in the address; this address is never logged.
  const url = `https://api.scraperapi.com/?api_key=${encodeURIComponent(key)}&url=${encodeURIComponent(target)}`;
  try {
    const res = await fetchWithTimeout(url, { headers: { Accept: "application/json" } }, PROXY_TIMEOUT_MS);
    if (KEY_REFUSED.has(res.status)) {
      console.warn(`ScraperAPI refused the key (HTTP ${res.status}); pausing it for 10 minutes.`);
      breaker.scraperapiOffUntil = Date.now() + 10 * 60_000;
      return { kind: "failed" };
    }
    return await readCatalogReply(res);
  } catch {
    return { kind: "failed" };
  }
}

// ScrapingAnt's free plan allows one request at a time, so requests line up here.
let antLine: Promise<unknown> = Promise.resolve();
const ANT_MAX_WAIT_MS = 30_000;

async function viaScrapingAnt(target: string): Promise<FetchOutcome> {
  const key = process.env.SCRAPINGANT_KEY;
  if (!key || Date.now() < breaker.scrapingantOffUntil) return { kind: "failed" };
  const queuedAt = Date.now();
  const run = antLine.then(async (): Promise<FetchOutcome> => {
    // Too long in line, or ScrapingAnt was paused while we waited: give up on this book.
    if (Date.now() - queuedAt > ANT_MAX_WAIT_MS || Date.now() < breaker.scrapingantOffUntil) return { kind: "failed" };
    // The key goes in the address, as ScrapingAnt documents; this address is never logged.
    const params = new URLSearchParams({ url: target, "x-api-key": key, browser: "false", timeout: "20" });
    try {
      const res = await fetchWithTimeout(`https://api.scrapingant.com/v2/general?${params}`, { headers: { Accept: "application/json" } }, 25_000);
      if (res.status === 403 || res.status === 422) {
        // 403: wrong key or the month's credits are used up. 422: missing key or bad settings.
        console.warn(`ScrapingAnt refused the request (HTTP ${res.status}); pausing it for 10 minutes. Check the key and remaining credits.`);
        breaker.scrapingantOffUntil = Date.now() + 10 * 60_000;
        return { kind: "failed" };
      }
      if (res.status === 423) return { kind: "blocked" }; // the catalog spotted the scraper
      if (!res.ok) return { kind: "failed" }; // 404 unreachable/timeout, 409 busy, 500 server error
      // The catalog's own reply status comes in a header; a 200 here can still hide a block.
      const page = Number(res.headers.get("ant-page-status-code") || 200);
      return await readCatalogReply(new Response(await res.text(), { status: page >= 200 && page <= 599 ? page : 200 }));
    } catch {
      return { kind: "failed" };
    }
  });
  antLine = run.catch(() => undefined);
  return run;
}

async function search(lib: string, query: string): Promise<FetchOutcome> {
  const target = `https://gateway.bibliocommons.com/v2/libraries/${lib}/bibs/search?query=${encodeURIComponent(
    query,
  )}&searchType=keyword`;
  const first = await direct(target, lib);
  if (first.kind === "ok") return first;
  for (const proxy of [viaBrightData, viaScraperApi, viaScrapingAnt]) {
    const out = await proxy(target);
    if (out.kind === "ok") return out;
  }
  return first;
}

export async function checkBook(
  book: { title: string; author: string; isbn: string },
  libInput: string,
): Promise<Availability> {
  const lib = safeLibraryCode(libInput);
  const title = cleanTitle(book.title);
  const cacheKey = `av:v3:${lib}:${book.isbn}|${title.toLowerCase()}|${book.author.toLowerCase()}`;
  const cached = await cacheGet<Availability>(cacheKey);
  if (cached) return cached;

  const short = title.split(":")[0].trim();
  // Title + author first: one search returns every edition. ISBN search is the fallback for odd titles.
  const queries: Array<{ q: string; byIsbn: boolean }> = [];
  queries.push({ q: book.author ? `${short} ${book.author}` : short, byIsbn: false });
  if (book.isbn) queries.push({ q: book.isbn, byIsbn: true });
  if (short !== title) queries.push({ q: book.author ? `${title} ${book.author}` : title, byIsbn: false });

  const fallbackUrl = catalogSearchUrl(lib, book.author ? `${title} ${book.author}` : title);
  let reachedCatalog = false;

  for (const { q, byIsbn } of queries) {
    const out = await search(lib, q);
    if (out.kind !== "ok") {
      // Catalog unreachable: don't burn time on the other searches.
      return { status: "error", catalogUrl: fallbackUrl };
    }
    reachedCatalog = true;
    const bibs: any[] = Object.values(out.json?.entities?.bibs || {});
    // A title search can also return study guides and other books; keep the ones that are this book.
    const matches = byIsbn ? bibs : bibs.filter((b) => sameWork(b?.briefInfo, short, book.author));
    if (!matches.length) continue;

    const editions = matches.map((b) => toEdition(b, lib)).filter((e): e is Edition => !!e);
    if (!editions.length) continue;
    const best = pickBest(editions, book.isbn);
    const ordered = [best, ...editions.filter((e) => e !== best)].slice(0, 12);
    const anyAvailable = editions.some((e) => e.availableCopies > 0);
    const anyOwned = editions.some((e) => e.totalCopies > 0);
    const anyOnOrder = editions.some((e) => e.onOrder);
    const result: Availability = {
      status: anyAvailable ? "available" : anyOwned ? "checked_out" : anyOnOrder ? "on_order" : "not_found",
      matchedTitle: best.title,
      availableCopies: best.availableCopies,
      totalCopies: best.totalCopies,
      heldCopies: best.heldCopies,
      format: best.format,
      catalogUrl: best.url,
      editions: ordered,
      exactEdition: !!book.isbn && best.isbn === book.isbn,
    };
    await cacheSet(cacheKey, result, RESULT_TTL_SECONDS);
    return result;
  }

  const result: Availability = { status: reachedCatalog ? "not_found" : "error", catalogUrl: fallbackUrl };
  if (result.status === "not_found") await cacheSet(cacheKey, result, RESULT_TTL_SECONDS);
  return result;
}

const normText = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .split(":")[0]
    .replace(/^(the|a|an)\s+/, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Same book (any edition)? Titles must match; the author's last name must appear when both are known. */
export function sameWork(info: any, title: string, author: string): boolean {
  const want = normText(title);
  const got = normText(info?.title);
  if (!want || !got) return false;
  if (!(got === want || got.startsWith(want + " ") || want.startsWith(got + " "))) return false;
  const last = normText(author).split(" ").pop();
  const authors = [info?.authors, info?.primaryAuthor].flat().filter(Boolean).map(normText).join(" ");
  return !last || !authors || authors.includes(last);
}

function toEdition(b: any, lib: string): Edition | null {
  if (!b?.id) return null;
  const info = b.briefInfo || {};
  const a = b.availability || {};
  const year = String(info.publicationDate ?? info.publicationYear ?? "").match(/\d{4}/)?.[0];
  const isbns: string[] = [info.isbns, info.isbn].flat().filter(Boolean).map((x: unknown) => String(x).replace(/[^0-9Xx]/g, ""));
  return {
    id: String(b.id),
    title: String(info.title ?? ""),
    format: info.format || a.bibType || undefined,
    year,
    edition: info.edition ? String(info.edition) : undefined,
    isbn: isbns.find((x) => x.length === 13) ?? isbns[0],
    availableCopies: Number(a.availableCopies ?? 0),
    totalCopies: Number(a.totalCopies ?? 0),
    heldCopies: Number(a.heldCopies ?? 0),
    onOrder: String(a.statusType ?? a.status ?? "").toUpperCase() === "ON_ORDER" || Number(a.onOrderCopies ?? 0) > 0,
    url: `https://${lib}.bibliocommons.com/v2/record/${b.id}`,
  };
}

/** Best edition to lead with: the reader's exact ISBN if available, else an available print book, else the most copies. */
function pickBest(eds: Edition[], isbn: string): Edition {
  const isBook = (e: Edition) => /^(BK|BOOK)$/i.test(String(e.format ?? ""));
  const score = (e: Edition) =>
    (e.availableCopies > 0 ? 1000 : 0) +
    (isbn && e.isbn === isbn ? 500 : 0) +
    (isBook(e) ? 100 : 0) +
    Math.min(e.totalCopies, 99);
  return eds.reduce((best, e) => (score(e) > score(best) ? e : best), eds[0]);
}
