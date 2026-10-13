// Run with: npm test
// Outside services (Goodreads, BiblioCommons, ScraperAPI) are simulated with a fake fetch.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { parseGoodreadsId, parseRssItems, fetchShelf } from "../server/goodreads.js";
import { checkBook, resetBreakers } from "../server/catalog.js";
import { mapLimit } from "../server/http.js";
import { clearMemoryCache } from "../server/cache.js";
import { parseRecommendations } from "../server/ai.js";
import { POST as shelfRoute } from "../api/shelf.js";
import { POST as availabilityRoute } from "../api/availability.js";
import { GET as configRoute } from "../api/config.js";

type Handler = (url: string) => Response | Promise<Response>;
const calls: string[] = [];
function mockFetch(handler: Handler) {
  calls.length = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    return handler(url);
  }) as typeof fetch;
}

const rssItem = (n: number) => `<item><title><![CDATA[Book ${n} (Series #${n})]]></title><link>https://www.goodreads.com/review/show/${n}</link>
<book_id>${n}</book_id><author_name>Author ${n}</author_name><isbn>97800000000${String(n).padStart(2, "0")}</isbn>
<book_medium_image_url>https://img/${n}.jpg</book_medium_image_url></item>`;
const rss = (from: number, count: number) =>
  `<?xml version="1.0"?><rss><channel><title>Jane's bookshelf: to-read</title>${Array.from({ length: count }, (_, i) => rssItem(from + i)).join("")}</channel></rss>`;

const bib = (id: string, available: number, total: number) => ({
  catalogSearch: {},
  entities: {
    bibs: {
      [id]: {
        id,
        briefInfo: { title: "Tress of the Emerald Sea", format: "BK" },
        availability: { statusType: available > 0 ? "AVAILABLE" : "UNAVAILABLE", availableCopies: available, totalCopies: total, heldCopies: 3 },
      },
    },
  },
});
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

beforeEach(() => {
  resetBreakers();
  clearMemoryCache();
  delete process.env.SCRAPERAPI_KEY;
  delete process.env.BRIGHTDATA_API_KEY;
  delete process.env.BRIGHTDATA_ZONE;
  delete process.env.AI_PROVIDER;
});

test("Goodreads ID: number, slug, and profile link all work", () => {
  assert.equal(parseGoodreadsId("144932103"), "144932103");
  assert.equal(parseGoodreadsId("144932103-remy"), "144932103");
  assert.equal(parseGoodreadsId("https://www.goodreads.com/user/show/144932103-remy-carter"), "144932103");
  assert.equal(parseGoodreadsId("goodreads.com/review/list/144932103?shelf=to-read"), "144932103");
  assert.equal(parseGoodreadsId("jane"), null);
  assert.equal(parseGoodreadsId(""), null);
});

test("RSS parsing pulls title, author, ISBN and cover", () => {
  const [b] = parseRssItems(rss(1, 1));
  assert.equal(b.title, "Book 1 (Series #1)");
  assert.equal(b.author, "Author 1");
  assert.equal(b.isbn, "9780000000001");
  assert.equal(b.imageUrl, "https://img/1.jpg");
});

test("shelf of 252 books loads all three pages", async () => {
  mockFetch((url) => {
    const page = Number(new URL(url).searchParams.get("page"));
    const sizes = [100, 100, 52];
    const size = sizes[page - 1] ?? 0;
    return new Response(rss((page - 1) * 100 + 1, size));
  });
  const shelf = await fetchShelf("123");
  assert.equal(shelf.books.length, 252);
  assert.equal(shelf.shelfTitle, "Jane's bookshelf: to-read");
});

test("private shelf gives a clear message", async () => {
  mockFetch(() => new Response("nope", { status: 403 }));
  await assert.rejects(fetchShelf("123"), /private/);
});

test("available book links to its catalog record", async () => {
  mockFetch(() => ok(bib("S75C123", 6, 15)));
  const r = await checkBook({ title: "Tress of the Emerald Sea (Hoid's Travails)", author: "Brandon Sanderson", isbn: "9781250899651" }, "bpl");
  assert.equal(r.status, "available");
  assert.equal(r.availableCopies, 6);
  assert.equal(r.totalCopies, 15);
  assert.equal(r.catalogUrl, "https://bpl.bibliocommons.com/v2/record/S75C123");
  assert.equal(calls.length, 1, "ISBN search found it, so no extra searches");
});

