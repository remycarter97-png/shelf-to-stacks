import { useQueries, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { Availability, Book } from "../../shared/types";
import { api } from "../lib/api";
import { catalogLink, catalogLinkLabel, cleanTitle, type LibrarySystem } from "../lib/libraries";
import { useShelf } from "../lib/shelfContext";
import { load, save } from "../lib/storage";
import { OutLink, cx } from "./ui";

function statusText(r: Availability | undefined, L: string) {
  if (!r) return null;
  if (r.status === "available") return { text: `Available now at ${L}`, cls: "text-success" };
  if (r.status === "checked_out") return { text: `Owned by ${L} · all copies out`, cls: "text-muted-foreground" };
  if (r.status === "on_order") return { text: `On order at ${L}`, cls: "text-muted-foreground" };
  if (r.status === "not_found") return { text: `Not found at ${L}`, cls: "text-muted-foreground" };
  return { text: `Couldn't check ${L}`, cls: "text-muted-foreground" };
}

function addLink(source: Book["source"], title: string, author: string) {
  const q = encodeURIComponent(`${cleanTitle(title)} ${author}`.trim());
  return source === "storygraph"
    ? { href: `https://app.thestorygraph.com/browse?search_term=${q}`, label: "Find on StoryGraph ↗" }
    : { href: `https://www.goodreads.com/search?q=${q}`, label: "Find on Goodreads ↗" };
}

/** "More like this": similar books already on the reader's list first, then new ones. */
export function MoreLikeThis({ book, library }: { book: Book; library: LibrarySystem }) {
  const shelf = useShelf();
  const [open, setOpen] = useState(false);
  // AI or Open Library; AI is only offered when the site has an AI key. The choice is remembered.
  const [pref, setPref] = useState<"ai" | "openlibrary">(() => load("similar-mode", "ai"));
  const mode = shelf.aiEnabled ? pref : "openlibrary";
  const choose = (m: "ai" | "openlibrary") => {
    setPref(m);
    save("similar-mode", m);
  };
  const others = shelf.books.filter((b) => b.id !== book.id);
  const q = useQuery({
    queryKey: ["similar", book.title, book.author, others.length, mode],
    queryFn: () =>
      api.similar({ title: book.title, author: book.author }, others.map((b) => ({ title: b.title, author: b.author })), mode),
    enabled: open && navigator.onLine,
    staleTime: Infinity,
    retry: false,
  });
  const live = library.mode === "live" && !!library.biblioCode;
  const newBooks = q.data?.newBooks ?? [];
  const checks = useQueries({
    queries: newBooks.map((r) => ({
      queryKey: ["rec-avail", library.biblioCode, r.title, r.author],
      queryFn: async () =>
        (await api.availability({ library: library.biblioCode!, books: [{ key: "r", title: r.title, author: r.author, isbn: "" }] })).results[0]
          ?.result,
      enabled: live,
      staleTime: 15 * 60_000,
    })),
  });

  const L = library.short;
  const link = "font-medium text-link underline-offset-2 hover:underline";

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="-my-2 py-2 text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
      >
        {open ? "Hide books like this" : "More like this"}
      </button>
      {open && (
        <div className="mt-3 rounded-md border border-border/60 bg-muted/50 p-4 text-sm">
          {shelf.aiEnabled && (
            <div role="radiogroup" aria-label="Where recommendations come from" className="mb-4 inline-flex rounded-md border border-border/60 bg-card p-1 text-xs">
              {(
                [
                  ["ai", "AI picks"],
                  ["openlibrary", "Open Library"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={mode === id}
                  onClick={() => choose(id)}
                  className={cx(
                    "min-h-9 rounded px-3 font-medium",
                    mode === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {q.isLoading && <p className="text-muted-foreground">Finding books like this one…</p>}
          {!navigator.onLine && !q.data && <p className="text-muted-foreground">You're offline. Recommendations need a connection.</p>}
          {q.isError && <p className="text-destructive">{(q.error as Error).message}</p>}
          {q.data && (
            <>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Already on your list</p>
              {q.data.onList.length === 0 ? (
                <p className="mt-1 text-muted-foreground">Nothing else on your list is much like this one.</p>
              ) : (
                <ol className="mt-2 space-y-3">
                  {q.data.onList.map(({ index, reason }) => {
                    const b = others[index];
                    if (!b) return null;
                    const r = shelf.lookup(b);
                    const st = statusText(r, L);
                    return (
                      <li key={b.id} className="leading-snug">
                        <p>
                          <span className="font-medium">{cleanTitle(b.title)}</span>
                          {b.author && <span className="text-muted-foreground"> · {b.author}</span>}
                        </p>
                        {reason && <p className="italic text-foreground/80">{reason}</p>}
                        <p className="mt-0.5 flex flex-wrap gap-x-3">
                          {st && <span className={st.cls}>{st.text}</span>}
                          {r && (r.status === "available" || r.status === "checked_out") && r.catalogUrl && (
                            <OutLink href={r.catalogUrl} className={link}>
                              {r.status === "available" ? "Place hold →" : "Join holds list →"}
                            </OutLink>
                          )}
                        </p>
                      </li>
                    );
                  })}
                </ol>
              )}

              <p className="mt-5 text-xs uppercase tracking-wider text-muted-foreground">Not on your list yet</p>
              {newBooks.length === 0 ? (
                <p className="mt-1 text-muted-foreground">No new suggestions this time.</p>
              ) : (
                <ol className="mt-2 space-y-3">
                  {newBooks.map((nb, i) => {
                    const r = checks[i]?.data;
                    const st = live ? statusText(r, L) : null;
                    const add = addLink(book.source, nb.title, nb.author);
                    return (
                      <li key={`${nb.title}-${i}`} className="leading-snug">
                        <p>
                          <span className="font-medium">{nb.title}</span>
                          {nb.author && <span className="text-muted-foreground"> · {nb.author}</span>}
                        </p>
                        {nb.reason && <p className="italic text-foreground/80">{nb.reason}</p>}
                        <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1">
                          {live && checks[i]?.isLoading && <span className="text-muted-foreground">Checking {L}…</span>}
                          {st && <span className={st.cls}>{st.text}</span>}
                          <OutLink
                            href={r?.catalogUrl && r.status !== "error" ? r.catalogUrl : catalogLink(library, nb.title, nb.author)}
                            className={link}
                          >
                            {r?.status === "available" ? "Place hold →" : r?.status === "checked_out" ? "Join holds list →" : catalogLinkLabel(library)}
                          </OutLink>
                          <OutLink href={add.href} className={cx("text-muted-foreground hover:text-foreground")}>
                            {add.label}
                          </OutLink>
                        </p>
                      </li>
                    );
                  })}
                </ol>
              )}
              <p className="mt-4 text-xs text-muted-foreground">
                {q.data.source === "ai"
                  ? "Suggestions are made by AI and can be imperfect."
                  : mode === "ai"
                    ? "AI wasn't available just now, so these come from Open Library: matched on shared subjects and authors."
                    : "Matched on shared subjects and authors from Open Library, a free book database."}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
