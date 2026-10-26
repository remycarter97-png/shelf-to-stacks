import { genresForMany } from "../server/genres.js";
import { overLimit } from "../server/cache.js";
import { HttpError, clientIp, handle, json, readJson } from "../server/http.js";

// POST /api/genres  { books: [{ key, title, author, isbn }] }  (up to 40 per request)
// Returns { results: [{ key, genres: GenreId[] | null }] }; null means "try again later".
export const POST = handle(async (req) => {
  const body = await readJson<{ books?: Array<{ key?: string; title?: string; author?: string; isbn?: string }> }>(req);
  const books = (Array.isArray(body.books) ? body.books : [])
    .slice(0, 40)
    .map((b) => ({
      key: String(b?.key ?? "").slice(0, 200),
      title: String(b?.title ?? "").trim().slice(0, 200),
      author: String(b?.author ?? "").trim().slice(0, 120),
      isbn: String(b?.isbn ?? "").replace(/[^0-9Xx]/g, "").slice(0, 13),
    }))
    .filter((b) => b.key && b.title);
  if (books.length === 0) throw new HttpError("No books to look up.");
  if (await overLimit(`genres:${clientIp(req)}`, 120, 600)) {
    throw new HttpError("Too many genre lookups. Try again in a few minutes.", 429);
  }
  return json({ results: await genresForMany(books) });
});
