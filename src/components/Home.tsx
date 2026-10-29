import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Book } from "../../shared/types";
import { importLibraryCsv } from "../../shared/importCsv";
import { api } from "../lib/api";
import { LIBRARIES, savedLibrary, type LibrarySystem } from "../lib/libraries";
import { LibraryRequest } from "./LibraryRequest";
import { BookSearchAdd, hitToBook, sameBook, searchBookId, type SearchHit } from "./BookSearchAdd";
import { ExportGuide } from "./ExportGuide";
import { clearAll, load, requestPersistentStorage, save } from "../lib/storage";
import { timeAgo } from "../lib/format";
import { BookClubPanel, type ClubPick } from "./BookClubPanel";
import { SiteFooter, SiteHeader } from "./SiteChrome";
import { LibraryStack, ReadingNook } from "./Illustrations";
import { JournalTeaser, usePageTitle } from "./JournalPages";
import { Recommendations } from "./Recommendations";
import { InstallLink } from "./InstallPrompt";
import { navigate, takeShelfScroll } from "../lib/router";
import { ShelfResults } from "./ShelfResults";
import { Button, Input, OutLink, Select, cx } from "./ui";

/** Where the list on this device came from. "manual" = books added one by one with search. */
type ShelfOrigin = "goodreads" | "file" | "manual";
/** Which way in is showing: search for books, upload an export, or a Goodreads ID. */
type Mode = "search" | "file" | "goodreads";
type SavedShelf = { userId: string; books: Book[]; at: number; origin?: ShelfOrigin; fileName?: string; fileSource?: "storygraph" | "goodreads" };

