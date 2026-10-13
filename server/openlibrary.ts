// Free "More like this" using Open Library (openlibrary.org): no key, no cost.
//
// - Books on the reader's list are scored by subjects they share with the picked book
//   (rarer subjects count more) plus a bonus for the same author.
// - New books come from an Open Library search on the picked book's most specific subjects,
//   most-read first, skipping anything already on the list.
// Subject lookups are cached for 30 days, so a list gets faster the more it's used.

import { cacheGet, cacheSet } from "./cache.js";
import { fetchWithTimeout, mapLimit } from "./http.js";
import type { ShelfEntry, SimilarResult } from "./similar.js";

const OL = "https://openlibrary.org";
// Open Library asks apps to identify themselves.
const HEADERS = { "User-Agent": "ShelfToStacks/1.0 (library availability app)", Accept: "application/json" };
const MAX_ON_LIST = 8;
const MAX_NEW = 6;
const LOOKUP_BUDGET_MS = 20_000;

// Subjects that say nothing about what a book is like.
const GENERIC = new Set([
  "fiction", "nonfiction", "non fiction", "accessible book", "protected daisy", "in library", "lending library",
  "large type books", "large print books", "open library staff picks", "new york times bestseller",
  "new york times reviewed", "english fiction", "american fiction", "fiction general", "general",
  "novel", "novels", "literature", "english literature", "american literature", "reading level grade 11",
  "reading level grade 12", "books and reading", "fiction in english", "long now manual for civilization",
  "translations into english", "audiobooks", "electronic books", "large type", "juvenile fiction",
]);

export type Work = { key: string; title: string; author: string; subjects: string[] };

export function normSubject(s: string) {
  return s
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanSubjects(raw: unknown): string[] {
  const out = new Set<string>();
  for (const s of Array.isArray(raw) ? raw : []) {
    const n = normSubject(String(s));
    if (!n || n.length > 40 || GENERIC.has(n) || /^(nyt|reading level|award|accessible)/.test(n) || /\d{4}/.test(n)) continue;
    out.add(n);
  }
  return [...out].slice(0, 40);
}

const normTitle = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .split(":")[0]
    .replace(/^(the|a|an)\s+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const lastName = (a: string) => (a.toLowerCase().includes(",") ? a.split(",")[0] : a.split(/\s+/).pop() ?? "").toLowerCase().replace(/[^a-z]/g, "");

/** Finds a book's subjects on Open Library (cached for 30 days; misses cached for a day). */
export async function lookupWork(b: ShelfEntry): Promise<Work | null> {
  const title = b.title.replace(/\([^)]*\)/g, "").split(":")[0].trim();
  const key = `ol:v1:${normTitle(title)}|${lastName(b.author)}`;
  const cached = await cacheGet<Work | { miss: true }>(key);
  if (cached) return "miss" in cached ? null : cached;
  const params = new URLSearchParams({ title, limit: "1", fields: "key,title,author_name,subject" });
  if (b.author) params.set("author", b.author);
  try {
    const res = await fetchWithTimeout(`${OL}/search.json?${params}`, { headers: HEADERS }, 8_000);
    if (!res.ok) return null;
    const doc = ((await res.json()) as { docs?: any[] }).docs?.[0];
    if (!doc) {
      await cacheSet(key, { miss: true }, 24 * 3600);
      return null;
    }
    const work: Work = { key: String(doc.key), title: String(doc.title ?? title), author: String(doc.author_name?.[0] ?? b.author), subjects: cleanSubjects(doc.subject) };
    await cacheSet(key, work, 30 * 24 * 3600);
    return work;
  } catch {
    return null;
  }
}

/** Scores the reader's list against the picked book. Pure, so it can be tested. */
export function rankOnList(seed: Work, seedAuthor: string, shelf: ShelfEntry[], works: Array<Work | null>) {
  // How many list books carry each subject: rarer shared subjects mean more.
  const freq = new Map<string, number>();
  for (const w of works) for (const s of w?.subjects ?? []) freq.set(s, (freq.get(s) ?? 0) + 1);
  const seedSubjects = new Set(seed.subjects);
  const seedLast = lastName(seedAuthor || seed.author);
  const seedTitle = normTitle(seed.title);

  const scored = shelf
    .map((b, index) => {
      const w = works[index];
      if (normTitle(b.title) === seedTitle) return null;
      const shared = (w?.subjects ?? []).filter((s) => seedSubjects.has(s));
      const sameAuthor = !!seedLast && lastName(b.author) === seedLast;
      const score = shared.reduce((sum, s) => sum + 1 / Math.log2(1 + (freq.get(s) ?? 1)), 0) + (sameAuthor ? 2 : 0);
      if (score < 1) return null; // too little in common to be worth showing
      const top = shared.sort((a, c) => (freq.get(a) ?? 0) - (freq.get(c) ?? 0)).slice(0, 3);
      const reason = [sameAuthor ? `Also by ${b.author || seed.author}` : "", top.length ? `Shares: ${top.join(", ")}` : ""]
        .filter(Boolean)
        .join(" · ");
      return { index, score, reason };
    })
    .filter((x): x is { index: number; score: number; reason: string } => !!x)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_ON_LIST);
  return scored.map(({ index, reason }) => ({ index, reason }));
}

