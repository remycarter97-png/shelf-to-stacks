import { useState } from "react";
import type { Availability, Book, Edition, Status } from "../../shared/types";
import {
  catalogLink,
  catalogLinkLabel,
  purchaseSuggestionUrl,
  splitSeries,
  worldcatUrl,
  type LibrarySystem,
} from "../lib/libraries";
import { prettyFormat, timeAgo } from "../lib/format";
import { STALE_MS } from "../lib/useAvailability";
import { MoreWays } from "./MoreWays";
import { MoreLikeThis } from "./MoreLikeThis";
import { OutLink, cx } from "./ui";
import { openBook } from "../lib/router";

export type CardState = { result?: Availability; checking: boolean; checkedAt?: number; failedAt?: number };

// Labels separate "the library owns it" from "a copy is on the shelf right now".
export const STATUS: Record<Status | "checking" | "waiting" | "link", { label: string; dot: string }> = {
  checking: { label: "Checking…", dot: "bg-muted-foreground/50 animate-pulse" },
  waiting: { label: "Not checked yet", dot: "bg-muted-foreground/40" },
  available: { label: "Available now", dot: "bg-success" },
  checked_out: { label: "Owned · all copies checked out", dot: "bg-warning" },
  on_order: { label: "On order · not on shelves yet", dot: "bg-info" },
  not_found: { label: "Not found in this catalog", dot: "bg-muted-foreground/60" },
  error: { label: "Couldn't verify right now", dot: "bg-destructive" },
  link: { label: "Link only", dot: "bg-muted-foreground/40" },
};

