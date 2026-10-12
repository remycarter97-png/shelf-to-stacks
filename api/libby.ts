import { checkLibby } from "../server/libby.js";
import { safeLibraryCode } from "../server/catalog.js";
import { HttpError, handle, json } from "../server/http.js";

// GET /api/libby?key=bpl&title=...&author=...   (cached by Vercel's CDN for 15 minutes)
export const GET = handle(async (req) => {
  const u = new URL(req.url);
  const title = (u.searchParams.get("title") || "").slice(0, 300);
  if (!title) throw new HttpError("title is required.");
  const out = await checkLibby(
    safeLibraryCode(u.searchParams.get("key")),
    title,
    (u.searchParams.get("author") || "").slice(0, 200),
  );
  return json(out, { cacheSeconds: out.status === "ok" ? 900 : 60 });
});
