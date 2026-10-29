import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { Book } from "../../shared/types";
import { api } from "../lib/api";
import { Input, cx } from "./ui";

export type SearchHit = { title: string; author: string; year?: number; isbn: string; coverUrl: string };

/** A stable ID for a book added by search, so adding it twice is caught. */
export function searchBookId(h: { title: string; author: string; isbn: string }) {
  const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `search:${h.isbn || `${slug(h.title)}--${slug(h.author)}`}`;
}

export function hitToBook(h: SearchHit): Book {
  return { id: searchBookId(h), title: h.title, author: h.author, isbn: h.isbn, imageUrl: h.coverUrl, goodreadsUrl: "", source: "search" };
}

/** Same book? Compares title and first author loosely, so an upload doesn't duplicate a hand-added book. */
export function sameBook(a: Pick<Book, "title" | "author" | "isbn">, b: Pick<Book, "title" | "author" | "isbn">) {
  if (a.isbn && b.isbn && a.isbn === b.isbn) return true;
  const t = (s: string) => s.toLowerCase().replace(/\([^)]*\)/g, "").split(":")[0].replace(/^(the|a|an)\s+/, "").replace(/[^a-z0-9]+/g, "");
  const last = (s: string) => (s.trim().split(/\s+/).pop() ?? "").toLowerCase().replace(/[^a-z]/g, "");
  return t(a.title) === t(b.title) && last(a.author) === last(b.author);
}

/**
 * "Search books": find a book and add it to your list, no import needed.
 * `onList` says which results are already on the list; `onToggle` adds or removes one.
 */
export function BookSearchAdd({
  onList,
  onToggle,
  listCount,
}: {
  /** "added" = added here (can be removed); "imported" = came from an upload; false = not on the list. */
  onList: (h: SearchHit) => "added" | "imported" | false;
  onToggle: (h: SearchHit) => void;
  listCount: number;
}) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  const search = useQuery({
    queryKey: ["booksearch", debounced.toLowerCase()],
    queryFn: () => api.bookSearch(debounced),
    enabled: debounced.length >= 2,
    staleTime: 3600_000,
    retry: 1,
  });
  const results = search.data?.results ?? [];

  return (
    <div className="mt-4 max-w-2xl">
      <Input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by title or author…"
        aria-label="Search for a book to add"
        autoComplete="off"
        enterKeyHint="search"
      />
      <p className="mt-2 text-sm text-muted-foreground">
        {listCount > 0
          ? `${listCount} ${listCount === 1 ? "book" : "books"} on your list. Add as many as you like; each one is checked at the library.`
          : "Add a few books you'd like to read and we'll check Boston Public Library for each one."}
      </p>

      {debounced.length >= 2 && (
        <div className="mt-3 overflow-hidden rounded-[1.2rem] border border-border/70 bg-card" aria-live="polite">
          {search.isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Searching…</p>
          ) : search.isError ? (
            <p className="p-4 text-sm text-destructive">{(search.error as Error).message}</p>
          ) : results.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No books found for “{debounced}”. Try the title and the author's last name.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {results.map((h) => {
                const state = onList(h);
                const added = state === "added";
                return (
                  <li key={`${h.title}|${h.author}|${h.isbn}`} className="flex items-center gap-3 p-3">
                    {h.coverUrl ? (
                      <img src={h.coverUrl} alt="" className="h-16 w-11 shrink-0 rounded object-cover" loading="lazy" />
                    ) : (
                      <div className="h-16 w-11 shrink-0 rounded bg-muted" aria-hidden />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-[1.02rem] leading-snug [overflow-wrap:anywhere]">{h.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {h.author || "Unknown author"}
                        {h.year ? ` · ${h.year}` : ""}
                      </p>
                    </div>
                    {state === "imported" ? (
                      <span className="shrink-0 rounded-full bg-muted px-3 py-2 text-xs font-bold text-muted-foreground">✓ On your list</span>
                    ) : (
                    <button
                      type="button"
                      onClick={() => onToggle(h)}
                      aria-pressed={added}
                      aria-label={added ? `Remove ${h.title} from your list` : `Add ${h.title} to your list`}
                      className={cx(
                        "min-h-10 shrink-0 rounded-full px-4 text-sm font-bold transition",
                        added ? "bg-muted text-foreground" : "btn-ledge bg-primary text-primary-foreground",
                      )}
                    >
                      {added ? "✓ Added" : "+ Add"}
                    </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
