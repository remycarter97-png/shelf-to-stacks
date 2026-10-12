import { checkBook, safeLibraryCode } from "../server/catalog.js";
import { HttpError, handle, json, mapLimit, readJson } from "../server/http.js";
import type { AvailabilityRequest, AvailabilityResponse } from "../shared/types.js";

const MAX_BOOKS = 20;
const CONCURRENCY = 5;

// POST /api/availability  { library: "bpl", books: [{ key, title, author, isbn }] }
export const POST = handle(async (req) => {
  const body = await readJson<Partial<AvailabilityRequest>>(req);
  if (!Array.isArray(body.books)) throw new HttpError("books must be a list.");
  const library = safeLibraryCode(body.library);
  const books = body.books.slice(0, MAX_BOOKS).map((b) => ({
    key: String(b?.key || ""),
    title: String(b?.title || "").slice(0, 300),
    author: String(b?.author || "").slice(0, 200),
    isbn: String(b?.isbn || "").replace(/[^0-9Xx]/g, "").slice(0, 13),
  }));
  const results = await mapLimit(books, CONCURRENCY, async (b) => ({
    key: b.key,
    result: await checkBook(b, library),
  }));
  return json({ results } satisfies AvailabilityResponse);
});
