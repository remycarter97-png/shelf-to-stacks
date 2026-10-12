// BiblioCommons availability lookups (Boston Public Library, or any library whose
// catalog lives at <code>.bibliocommons.com).
//
// Order of attempts for each search:
//   1. Direct request to the BiblioCommons gateway.
//   2. Bright Data Web Unlocker (when BRIGHTDATA_API_KEY and BRIGHTDATA_ZONE are set).
//   3. ScraperAPI (when SCRAPERAPI_KEY is set).
// Every path has a circuit breaker so one bad stretch doesn't slow every book down:
//   - Direct blocked (403/422/429) → skip direct for 2 minutes.
//   - A proxy refuses the key or has no credits (401/402/403/407) → skip that proxy for 10 minutes.
// A book that can't be checked comes back as status "error" with a catalog search link,
// so the reader always has somewhere to go.

import type { Availability, Status } from "../shared/types.js";
import { cacheGet, cacheSet } from "./cache.js";
import { BROWSER_UA, fetchWithTimeout } from "./http.js";

const DIRECT_TIMEOUT_MS = 7_000;
const PROXY_TIMEOUT_MS = 15_000;
const RESULT_TTL_SECONDS = 15 * 60;

const breaker = { directBlockedUntil: 0, brightdataOffUntil: 0, scraperapiOffUntil: 0 };

/** Exposed for tests. */
export function resetBreakers() {
  breaker.directBlockedUntil = 0;
  breaker.brightdataOffUntil = 0;
  breaker.scraperapiOffUntil = 0;
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

function statusFrom(a: {
  statusType?: string;
  status?: string;
  availableCopies?: number;
  onOrderCopies?: number;
  totalCopies?: number;
}): Status {
  const t = String(a.statusType || a.status || "").toUpperCase();
  if (t === "AVAILABLE" || (a.availableCopies ?? 0) > 0) return "available";
  if (t === "ON_ORDER" || (a.onOrderCopies ?? 0) > 0) return "on_order";
  if ((a.totalCopies ?? 0) > 0) return "checked_out";
  return "not_found";
}

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

async function search(lib: string, query: string): Promise<FetchOutcome> {
  const target = `https://gateway.bibliocommons.com/v2/libraries/${lib}/bibs/search?query=${encodeURIComponent(
    query,
  )}&searchType=keyword`;
  const first = await direct(target, lib);
  if (first.kind === "ok") return first;
  for (const proxy of [viaBrightData, viaScraperApi]) {
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
  const cacheKey = `av:v2:${lib}:${book.isbn}|${title.toLowerCase()}|${book.author.toLowerCase()}`;
  const cached = await cacheGet<Availability>(cacheKey);
  if (cached) return cached;

  const queries: string[] = [];
  if (book.isbn) queries.push(book.isbn);
  queries.push(book.author ? `${title} ${book.author}` : title);
  // Long subtitles often stop a match; try the part before the colon too.
  const short = title.split(":")[0].trim();
  if (short && short !== title) queries.push(book.author ? `${short} ${book.author}` : short);

  const fallbackUrl = catalogSearchUrl(lib, book.author ? `${title} ${book.author}` : title);
  let reachedCatalog = false;

  for (const q of queries) {
    const out = await search(lib, q);
    if (out.kind !== "ok") {
      // Catalog unreachable: don't burn time on the other searches.
      return { status: "error", catalogUrl: fallbackUrl };
    }
    reachedCatalog = true;
    const bibs: Record<string, any> = out.json?.entities?.bibs || {};
    const ids = Object.keys(bibs);
    if (!ids.length) continue;

    // Prefer a record that has availability, and a physical book when there is one.
    const withAvail = ids.map((id) => bibs[id]).filter((b) => b?.availability);
    const chosen =
      withAvail.find((b) => /^(BK|BOOK)$/i.test(String(b?.briefInfo?.format || ""))) ??
      withAvail[0] ??
      bibs[ids[0]];
    const a = chosen.availability || {};
    const info = chosen.briefInfo || {};
    const result: Availability = {
      status: statusFrom(a),
      matchedTitle: info.title,
      availableCopies: a.availableCopies,
      totalCopies: a.totalCopies,
      heldCopies: a.heldCopies,
      format: info.format || a.bibType,
      catalogUrl: chosen.id
        ? `https://${lib}.bibliocommons.com/v2/record/${chosen.id}`
        : catalogSearchUrl(lib, q),
    };
    await cacheSet(cacheKey, result, RESULT_TTL_SECONDS);
    return result;
  }

  const result: Availability = { status: reachedCatalog ? "not_found" : "error", catalogUrl: fallbackUrl };
  if (result.status === "not_found") await cacheSet(cacheKey, result, RESULT_TTL_SECONDS);
  return result;
}
