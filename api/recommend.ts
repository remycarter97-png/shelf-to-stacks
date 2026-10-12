import { recommend } from "../server/ai.js";
import { overLimit } from "../server/cache.js";
import { HttpError, clientIp, handle, json, readJson } from "../server/http.js";

// POST /api/recommend  { books: [{ title, author }] }
// Limited to 5 requests per visitor per 10 minutes, and 200 per hour across the whole site,
// so nobody can run up your AI bill.
export const POST = handle(async (req) => {
  const body = await readJson<{ books?: Array<{ title?: string; author?: string }> }>(req);
  if (!Array.isArray(body.books) || body.books.length === 0) {
    throw new HttpError("Need at least one book to base recommendations on.");
  }
  if (await overLimit(`rec:${clientIp(req)}`, 5, 600)) {
    throw new HttpError("You've asked for a lot of recommendations. Try again in a few minutes.", 429);
  }
  if (await overLimit("rec:all", 200, 3600)) {
    throw new HttpError("Recommendations are busy right now. Try again later.", 429);
  }
  const books = body.books.slice(0, 250).map((b) => ({
    title: String(b?.title || "").slice(0, 200),
    author: String(b?.author || "").slice(0, 120),
  }));
  return json({ recommendations: await recommend(books) });
});
