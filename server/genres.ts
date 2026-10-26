// Genres for a reader's list, from Open Library subjects (free, no key).
// Each book's answer is cached for 30 days; books Open Library doesn't know are cached for a week.

import { genresFromSubjects, type GenreId } from "../shared/genres.js";
import { cacheGet, cacheSet } from "./cache.js";
import { fetchWithTimeout, mapLimit } from "./http.js";

const OL = "https://openlibrary.org";
const HEADERS = { "User-Agent": "ShelfToStacks/1.0 (library availability app)", Accept: "application/json" };

export type GenreBook = { key: string; title: string; author: string; isbn: string };

/** null = couldn't look it up right now (try again later); [] = looked up, no genre fits. */
export async function genresFor(b: GenreBook): Promise<GenreId[] | null> {
  const title = b.title.replace(/\([^)]*\)/g, "").split(":")[0].trim();
  const cacheKey = `genres:v1:${b.isbn}|${title.toLowerCase()}|${b.author.toLowerCase()}`;
  const cached = await cacheGet<GenreId[]>(cacheKey);
  if (cached) return cached;

  const query = async (params: URLSearchParams) => {
    params.set("limit", "1");
    params.set("fields", "key,subject");
    const res = await fetchWithTimeout(`${OL}/search.json?${params}`, { headers: HEADERS }, 7_000);
    if (!res.ok) throw new Error(`Open Library ${res.status}`);
    return ((await res.json()) as { docs?: Array<{ subject?: string[] }> }).docs?.[0];
  };
  try {
    let doc = b.isbn ? await query(new URLSearchParams({ isbn: b.isbn })) : undefined;
    if (!doc?.subject?.length) {
      const p = new URLSearchParams({ title });
      if (b.author) p.set("author", b.author);
      doc = (await query(p)) ?? doc;
    }
    const genres = genresFromSubjects(doc?.subject ?? []);
    await cacheSet(cacheKey, genres, (doc ? 30 : 7) * 24 * 3600);
    return genres;
  } catch {
    return null;
  }
}

/** Looks up as many as fit in the time budget; the rest come back as null for the app to ask again. */
export async function genresForMany(books: GenreBook[], budgetMs = 40_000) {
  const stopAt = Date.now() + budgetMs;
  return mapLimit(books, 8, async (b) => ({ key: b.key, genres: Date.now() < stopAt ? await genresFor(b) : null }));
}
