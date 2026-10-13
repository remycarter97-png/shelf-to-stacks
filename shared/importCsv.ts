// Reads a library export file and returns the "want to read" books.
// Runs in the browser, so the file never leaves the reader's device.
//
// Supported:
//   - StoryGraph: Manage Account → Export StoryGraph Library. Columns include
//     Title, Authors, ISBN/UID, Format, Read Status ("to-read" for the TBR pile).
//   - Goodreads: My Books → Import and export → Export Library. Columns include
//     Book Id, Title, Author, ISBN, ISBN13, Exclusive Shelf ("to-read").

import type { Book } from "./types";

export type ImportSource = "storygraph" | "goodreads";
export type ImportResult = { source: ImportSource; books: Book[]; totalRows: number };

/** RFC 4180-style CSV: quoted fields, doubled quotes, commas and line breaks inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Keeps only real ISBNs. Goodreads wraps them like ="9780316…"; StoryGraph may use its own IDs. */
export function cleanIsbn(raw: string): string {
  const digits = String(raw || "").replace(/[^0-9Xx]/g, "").toUpperCase();
  return /^(\d{9}[\dX]|\d{13})$/.test(digits) ? digits : "";
}

function hashId(s: string) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** Wants "to-read", "To Read", "want to read". */
function isToRead(status: string) {
  return /^(to[\s_-]?read|want[\s_-]?to[\s_-]?read)$/i.test(status.trim());
}

function searchLink(source: ImportSource, title: string, author: string) {
  const q = encodeURIComponent(`${title} ${author}`.trim());
  return source === "storygraph"
    ? `https://app.thestorygraph.com/browse?search_term=${q}`
    : `https://www.goodreads.com/search?q=${q}`;
}

export function importLibraryCsv(text: string): ImportResult {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error("That file looks empty. Make sure you picked the CSV from your export.");
  const header = rows[0].map(norm);
  const col = (...names: string[]) => {
    for (const n of names) {
      const i = header.indexOf(norm(n));
      if (i >= 0) return i;
    }
    return -1;
  };

  const title = col("Title");
  const sgStatus = col("Read Status");
  const grShelf = col("Exclusive Shelf");
  if (title < 0 || (sgStatus < 0 && grShelf < 0)) {
    throw new Error("We couldn't read that file. Upload the CSV exported from StoryGraph or Goodreads.");
  }
  const source: ImportSource = sgStatus >= 0 ? "storygraph" : "goodreads";
  const status = source === "storygraph" ? sgStatus : grShelf;
  const author = source === "storygraph" ? col("Authors", "Author") : col("Author");
  const isbn13 = col("ISBN13");
  const isbn = source === "storygraph" ? col("ISBN/UID", "ISBN") : col("ISBN");
  const grId = col("Book Id");

  const books: Book[] = [];
  const seen = new Set<string>();
  for (const r of rows.slice(1)) {
    if (!isToRead(r[status] ?? "")) continue;
    const t = (r[title] ?? "").trim();
    if (!t) continue;
    // StoryGraph lists co-authors as "A, B"; the first name searches best.
    const a = (r[author] ?? "").split(/,|;| & /)[0].trim();
    const i = cleanIsbn(r[isbn13] ?? "") || cleanIsbn(r[isbn] ?? "");
    const id = source === "goodreads" && r[grId] ? `gr-${r[grId].trim()}` : `${source}-${i || hashId(`${t}|${a}`.toLowerCase())}`;
    if (seen.has(id)) continue;
    seen.add(id);
    books.push({
      id,
      title: t,
      author: a,
      isbn: i,
      // Exports don't include covers; Open Library has most by ISBN (missing ones are hidden).
      imageUrl: i ? `https://covers.openlibrary.org/b/isbn/${i}-M.jpg?default=false` : "",
      goodreadsUrl:
        source === "goodreads" && r[grId] ? `https://www.goodreads.com/book/show/${r[grId].trim()}` : searchLink(source, t, a),
      source,
    });
  }
  return { source, books, totalRows: rows.length - 1 };
}
