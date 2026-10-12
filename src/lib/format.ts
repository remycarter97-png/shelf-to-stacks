// BiblioCommons format codes → readable names.
const FORMAT_LABELS: Record<string, string> = {
  BK: "Book",
  BOOK: "Book",
  EBOOK: "eBook",
  AB: "Audiobook (CD)",
  AUDIOBOOK: "Audiobook",
  EAUDIO: "Audiobook (digital)",
  EAUDIOBOOK: "Audiobook (digital)",
  LP: "Large print",
  LPRINT: "Large print",
  GRAPHIC_NOVEL: "Graphic novel",
  DVD: "DVD",
  CD: "Music CD",
};

export function prettyFormat(raw?: string): string {
  if (!raw) return "";
  const key = raw.trim().toUpperCase().replace(/\s+/g, "_");
  return (
    FORMAT_LABELS[key] ??
    raw
      .toLowerCase()
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

export function timeAgo(ts: number) {
  const mins = Math.round((Date.now() - ts) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return `${Math.round(hrs / 24)} days ago`;
}
