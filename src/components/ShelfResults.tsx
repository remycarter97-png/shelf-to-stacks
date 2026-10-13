import { useEffect, useMemo, useState } from "react";
import { bookKey, type Book, type Status } from "../../shared/types";
import type { LibrarySystem } from "../lib/libraries";
import { prettyFormat, timeAgo } from "../lib/format";
import { useAvailability } from "../lib/useAvailability";
import { load, save } from "../lib/storage";
import { PAGE_SIZES, Pagination } from "./Pagination";
import { BookCard } from "./BookCard";
import { Button, Input, Select, cx } from "./ui";
import type { ClubPick } from "./BookClubPanel";

type Filter = "all" | "available" | "checked_out" | "not_found";
type Sort = "shelf" | "title" | "author" | "status";

const RANK: Record<Status | "checking", number> = {
  available: 0,
  checked_out: 1,
  on_order: 2,
  not_found: 3,
  error: 4,
  checking: 5,
};

export function ShelfResults({
  books,
  library,
  picks,
  onTogglePick,
}: {
  books: Book[];
  library: LibrarySystem;
  picks: ClubPick[];
  onTogglePick: (p: ClubPick) => void;
}) {
  const { entries, pending, retry, refreshAll, live } = useAvailability(books, library);
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("shelf");
  const [format, setFormat] = useState("all");
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState<number>(() => {
    const n = load("page-size", 10);
    return (PAGE_SIZES as readonly number[]).includes(n) ? n : 10;
  });
  const [page, setPage] = useState(1);
  const L = library.short;

  // A new search, filter or sort starts back on page 1.
  useEffect(() => setPage(1), [filter, sort, format, query, books]);

  const rows = useMemo(
    () =>
      books.map((book) => {
        const k = bookKey(book);
        const e = entries.get(k);
        return { book, key: k, result: e?.result, at: e?.at, checking: pending.has(k) };
      }),
    [books, entries, pending],
  );

  const counts = useMemo(() => {
    const c = { all: books.length, available: 0, checked_out: 0, not_found: 0, error: 0 };
    for (const r of rows) {
      const s = r.result?.status;
      if (s === "available") c.available++;
      else if (s === "checked_out" || s === "on_order") c.checked_out++;
      else if (s === "not_found") c.not_found++;
      else if (s === "error" && !r.checking) c.error++;
    }
    return c;
  }, [rows, books.length]);

  const formats = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => r.result?.format && set.add(prettyFormat(r.result.format)));
    return [...set].sort();
  }, [rows]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows.filter((r) => {
      const s = r.result?.status;
      if (filter === "available" && s !== "available") return false;
      if (filter === "checked_out" && s !== "checked_out" && s !== "on_order") return false;
      if (filter === "not_found" && s !== "not_found") return false;
      if (format !== "all" && prettyFormat(r.result?.format) !== format) return false;
      if (q && !`${r.book.title} ${r.book.author}`.toLowerCase().includes(q)) return false;
      return true;
    });
    if (sort === "shelf") return list;
    const keyOf = (r: (typeof list)[number]) =>
      sort === "title"
        ? r.book.title.toLowerCase()
        : sort === "author"
          ? r.book.author.toLowerCase() || "￿"
          : String(RANK[r.result?.status ?? "checking"]) + r.book.title.toLowerCase();
    return [...list].sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
  }, [rows, filter, format, query, sort]);

  const pages = Math.max(1, Math.ceil(shown.length / pageSize));
  const current = Math.min(page, pages);
  const pageRows = shown.slice((current - 1) * pageSize, current * pageSize);
  const goTo = (p: number) => {
    setPage(p);
    document.getElementById("results-heading")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const pager = {
    page: current,
    pages,
    total: shown.length,
    pageSize,
    onPage: goTo,
    onPageSize: (n: number) => {
      // Keep the first book on screen in view after changing the page size.
      const firstIndex = (current - 1) * pageSize;
      setPageSize(n);
      save("page-size", n);
      setPage(Math.floor(firstIndex / n) + 1);
    },
  };

  const checking = rows.filter((r) => r.checking).length;
  const done = books.length - checking;
  const oldest = rows.reduce<number | undefined>((m, r) => (r.at && (!m || r.at < m) ? r.at : m), undefined);

  const heading =
    filter === "available"
      ? `${counts.available} available at ${L}`
      : filter === "checked_out"
        ? `${counts.checked_out} checked out at ${L}`
        : filter === "not_found"
          ? `${counts.not_found} not in the ${L} catalog`
          : `${books.length} ${books.length === 1 ? "book" : "books"} on your shelf`;

  return (
    <section className="mt-10" aria-labelledby="results-heading">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 id="results-heading" className="font-display text-3xl font-medium">
          {heading}
        </h2>
        {live && checking === 0 && oldest && (
          <button type="button" onClick={refreshAll} className="py-2 text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground">
            Checked {timeAgo(oldest)} · Refresh
          </button>
        )}
      </div>
      {!live && (
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          {library.network === "minuteman"
            ? `${library.name} is part of the Minuteman Library Network, whose catalog doesn't allow automatic checks. Each book links straight to a catalog search.`
            : `We can't check ${library.name} automatically, so each book links to a search that shows libraries near you that have it.`}
        </p>
      )}

      <div className="mt-5 grid gap-3 sm:flex sm:flex-wrap sm:items-center">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search title or author…"
          aria-label="Search books on your shelf"
          className="h-11 sm:w-64"
          type="search"
        />
        <div className="grid grid-cols-2 gap-3 sm:flex">
          {live && (
            <label className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
              <span className="shrink-0">Format</span>
              <Select value={format} onChange={(e) => setFormat(e.target.value)} className="w-full">
                <option value="all">All</option>
                {formats.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </Select>
            </label>
          )}
          <label className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
            <span className="shrink-0">Sort</span>
            <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="w-full">
              <option value="shelf">Shelf order</option>
              <option value="title">Title</option>
              <option value="author">Author</option>
              {live && <option value="status">Available first</option>}
            </Select>
          </label>
        </div>
      </div>

      {live && (
        <div role="tablist" aria-label="Filter by availability" className="mt-4 grid grid-cols-4 gap-1 rounded-md border border-border/60 bg-card p-1 text-sm">
          {(
            [
              ["all", "All", counts.all],
              ["available", "Available", counts.available],
              ["checked_out", "Checked out", counts.checked_out],
              ["not_found", "Not in catalog", counts.not_found],
            ] as const
          ).map(([id, label, n]) => (
            <button
              key={id}
              role="tab"
              aria-selected={filter === id}
              onClick={() => setFilter(id)}
              className={cx(
                "flex min-h-14 flex-col items-center justify-center rounded px-1 py-1.5 leading-tight transition-colors",
                filter === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="text-center">{label}</span>
              <span className="tabular-nums opacity-70">{n}</span>
            </button>
          ))}
        </div>
      )}

      {live && checking > 0 && (
        <div className="mt-4" aria-live="polite">
          <div className="mb-1.5 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Checking against {L}…</span>
            <span className="font-medium tabular-nums">
              {done} / {books.length}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${(done / books.length) * 100}%` }} />
          </div>
        </div>
      )}

      {live && counts.error > 0 && checking === 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-warning/40 bg-warning/10 px-4 py-2.5 text-sm">
          <span>
            {counts.error} {counts.error === 1 ? "book" : "books"} couldn't be checked. Each has a link to search {L} yourself.
          </span>
          <Button variant="outline" className="min-h-9 px-3" onClick={() => retry()}>
            Retry those
          </Button>
        </div>
      )}

      {shown.length > 0 && (
        <div className="mt-5">
          <Pagination label="Pages, top" {...pager} />
        </div>
      )}

      <ul className="mt-4 grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
        {pageRows.map((r) => (
          <BookCard
            key={r.book.id}
            book={r.book}
            state={{ result: r.result, checking: r.checking, checkedAt: r.at }}
            library={library}
            picked={picks.some((p) => p.id === r.book.id)}
            onTogglePick={() =>
              onTogglePick({ id: r.book.id, title: r.book.title, author: r.book.author, imageUrl: r.book.imageUrl })
            }
            onRetry={() => retry([r.book])}
          />
        ))}
      </ul>
      {shown.length === 0 && <p className="mt-6 italic text-muted-foreground">No books match.</p>}
      {shown.length > pageSize && (
        <div className="mt-6">
          <Pagination label="Pages, bottom" {...pager} />
        </div>
      )}
    </section>
  );
}
