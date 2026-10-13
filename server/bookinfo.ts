// Book details for the book page, from Open Library (free, no key):
// description, first published year, typical page count, subjects and a cover.

import { cacheGet, cacheSet } from "./cache.js";
import { fetchWithTimeout } from "./http.js";
import { cleanSubjects } from "./openlibrary.js";

const OL = "https://openlibrary.org";
const HEADERS = { "User-Agent": "ShelfToStacks/1.0 (library availability app)", Accept: "application/json" };

export type BookInfo = {
  found: boolean;
  description?: string;
  firstPublished?: number;
  pages?: number;
  subjects: string[];
  coverUrl?: string;
  openLibraryUrl?: string;
  ratingsAverage?: number;
  ratingsCount?: number;
};

/** Open Library descriptions are either a string or { value }, sometimes with markdown links and source notes. */
export function cleanDescription(raw: unknown): string | undefined {
  const text = typeof raw === "string" ? raw : typeof raw === "object" && raw && "value" in raw ? String((raw as { value: unknown }).value) : "";
  const cleaned = text
    .replace(/\r/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // [text](link) → text
    .replace(/\n-{3,}[\s\S]*$/, "") // trailing "----" source/notes block
    .replace(/\(\s*source:[^)]*\)\s*$/i, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return cleaned ? cleaned.slice(0, 2500) : undefined;
}

export async function getBookInfo(title: string, author: string, isbn: string): Promise<BookInfo> {
  const shortTitle = title.replace(/\([^)]*\)/g, "").split(":")[0].trim();
  const key = `info:v1:${isbn}|${shortTitle.toLowerCase()}|${author.toLowerCase()}`;
  const cached = await cacheGet<BookInfo>(key);
  if (cached) return cached;

  const fields = "key,title,author_name,first_publish_year,number_of_pages_median,subject,cover_i,ratings_average,ratings_count";
  const tryQuery = async (params: URLSearchParams) => {
    params.set("limit", "1");
    params.set("fields", fields);
    const res = await fetchWithTimeout(`${OL}/search.json?${params}`, { headers: HEADERS }, 8_000);
    if (!res.ok) return undefined;
    return ((await res.json()) as { docs?: any[] }).docs?.[0];
  };

  let doc: any;
  try {
    if (isbn) doc = await tryQuery(new URLSearchParams({ isbn }));
    if (!doc) {
      const p = new URLSearchParams({ title: shortTitle });
      if (author) p.set("author", author);
      doc = await tryQuery(p);
    }
  } catch {
    return { found: false, subjects: [] }; // not cached, so it's tried again next time
  }
  if (!doc) {
    const miss: BookInfo = { found: false, subjects: [] };
    await cacheSet(key, miss, 24 * 3600);
    return miss;
  }

  let description: string | undefined;
  try {
    const res = await fetchWithTimeout(`${OL}${doc.key}.json`, { headers: HEADERS }, 8_000);
    if (res.ok) description = cleanDescription(((await res.json()) as { description?: unknown }).description);
  } catch {
    /* description is optional */
  }

  const info: BookInfo = {
    found: true,
    description,
    firstPublished: typeof doc.first_publish_year === "number" ? doc.first_publish_year : undefined,
    pages: typeof doc.number_of_pages_median === "number" ? doc.number_of_pages_median : undefined,
    subjects: cleanSubjects(doc.subject).slice(0, 12),
    coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : undefined,
    openLibraryUrl: `${OL}${doc.key}`,
    ratingsAverage: typeof doc.ratings_average === "number" ? Math.round(doc.ratings_average * 10) / 10 : undefined,
    ratingsCount: typeof doc.ratings_count === "number" ? doc.ratings_count : undefined,
  };
  await cacheSet(key, info, 30 * 24 * 3600);
  return info;
}
