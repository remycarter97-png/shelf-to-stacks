// Library systems the app knows about.
// - Boston Public Library: live availability through its BiblioCommons catalog.
// - Minuteman Library Network members share one catalog (find.minlib.net) that blocks
//   automated lookups, so they get catalog search links.
// - "Other library": the reader types their library's name. If its catalog is on
//   BiblioCommons (address ends in bibliocommons.com) it gets live checks too.

export type LibrarySystem = {
  id: string;
  name: string;
  /** Short label used in buttons, e.g. "BPL" or "Cambridge". */
  short: string;
  mode: "live" | "link";
  /** BiblioCommons code (the part before .bibliocommons.com), for live checks. */
  biblioCode?: string;
  /** Libby / OverDrive library key, e.g. "bpl" or "minuteman". */
  libbyKey?: string;
  network: "bibliocommons" | "minuteman" | "custom";
  /** Custom libraries only: a catalog homepage the reader gave us. */
  catalogUrl?: string;
};

const mln = (id: string, name: string, town: string): LibrarySystem => ({
  id,
  name,
  short: town,
  mode: "link",
  libbyKey: "minuteman",
  network: "minuteman",
});

export const LIBRARIES: LibrarySystem[] = [
  {
    id: "bpl",
    name: "Boston Public Library",
    short: "BPL",
    mode: "live",
    biblioCode: "bpl",
    libbyKey: "bpl",
    network: "bibliocommons",
  },
  mln("acton", "Acton Memorial Library", "Acton"),
  mln("arlington", "Robbins Library", "Arlington"),
  mln("ashland", "Ashland Public Library", "Ashland"),
  mln("bedford", "Bedford Free Public Library", "Bedford"),
  mln("belmont", "Belmont Public Library", "Belmont"),
  mln("brookline", "Public Library of Brookline", "Brookline"),
  mln("cambridge", "Cambridge Public Library", "Cambridge"),
  mln("concord", "Concord Free Public Library", "Concord"),
  mln("dedham", "Dedham Public Library", "Dedham"),
  mln("dover", "Dover Town Library", "Dover"),
  mln("framingham", "Framingham Public Library", "Framingham"),
  mln("franklin", "Franklin Public Library", "Franklin"),
  mln("holliston", "Holliston Public Library", "Holliston"),
  mln("lexington", "Cary Memorial Library", "Lexington"),
  mln("lincoln", "Lincoln Public Library", "Lincoln"),
  mln("maynard", "Maynard Public Library", "Maynard"),
  mln("medfield", "Medfield Public Library", "Medfield"),
  mln("medford", "Medford Public Library", "Medford"),
  mln("medway", "Medway Public Library", "Medway"),
  mln("millis", "Millis Public Library", "Millis"),
  mln("natick", "Morse Institute Library", "Natick"),
  mln("needham", "Needham Free Public Library", "Needham"),
  mln("newton", "Newton Free Library", "Newton"),
  mln("norwood", "Morrill Memorial Library", "Norwood"),
  mln("sherborn", "Sherborn Library", "Sherborn"),
  mln("somerville", "Somerville Public Library", "Somerville"),
  mln("stow", "Randall Library", "Stow"),
  mln("sudbury", "Goodnow Library", "Sudbury"),
  mln("waltham", "Waltham Public Library", "Waltham"),
  mln("watertown", "Watertown Free Public Library", "Watertown"),
  mln("wayland", "Wayland Free Public Library", "Wayland"),
  mln("wellesley", "Wellesley Free Library", "Wellesley"),
  mln("weston", "Weston Public Library", "Weston"),
  mln("westwood", "Westwood Public Library", "Westwood"),
  mln("winchester", "Winchester Public Library", "Winchester"),
  mln("woburn", "Woburn Public Library", "Woburn"),
];

export const DEFAULT_LIBRARY = LIBRARIES[0];

export type CustomLibraryInput = { name: string; catalog: string; libby: string };

/** "chipublib.bibliocommons.com/v2/..." → "chipublib" */
export function biblioCodeFrom(input: string): string | undefined {
  const m = input.trim().toLowerCase().match(/([a-z0-9-]{2,40})\.bibliocommons\.com/);
  return m && m[1] !== "gateway" && m[1] !== "www" ? m[1] : undefined;
}

/** "https://libbyapp.com/library/chipublib" or "chipublib" → "chipublib" */
export function libbyKeyFrom(input: string): string | undefined {
  const s = input.trim().toLowerCase();
  if (!s) return undefined;
  const m = s.match(/libbyapp\.com\/(?:library|search)\/([a-z0-9-]{2,40})/) || s.match(/^([a-z0-9-]{2,40})$/);
  return m ? m[1] : undefined;
}

function shortName(name: string) {
  if (name.length <= 16) return name;
  const initials = name
    .split(/\s+/)
    .filter((w) => /^[A-Z]/.test(w))
    .map((w) => w[0])
    .join("");
  return initials.length >= 2 ? initials : name.slice(0, 16);
}

export function makeCustomLibrary(input: CustomLibraryInput): LibrarySystem {
  const name = input.name.trim().slice(0, 80) || "My library";
  const biblioCode = biblioCodeFrom(input.catalog);
  let catalogUrl: string | undefined;
  const raw = input.catalog.trim();
  if (raw) {
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
      catalogUrl = new URL(withScheme).toString();
    } catch {
      catalogUrl = undefined;
    }
  }
  return {
    id: "custom",
    name,
    short: shortName(name),
    mode: biblioCode ? "live" : "link",
    biblioCode,
    libbyKey: libbyKeyFrom(input.libby),
    network: "custom",
    catalogUrl,
  };
}

export function cleanTitle(title: string) {
  return title.replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
}

/** Splits "Tress of the Emerald Sea (Hoid's Travails)" into title and series. */
export function splitSeries(title: string): { main: string; series?: string } {
  const m = title.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  return m ? { main: m[1], series: m[2] } : { main: title };
}

export function minutemanSearchUrl(title: string, author: string) {
  const q = encodeURIComponent(`${cleanTitle(title)} ${author}`.trim());
  return `https://find.minlib.net/iii/encore/search/C__S${q}__Orightresult__U?lang=eng&suite=cobalt`;
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
  if (lib.network === "minuteman") return minutemanSearchUrl(title, author);
  return worldcatUrl(title, author, isbn);
}

export function catalogLinkLabel(lib: LibrarySystem) {
  if (lib.biblioCode || lib.network === "minuteman") return `Check availability at ${lib.short} →`;
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

export function kindleUnlimitedLink(title: string, author: string) {
  const q = encodeURIComponent(`${cleanTitle(title)} ${author}`.trim());
  // Kindle Store search filtered to Kindle Unlimited titles.
  return `https://www.amazon.com/s?k=${q}&i=digital-text&rh=p_n_feature_nine_browse-bin%3A8529758011`;
}