test("no match → not in catalog, with a search link", async () => {
  mockFetch(() => ok({ catalogSearch: {}, entities: { bibs: {} } }));
  const r = await checkBook({ title: "Aether Corruption", author: "Daniel Schinhofen", isbn: "" }, "bpl");
  assert.equal(r.status, "not_found");
  assert.match(r.catalogUrl, /bpl\.bibliocommons\.com\/v2\/search\?query=Aether/);
});

test("blocked catalog falls back to ScraperAPI when a key is set", async () => {
  process.env.SCRAPERAPI_KEY = "test-key";
  mockFetch((url) => (url.startsWith("https://api.scraperapi.com") ? ok(bib("S1", 2, 4)) : new Response("", { status: 422 })));
  const r = await checkBook({ title: "Proxy Book", author: "A", isbn: "1" }, "bpl");
  assert.equal(r.status, "available");
  assert.ok(calls.some((c) => c.startsWith("https://api.scraperapi.com")));
});

test("blocked catalog + bad proxy key → 'couldn't check' with a catalog link, and the proxy is paused", async () => {
  process.env.SCRAPERAPI_KEY = "bad-key";
  mockFetch((url) => (url.startsWith("https://api.scraperapi.com") ? new Response("", { status: 401 }) : new Response("", { status: 403 })));
  const r = await checkBook({ title: "Blocked Book", author: "A", isbn: "2" }, "bpl");
  assert.equal(r.status, "error");
  assert.match(r.catalogUrl, /bpl\.bibliocommons\.com\/v2\/search/);
  const before = calls.length;
  await checkBook({ title: "Another Book", author: "B", isbn: "3" }, "bpl");
  assert.equal(calls.length, before, "both paths are paused, so no wasted requests");
});

test("blocked catalog uses Bright Data first, sending the key in a header and the zone in the body", async () => {
  process.env.BRIGHTDATA_API_KEY = "bd-key";
  process.env.BRIGHTDATA_ZONE = "web_unlocker1";
  process.env.SCRAPERAPI_KEY = "sa-key";
  let seen: { auth?: string | null; body?: any } = {};
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    if (url === "https://api.brightdata.com/request") {
      seen = { auth: new Headers(init?.headers).get("authorization"), body: JSON.parse(String(init?.body)) };
      return ok(bib("S2", 3, 5));
    }
    return new Response("", { status: 403 });
  }) as typeof fetch;
  calls.length = 0;
  const r = await checkBook({ title: "Bright Book", author: "A", isbn: "4" }, "bpl");
  assert.equal(r.status, "available");
  assert.equal(seen.auth, "Bearer bd-key");
  assert.equal(seen.body.zone, "web_unlocker1");
  assert.equal(seen.body.format, "raw");
  assert.match(seen.body.url, /gateway\.bibliocommons\.com\/v2\/libraries\/bpl/);
  assert.ok(!calls.some((c) => c.includes("scraperapi")), "ScraperAPI not needed when Bright Data works");
});

test("Bright Data refusing the key falls through to ScraperAPI", async () => {
  process.env.BRIGHTDATA_API_KEY = "bad";
  process.env.BRIGHTDATA_ZONE = "z";
  process.env.SCRAPERAPI_KEY = "sa-key";
  mockFetch((url) =>
    url.startsWith("https://api.brightdata.com") ? new Response("", { status: 401 })
    : url.startsWith("https://api.scraperapi.com") ? ok(bib("S3", 1, 2))
    : new Response("", { status: 403 }));
  const r = await checkBook({ title: "Fallthrough Book", author: "A", isbn: "5" }, "bpl");
  assert.equal(r.status, "available");
});

test("checks run in parallel, not one at a time", async () => {
  let running = 0;
  let peak = 0;
  const start = Date.now();
  await mapLimit(Array.from({ length: 20 }), 5, async () => {
    running++;
    peak = Math.max(peak, running);
    await new Promise((r) => setTimeout(r, 50));
    running--;
  });
  assert.equal(peak, 5);
  assert.ok(Date.now() - start < 400, "20 × 50 ms in groups of 5 takes about 200 ms, not 1 s");
});

test("API: /api/shelf rejects a bad ID with a helpful message", async () => {
  const res = await shelfRoute(new Request("http://x/api/shelf", { method: "POST", body: JSON.stringify({ userId: "jane" }) }));
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /Goodreads user ID/);
});

