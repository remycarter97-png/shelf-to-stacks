// Series info from Goodreads-style titles: "Aether Corruption (Aether's Revival, #13)".

export type SeriesInfo = { name: string; number?: string };

/** Reads the series name and number from the end of a title, if there is one. */
export function parseSeries(title: string): SeriesInfo | null {
  const m = title.match(/\(([^()]+)\)\s*$/);
  if (!m) return null;
  const inner = m[1].trim();
  // "Series, #13" / "Series #2.5" / "Series, #1-3"
  const num = inner.match(/^(.*?),?\s*#\s*([\d.]+(?:\s*-\s*[\d.]+)?)\s*$/);
  if (num) return { name: num[1].trim(), number: num[2].replace(/\s+/g, "") };
  // A parenthetical with no number is usually a series name ("Hoid's Travails"); skip obvious non-series notes.
  if (/edition|unabridged|abridged|translated|illustrated|volume \d|vol\. \d/i.test(inner)) return null;
  return { name: inner };
}

const norm = (s: string) => s.toLowerCase().replace(/^the\s+/, "").replace(/[^a-z0-9]+/g, " ").trim();

export function sameSeries(a: SeriesInfo, b: SeriesInfo) {
  return norm(a.name) === norm(b.name);
}

/** Sort key for a series number ("2.5" → 2.5, "1-3" → 1); unnumbered books go last. */
export function seriesOrder(s: SeriesInfo | null) {
  const n = parseFloat(String(s?.number ?? ""));
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}