export function Home() {
  usePageTitle("");
  const [userId, setUserId] = useState(() => load("userId", ""));
  // Boston Public Library is the only library for now; readers elsewhere can request theirs.
  const [libId, setLibId] = useState(() => savedLibrary().id);
  const [requesting, setRequesting] = useState(false);
  const [shelf, setShelf] = useState<SavedShelf | null>(() => load<SavedShelf | null>("shelf", null));
  const [picks, setPicks] = useState<ClubPick[]>(() => load("club-picks", []));
  const [mode, setMode] = useState<Mode>(() => {
    const origin = load<SavedShelf | null>("shelf", null)?.origin;
    if (origin === "manual") return "search";
    // New visitors start with search: they can see real availability before importing anything.
    return origin ?? load<Mode>("mode", "search");
  });
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const config = useQuery({ queryKey: ["config"], queryFn: api.config, staleTime: Infinity, retry: false });

  const library: LibrarySystem | null = useMemo(() => LIBRARIES.find((l) => l.id === libId) ?? null, [libId]);

  useEffect(() => save("club-picks", picks), [picks]);

  // Coming back from a book page: return to the same spot on the shelf.
  useEffect(() => {
    const y = takeShelfScroll();
    if (y == null) return;
    const go = () => window.scrollTo(0, y);
    requestAnimationFrame(go);
    const t = setTimeout(go, 250);
    return () => clearTimeout(t);
  }, []);

  const fetchShelf = useMutation({
    // `auto` = the quiet hourly refresh; its failures aren't shown (the saved list stays).
    mutationFn: (args: { id: string; refresh?: boolean; auto?: boolean }) => api.shelf(args.id, args.refresh),
    onSuccess: (res) => {
      setShelf((prev) => {
        const next: SavedShelf = { userId: res.userId, books: keepHandAdded(prev?.books, res.books), at: Date.now(), origin: "goodreads" };
        save("shelf", next);
        return next;
      });
      save("userId", userId.trim());
      requestPersistentStorage();
      // Bring the results into view, mainly for phones where they start below the fold.
      setTimeout(() => document.getElementById("results-heading")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    },
  });

  // Returning visitor: show the saved shelf right away, then quietly refresh it once an hour.
  useEffect(() => {
    if (shelf && (shelf.origin ?? "goodreads") === "goodreads" && navigator.onLine && Date.now() - shelf.at > 60 * 60_000) {
      fetchShelf.mutate({ id: shelf.userId, refresh: true, auto: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Loads an export's text as the list. Books added by search are kept. */
  const importText = (text: string, fileName: string) => {
    const res = importLibraryCsv(text);
    setShelf((prev) => {
      const next: SavedShelf = {
        userId: "",
        books: keepHandAdded(prev?.books, res.books),
        at: Date.now(),
        origin: "file",
        fileName,
        fileSource: res.source,
      };
      save("shelf", next);
      return next;
    });
    save("stale-snooze-until", 0);
    requestPersistentStorage();
    setTimeout(() => document.getElementById("results-heading")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setFileError(null);
    try {
      if (file.size > 20_000_000) throw new Error("That file is too large to be a library export.");
      importText(await file.text(), file.name);
    } catch (e) {
      setFileError((e as Error).message);
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  // Android: an export shared to the installed app ("Share → Shelf to Stacks") arrives here.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("shared")) return;
    window.history.replaceState({}, "", "/");
    (async () => {
      try {
        const cache = await caches.open("share-target");
        const res = await cache.match("/shared-file");
        if (!res) return;
        const name = decodeURIComponent(res.headers.get("x-file-name") || "export.csv");
        switchMode("file");
        importText(await res.text(), name);
        await cache.delete("/shared-file");
      } catch (e) {
        switchMode("file");
        setFileError((e as Error).message || "We couldn't open the shared file. Try uploading it instead.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Search: add or remove one book by hand.
  const onListState = (h: SearchHit): "added" | "imported" | false => {
    const b = (shelf?.books ?? []).find((x) => x.id === searchBookId(h) || sameBook(x, h));
    return !b ? false : b.source === "search" ? "added" : "imported";
  };
  const toggleSearchBook = (h: SearchHit) => {
    setShelf((prev) => {
      const list = prev?.books ?? [];
      const existing = list.find((x) => x.id === searchBookId(h) || sameBook(x, h));
      if (existing && existing.source !== "search") return prev; // imported books are managed by the upload
      const books = existing ? list.filter((x) => x !== existing) : [...list, hitToBook(h)];
      if (books.length === 0 && (!prev || prev.origin === "manual")) {
        save("shelf", null);
        return null;
      }
      const next: SavedShelf = prev ? { ...prev, books } : { userId: "", books, at: Date.now(), origin: "manual" };
      save("shelf", next);
      return next;
    });
    requestPersistentStorage();
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    save("mode", m);
  };

  const togglePick = (p: ClubPick) =>
    setPicks((prev) => (prev.some((x) => x.id === p.id) ? prev.filter((x) => x.id !== p.id) : [...prev, p]));

  // Goodreads stopped sharing shelf feeds on Oct 28, 2026. While that lasts, the upload is the main way in.
  const feedDown = config.data?.goodreadsFeed === "down";
  const [exportHelpOpen, setExportHelpOpen] = useState(false);
  const goToExport = () => {
    switchMode("file");
    setExportHelpOpen(true);
  };
  const standalone = typeof matchMedia !== "undefined" && matchMedia("(display-mode: standalone)").matches;

  // A list from an export doesn't update itself; after a month, suggest a fresh one.
  const ageDays = shelf ? Math.floor((Date.now() - shelf.at) / 86_400_000) : 0;
  const [snoozeUntil, setSnoozeUntil] = useState(() => load("stale-snooze-until", 0));
  const stale =
    !!shelf &&
    shelf.books.length > 0 &&
    (shelf.origin === "file" || (shelf.origin === "goodreads" && feedDown)) &&
    ageDays >= 30 &&
    Date.now() > snoozeUntil;
  const shelfError = fetchShelf.isError && !fetchShelf.variables?.auto ? (fetchShelf.error as Error & { status?: number; code?: string }) : null;

  const books = shelf?.books ?? [];
  const sameUser = shelf && shelf.userId === userId.trim().match(/\d+/)?.[0];

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <main className="safe-x mx-auto max-w-6xl">
        <section className="grid items-center gap-x-10 pt-6 sm:pt-10 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="relative mx-auto mb-2 w-full max-w-[19rem] sm:max-w-sm lg:order-2 lg:mb-0 lg:max-w-none">
            <ReadingNook className="h-auto w-full" />
            <p className="absolute right-0 top-[4%] hidden rotate-3 items-center gap-2 rounded-2xl bg-card px-3.5 py-2.5 text-sm sm:flex" style={{ boxShadow: "var(--shadow-soft)" }}>
              <span className="h-2.5 w-2.5 rounded-full bg-success" aria-hidden />
              <span>
                <b className="font-extrabold">Live</b> Boston Public Library availability
              </span>
            </p>
          </div>
          <div className="min-w-0 lg:order-1">
          <p className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-sm font-semibold text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-success" aria-hidden />
            Your List × Your Library
          </p>
          <h1 className="mt-4 max-w-[15ch] font-display text-[2.7rem] font-normal leading-[1.05] sm:text-6xl lg:text-[4.2rem]">
            Find your next favorite story <em className="text-link">at the library</em>
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
            Search for books you want to read, or bring your whole Goodreads or StoryGraph list. We'll check every book
            against your library's catalog and show you what's on the shelf right now.
          </p>

          <div
            id="list-tabs"
            role="tablist"
            aria-label="Where your list comes from"
            className="mt-7 flex w-full max-w-md scroll-mt-24 rounded-md border border-border/60 bg-card p-1 text-[0.82rem] sm:inline-flex sm:w-auto sm:text-sm"
          >
            {(
              [
                ["search", "Search books"],
                ["file", "Upload a list"],
                ["goodreads", "Goodreads ID"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={mode === id}
                onClick={() => switchMode(id)}
                className={cx(
                  "min-h-10 flex-1 whitespace-nowrap rounded px-2.5 font-medium transition-colors sm:flex-none sm:px-4",
                  mode === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <ImportOptions onUpload={() => switchMode("file")} feedDown={feedDown} />
          <p className="mt-1 text-sm text-muted-foreground">
            Choosing for a book club?{" "}
            <button type="button" onClick={() => navigate("/club")} className="font-medium text-link underline underline-offset-2">
              Compare members' lists
            </button>
          </p>

          {mode === "search" ? (
            <>
              <BookSearchAdd onList={onListState} onToggle={toggleSearchBook} listCount={books.length} />
              <p className="mt-3 text-sm text-muted-foreground">
                Have a Goodreads or StoryGraph list?{" "}
                <button type="button" onClick={goToExport} className="font-semibold text-link underline underline-offset-2">
                  Upload it
                </button>{" "}
                to check every book at once.
              </p>
            </>
          ) : mode === "goodreads" ? (
          <>
          {feedDown && (
            <div role="status" className="mt-4 max-w-2xl rounded-2xl border border-warning/40 bg-warning/10 p-4 text-sm">
              <p className="font-bold">Goodreads shut down want-to-read feeds</p>
              <p className="mt-1 text-muted-foreground">
                On October 28, 2026, Goodreads turned off the RSS feeds that let apps like Shelf to Stacks read a
                want-to-read list from a profile ID. Upload your Goodreads export instead. It takes about a minute and works
                with private profiles too.
              </p>
              <Button className="mt-3" onClick={goToExport}>
                Upload my Goodreads export
              </Button>
            </div>
          )}
          {!feedDown && (
          <form
            className="mt-4 flex max-w-2xl flex-col gap-3 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              if (userId.trim()) fetchShelf.mutate({ id: userId.trim(), refresh: !!sameUser });
            }}
          >
            <Input
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="Goodreads user ID or profile link"
              aria-label="Goodreads user ID or profile link"
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <Button type="submit" disabled={fetchShelf.isPending || !userId.trim() || !library} className="h-12 shrink-0 px-6">
              {fetchShelf.isPending ? "Loading shelf…" : library ? "Check the catalog" : "Choose a library first"}
            </Button>
          </form>
          )}
          </>
          ) : (
            <div className="mt-4 max-w-2xl">
              <input
                ref={fileInput}
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                id="library-file"
                onChange={(e) => onFile(e.target.files?.[0])}
              />
              <label
                htmlFor="library-file"
                className="flex min-h-12 w-full cursor-pointer items-center justify-center rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground hover:opacity-90 sm:w-auto sm:inline-flex"
              >
                Upload your export file (.csv)
              </label>
              <p className="mt-2 text-sm text-muted-foreground">A StoryGraph or Goodreads library export. The file stays on your device.</p>
              <ExportGuide key={exportHelpOpen ? "open" : "closed"} defaultOpen={exportHelpOpen} installed={standalone} />
              <StoryGraphHelp />
              {fileError && (
                <p role="alert" className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {fileError}
                </p>
              )}
            </div>
          )}

          <div className="mt-4 flex max-w-2xl flex-wrap items-center gap-x-3 gap-y-2 text-sm">
            <label htmlFor="library" className={cx(library ? "text-muted-foreground" : "font-medium text-foreground")}>
              My library
            </label>
            <Select
              id="library"
              value={libId}
              onChange={(e) => {
                // "Request a different library" opens the request form; the chosen library stays as it was.
                if (e.target.value === "request") return setRequesting(true);
                setLibId(e.target.value);
                save("library", e.target.value);
              }}
              className={cx("min-w-0 max-w-full flex-1 sm:flex-none", !library && "ring-2 ring-accent")}
            >
              {LIBRARIES.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
              <option value="request">Request a different library…</option>
            </Select>
          </div>

          {requesting ? (
            <LibraryRequest onClose={() => setRequesting(false)} />
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Borrow somewhere else?{" "}
              <button type="button" onClick={() => setRequesting(true)} className="text-link underline underline-offset-2">
                Request a different library
              </button>
            </p>
          )}

          {mode === "goodreads" && !feedDown && <HelpHint />}

          {shelfError && mode === "goodreads" && (
            <div role="alert" className="mt-4 max-w-2xl rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm">
              <p className="text-destructive">{shelfError.message}</p>
              {shelfError.code === "feed_unavailable" ? (
                <Button className="mt-3" onClick={goToExport}>
                  Upload my Goodreads export
                </Button>
              ) : (
                shelfError.status !== 400 && (
                  <button type="button" onClick={goToExport} className="mt-1 text-link underline underline-offset-2">
                    Upload your Goodreads export instead
                  </button>
                )
              )}
            </div>
          )}
          {shelf && !fetchShelf.isPending && (shelf.origin ?? "goodreads") === "goodreads" && (
            <p className="mt-3 text-xs text-muted-foreground">
              Shelf loaded {timeAgo(shelf.at)}.{" "}
              {feedDown ? (
                "This is your saved copy. Goodreads shut down the feed that kept it up to date, so upload a new export when your list changes."
              ) : (
                <button
                  type="button"
                  className="underline underline-offset-2 hover:text-foreground"
                  onClick={() => fetchShelf.mutate({ id: shelf.userId, refresh: true })}
                >
                  Reload from Goodreads
                </button>
              )}
            </p>
          )}
          {shelf && shelf.origin === "manual" && mode !== "search" && (
            <p className="mt-3 text-xs text-muted-foreground">
              {books.length} {books.length === 1 ? "book" : "books"} added by search.{" "}
              <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => switchMode("search")}>
                Add more
              </button>
            </p>
          )}
          {shelf && shelf.origin === "file" && (
            <p className="mt-3 text-xs text-muted-foreground">
              {shelf.fileSource === "goodreads" ? "Goodreads" : "StoryGraph"} list uploaded {timeAgo(shelf.at)}
              {shelf.fileName ? ` (${shelf.fileName})` : ""}.{" "}
              <label htmlFor="library-file" className="cursor-pointer underline underline-offset-2 hover:text-foreground" onClick={() => switchMode("file")}>
                Upload a newer export
              </label>
            </p>
          )}
          </div>
        </section>

        {stale && (
          <div role="status" className="mt-10 flex flex-wrap items-center justify-between gap-3 rounded-[1.4rem] bg-butter p-5 text-[#4a3728]">
            <div className="min-w-0 max-w-xl">
              <p className="font-display text-xl">Your list is {ageDays} days old</p>
              <p className="mt-1 text-sm">
                Books you've added on Goodreads or StoryGraph since {new Date(shelf!.at).toLocaleDateString(undefined, { month: "long", day: "numeric" })} won't
                show up here. Upload a newer export to bring them in.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  goToExport();
                  setTimeout(() => document.getElementById("list-tabs")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
                }}
                className="btn-ledge min-h-11 rounded-full bg-[#f2c4c4] px-5 text-sm font-extrabold"
                style={{ ["--primary-edge" as string]: "#e3a7a7" }}
              >
                Upload a newer export
              </button>
              <button
                type="button"
                onClick={() => {
                  const until = Date.now() + 14 * 86_400_000;
                  save("stale-snooze-until", until);
                  setSnoozeUntil(until);
                }}
                className="text-sm font-bold underline underline-offset-2"
              >
                Remind me in 2 weeks
              </button>
            </div>
          </div>
        )}

        {books.length > 0 && !library && (
          <div className="mt-10 rounded-lg border border-border/70 bg-card p-5">
            <h2 id="results-heading" className="font-display text-2xl">
              {books.length} {books.length === 1 ? "book" : "books"} ready to check
            </h2>
            <p className="mt-1 text-muted-foreground">Choose your library to see which ones you can borrow.</p>
            <Button className="mt-4" onClick={() => document.getElementById("library")?.focus()}>
              Choose my library
            </Button>
          </div>
        )}
        {books.length > 0 && library && (
          <>
            <ShelfResults
              key={`${library.id}:${library.biblioCode ?? ""}`}
              books={books}
              library={library}
              picks={picks}
              onTogglePick={togglePick}
              aiEnabled={!!config.data?.recommendations}
            />
            <BookClubPanel picks={picks} onRemove={(id) => setPicks((p) => p.filter((x) => x.id !== id))} />
            {config.data?.recommendations && <Recommendations books={books} library={library} />}
          </>
        )}
        {shelf && books.length === 0 && (
          <p className="mt-8 italic text-muted-foreground">
            {shelf.origin === "file"
              ? "That export has no books marked to-read."
              : "Goodreads returned no books. Either the Want to Read shelf is empty, or it's hidden by privacy settings. Make the profile public, or upload your Goodreads export instead."}
          </p>
        )}

        <JournalTeaser />

        <About
          feedDown={feedDown}
          onUpload={() => {
            switchMode("file");
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      </main>

      <SiteFooter />
    </div>
  );
}

/** What each import option reads, and its limits. */
function ImportOptions({ onUpload, feedDown }: { onUpload: () => void; feedDown: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 max-w-2xl text-sm">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="py-1 text-muted-foreground underline underline-offset-2 hover:text-foreground">
        What can I import?
      </button>
      {open && (
        <div className="mt-2 overflow-hidden rounded-md border border-border/60 bg-card">
          <dl className="divide-y divide-border/60">
            {[
              [
                "Search books",
                "Find books by title or author and add them one at a time.",
                "Nothing to import. Books you add stay on your list when you upload an export later.",
              ],
              [
                "Goodreads profile link",
                "Your Want to Read shelf: title, author, ISBN, cover. Refreshes itself hourly.",
                feedDown
                  ? "Not working: Goodreads shut down these RSS feeds on October 28, 2026. Use the export file instead."
                  : "Profile and shelf must be public. Up to 1,000 books. Other shelves aren't read.",
              ],
              [
                "Goodreads export file",
                "Books on your to-read shelf from My Books → Import and export → Export Library.",
                "Works with private profiles. Doesn't update by itself; upload a new export when your list changes.",
              ],
              [
                "StoryGraph export file",
                "Books marked to-read from Manage Account → Export StoryGraph Library.",
                "StoryGraph has no live link, so upload a new export when your list changes. Covers come from Open Library.",
              ],
            ].map(([name, reads, limits]) => (
              <div key={name} className="p-3">
                <dt className="font-medium">{name}</dt>
                <dd className="mt-0.5 text-muted-foreground">{reads}</dd>
                <dd className="mt-0.5 text-muted-foreground">
                  <span className="font-medium text-foreground">Limits: </span>
                  {limits}
                </dd>
              </div>
            ))}
          </dl>
          <p className="border-t border-border/60 p-3 text-muted-foreground">
            Ratings, reviews and reading history aren't used. Nothing is uploaded to a server except title, author and ISBN
            for library lookups.{" "}
            <button type="button" onClick={onUpload} className="text-link underline underline-offset-2">
              Upload a file
            </button>
          </p>
        </div>
      )}
    </div>
  );
}

function StoryGraphHelp() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 text-sm text-muted-foreground">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="py-1 underline underline-offset-2 hover:text-foreground">
        How do I get my StoryGraph export?
      </button>
      {open && (
        <div className="mt-2 rounded-md border border-border/60 bg-card p-3 leading-relaxed">
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              On{" "}
              <OutLink href="https://app.thestorygraph.com/" className="underline">
                app.thestorygraph.com
              </OutLink>
              , tap your profile picture, then <b>Manage Account</b>.
            </li>
            <li>
              Scroll to <b>Manage Your Data</b> and tap <b>Export StoryGraph Library</b>, then <b>Generate export</b>.
            </li>
            <li>Download the CSV file when it's ready, then upload it here.</li>
          </ol>
          <p className="mt-2">
            We use the books marked <em>to-read</em>. The file stays on your device. A Goodreads library export (CSV) works
            here too.
          </p>
        </div>
      )}
    </div>
  );
}

function HelpHint() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 max-w-2xl text-sm text-muted-foreground">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="py-1 underline underline-offset-2 hover:text-foreground">
        Where do I find my Goodreads user ID?
      </button>
      {open && (
        <div className="mt-2 rounded-md border border-border/60 bg-card p-3 leading-relaxed">
          Open your Goodreads profile. The address looks like{" "}
          <code className="rounded bg-muted px-1 [overflow-wrap:anywhere]">
            goodreads.com/user/show/<b>1234567</b>-jane
          </code>
          . The number is your ID — or just paste the whole link. Your profile and your <em>Want to Read</em> shelf need to
          be public: in Goodreads, go to{" "}
          <OutLink href="https://www.goodreads.com/user/edit?tab=settings" className="underline">
            Settings → Privacy
          </OutLink>{" "}
          and set “Who can view my profile” to <em>anyone</em>.
        </div>
      )}
    </div>
  );
}

function About({ onUpload, feedDown }: { onUpload: () => void; feedDown: boolean }) {
  return (
    <section id="about" className="mt-24 scroll-mt-24">
      <div className="grid items-center gap-10 md:grid-cols-2 md:gap-14">
        <LibraryStack />
        <div>
          <p className="font-script text-2xl text-link">our little corner</p>
          <blockquote className="font-display text-[1.75rem] italic leading-snug md:text-[2.1rem]">
            “We're a small team who believe books should feel like a hug.”
          </blockquote>
          <p className="mt-4 max-w-lg text-[1.05rem] leading-relaxed text-muted-foreground">
            Shelf to Stacks started with one long want-to-read list and a library card. It checks your whole list against
            Boston Public Library in one go, keeps everything on your device, and helps your book club pick its next read
            with a ranked vote.
          </p>
          <div className="mt-5 flex flex-wrap gap-2.5 text-sm font-bold">
            {["♡ No account needed", "Live library availability", "Book club votes"].map((f) => (
              <span key={f} className="rounded-full border-[1.5px] border-border bg-card px-4 py-2">
                {f}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-14 grid gap-6 text-[0.95rem] leading-relaxed text-muted-foreground md:grid-cols-2">
        <div className="rounded-[1.4rem] bg-card p-6" style={{ boxShadow: "var(--shadow-soft)" }}>
          <h2 className="font-display text-2xl text-foreground">How it works</h2>
          <p className="mt-2">
            {feedDown
              ? "We read the to-read books in your Goodreads or StoryGraph export"
              : "We read your public Goodreads Want to Read shelf (or the to-read books in a Goodreads or StoryGraph export)"}
            , then look each book up in Boston Public Library's catalog for live availability. Borrow somewhere else? Use
            “Request a different library” and we'll look into adding it.
          </p>
          <p className="mt-3">
            {feedDown ? (
              <>
                <b className="text-foreground">Goodreads shut down its want-to-read feeds</b> on October 28, 2026, so a
                Goodreads export is now the way to bring your list.{" "}
              </>
            ) : (
              <>
                <b className="text-foreground">Goodreads profiles must be public.</b> Goodreads closed its public API, so we
                can only read public Want to Read shelves.{" "}
              </>
            )}
            <button type="button" onClick={onUpload} className="font-semibold text-link underline underline-offset-2">
              Upload your Goodreads export
            </button>
          </p>
        </div>
        <div className="rounded-[1.4rem] bg-card p-6" style={{ boxShadow: "var(--shadow-soft)" }}>
          <h2 className="font-display text-2xl text-foreground">Your data stays with you</h2>
          <p className="mt-2">
            No account needed. Your list, library, last results, book club shortlist and display choices are saved only on
            this device, so the app opens instantly next time and still works offline.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            <InstallLink className="btn-ledge inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground">
              <PhoneIcon />
              Add to your home screen
            </InstallLink>
            <button
              type="button"
              className="underline underline-offset-2 hover:text-foreground"
              onClick={() => {
                if (window.confirm("Remove your saved list, library and results from this device?")) {
                  clearAll();
                  window.location.reload();
                }
              }}
            >
              Clear saved data
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden className="fill-none stroke-current" strokeWidth="2">
      <rect x="7" y="2.5" width="10" height="19" rx="2" />
      <path d="M11 18.5h2" strokeLinecap="round" />
    </svg>
  );
}

/** A new list replaces the old one, but books added by search stay unless the new list has them too. */
function keepHandAdded(prev: Book[] | undefined, next: Book[]): Book[] {
  const extra = (prev ?? []).filter((b) => b.source === "search" && !next.some((n) => sameBook(n, b)));
  return [...next, ...extra];
}
