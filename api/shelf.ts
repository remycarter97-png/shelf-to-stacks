import { fetchShelf, parseGoodreadsId } from "../server/goodreads.js";
import { HttpError, handle, json, readJson } from "../server/http.js";
import { cacheGet, cacheSet } from "../server/cache.js";
import type { ShelfResponse } from "../shared/types.js";

// POST /api/shelf  { userId: "1234567" | "https://www.goodreads.com/user/show/1234567-jane", refresh?: boolean }
export const POST = handle(async (req) => {
  const body = await readJson<{ userId?: string; refresh?: boolean }>(req);
  const id = parseGoodreadsId(body.userId || "");
  if (!id) {
    throw new HttpError(
      "That doesn't look like a Goodreads user ID. Paste the number from your profile link, or the whole link.",
    );
  }
  const key = `shelf:v1:${id}`;
  if (!body.refresh) {
    const cached = await cacheGet<ShelfResponse>(key);
    if (cached) return json({ ...cached, userId: id });
  }
  const shelf = await fetchShelf(id);
  await cacheSet(key, shelf, 60 * 60);
  return json({ ...shelf, userId: id });
});
