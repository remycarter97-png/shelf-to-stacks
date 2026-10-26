import { load } from "./storage";

// Library systems the app knows about. For now that's Boston Public Library, with live
// availability through its BiblioCommons catalog. Readers elsewhere can ask for their library
// with "Request a different library" (saved to Supabase: library_requests).

export type LibrarySystem = {
  id: string;
  name: string;
  /** Short label used in buttons, e.g. "BPL". */
  short: string;
  mode: "live" | "link";
  /** BiblioCommons code (the part before .bibliocommons.com), for live checks. */
  biblioCode?: string;
  /** Libby / OverDrive library key, e.g. "bpl". */
  libbyKey?: string;
};

export const LIBRARIES: LibrarySystem[] = [
  {
    id: "bpl",
    name: "Boston Public Library",
    short: "BPL",
    mode: "live",
    biblioCode: "bpl",
    libbyKey: "bpl",
  },
];

export const DEFAULT_LIBRARY = LIBRARIES[0];

/** The reader's library. Anything saved that's no longer offered (older Minuteman or custom picks) becomes BPL. */
export function savedLibrary(): LibrarySystem {
  const id = load<string>("library", "");
  return LIBRARIES.find((l) => l.id === id) ?? DEFAULT_LIBRARY;
}

export function cleanTitle(title: string) {
  return title.replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
}

/** Splits "Tress of the Emerald Sea (Hoid's Travails)" into title and series. */
export function splitSeries(title: string): { main: string; series?: string } {
  const m = title.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  return m ? { main: m[1], series: m[2] } : { main: title };
}

export function biblioSearchUrl(code: string, title: string, author: string) {
  const q = encodeURIComponent(`${cleanTitle(title)} ${author}`.trim());
  return `https://${code}.bibliocommons.com/v2/search?query=${q}&searchType=keyword`;
}

export function worldcatUrl(title: string, author: string, isbn?: string) {
  const q = isbn ? `bn:${isbn}` : `${cleanTitle(title)} ${author}`.trim();
  return `https://search.worldcat.org/search?q=${encodeURIComponent(q)}`;
}

/** Where to send a reader to look a book up in their own catalog. */
export function catalogLink(lib: LibrarySystem, title: string, author: string, isbn?: string) {
  if (lib.biblioCode) return biblioSearchUrl(lib.biblioCode, title, author);
  return worldcatUrl(title, author, isbn);
}

export function catalogLinkLabel(lib: LibrarySystem) {
  if (lib.biblioCode) return `Check availability at ${lib.short} →`;
  return "Find it at libraries near you →";
}

export function libbyLink(lib: LibrarySystem, title: string, author: string) {
  const q = encodeURIComponent(`${cleanTitle(title).split(":")[0]} ${author}`.trim());
  return lib.libbyKey
    ? `https://libbyapp.com/search/${lib.libbyKey}/search/query-${q}/page-1`
    : `https://www.overdrive.com/search?q=${q}`;
}

export function buyLinks(title: string, author: string, isbn?: string) {
  const q = encodeURIComponent(`${cleanTitle(title)} ${author}`.trim());
  const k = isbn ? encodeURIComponent(isbn) : q;
  return [
    { label: "Bookshop.org", note: "supports indie stores", href: `https://bookshop.org/search?keywords=${k}` },
    { label: "Amazon", href: `https://www.amazon.com/s?k=${k}&i=stripbooks` },
    { label: "ThriftBooks", note: "used", href: `https://www.thriftbooks.com/browse/?b.search=${q}` },
    { label: "AbeBooks", note: "used", href: `https://www.abebooks.com/servlet/SearchResults?kn=${q}` },
  ];
}

/** The library's "suggest a purchase" page, when we know it. */
export function purchaseSuggestionUrl(lib: LibrarySystem): string | undefined {
  // BiblioCommons libraries (BPL and others) have a built-in suggestion form; readers sign in to use it.
  if (lib.biblioCode) return `https://${lib.biblioCode}.bibliocommons.com/suggested_purchases`;
  return undefined;
}
