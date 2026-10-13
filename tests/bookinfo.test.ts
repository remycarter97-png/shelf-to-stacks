import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { cleanDescription, getBookInfo } from "../server/bookinfo.js";
import { clearMemoryCache } from "../server/cache.js";

beforeEach(() => clearMemoryCache());

test("descriptions: both Open Library shapes, links and source notes cleaned", () => {
  assert.equal(cleanDescription("A house of endless halls."), "A house of endless halls.");
  assert.equal(
    cleanDescription({ value: "Piranesi lives in the [House](https://x).\n\n----------\nContains: Piranesi" }),
    "Piranesi lives in the House.",
  );
  assert.equal(cleanDescription(undefined), undefined);
});

test("looks up by ISBN first, then reads the work's description", async () => {
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("search.json")) {
      return new Response(
        JSON.stringify({
          docs: [{ key: "/works/OL1W", first_publish_year: 2020, number_of_pages_median: 272, subject: ["Fiction", "Magic", "Labyrinths"], cover_i: 42, ratings_average: 4.256, ratings_count: 900 }],
        }),
      );
    }
    if (url.endsWith("/works/OL1W.json")) return new Response(JSON.stringify({ description: { value: "A man lives in a house of statues." } }));
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
  const info = await getBookInfo("Piranesi", "Susanna Clarke", "9781635575637");
  assert.equal(info.found, true);
  assert.match(calls[0], /isbn=9781635575637/);
  assert.equal(info.description, "A man lives in a house of statues.");
  assert.equal(info.firstPublished, 2020);
  assert.equal(info.pages, 272);
  assert.deepEqual(info.subjects, ["magic", "labyrinths"]);
  assert.equal(info.coverUrl, "https://covers.openlibrary.org/b/id/42-L.jpg");
  assert.equal(info.ratingsAverage, 4.3);
});

test("not found is reported, not an error", async () => {
  globalThis.fetch = (async () => new Response(JSON.stringify({ docs: [] }))) as typeof fetch;
  const info = await getBookInfo("Some Unknown Book", "Nobody", "");
  assert.equal(info.found, false);
});