/** The picked book's most specific subjects (the ones fewest list books share), for searching. */
function searchSubjects(seed: Work, works: Array<Work | null>) {
  const freq = new Map<string, number>();
  for (const w of works) for (const s of w?.subjects ?? []) freq.set(s, (freq.get(s) ?? 0) + 1);
  return [...seed.subjects]
    .filter((s) => s.split(" ").length <= 4)
    .sort((a, b) => (freq.get(a) ?? 0) - (freq.get(b) ?? 0))
    .slice(0, 4);
}

async function findNewBooks(seed: Work, subjects: string[], shelf: ShelfEntry[]) {
  const onList = new Set([...shelf.map((b) => normTitle(b.title)), normTitle(seed.title)]);
  const out: SimilarResult["newBooks"] = [];
  const seenAuthors = new Map<string, number>();
  // Two subjects together first (more specific), then one at a time.
  const queries = [subjects.slice(0, 2), subjects.slice(0, 1), subjects.slice(1, 2), subjects.slice(2, 3)].filter((q) => q.length);
  for (const q of queries) {
    if (out.length >= MAX_NEW) break;
    const params = new URLSearchParams({
      q: q.map((s) => `subject:"${s}"`).join(" AND "),
      sort: "readinglog",
      limit: "40",
      fields: "key,title,author_name,subject",
    });
    try {
      const res = await fetchWithTimeout(`${OL}/search.json?${params}`, { headers: HEADERS }, 8_000);
      if (!res.ok) continue;
      for (const d of ((await res.json()) as { docs?: any[] }).docs ?? []) {
        const title = String(d.title ?? "");
        const author = String(d.author_name?.[0] ?? "");
        const key = normTitle(title);
        if (!title || onList.has(key) || out.some((o) => normTitle(o.title) === key)) continue;
        const a = lastName(author);
        if ((seenAuthors.get(a) ?? 0) >= 1) continue; // keep the list varied: one book per author
        seenAuthors.set(a, (seenAuthors.get(a) ?? 0) + 1);
        const shared = cleanSubjects(d.subject).filter((s) => seed.subjects.includes(s)).slice(0, 3);
        out.push({ title, author, reason: shared.length ? `Shares: ${shared.join(", ")}` : `Popular in ${q.join(" & ")}` });
        if (out.length >= MAX_NEW) break;
      }
    } catch {
      /* try the next search */
    }
  }
  return out;
}

export async function similarFree(seed: ShelfEntry, shelf: ShelfEntry[]): Promise<SimilarResult> {
  const seedWork = await lookupWork(seed);
  if (!seedWork || seedWork.subjects.length === 0) {
    // Without subjects we can still match the same author on the list.
    const last = lastName(seed.author);
    return {
      onList: shelf
        .map((b, index) => ({ index, b }))
        .filter(({ b }) => last && lastName(b.author) === last && normTitle(b.title) !== normTitle(seed.title))
        .slice(0, MAX_ON_LIST)
        .map(({ index, b }) => ({ index, reason: `Also by ${b.author}` })),
      newBooks: [],
    };
  }
  // Look up the list's subjects, within a time budget; anything not reached is cached next time.
  const deadline = Date.now() + LOOKUP_BUDGET_MS;
  const works = await mapLimit(shelf.slice(0, 300), 8, async (b) => (Date.now() < deadline ? lookupWork(b) : null));
  const onList = rankOnList(seedWork, seed.author, shelf, works);
  const newBooks = await findNewBooks(seedWork, searchSubjects(seedWork, works), shelf);
  return { onList, newBooks };
}
