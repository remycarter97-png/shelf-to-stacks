// Finds the books several book club members want to read.
//
// Lists come from different places (Goodreads, StoryGraph) and often hold different editions
// of the same book, so books are matched by title + author's last name first, and by ISBN
// as a backup (an ISBN match links two entries even when titles are written differently).

import type { Book } from "./types";

export type ClubMember = { id: string; name: string; books: Book[] };

export type CommonBook = {
  key: string;
  /** A representative copy (prefers one with a cover and ISBN). */
  book: Book;
  /** Members who have this book on their list, in club order. */
  members: Array<{ id: string; name: string }>;
};

function fold(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "");
}

/** "The Hobbit: or There and Back Again (Middle-earth, #1)" → "hobbit" */
export function titleKey(title: string) {
  return fold(title)
    .replace(/\([^)]*\)/g, "")
    .split(":")[0]
    .replace(/^(the|a|an)\s+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function lastName(author: string) {
  const a = fold(author).trim();
  // "Clarke, Susanna" → "clarke"; "Susanna Clarke" → "clarke"
  if (a.includes(",")) return a.split(",")[0].replace(/[^a-z0-9]+/g, "");
  return (a.split(/\s+/).pop() ?? "").replace(/[^a-z0-9]+/g, "");
}

/** ISBN-10 → ISBN-13 so the two forms of the same ISBN match. */
export function toIsbn13(isbn: string): string {
  const d = isbn.replace(/[^0-9Xx]/g, "").toUpperCase();
  if (d.length === 13) return d;
  if (d.length !== 10) return "";
  const core = "978" + d.slice(0, 9);
  const sum = [...core].reduce((s, c, i) => s + Number(c) * (i % 2 ? 3 : 1), 0);
  return core + ((10 - (sum % 10)) % 10);
}

export function findCommonBooks(members: ClubMember[]): CommonBook[] {
  // Union-find over entries so title matches and ISBN matches join the same group.
  type Entry = { member: number; book: Book };
  const entries: Entry[] = [];
  members.forEach((m, mi) => m.books.forEach((book) => entries.push({ member: mi, book })));
  const parent = entries.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const join = (a: number, b: number) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };
  const byKey = new Map<string, number>();
  const link = (key: string, i: number) => {
    if (!key) return;
    const j = byKey.get(key);
    if (j === undefined) byKey.set(key, i);
    else join(j, i);
  };
  entries.forEach((e, i) => {
    const t = titleKey(e.book.title);
    if (t) link(`t:${t}|${lastName(e.book.author)}`, i);
    const isbn = toIsbn13(e.book.isbn || "");
    if (isbn) link(`i:${isbn}`, i);
  });

  const groups = new Map<number, Entry[]>();
  entries.forEach((e, i) => {
    const r = find(i);
    groups.set(r, [...(groups.get(r) ?? []), e]);
  });

  const out: CommonBook[] = [];
  for (const [root, group] of groups) {
    const memberIdx = [...new Set(group.map((e) => e.member))].sort((a, b) => a - b);
    const best =
      group.find((e) => e.book.imageUrl && e.book.isbn) ?? group.find((e) => e.book.imageUrl) ?? group.find((e) => e.book.isbn) ?? group[0];
    out.push({
      key: `g${root}:${titleKey(best.book.title)}`,
      book: best.book,
      members: memberIdx.map((i) => ({ id: members[i].id, name: members[i].name })),
    });
  }
  // Most-shared first, then alphabetical.
  return out.sort((a, b) => b.members.length - a.members.length || titleKey(a.book.title).localeCompare(titleKey(b.book.title)));
}
