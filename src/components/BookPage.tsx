import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { bookKey, type Book } from "../../shared/types";
import { parseSeries, sameSeries, seriesOrder } from "../../shared/series";
import { api } from "../lib/api";
import {
  catalogLink,
  catalogLinkLabel,
  purchaseSuggestionUrl,
  splitSeries,
  worldcatUrl,
  savedLibrary,
  type LibrarySystem,
} from "../lib/libraries";
import { navigate, openBook } from "../lib/router";
import { ShelfContext } from "../lib/shelfContext";
import { load, save } from "../lib/storage";
import { STALE_MS, loadSaved, useAvailability } from "../lib/useAvailability";
import { timeAgo } from "../lib/format";
import type { ClubPick } from "./BookClubPanel";
import { Editions, STATUS, copiesLine } from "./BookCard";
import { Logo } from "./Logo";
import { MoreLikeThis } from "./MoreLikeThis";
import { MoreWays } from "./MoreWays";
import { OutLink, cx } from "./ui";

type SavedShelf = { books: Book[] };

// The home page restores the shelf's page and scroll position when it opens.
const goBack = () => navigate("/");

export function BookPage({ id }: { id: string }) {
  const books = useMemo(() => load<SavedShelf | null>("shelf", null)?.books ?? [], []);
  const library = useMemo(savedLibrary, []);
  const book = books.find((b) => b.id === id);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);

  useEffect(() => {
    if (book) document.title = `${splitSeries(book.title).main} · Shelf to Stacks`;
    return () => {
      document.title = "Shelf to Stacks";
    };
  }, [book]);

  return (
    <div className="min-h-screen">
      <header className="shop-header safe-top">
        <div className="safe-x mx-auto flex h-16 max-w-4xl items-center justify-between gap-3">
          <button
            type="button"
            onClick={goBack}
            className="inline-flex min-h-9 items-center gap-1 whitespace-nowrap rounded-full border border-border px-3 text-sm font-medium hover:bg-muted"
          >
            ← My shelf
          </button>
          <Logo />
        </div>
      </header>
      <main className="safe-x mx-auto max-w-4xl pb-16">
        {!book ? (
          <NotOnList />
        ) : !library ? (
          <div className="mt-10 rounded-lg border border-border/70 bg-card p-6">
            <p className="font-medium">Choose your library first</p>
            <p className="mt-1 text-sm text-muted-foreground">Pick a library on the home page, then come back to see availability for this book.</p>
            <button type="button" onClick={() => navigate("/")} className="mt-3 text-sm font-medium text-link underline underline-offset-2">
              Go to the home page
            </button>
          </div>
        ) : (
          <BookDetails key={book.id} book={book} books={books} library={library} />
        )}
      </main>
    </div>
  );
}

function NotOnList() {
  return (
    <div className="mt-10 rounded-lg border border-border/70 bg-card p-6">
      <p className="font-medium">This book isn't on your current list</p>
      <p className="mt-1 text-sm text-muted-foreground">
        It may have been removed, or a different list is loaded on this device. Load your list on the home page and pick the book from there.
      </p>
      <button type="button" onClick={() => navigate("/")} className="mt-3 text-sm font-medium text-link underline underline-offset-2">
        Back to my shelf
      </button>
    </div>
  );
}

