import type { ReactNode } from "react";
import { GENRES, GENRE_BY_ID, type GenreId, type Tint } from "../../shared/genres";
import { cx } from "./ui";

export const TINT_BG: Record<Tint, string> = {
  blush: "var(--blush-soft)",
  sage: "var(--sage-soft)",
  butter: "var(--butter-soft)",
  lavender: "var(--lavender-soft)",
  clay: "var(--clay-soft)",
};

/** "Browse your shelf by mood": pastel cards for the genres on this list, with counts. */
export function MoodPicker({
  counts,
  selected,
  onSelect,
  loading,
  missing,
}: {
  counts: Map<GenreId, number>;
  selected: GenreId | "all";
  onSelect: (id: GenreId | "all") => void;
  loading: boolean;
  missing: number;
}) {
  const present = GENRES.filter((g) => (counts.get(g.id) ?? 0) > 0).sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0));
  if (present.length === 0 && !loading) return null;
  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="font-script text-xl text-link">what are you in the mood for?</p>
          <h3 className="font-display text-xl font-medium">Browse your shelf by mood</h3>
        </div>
        {selected !== "all" ? (
          <button type="button" onClick={() => onSelect("all")} className="py-1 text-sm font-bold text-link underline underline-offset-2">
            Show every mood
          </button>
        ) : loading ? (
          <p className="text-sm text-muted-foreground" aria-live="polite">
            Finding genres… {missing} to go
          </p>
        ) : null}
      </div>
      <div
        role="group"
        aria-label="Filter by mood"
        className="-mx-4 mt-2 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 pt-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-4 xl:grid-cols-6"
      >
        {present.map((g) => {
          const on = selected === g.id;
          return (
            <button
              key={g.id}
              type="button"
              aria-pressed={on}
              onClick={() => onSelect(on ? "all" : g.id)}
              className={cx(
                "relative flex w-36 shrink-0 snap-start flex-col items-start gap-1 rounded-[1.3rem] p-3.5 text-left transition sm:w-auto",
                on ? "ring-2 ring-foreground/70" : "hover:-translate-y-0.5",
              )}
              style={{ background: TINT_BG[g.tint] }}
            >
              <MoodIcon id={g.id} />
              <span className="mt-1 font-display text-[1.02rem] font-medium leading-tight">{g.label}</span>
              <span className="text-xs font-bold text-muted-foreground">
                {counts.get(g.id)} {counts.get(g.id) === 1 ? "book" : "books"}
              </span>
              {on && (
                <span className="absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-full bg-foreground text-xs text-background" aria-hidden>
                  ✓
                </span>
              )}
            </button>
          );
        })}
        {loading && present.length === 0 && (
          <div className="h-[7.5rem] w-36 shrink-0 animate-pulse rounded-[1.3rem] bg-muted sm:w-auto" aria-hidden />
        )}
      </div>
    </div>
  );
}

