// "More like this": for one chosen book, rank the reader's own list by similarity and
// suggest new books that aren't on it. One AI request does both.

import { askAi } from "./ai.js";
import { HttpError } from "./http.js";

export type ShelfEntry = { title: string; author: string };
export type SimilarOnList = { index: number; reason: string };
export type SimilarNew = { title: string; author: string; reason: string };
export type SimilarResult = { onList: SimilarOnList[]; newBooks: SimilarNew[] };

const MAX_ON_LIST = 8;
const MAX_NEW = 6;

export function buildSimilarPrompt(seed: ShelfEntry, shelf: ShelfEntry[]) {
  const list = shelf.map((b, i) => `${i}. "${b.title}"${b.author ? ` by ${b.author}` : ""}`).join("\n");
  return `You are a thoughtful librarian helping a reader choose what to read next.

The reader picked this book: "${seed.title}"${seed.author ? ` by ${seed.author}` : ""}.

Their want-to-read list (numbered):
${list}

Do two things:
1. From THEIR LIST ONLY, choose up to ${MAX_ON_LIST} books most similar to the picked book in themes, tone, style, genre or author. Skip the picked book itself. Order best match first. Only include real matches; fewer is fine.
2. Suggest ${MAX_NEW} books NOT on their list that a fan of the picked book would love. Real, published books only. No books from the list, no other editions of listed books, and no sequels to the picked book.

For each book give one short reason (under 15 words) that names what it shares with the picked book.

Reply with ONLY this JSON, no other text:
{"onList": [{"index": 3, "reason": "..."}], "newBooks": [{"title": "...", "author": "...", "reason": "..."}]}`;
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .split(":")[0]
    .replace(/^(the|a|an)\s+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Reads the AI reply and keeps only sensible entries. */
export function parseSimilar(text: string, seed: ShelfEntry, shelf: ShelfEntry[]): SimilarResult {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  let raw: any;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new HttpError("Couldn't read the recommendations. Try again.", 502);
  }
  const seedKey = norm(seed.title);
  const listKeys = new Set(shelf.map((b) => norm(b.title)));
  const seen = new Set<number>();
  const onList: SimilarOnList[] = [];
  for (const r of Array.isArray(raw?.onList) ? raw.onList : []) {
    const i = Number(r?.index);
    if (!Number.isInteger(i) || i < 0 || i >= shelf.length || seen.has(i)) continue;
    if (norm(shelf[i].title) === seedKey) continue; // never the picked book itself
    seen.add(i);
    onList.push({ index: i, reason: String(r?.reason ?? "").slice(0, 200) });
    if (onList.length >= MAX_ON_LIST) break;
  }
  const newBooks: SimilarNew[] = [];
  const newSeen = new Set<string>();
  for (const r of Array.isArray(raw?.newBooks) ? raw.newBooks : []) {
    const title = String(r?.title ?? "").trim().slice(0, 200);
    const author = String(r?.author ?? "").trim().slice(0, 120);
    const key = norm(title);
    // Drop anything already on the list (the AI sometimes repeats them) and duplicates.
    if (!title || !key || key === seedKey || listKeys.has(key) || newSeen.has(key)) continue;
    newSeen.add(key);
    newBooks.push({ title, author, reason: String(r?.reason ?? "").slice(0, 200) });
    if (newBooks.length >= MAX_NEW) break;
  }
  return { onList, newBooks };
}

export async function similarBooks(seed: ShelfEntry, shelf: ShelfEntry[]): Promise<SimilarResult> {
  return parseSimilar(await askAi(buildSimilarPrompt(seed, shelf)), seed, shelf);
}