export function copiesLine(r: Availability) {
  const fmt = r.format ? prettyFormat(r.format) : "";
  if (r.status === "available") {
    return [`${r.availableCopies ?? 0} of ${r.totalCopies ?? 0} copies on the shelf`, fmt].filter(Boolean).join(" · ");
  }
  if (r.status === "checked_out") {
    return [
      `Library owns ${r.totalCopies ?? 0} ${r.totalCopies === 1 ? "copy" : "copies"}`,
      r.heldCopies ? `${r.heldCopies} ${r.heldCopies === 1 ? "hold" : "holds"} waiting` : "",
      fmt,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  if (r.status === "on_order") return ["Ordered by the library", fmt].filter(Boolean).join(" · ");
  return "";
}

export function BookCard({
  book,
  state,
  library,
  picked,
  onTogglePick,
  onRetry,
}: {
  book: Book;
  state: CardState;
  library: LibrarySystem;
  picked: boolean;
  onTogglePick: () => void;
  onRetry?: () => void;
}) {
  const L = library.short;
  const r = state.result;
  const live = library.mode === "live";
  const statusKey = !live ? "link" : r ? r.status : state.checking ? "checking" : "waiting";
  const s = STATUS[statusKey];
  const { main, series } = splitSeries(book.title);
  const fallback = catalogLink(library, book.title, book.author, book.isbn);
  const href = r?.catalogUrl || fallback;
  const primary = "font-medium text-link underline-offset-2 hover:underline";
  const secondary = "text-muted-foreground underline-offset-2 hover:text-foreground hover:underline";
  const owned = r && (r.status === "available" || r.status === "checked_out" || r.status === "on_order");
  const now = Date.now();
  const unverified = !!state.failedAt && !!r && r.status !== "error";
  const old = !!state.checkedAt && now - state.checkedAt > STALE_MS;
  const purchase = purchaseSuggestionUrl(library);

  return (
    <li className="flex min-w-0 gap-4 rounded-lg border border-border/70 bg-card p-4 sm:gap-5 sm:p-5">
      <Cover src={book.imageUrl} />
      <div className="min-w-0 flex-1">
        <h3 className="font-display text-lg font-medium leading-snug [overflow-wrap:anywhere] line-clamp-2">
          <button
            type="button"
            onClick={() => openBook(book.id)}
            className="text-left underline-offset-4 hover:underline focus-visible:underline"
            aria-label={`${main}: open book details`}
          >
            {main}
          </button>
        </h3>
        {series && <p className="mt-0.5 truncate text-xs text-muted-foreground">{series}</p>}
        {book.author && <p className="mt-0.5 text-sm text-muted-foreground">by {book.author}</p>}

        <p className="mt-2.5 inline-flex items-center gap-1.5 text-sm font-medium" aria-live="polite">
          <span className={cx("h-2 w-2 shrink-0 rounded-full", s.dot)} aria-hidden />
          {s.label}
        </p>
        {r && owned && <p className="mt-0.5 text-sm text-muted-foreground">{copiesLine(r)}</p>}

        {live && r?.status === "not_found" && (
          <p className="mt-1 text-sm leading-snug text-muted-foreground">
            We searched {L} by {book.isbn ? "title, author and ISBN" : "title and author"} and found no match. It may be listed under a
            different title or spelling, or the library may not own it.
          </p>
        )}
        {live && r?.status === "error" && (
          <p className="mt-1 text-sm leading-snug text-muted-foreground">
            The {L} catalog didn't respond, so we can't confirm availability. Check it directly, or try again later.
          </p>
        )}

        {/* Freshness: say when a result is old or couldn't be re-checked. */}
        {live && r && r.status !== "error" && (unverified || old) && state.checkedAt && (
          <p className="mt-1 text-xs text-warning">
            {unverified
              ? `Couldn't re-check · showing what ${L} reported ${timeAgo(state.checkedAt)}`
              : `Checked ${timeAgo(state.checkedAt)} · may have changed`}
          </p>
        )}

        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          {!live && (
            <OutLink href={fallback} className={primary}>
              {catalogLinkLabel(library)}
            </OutLink>
          )}
          {live && owned && (
            <OutLink href={href} className={primary}>
              {r!.status === "available" ? `Place hold at ${L} →` : `Join the holds list at ${L} →`}
            </OutLink>
          )}
          {live && r?.status === "not_found" && (
            <>
              {purchase && (
                <OutLink href={purchase} className={primary}>
                  Ask {L} to buy it →
                </OutLink>
              )}
              <OutLink href={worldcatUrl(book.title, book.author, book.isbn)} className={purchase ? secondary : primary}>
                Find it at other libraries ↗
              </OutLink>
              <OutLink href={href} className={secondary}>
                Search {L} yourself
              </OutLink>
            </>
          )}
          {live && !r && !state.checking && (
            <OutLink href={fallback} className={primary}>
              {catalogLinkLabel(library)}
            </OutLink>
          )}
          {live && r?.status === "error" && (
            <>
              <OutLink href={fallback} className={primary}>
                {catalogLinkLabel(library)}
              </OutLink>
              {onRetry && (
                <button type="button" onClick={onRetry} className={secondary + " underline"}>
                  Try again
                </button>
              )}
            </>
          )}
          {book.goodreadsUrl && (
            <OutLink href={book.goodreadsUrl} className="text-muted-foreground hover:text-foreground">
              {book.source === "storygraph" ? "StoryGraph" : "Goodreads"} ↗
            </OutLink>
          )}
          <button
            type="button"
            onClick={onTogglePick}
            aria-pressed={picked}
            className={cx(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              picked ? "border-accent-strong bg-accent-strong text-accent-foreground" : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {picked ? "✓ On club shortlist" : "+ Book club shortlist"}
          </button>
        </div>

        {live && r?.editions && r.editions.length > 0 && <Editions editions={r.editions} shelfIsbn={book.isbn} exact={!!r.exactEdition} library={library} />}
        <MoreLikeThis book={book} library={library} />
        <MoreWays title={book.title} author={book.author} isbn={book.isbn} library={library} />
      </div>
    </li>
  );
}

function editionStatus(e: Edition) {
  if (e.availableCopies > 0) return { text: `${e.availableCopies} of ${e.totalCopies} on shelf`, cls: "text-success" };
  if (e.totalCopies > 0)
    return {
      text: `All ${e.totalCopies} out${e.heldCopies ? ` · ${e.heldCopies} ${e.heldCopies === 1 ? "hold" : "holds"}` : ""}`,
      cls: "text-muted-foreground",
    };
  if (e.onOrder) return { text: "On order", cls: "text-muted-foreground" };
  return { text: "No copies listed", cls: "text-muted-foreground" };
}

/** Every edition the library has: format, year, ISBN and its own availability. */
export function Editions({
  editions,
  shelfIsbn,
  exact,
  library,
  defaultOpen = false,
}: {
  editions: Edition[];
  shelfIsbn: string;
  exact: boolean;
  library: LibrarySystem;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const others = editions.length - 1;
  const formats = [...new Set(editions.map((e) => prettyFormat(e.format)).filter(Boolean))];
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="-my-2 py-2 text-left text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
      >
        {open
          ? "Hide editions"
          : others > 0
            ? `${editions.length} editions at ${library.short}${formats.length ? ` · ${formats.join(", ")}` : ""}`
            : "Edition details"}
      </button>
      {open && (
        <div className="mt-2 rounded-md border border-border/60 bg-muted/50 p-3 text-sm">
          {shelfIsbn && (
            <p className="mb-2 text-xs text-muted-foreground">
              Your list's edition: ISBN {shelfIsbn}
              {exact ? " — matched exactly." : " — the library has other editions of this book."}
            </p>
          )}
          <ul className="divide-y divide-border/60">
            {editions.map((e, i) => {
              const st = editionStatus(e);
              return (
                <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2">
                  <div className="min-w-0">
                    <span className="font-medium">{prettyFormat(e.format) || "Edition"}</span>
                    {e.year && <span className="text-muted-foreground"> · {e.year}</span>}
                    {e.edition && <span className="text-muted-foreground"> · {e.edition}</span>}
                    {i === 0 && <span className="ml-1.5 rounded bg-primary/10 px-1.5 py-0.5 text-xs text-foreground">Best match</span>}
                    {e.isbn && (
                      <span className="block text-xs text-muted-foreground [overflow-wrap:anywhere]">
                        ISBN {e.isbn}
                        {shelfIsbn && e.isbn === shelfIsbn ? " · your edition" : ""}
                      </span>
                    )}
                  </div>
                  <div className="flex items-baseline gap-3">
                    <span className={st.cls}>{st.text}</span>
                    <OutLink href={e.url} className="font-medium text-link underline-offset-2 hover:underline">
                      View →
                    </OutLink>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Book cover, or a plain placeholder when there is none or it fails to load. */
export function Cover({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <div className="h-24 w-16 flex-shrink-0 rounded-sm bg-muted" aria-hidden />;
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-24 w-16 flex-shrink-0 rounded-sm bg-muted object-cover shadow-md"
    />
  );
}
