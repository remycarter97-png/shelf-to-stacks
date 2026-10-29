import type { Book, ShelfResponse } from "../shared/types.js";
import { BROWSER_UA, HttpError, fetchWithTimeout } from "./http.js";
import { cacheGet, cacheSet } from "./cache.js";

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim();
}

function pick(item: string, tag: string): string {
  const m = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? decode(m[1]) : "";
}

/**
 * Accepts "1234567", "1234567-jane", or a full profile/shelf URL such as
 * https://www.goodreads.com/user/show/1234567-jane. Returns the numeric ID or null.
 */
export function parseGoodreadsId(input: string): string | null {
  const s = String(input || "").trim();
  const fromUrl = s.match(/goodreads\.com\/(?:user\/show|review\/list(?:_rss)?)\/(\d+)/i);
  if (fromUrl) return fromUrl[1];
  const lead = s.match(/^(\d{1,12})(?:-[\w-]*)?$/);
  return lead ? lead[1] : null;
}

export function parseRssItems(xml: string): Book[] {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  return items.map((it) => ({
    id: pick(it, "book_id") || pick(it, "guid"),
    title: pick(it, "title"),
    author: pick(it, "author_name"),
    isbn: pick(it, "isbn"),
    imageUrl: pick(it, "book_large_image_url") || pick(it, "book_medium_image_url") || pick(it, "book_image_url"),
    goodreadsUrl: pick(it, "link"),
  }));
}

const PER_PAGE = 100;
const MAX_PAGES = 10;

export const FEED_UNAVAILABLE_MESSAGE =
  "Goodreads isn't sharing want-to-read lists right now, so we can't load your list from your ID. Upload your Goodreads export instead. It takes about a minute.";

function feedUnavailable() {
  return new HttpError(FEED_UNAVAILABLE_MESSAGE, 503, "feed_unavailable");
}

/** True when the Goodreads profile page exists (it does even when the shelf feed doesn't). */
async function profileExists(userId: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`https://www.goodreads.com/user/show/${userId}`, { headers: { "User-Agent": BROWSER_UA } }, 8_000);
    return res.ok;
  } catch {
    return true; // can't tell; don't blame the reader's ID
  }
}

/**
 * Whether Goodreads' shelf feeds work at all, checked against a long-standing public account
 * (Goodreads' co-founder, user 1). Cached for 15 minutes.
 */
export async function goodreadsFeedStatus(): Promise<"up" | "down"> {
  const key = "goodreads-feed-status:v1";
  const cached = await cacheGet<"up" | "down">(key);
  if (cached) return cached;
  let status: "up" | "down" = "down";
  try {
    const res = await fetchWithTimeout("https://www.goodreads.com/review/list_rss/1?shelf=read&per_page=1", { headers: { "User-Agent": BROWSER_UA } }, 8_000);
    if (res.ok && (await res.text()).includes("<rss")) status = "up";
  } catch {
    status = "down";
  }
  await cacheSet(key, status, 15 * 60);
  return status;
}

export async function fetchShelf(userId: string, shelf = "to-read"): Promise<ShelfResponse> {
  const pageUrl = (page: number) =>
    `https://www.goodreads.com/review/list_rss/${userId}?shelf=${encodeURIComponent(shelf)}&per_page=${PER_PAGE}&page=${page}`;

  const getPage = async (page: number) => {
    const res = await fetchWithTimeout(pageUrl(page), { headers: { "User-Agent": BROWSER_UA } }, 12_000);
    if (!res.ok) {
      if (page === 1) {
        if (res.status === 404) {
          // Since Oct 28, 2026 Goodreads answers "not found" for every shelf feed. Only call the
          // ID wrong when the profile itself doesn't exist.
          if (await profileExists(userId)) throw feedUnavailable();
          throw new HttpError("We couldn't find that Goodreads user. Check the ID and try again.", 502, "user_not_found");
        }
        throw new HttpError(
          "This Goodreads profile or its Want to Read shelf looks private, so Goodreads won't share it. Make it public in Goodreads privacy settings, or upload your Goodreads export instead.",
          502,
          "private",
        );
      }
      return "";
    }
    return res.text();
  };

  const first = await getPage(1);
  if (!first.includes("<rss") && !first.includes("<channel")) {
    throw new HttpError(
      "Goodreads didn't share this shelf. This usually means the profile is private. Make it public in Goodreads privacy settings, or upload your Goodreads export instead.",
      502,
    );
  }
  const shelfTitle = pick(first.split("<item>")[0], "title");
  const all: Book[] = [];
  const seen = new Set<string>();
  const add = (books: Book[]) => {
    let added = 0;
    for (const b of books) {
      if (b.id && b.title && !seen.has(b.id)) {
        seen.add(b.id);
        all.push(b);
        added++;
      }
    }
    return added;
  };

  const firstItems = parseRssItems(first);
  add(firstItems);
  // Fetch the remaining pages a few at a time instead of one after another.
  let page = 2;
  let more = firstItems.length >= PER_PAGE;
  while (more && page <= MAX_PAGES) {
    const batch = [page, page + 1, page + 2].filter((p) => p <= MAX_PAGES);
    page += batch.length;
    const pages = await Promise.all(batch.map(getPage));
    for (const xml of pages) {
      const items = parseRssItems(xml);
      const added = add(items);
      if (items.length < PER_PAGE || added === 0) more = false;
    }
  }
  return { shelfTitle, books: all };
}
