// Libby / OverDrive ebook and audiobook availability.
// Uses OverDrive's public "thunder" search endpoint that the Libby app itself calls.
// It is not an official, documented API, so every failure falls back to a Libby search link.

import type { LibbyItem, LibbyResponse } from "../shared/types.js";
import { cacheGet, cacheSet } from "./cache.js";
import { BROWSER_UA, fetchWithTimeout } from "./http.js";
import { cleanTitle } from "./catalog.js";

function norm(s: string) {
  return cleanTitle(s.toLowerCase()).replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

export function libbySearchUrl(libbyKey: string, title: string, author: string) {
  const q = encodeURIComponent(`${cleanTitle(title).split(":")[0]} ${author}`.trim());
  return `https://libbyapp.com/search/${libbyKey}/search/query-${q}/page-1`;
}

export async function checkLibby(libbyKey: string, title: string, author: string): Promise<LibbyResponse> {
  const shortTitle = cleanTitle(title).split(":")[0].trim();
  const q = `${shortTitle} ${author}`.trim();
  const searchUrl = libbySearchUrl(libbyKey, title, author);
  const cacheKey = `libby:v1:${libbyKey}:${q.toLowerCase()}`;
  const cached = await cacheGet<LibbyResponse>(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetchWithTimeout(
      `https://thunder.api.overdrive.com/v2/libraries/${libbyKey}/media?query=${encodeURIComponent(q)}&perPage=10`,
      { headers: { "User-Agent": BROWSER_UA, Accept: "application/json" } },
      8_000,
    );
    if (!res.ok) return { status: "error", items: [], searchUrl };
    const body = (await res.json()) as { items?: any[] };
    const want = norm(shortTitle);
    const items: LibbyItem[] = (body.items || [])
      .filter((i) => {
        const t = norm(String(i.title || ""));
        return t && (t.includes(want) || want.includes(t));
      })
      .slice(0, 4)
      .map((i) => ({
        title: String(i.title || ""),
        author: String(i.firstCreatorName || ""),
        type: String(i.type?.id || ""),
        available: !!i.isAvailable,
        availableCopies: Number(i.availableCopies ?? 0),
        ownedCopies: Number(i.ownedCopies ?? 0),
        holds: Number(i.holdsCount ?? 0),
        waitDays: typeof i.estimatedWaitDays === "number" ? i.estimatedWaitDays : undefined,
      }));
    const out: LibbyResponse = { status: "ok", items, searchUrl };
    await cacheSet(cacheKey, out, 30 * 60);
    return out;
  } catch {
    return { status: "error", items: [], searchUrl };
  }
}