/** Small genre pills for a book card or book page. */
export function GenreTags({ ids, className }: { ids?: GenreId[]; className?: string }) {
  if (!ids?.length) return null;
  return (
    <ul className={cx("flex flex-wrap gap-1.5", className)} aria-label="Genres">
      {ids.map((id) => (
        <li key={id} className="rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: TINT_BG[GENRE_BY_ID[id].tint] }}>
          {GENRE_BY_ID[id].short}
        </li>
      ))}
    </ul>
  );
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg width="34" height="34" viewBox="0 0 32 32" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

const HEART = "M16 26s-8-5-10.5-9.8C4 13 5.8 9 9.6 9c2.2 0 3.8 1.3 4.8 2.8h3.2c1-1.5 2.6-2.8 4.8-2.8 3.8 0 5.6 4 4.1 7.2C24 21 16 26 16 26z";

export function MoodIcon({ id }: { id: GenreId }) {
  switch (id) {
    case "cozy":
      return (
        <Icon>
          <path d="M7 13h15v6a6 6 0 0 1-6 6h-3a6 6 0 0 1-6-6z" />
          <path d="M22 15h1.5a3 3 0 0 1 0 6H22" />
          <path d="M12 9c-1.5-1.5 1.5-2.5 0-5M16.5 9c-1.5-1.5 1.5-2.5 0-5" stroke="var(--clay)" />
        </Icon>
      );
    case "romance":
      return (
        <Icon>
          <path d={HEART} fill="#e48f8f" stroke="none" transform="translate(16 16) scale(.85) translate(-16 -16)" />
        </Icon>
      );
    case "mystery":
      return (
        <Icon>
          <path d="M5 16a11 11 0 0 1 22 0z" fill="var(--sage)" />
          <path d="M16 16v8a2.5 2.5 0 0 1-5 0M16 5V3.5" />
          <path d="M7 21l-1 2.5M25 20l-1 2.5M21 25l-1 2.5" stroke="#7f9fbf" />
        </Icon>
      );
    case "fantasy":
      return (
        <Icon>
          <path d="M6 26 20 12" />
          <path d="M22 5l1.3 2.7L26 9l-2.7 1.3L22 13l-1.3-2.7L18 9l2.7-1.3z" fill="#f8d98f" />
          <path d="M9 8l.6 1.4L11 10l-1.4.6L9 12l-.6-1.4L7 10l1.4-.6zM25 19l.5 1 1 .5-1 .5-.5 1-.5-1-1-.5 1-.5z" fill="currentColor" stroke="none" />
        </Icon>
      );
    case "scifi":
      return (
        <Icon>
          <circle cx="16" cy="16" r="6.5" fill="var(--lavender)" />
          <path d="M4.5 19.5c-1.5-2.5 3.5-6 11-8s12.5-1.6 12 1.4c-.4 2-4 4.2-9 5.6" />
          <circle cx="25" cy="7" r="1.2" fill="currentColor" stroke="none" />
        </Icon>
      );
    case "historical":
      return (
        <Icon>
          <path d="M9 4h14M9 28h14M10 4c0 6 6 8 6 12s-6 6-6 12M22 4c0 6-6 8-6 12s6 6 6 12" />
          <path d="M12.5 25.5c1-2 2.5-3 3.5-3s2.5 1 3.5 3z" fill="var(--clay)" stroke="none" />
        </Icon>
      );
    case "spooky":
      return (
        <Icon>
          <path d="M8 27V14a8 8 0 0 1 16 0v13l-2.7-2-2.7 2-2.6-2-2.6 2-2.7-2z" fill="var(--card)" />
          <circle cx="13.5" cy="14" r="1.2" fill="currentColor" stroke="none" />
          <circle cx="18.5" cy="14" r="1.2" fill="currentColor" stroke="none" />
        </Icon>
      );
    case "literary":
      return (
        <Icon>
          <path d="M4 9c4-1.5 8-1.2 12 1 4-2.2 8-2.5 12-1v16c-4-1.5-8-1.2-12 1-4-2.2-8-2.5-12-1z" fill="var(--card)" />
          <path d="M16 10v16" />
        </Icon>
      );
    case "nonfiction":
      return (
        <Icon>
          <path d="M11.5 20a7 7 0 1 1 9 0c-1 .8-1.5 1.8-1.5 3h-6c0-1.2-.5-2.2-1.5-3z" fill="var(--butter)" />
          <path d="M13 26.5h6" />
        </Icon>
      );
    case "poetry":
      return (
        <Icon>
          <path d="M8 27C11 18 17 9 27 4c-2 9-8 15-16 18" fill="var(--clay)" />
          <path d="M8 27l7-8" />
        </Icon>
      );
    case "kids":
      return (
        <Icon>
          <path d="M8 27c0-7 3.5-11 8-11s8 4 8 11z" fill="currentColor" stroke="none" />
          <path d="M10 15l1-6 4 4.5zM22 15l-1-6-4 4.5z" fill="currentColor" stroke="none" />
          <circle cx="16" cy="15.5" r="5.5" fill="currentColor" stroke="none" />
          <circle cx="14" cy="15" r=".9" fill="var(--background)" stroke="none" />
          <circle cx="18" cy="15" r=".9" fill="var(--background)" stroke="none" />
        </Icon>
      );
    case "ya":
      return (
        <Icon>
          <rect x="8" y="9" width="16" height="18" rx="4" fill="var(--blush)" />
          <path d="M12 9V7.5a4 4 0 0 1 8 0V9M12 18h8" />
        </Icon>
      );
  }
}
