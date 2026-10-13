import { similarBooks } from "../server/similar.js";
import { cacheGet, cacheSet, overLimit } from "../server/cache.js";
import { HttpError, clientIp, handle, json, readJson } from "../server/http.js";

// POST /api/similar  { seed: { title, author }, shelf: [{ title, author }] }
// Returns { onList: [{ index, reason }], newBooks: [{ title, author, reason }] }, where index points into shelf.
// Same limits as recommendations: 10 per visitor per 10 minutes, 300 per hour site-wide. Answers are cached for a week.
export const POST = handle(async (req) => {
  const body = await readJson<{ seed?: { title?: string; author?: string }; shelf?: Array<{ title?: string; author?: string }> }>(req);
  const seed = { title: String(body.seed?.title ?? "").trim().slice(0, 200), author: String(body.seed?.author ?? "").trim().slice(0, 120) };
  if (!seed.title) throw new HttpError("Pick a book first.");
  const shelf = (Array.isArray(body.shelf) ? body.shelf : []).slice(0, 300).map((b) => ({
    title: String(b?.title ?? "").slice(0, 200),
    author: String(b?.author ?? "").slice(0, 120),
  }));

  const key = `similar:v1:${await digest(JSON.stringify([seed, shelf]))}`;
  const cached = await cacheGet(key);
  if (cached) return json(cached);

  if (await overLimit(`sim:${clientIp(req)}`, 10, 600)) {
    throw new HttpError("You've asked for a lot of recommendations. Try again in a few minutes.", 429);
  }
  if (await overLimit("sim:all", 300, 3600)) {
    throw new HttpError("Recommendations are busy right now. Try again later.", 429);
  }
  const result = await similarBooks(seed, shelf);
  await cacheSet(key, result, 7 * 24 * 3600);
  return json(result);
});

async function digest(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}
