import { getBookInfo } from "../server/bookinfo.js";
import { HttpError, handle, json } from "../server/http.js";

// GET /api/bookinfo?title=...&author=...&isbn=...   (cached by Vercel's CDN for a day)
export const GET = handle(async (req) => {
  const u = new URL(req.url);
  const title = (u.searchParams.get("title") || "").slice(0, 300);
  if (!title) throw new HttpError("title is required.");
  const info = await getBookInfo(
    title,
    (u.searchParams.get("author") || "").slice(0, 200),
    (u.searchParams.get("isbn") || "").replace(/[^0-9Xx]/g, "").slice(0, 13),
  );
  return json(info, { cacheSeconds: info.found ? 86400 : 300 });
});
