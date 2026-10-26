import { searchBooks } from "../server/openlibrary.js";
import { HttpError, handle, json } from "../server/http.js";

// GET /api/booksearch?q=...   Book search for adding a book to a club (Open Library; cached a day).
export const GET = handle(async (req) => {
  const q = (new URL(req.url).searchParams.get("q") || "").slice(0, 120);
  if (q.trim().length < 2) throw new HttpError("Type at least 2 letters.");
  try {
    return json({ results: await searchBooks(q) }, { cacheSeconds: 86400 });
  } catch {
    throw new HttpError("Book search isn't responding. Try again, or type the title and author yourself.", 502);
  }
});
