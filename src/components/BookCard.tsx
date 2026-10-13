import type { Availability, Book, Status } from "../../shared/types";
import { catalogLink, catalogLinkLabel, splitSeries, type LibrarySystem } from "../lib/libraries";
import { prettyFormat } from "../lib/format";
import { MoreWays } from "./MoreWays";
import { OutLink, cx } from "./ui";

export type CardState = { result?: Availability; checking: boolean; checkedAt?: number };

const STATUS: Record<Status | "checking" | "waiting" | "link", { label: string; dot: string }> = {
  checking: { label: "Checking…", dot: "bg-muted-foreground/50 animate-pulse" },
  waiting: { label: "Not checked yet", dot: "bg-muted-foreground/40" },
  available: { label: "Available", dot: "bg-success" },
  checked_out: { label: "Checked out", dot: "bg-warning" },
  on_order: { label: "On order", dot: "bg-info" },
  not_found: { label: "Not in catalog", dot: "bg-muted-foreground/60" },
  error: { label: "Couldn't check", dot: "bg-destructive" },
  link: { label: "Link only", dot: "bg-muted-foreground/40" },
};

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

  return (
    <li className="flex min-w-0 gap-4 rounded-lg border border-border/70 bg-card p-4 sm:gap-5 sm:p-5">
      {book.imageUrl ? (
        <img
          src={book.imageUrl}
          alt=""
          loading="lazy"
          className="h-24 w-16 flex-shrink-0 rounded-sm bg-muted object-cover shadow-md"
        />
      ) : (
        <div className="h-24 w-16 flex-shrink-0 rounded-sm bg-muted" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <h3 className="font-display text-lg font-medium leading-snug [overflow-wrap:anywhere] line-clamp-2">
          {main}
        </h3>
        {series && <p className="mt-0.5 truncate text-xs text-muted-foreground">{series}</p>}
        {book.author && <p className="mt-0.5 text-sm text-muted-foreground">by {book.author}</p>}

        <p className="mt-2.5 inline-flex items-center gap-1.5 text-sm font-medium" aria-live="polite">
          <span className={cx("h-2 w-2 rounded-full", s.dot)} aria-hidden />
          {s.label}
        </p>
        {r && (r.status === "available" || r.status === "checked_out" || r.status === "on_order") && (
          <p className="mt-0.5 text-sm text-muted-foreground">
            {r.availableCopies ?? 0} of {r.totalCopies ?? 0} copies available
            {r.heldCopies ? ` · ${r.heldCopies} holds` : ""}
            {r.format ? ` · ${prettyFormat(r.format)}` : ""}
          </p>
        )}
        {r?.status === "error" && <p className="mt-0.5 text-sm text-muted-foreground">The catalog didn't answer this time.</p>}

        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          {!live && (
            <OutLink href={fallback} className={primary}>
              {catalogLinkLabel(library)}
            </OutLink>
          )}
          {live && r && (r.status === "available" || r.status === "checked_out" || r.status === "on_order") && (
            <OutLink href={href} className={primary}>
              {r.status === "available" ? `Place hold at ${L} →` : `Join the holds list at ${L} →`}
            </OutLink>
          )}
          {live && r?.status === "not_found" && (
            <OutLink href={href} className={primary}>
              Search anyway →
            </OutLink>
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
                <button type="button" onClick={onRetry} className="text-muted-foreground underline underline-offset-2 hover:text-foreground">
                  Retry
                </button>
              )}
            </>
          )}
          {book.goodreadsUrl && (
            <OutLink href={book.goodreadsUrl} className="text-muted-foreground hover:text-foreground">
              Goodreads ↗
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
        <MoreWays title={book.title} author={book.author} isbn={book.isbn} library={library} />
      </div>
    </li>
  );
}
