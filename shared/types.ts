// Types shared by the browser app and the API routes.

export type Book = {
  id: string;
  title: string;
  author: string;
  isbn: string;
  imageUrl: string;
  goodreadsUrl: string;
};

export type ShelfResponse = { shelfTitle: string; books: Book[] };

export type Status = "available" | "checked_out" | "on_order" | "not_found" | "error";

export type Availability = {
  status: Status;
  matchedTitle?: string;
  availableCopies?: number;
  totalCopies?: number;
  heldCopies?: number;
  format?: string;
  /** Link to the catalog record or search. Always present, so a failed check still has somewhere to go. */
  catalogUrl: string;
};

export type AvailabilityRequest = {
  /** BiblioCommons library code, e.g. "bpl" (the part before .bibliocommons.com). */
  library: string;
  books: Array<{ key: string; title: string; author: string; isbn: string }>;
};

export type AvailabilityResponse = {
  results: Array<{ key: string; result: Availability }>;
};

export type LibbyItem = {
  title: string;
  author: string;
  type: string;
  available: boolean;
  availableCopies: number;
  ownedCopies: number;
  holds: number;
  waitDays?: number;
};

export type LibbyResponse = { status: "ok" | "error"; items: LibbyItem[]; searchUrl: string };

export type Recommendation = { title: string; author: string; reason: string };

export type AppConfig = { recommendations: boolean };

/** Stable key for a book's availability result. */
export function bookKey(b: { title: string; author: string; isbn: string }) {
  return `${b.isbn}|${b.title.toLowerCase().trim()}|${b.author.toLowerCase().trim()}`;
}
