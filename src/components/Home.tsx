import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Book } from "../../shared/types";
import { importLibraryCsv } from "../../shared/importCsv";
import { api } from "../lib/api";
import {
  LIBRARIES,
  makeCustomLibrary,
  type CustomLibraryInput,
  type LibrarySystem,
} from "../lib/libraries";
import { clearAll, load, requestPersistentStorage, save } from "../lib/storage";
import { timeAgo } from "../lib/format";
import { BookClubPanel, type ClubPick } from "./BookClubPanel";
import { Logo } from "./Logo";
import { Recommendations } from "./Recommendations";
import { InstallLink } from "./InstallPrompt";
import { navigate, takeShelfScroll } from "../lib/router";
import { ShelfResults } from "./ShelfResults";
import { Button, Input, OutLink, Select, cx } from "./ui";

/** "goodreads" = live from the Goodreads feed; "file" = uploaded export (StoryGraph or Goodreads). */
type ShelfOrigin = "goodreads" | "file";
type SavedShelf = { userId: string; books: Book[]; at: number; origin?: ShelfOrigin; fileName?: string; fileSource?: "storygraph" | "goodreads" };

export function Home() {
  const [userId, setUserId] = useState(() => load("userId", ""));
  // No library is picked for a first-time visitor; the page asks them to choose one.
  const [libId, setLibId] = useState(() => load("library", ""));
  const [custom, setCustom] = useState<CustomLibraryInput>(() => load("custom-library", { name: "", catalog: "", libby: "" }));
  const [shelf, setShelf] = useState<SavedShelf | null>(() => load<SavedShelf | null>("shelf", null));
  const [picks, setPicks] = useState<ClubPick[]>(() => load("club-picks", []));
  const [mode, setMode] = useState<ShelfOrigin>(() => load<SavedShelf | null>("shelf", null)?.origin ?? load<ShelfOrigin>("mode", "goodreads"));
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const config = useQuery({ queryKey: ["config"], queryFn: api.config, staleTime: Infinity, retry: false });

  const library: LibrarySystem | null = useMemo(
    () => (libId === "custom" ? makeCustomLibrary(custom) : (LIBRARIES.find((l) => l.id === libId) ?? null)),
    [libId, custom],
  );

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
    mutationFn: (args: { id: string; refresh?: boolean }) => api.shelf(args.id, args.refresh),
    onSuccess: (res) => {
      const next: SavedShelf = { userId: res.userId, books: res.books, at: Date.now(), origin: "goodreads" };
      setShelf(next);
      save("shelf", next);
      save("userId", userId.trim());
      requestPersistentStorage();
      // Bring the results into view, mainly for phones where they start below the fold.
      setTimeout(() => document.getElementById("results-heading")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    },
  });

  // Returning visitor: show the saved shelf right away, then quietly refresh it once an hour.
  useEffect(() => {
    if (shelf && (shelf.origin ?? "goodreads") === "goodreads" && navigator.onLine && Date.now() - shelf.at > 60 * 60_000) {
      fetchShelf.mutate({ id: shelf.userId, refresh: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setFileError(null);
    try {
      if (file.size > 20_000_000) throw new Error("That file is too large to be a library export.");
      const res = importLibraryCsv(await file.text());
      const next: SavedShelf = { userId: "", books: res.books, at: Date.now(), origin: "file", fileName: file.name, fileSource: res.source };
      setShelf(next);
      save("shelf", next);
      requestPersistentStorage();
      setTimeout(() => document.getElementById("results-heading")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (e) {
      setFileError((e as Error).message);
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const switchMode = (m: ShelfOrigin) => {
    setMode(m);
    save("mode", m);
  };

  const togglePick = (p: ClubPick) =>
    setPicks((prev) => (prev.some((x) => x.id === p.id) ? prev.filter((x) => x.id !== p.id) : [...prev, p]));

  const books = shelf?.books ?? [];
  const sameUser = shelf && shelf.userId === userId.trim().match(/\d+/)?.[0];

  return (
    <div className="min-h-screen">
      <header className="safe-top border-b border-border/60 bg-card/70 backdrop-blur">
        <div className="safe-x mx-auto flex h-16 max-w-6xl items-center justify-between gap-3">
          <Logo />
          <nav className="flex items-center gap-4 text-sm">
            <InstallLink className="inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-border px-3 font-medium text-foreground hover:bg-muted">
              <PhoneIcon />
              Get the app
            </InstallLink>
            <button type="button" onClick={() => navigate("/club")} className="hidden whitespace-nowrap py-2 text-muted-foreground hover:text-foreground sm:inline">
              Book club
            </button>
            <a href="#about" className="hidden whitespace-nowrap py-2 text-muted-foreground hover:text-foreground sm:inline">
              How it works
            </a>
          </nav>
        </div>
      </header>

      <main className="safe-x mx-auto max-w-6xl pb-12">
        <section className="pt-10 sm:pt-14">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            {mode === "file" ? "StoryGraph" : "Goodreads"} × {library?.name ?? "your library"}
          </p>
          <h1 className="mt-3 font-display text-5xl font-medium leading-[1.05] md:text-6xl">
            From your shelf
            <br />
            <span className="italic text-accent">to the stacks.</span>
          </h1>
          <p className="mt-5 max-w-xl leading-relaxed text-muted-foreground">
            Bring your Goodreads or StoryGraph want-to-read list and we'll walk it against your library's catalog — no
            more searching one book at a time.
          </p>

          <div role="tablist" aria-label="Where your list comes from" className="mt-7 inline-flex rounded-md border border-border/60 bg-card p-1 text-sm">
            {(
              [
                ["goodreads", "Goodreads"],
                ["file", "StoryGraph"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={mode === id}
                onClick={() => switchMode(id)}
                className={cx(
                  "min-h-10 rounded px-4 font-medium transition-colors",
                  mode === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <ImportOptions onUpload={() => switchMode("file")} />
          <p className="mt-1 text-sm text-muted-foreground">
            Choosing for a book club?{" "}
            <button type="button" onClick={() => navigate("/club")} className="font-medium text-link underline underline-offset-2">
              Compare members' lists
            </button>
          </p>

          {mode === "goodreads" ? (
          <>
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
                className="flex min-h-12 w-full cursor-pointer items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:opacity-90 sm:w-auto sm:inline-flex"
              >
                Upload your export file (.csv)
              </label>
              <p className="mt-2 text-sm text-muted-foreground">A StoryGraph or Goodreads library export. The file stays on your device.</p>
              <StoryGraphHelp />
              <GoodreadsExportHelp />
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
                setLibId(e.target.value);
                save("library", e.target.value);
              }}
              className={cx("min-w-0 max-w-full flex-1 sm:flex-none", !library && "ring-2 ring-accent")}
              aria-describedby={!library ? "library-hint" : undefined}
            >
              <option value="" disabled>
                Choose your library…
              </option>
              {LIBRARIES.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
              <option value="custom">Other library…</option>
            </Select>
          </div>

          {!library && libId !== "custom" && (
            <p id="library-hint" className="mt-2 text-sm text-muted-foreground">
              Pick the library where you borrow books. Boston Public Library gets live availability; you can also enter
              another library with “Other library…”.
            </p>
          )}

          {libId === "custom" && (
            <CustomLibraryForm
              value={custom}
              onChange={(v) => {
                setCustom(v);
                save("custom-library", v);
              }}
              library={library!}
            />
          )}

          {mode === "goodreads" && <HelpHint />}

          {fetchShelf.isError && (
            <div role="alert" className="mt-4 max-w-2xl rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm">
              <p className="text-destructive">{(fetchShelf.error as Error).message}</p>
              {(fetchShelf.error as Error & { status?: number }).status !== 400 && (
                <button type="button" onClick={() => switchMode("file")} className="mt-1 text-link underline underline-offset-2">
                  Upload your Goodreads export instead
                </button>
              )}
            </div>
          )}
          {shelf && !fetchShelf.isPending && (shelf.origin ?? "goodreads") === "goodreads" && (
            <p className="mt-3 text-xs text-muted-foreground">
              Shelf loaded {timeAgo(shelf.at)}.{" "}
              <button
                type="button"
                className="underline underline-offset-2 hover:text-foreground"
                onClick={() => fetchShelf.mutate({ id: shelf.userId, refresh: true })}
              >
                Reload from Goodreads
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
        </section>

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

        <About
          onUpload={() => {
            switchMode("file");
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      </main>

      <footer className="safe-bottom border-t border-border/60">
        <p className="safe-x mx-auto max-w-6xl py-8 text-sm leading-relaxed text-muted-foreground">
          Made for library readers. Catalog data via BiblioCommons · Ebooks via Libby · Shelf data via Goodreads or your StoryGraph export.
        </p>
      </footer>
    </div>
  );
}

function CustomLibraryForm({
  value,
  onChange,
  library,
}: {
  value: CustomLibraryInput;
  onChange: (v: CustomLibraryInput) => void;
  library: LibrarySystem;
}) {
  return (
    <div className="mt-4 grid max-w-2xl gap-3 rounded-md border border-border/60 bg-card p-4 text-sm">
      <label className="grid gap-1">
        <span className="font-medium">Library system name</span>
        <Input value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} placeholder="e.g. Chicago Public Library" className="h-11" />
      </label>
      <label className="grid gap-1">
        <span className="font-medium">
          Catalog web address <span className="font-normal text-muted-foreground">(optional)</span>
        </span>
        <Input
          value={value.catalog}
          onChange={(e) => onChange({ ...value, catalog: e.target.value })}
          placeholder="e.g. chipublib.bibliocommons.com"
          className="h-11"
          inputMode="url"
          autoCapitalize="off"
          spellCheck={false}
        />
      </label>
      <label className="grid gap-1">
        <span className="font-medium">
          Libby library <span className="font-normal text-muted-foreground">(optional)</span>
        </span>
        <Input
          value={value.libby}
          onChange={(e) => onChange({ ...value, libby: e.target.value })}
          placeholder="e.g. libbyapp.com/library/chipublib"
          className="h-11"
          inputMode="url"
          autoCapitalize="off"
          spellCheck={false}
        />
      </label>
      <p className="text-muted-foreground">
        {library.mode === "live"
          ? `Your catalog runs on BiblioCommons, so we'll check availability live.`
          : "If your catalog's address ends in bibliocommons.com we can check availability live. Otherwise each book links to a search of libraries near you."}
      </p>
    </div>
  );
}

/** What each import option reads, and its limits. */
function ImportOptions({ onUpload }: { onUpload: () => void }) {
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
                "Goodreads profile link",
                "Your Want to Read shelf: title, author, ISBN, cover. Refreshes itself hourly.",
                "Profile and shelf must be public. Up to 1,000 books. Other shelves aren't read.",
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

function GoodreadsExportHelp() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1 text-sm text-muted-foreground">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="py-1 underline underline-offset-2 hover:text-foreground">
        How do I get my Goodreads export?
      </button>
      {open && (
        <div className="mt-2 rounded-md border border-border/60 bg-card p-3 leading-relaxed">
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              On a computer or in a mobile browser, open{" "}
              <OutLink href="https://www.goodreads.com/review/import" className="underline">
                goodreads.com/review/import
              </OutLink>{" "}
              (My Books → Import and export). The Goodreads app can't do this.
            </li>
            <li>
              Tap <b>Export Library</b> and wait for the link to appear.
            </li>
            <li>Download the CSV file, then upload it here. We use the books on your to-read shelf.</li>
          </ol>
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

function About({ onUpload }: { onUpload: () => void }) {
  return (
    <section id="about" className="mt-16 border-t border-border/60 pt-10 text-sm leading-relaxed text-muted-foreground">
      <h2 className="font-display text-xl text-foreground">How it works</h2>
      <p className="mt-2">
        We read your public Goodreads Want to Read shelf (or the to-read books in a StoryGraph export), then look each
        book up in your library's catalog. Boston Public
        Library (and any library on BiblioCommons) gets live availability; Minuteman libraries get a direct catalog link
        for each book.
      </p>
      <p className="mt-2">
        No account needed. Your list, library, last results, book club shortlist and display choices are saved only on
        this device, so the app opens instantly next time and still works offline.{" "}
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
      </p>
      <InstallLink className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:opacity-90">
        <PhoneIcon />
        Add Shelf to Stacks to your home screen
      </InstallLink>
      <p className="mt-8 border-t border-border/60 pt-6">
        <b className="font-medium text-foreground">Goodreads profiles must be public.</b> Goodreads closed its public API,
        so we can only read public Want to Read shelves.{" "}
        <button type="button" onClick={onUpload} className="text-link underline underline-offset-2">
          Private profile? Upload your Goodreads export
        </button>
      </p>
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
