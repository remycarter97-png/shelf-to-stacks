import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { cleanSubjects, rankOnList, similarFree, type Work } from "../server/openlibrary.js";
import { clearMemoryCache } from "../server/cache.js";
import { POST as similarRoute } from "../api/similar.js";

beforeEach(() => {
  clearMemoryCache();
  delete process.env.AI_PROVIDER;
  delete process.env.AI_API_KEY;
  delete process.env.AI_MODEL;
});

test("generic subjects are dropped", () => {
  assert.deepEqual(cleanSubjects(["Fiction", "Accessible book", "Magic", "nyt:hardcover-fiction=2020", "Labyrinths", "Fiction, general", "Large type books"]), ["magic", "labyrinths"]);
});

test("ranking: shared rare subjects and same author come first; unrelated books are left out", () => {
  const seed: Work = { key: "s", title: "Piranesi", author: "Susanna Clarke", subjects: ["magic", "labyrinths", "amnesia", "england"] };
  const shelf = [
    { title: "The Starless Sea", author: "Erin Morgenstern" },
    { title: "Jonathan Strange & Mr Norrell", author: "Susanna Clarke" },
    { title: "Project Hail Mary", author: "Andy Weir" },
    { title: "Piranesi", author: "Susanna Clarke" },
  ];
  const works: Array<Work | null> = [
    { key: "1", title: "The Starless Sea", author: "Erin Morgenstern", subjects: ["magic", "labyrinths", "libraries"] },
    { key: "2", title: "Jonathan Strange", author: "Susanna Clarke", subjects: ["magic", "england"] },
    { key: "3", title: "Project Hail Mary", author: "Andy Weir", subjects: ["space", "science"] },
    { key: "4", title: "Piranesi", author: "Susanna Clarke", subjects: ["magic"] },
  ];
  const r = rankOnList(seed, "Susanna Clarke", shelf, works);
  assert.deepEqual(r.map((x) => x.index), [1, 0], "same author + shared subjects first; never the picked book or unrelated ones");
  assert.match(r[0].reason, /Also by Susanna Clarke/);
  assert.match(r[1].reason, /labyrinths/);
});

function fakeOpenLibrary() {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const u = new URL(String(input));
    const q = u.searchParams.get("q");
    const title = u.searchParams.get("title");
    const doc = (t: string, a: string, subject: string[]) => ({ key: `/works/${t}`, title: t, author_name: [a], subject });
    if (title) {
      const db: Record<string, any> = {
        Piranesi: doc("Piranesi", "Susanna Clarke", ["Fiction", "Magic", "Labyrinths", "Amnesia"]),
        "The Starless Sea": doc("The Starless Sea", "Erin Morgenstern", ["Magic", "Labyrinths", "Libraries"]),
        "Project Hail Mary": doc("Project Hail Mary", "Andy Weir", ["Space"]),
      };
      return new Response(JSON.stringify({ docs: db[title] ? [db[title]] : [] }));
    }
    if (q) {
      return new Response(
        JSON.stringify({
          docs: [
            doc("The Starless Sea", "Erin Morgenstern", ["Magic", "Labyrinths"]), // on the list: skipped
            doc("The Night Circus", "Erin Morgenstern", ["Magic"]),
            doc("Another Morgenstern", "Erin Morgenstern", ["Magic"]), // same author again: skipped
            doc("House of Leaves", "Mark Z. Danielewski", ["Labyrinths"]),
          ],
        }),
      );
    }
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
}

test("free method end to end: list matches, then new books not on the list", async () => {
  fakeOpenLibrary();
  const shelf = [
    { title: "The Starless Sea", author: "Erin Morgenstern" },
    { title: "Project Hail Mary", author: "Andy Weir" },
  ];
  const r = await similarFree({ title: "Piranesi", author: "Susanna Clarke" }, shelf);
  assert.deepEqual(r.onList.map((x) => x.index), [0]);
  assert.deepEqual(r.newBooks.map((b) => b.title), ["The Night Circus", "House of Leaves"]);
});

test("API: with no AI key, answers come from Open Library", async () => {
  fakeOpenLibrary();
  const res = await similarRoute(
    new Request("http://x/api/similar", {
      method: "POST",
      body: JSON.stringify({ seed: { title: "Piranesi", author: "Susanna Clarke" }, shelf: [{ title: "The Starless Sea", author: "Erin Morgenstern" }] }),
    }),
  );
  const body = await res.json();
  assert.equal(body.source, "openlibrary");
  assert.equal(body.onList.length, 1);
});

test("API: if the AI fails, it falls back to Open Library", async () => {
  process.env.AI_PROVIDER = "openai";
  process.env.AI_API_KEY = "k";
  process.env.AI_MODEL = "m";
  fakeOpenLibrary();
  const ol = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) =>
    String(input).includes("openlibrary") ? ol(input, init) : new Response("rate limited", { status: 429 })) as typeof fetch;
  const res = await similarRoute(
    new Request("http://x/api/similar", {
      method: "POST",
      body: JSON.stringify({ seed: { title: "Piranesi", author: "Susanna Clarke" }, shelf: [{ title: "The Starless Sea", author: "Erin Morgenstern" }] }),
    }),
  );
  assert.equal((await res.json()).source, "openlibrary");
});

test("API: the reader can choose Open Library even when AI is set up", async () => {
  process.env.AI_PROVIDER = "openai";
  process.env.AI_API_KEY = "k";
  process.env.AI_MODEL = "m";
  fakeOpenLibrary();
  const ol = globalThis.fetch;
  let aiCalled = false;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!String(input).includes("openlibrary")) aiCalled = true;
    return ol(input, init);
  }) as typeof fetch;
  const res = await similarRoute(
    new Request("http://x/api/similar", {
      method: "POST",
      body: JSON.stringify({ mode: "openlibrary", seed: { title: "Piranesi", author: "Susanna Clarke" }, shelf: [{ title: "The Starless Sea", author: "Erin Morgenstern" }] }),
    }),
  );
  assert.equal((await res.json()).source, "openlibrary");
  assert.equal(aiCalled, false);
});