test("API: /api/availability returns one result per book, in order", async () => {
  mockFetch((url) => (url.includes("query=111") ? ok(bib("S9", 1, 1)) : ok({ catalogSearch: {}, entities: { bibs: {} } })));
  const res = await availabilityRoute(
    new Request("http://x/api/availability", {
      method: "POST",
      body: JSON.stringify({
        library: "bpl",
        books: [
          { key: "a", title: "Found", author: "X", isbn: "111" },
          { key: "b", title: "Missing", author: "Y", isbn: "" },
        ],
      }),
    }),
  );
  const body = await res.json();
  assert.deepEqual(body.results.map((r: { key: string }) => r.key), ["a", "b"]);
  assert.equal(body.results[0].result.status, "available");
  assert.equal(body.results[1].result.status, "not_found");
});

test("API: recommendations stay off until an AI provider is configured", async () => {
  assert.deepEqual(await configRoute().json(), { recommendations: false });
  process.env.AI_PROVIDER = "anthropic";
  process.env.AI_API_KEY = "k";
  process.env.AI_MODEL = "m";
  assert.deepEqual(await configRoute().json(), { recommendations: true });
  delete process.env.AI_API_KEY;
  delete process.env.AI_MODEL;
});

test("AI replies are parsed even with extra text around the list", () => {
  const recs = parseRecommendations('Sure! Here you go:\n[{"title":"Piranesi","author":"Susanna Clarke","reason":"Like X."}]\nEnjoy');
  assert.equal(recs.length, 1);
  assert.equal(recs[0].title, "Piranesi");
});

const bibsOf = (list: Array<{ id: string; title: string; format: string; year?: string; isbn?: string; avail: number; total: number; holds?: number; authors?: string[] }>) => ({
  catalogSearch: {},
  entities: {
    bibs: Object.fromEntries(
      list.map((b) => [
        b.id,
        {
          id: b.id,
          briefInfo: { title: b.title, format: b.format, publicationDate: b.year, isbns: b.isbn ? [b.isbn] : [], authors: b.authors ?? ["Clarke, Susanna"] },
          availability: { availableCopies: b.avail, totalCopies: b.total, heldCopies: b.holds ?? 0 },
        },
      ]),
    ),
  },
});

test("editions: lists every edition, leads with an available print copy, drops unrelated books", async () => {
  mockFetch(() =>
    ok(
      bibsOf([
        { id: "E1", title: "Piranesi", format: "EBOOK", year: "2020", avail: 0, total: 30, holds: 12 },
        { id: "B1", title: "Piranesi", format: "BK", year: "2020", isbn: "9781635575637", avail: 4, total: 9 },
        { id: "L1", title: "Piranesi", format: "LPRINT", year: "2021", avail: 0, total: 2 },
        { id: "S1", title: "Study Guide to Piranesi", format: "BK", avail: 3, total: 3, authors: ["Guides, Book"] },
      ]),
    ),
  );
  const r = await checkBook({ title: "Piranesi", author: "Susanna Clarke", isbn: "" }, "bpl");
  assert.equal(r.status, "available");
  assert.equal(r.editions?.length, 3, "study guide is not an edition of the book");
  assert.equal(r.editions?.[0].id, "B1");
  assert.equal(r.editions?.[0].year, "2020");
  assert.equal(r.catalogUrl, "https://bpl.bibliocommons.com/v2/record/B1");
});

test("ownership vs availability: owned but every copy out is 'checked_out', with holds", async () => {
  mockFetch(() =>
    ok(bibsOf([{ id: "B2", title: "Piranesi", format: "BK", avail: 0, total: 6, holds: 21 }, { id: "E2", title: "Piranesi", format: "EBOOK", avail: 0, total: 10, holds: 40 }])),
  );
  const r = await checkBook({ title: "Piranesi", author: "Susanna Clarke", isbn: "" }, "bpl");
  assert.equal(r.status, "checked_out");
  assert.equal(r.totalCopies, 6);
  assert.equal(r.heldCopies, 21);
});

test("exact edition: the reader's own ISBN leads when it's available", async () => {
  mockFetch(() =>
    ok(
      bibsOf([
        { id: "A", title: "Piranesi", format: "BK", isbn: "9781111111111", avail: 2, total: 5 },
        { id: "M", title: "Piranesi", format: "BK", isbn: "9781635575637", avail: 1, total: 2 },
      ]),
    ),
  );
  const r = await checkBook({ title: "Piranesi", author: "Susanna Clarke", isbn: "9781635575637" }, "bpl");
  assert.equal(r.editions?.[0].id, "M");
  assert.equal(r.exactEdition, true);
});