function BookDetails({ book, books, library }: { book: Book; books: Book[]; library: LibrarySystem }) {
  const one = useMemo(() => [book], [book]);
  const { entries, pending, retry, live } = useAvailability(one, library);
  const entry = entries.get(bookKey(book));
  const r = entry?.result;
  const checking = pending.has(bookKey(book));
  const L = library.short;
  const { main } = splitSeries(book.title);
  const series = parseSeries(book.title);

  const info = useQuery({
    queryKey: ["bookinfo", book.title, book.author, book.isbn],
    queryFn: () => api.bookInfo(book.title, book.author, book.isbn),
    staleTime: 24 * 3600_000,
    retry: 1,
    enabled: navigator.onLine,
  });
  const config = useQuery({ queryKey: ["config"], queryFn: api.config, staleTime: Infinity, retry: 1 });

  // Club shortlist, shared with the home page through storage.
  const [picks, setPicks] = useState<ClubPick[]>(() => load("club-picks", []));
  const picked = picks.some((p) => p.id === book.id);
  const togglePick = () => {
    const next = picked
      ? picks.filter((p) => p.id !== book.id)
      : [...picks, { id: book.id, title: book.title, author: book.author, imageUrl: book.imageUrl }];
    setPicks(next);
    save("club-picks", next);
  };

  // "More like this" needs the whole shelf and whatever availability is saved for it.
  const shelfCtx = useMemo(() => {
    const saved = live ? loadSaved(library) : {};
    return {
      books,
      lookup: (b: Book) => (bookKey(b) === bookKey(book) ? r : saved[bookKey(b)]?.result),
      aiEnabled: !!config.data?.recommendations,
    };
  }, [books, library, live, book, r, config.data]);

  const statusKey = !live ? "link" : r ? r.status : checking ? "checking" : "waiting";
  const s = STATUS[statusKey];
  const owned = r && (r.status === "available" || r.status === "checked_out" || r.status === "on_order");
  const fallback = catalogLink(library, book.title, book.author, book.isbn);
  const purchase = purchaseSuggestionUrl(library);
  const unverified = !!entry?.failedAt && !!r && r.status !== "error";
  const old = !!entry && Date.now() - entry.at > STALE_MS;
  const primary = "font-medium text-link underline-offset-2 hover:underline";
  const secondary = "text-muted-foreground underline-offset-2 hover:text-foreground hover:underline";
  const cover = book.imageUrl || info.data?.coverUrl || "";
  const d = info.data;
  const facts = [
    d?.firstPublished ? `First published ${d.firstPublished}` : "",
    d?.pages ? `About ${d.pages} pages` : "",
    d?.ratingsAverage && d.ratingsCount ? `${d.ratingsAverage} ★ from ${d.ratingsCount.toLocaleString()} Open Library ratings` : "",
  ].filter(Boolean);

  return (
    <ShelfContext.Provider value={shelfCtx}>
      <article className="pt-8 sm:pt-10">
        {/* Header: cover, title, author, series */}
        <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:gap-8">
          <BigCover src={cover} />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-3xl font-medium leading-tight [overflow-wrap:anywhere] sm:text-4xl">{main}</h1>
            {book.author && <p className="mt-2 text-lg text-muted-foreground">by {book.author}</p>}
            {series && (
              <p className="mt-2 text-sm">
                <span className="rounded-full bg-muted px-2.5 py-1 font-medium">
                  {series.number ? `Book ${series.number} in ${series.name}` : `Part of ${series.name}`}
                </span>
              </p>
            )}
            {facts.length > 0 && <p className="mt-3 text-sm text-muted-foreground">{facts.join(" · ")}</p>}
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              {book.goodreadsUrl && (
                <OutLink href={book.goodreadsUrl} className={secondary}>
                  Open on {book.source === "storygraph" ? "StoryGraph" : "Goodreads"} ↗
                </OutLink>
              )}
              {d?.openLibraryUrl && (
                <OutLink href={d.openLibraryUrl} className={secondary}>
                  Open Library ↗
                </OutLink>
              )}
              <button
                type="button"
                onClick={togglePick}
                aria-pressed={picked}
                className={cx(
                  "rounded-full border px-3 py-1 text-xs transition-colors",
                  picked ? "border-accent-strong bg-accent-strong text-accent-foreground" : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {picked ? "✓ On club shortlist" : "+ Book club shortlist"}
              </button>
            </div>
          </div>
        </div>

        {/* Availability, expanded */}
        <Section title={`At ${library.name}`}>
          <p className="inline-flex items-center gap-2 text-base font-medium" aria-live="polite">
            <span className={cx("h-2.5 w-2.5 shrink-0 rounded-full", s.dot)} aria-hidden />
            {s.label}
          </p>
          {r && owned && <p className="mt-1 text-sm text-muted-foreground">{copiesLine(r)}</p>}
          {live && r?.status === "not_found" && (
            <p className="mt-1 text-sm text-muted-foreground">
              We searched {L} by {book.isbn ? "title, author and ISBN" : "title and author"} and found no match. It may be listed under a different
              title or spelling, or the library may not own it.
            </p>
          )}
          {live && r?.status === "error" && (
            <p className="mt-1 text-sm text-muted-foreground">The {L} catalog didn't respond, so we can't confirm availability right now.</p>
          )}
          {live && entry && r?.status !== "error" && (
            <p className={cx("mt-1 text-xs", unverified || old ? "text-warning" : "text-muted-foreground")}>
              {unverified
                ? `Couldn't re-check · showing what ${L} reported ${timeAgo(entry.at)}`
                : old
                  ? `Checked ${timeAgo(entry.at)} · may have changed`
                  : `Checked ${timeAgo(entry.at)}`}
            </p>
          )}
          {!live && (
            <p className="mt-1 text-sm text-muted-foreground">
              {library.name}'s catalog can't be checked automatically, so use the link below to see copies and place a hold.
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            {live && owned && (
              <OutLink href={r!.catalogUrl || fallback} className={primary}>
                {r!.status === "available" ? `Place hold at ${L} →` : `Join the holds list at ${L} →`}
              </OutLink>
            )}
            {live && r?.status === "not_found" && purchase && (
              <OutLink href={purchase} className={primary}>
                Ask {L} to buy it →
              </OutLink>
            )}
            {(!live || !owned) && (
              <OutLink href={fallback} className={live && r?.status === "not_found" && purchase ? secondary : primary}>
                {catalogLinkLabel(library)}
              </OutLink>
            )}
            {(!live || r?.status === "not_found") && (
              <OutLink href={worldcatUrl(book.title, book.author, book.isbn)} className={secondary}>
                Find it at other libraries ↗
              </OutLink>
            )}
            {live && !checking && (
              <button type="button" onClick={() => retry([book])} className={secondary + " underline"}>
                {r?.status === "error" ? "Try again" : "Check again"}
              </button>
            )}
          </div>

          {live && r?.editions && r.editions.length > 0 && (
            <Editions editions={r.editions} shelfIsbn={book.isbn} exact={!!r.exactEdition} library={library} defaultOpen />
          )}
          <MoreWays title={book.title} author={book.author} isbn={book.isbn} library={library} defaultOpen />
        </Section>

        {/* Series */}
        {series && <SeriesSection book={book} books={books} />}

        {/* About the book */}
        <Section title="About this book">
          {info.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading details…</p>
          ) : d?.description ? (
            <Description text={d.description} />
          ) : (
            <p className="text-sm text-muted-foreground">
              {info.isError || !navigator.onLine ? "Couldn't load details right now." : "No description found on Open Library."}
            </p>
          )}
          {d && d.subjects.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Subjects">
              {d.subjects.map((sub) => (
                <li key={sub} className="rounded-full border border-border/70 px-2.5 py-0.5 text-xs capitalize text-muted-foreground">
                  {sub}
                </li>
              ))}
            </ul>
          )}
          {d?.found && <p className="mt-3 text-xs text-muted-foreground">Details from Open Library; they may describe a different edition.</p>}
        </Section>

        {/* Recommendations, expanded */}
        <Section title="Recommendations">
          <MoreLikeThis book={book} library={library} defaultOpen />
        </Section>
      </article>
    </ShelfContext.Provider>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 min-w-0 rounded-lg border border-border/70 bg-card p-5 sm:p-6">
      <h2 className="mb-3 font-display text-xl font-medium">{title}</h2>
      {children}
    </section>
  );
}

function SeriesSection({ book, books }: { book: Book; books: Book[] }) {
  const series = parseSeries(book.title)!;
  const onList = books
    .map((b) => ({ b, s: parseSeries(b.title) }))
    .filter((x) => x.s && sameSeries(x.s, series))
    .sort((a, c) => seriesOrder(a.s) - seriesOrder(c.s));
  const others = onList.filter((x) => x.b.id !== book.id);
  return (
    <Section title={`The ${series.name} series`}>
      <p className="text-sm text-muted-foreground">
        {series.number ? `This is book ${series.number}. ` : ""}
        {others.length === 0
          ? "No other books from this series are on your list."
          : `${others.length} other ${others.length === 1 ? "book" : "books"} from this series ${others.length === 1 ? "is" : "are"} on your list.`}
      </p>
      {onList.length > 1 && (
        <ol className="mt-3 divide-y divide-border/60">
          {onList.map(({ b, s }) => {
            const current = b.id === book.id;
            return (
              <li key={b.id} className="flex items-baseline gap-3 py-2 text-sm">
                <span className="w-14 shrink-0 text-muted-foreground">{s?.number ? `Book ${s.number}` : "—"}</span>
                {current ? (
                  <span className="min-w-0 font-medium [overflow-wrap:anywhere]">
                    {splitSeries(b.title).main} <span className="font-normal text-muted-foreground">(this book)</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => openBook(b.id)}
                    className="min-w-0 text-left font-medium text-link underline-offset-2 [overflow-wrap:anywhere] hover:underline"
                  >
                    {splitSeries(b.title).main}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <p className="mt-3 text-sm">
        <OutLink href={`https://www.goodreads.com/search?q=${encodeURIComponent(series.name)}`} className="text-link underline-offset-2 hover:underline">
          See the whole series on Goodreads ↗
        </OutLink>
      </p>
    </Section>
  );
}

function Description({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 600;
  const shown = long && !open ? text.slice(0, 600).replace(/\s+\S*$/, "") + "…" : text;
  return (
    <div>
      <div className="space-y-3 text-[0.95rem] leading-relaxed">
        {shown.split(/\n{2,}/).map((p, i) => (
          <p key={i} className="whitespace-pre-line">
            {p}
          </p>
        ))}
      </div>
      {long && (
        <button type="button" onClick={() => setOpen((o) => !o)} className="mt-2 text-sm text-link underline underline-offset-2">
          {open ? "Show less" : "Read more"}
        </button>
      )}
    </div>
  );
}

function BigCover({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  const cls = "h-48 w-32 shrink-0 rounded-md bg-muted sm:h-60 sm:w-40";
  // No cover: a blank box only on wider screens, where it keeps the layout balanced.
  if (!src || failed) return <div className={cx(cls, "hidden sm:block")} aria-hidden />;
  return <img src={src} alt="" onError={() => setFailed(true)} className={cls + " object-cover shadow-lg"} />;
}
