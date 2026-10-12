import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { Book } from "../../shared/types";
import { api } from "../lib/api";
import {
  DEFAULT_LIBRARY,
  LIBRARIES,
  makeCustomLibrary,
  type CustomLibraryInput,
  type LibrarySystem,
} from "../lib/libraries";
import { load, requestPersistentStorage, save } from "../lib/storage";
import { timeAgo } from "../lib/format";
import { BookClubPanel, type ClubPick } from "./BookClubPanel";
import { Logo } from "./Logo";
import { Recommendations } from "./Recommendations";
import { ShelfResults } from "./ShelfResults";
import { Button, Input, OutLink, Select } from "./ui";

type SavedShelf = { userId: string; books: Book[]; at: number };

export function Home() {
  const [userId, setUserId] = useState(() => load("userId", ""));
  const [libId, setLibId] = useState(() => load("library", DEFAULT_LIBRARY.id));
  const [custom, setCustom] = useState<CustomLibraryInput>(() => load("custom-library", { name: "", catalog: "", libby: "" }));
  const [shelf, setShelf] = useState<SavedShelf | null>(() => load<SavedShelf | null>("shelf", null));
  const [picks, setPicks] = useState<ClubPick[]>(() => load("club-picks", []));
  const config = useQuery({ queryKey: ["config"], queryFn: api.config, staleTime: Infinity, retry: false });

  const library: LibrarySystem = useMemo(
    () => (libId === "custom" ? makeCustomLibrary(custom) : (LIBRARIES.find((l) => l.id === libId) ?? DEFAULT_LIBRARY)),
    [libId, custom],
  );

  useEffect(() => save("club-picks", picks), [picks]);

  const fetchShelf = useMutation({
    mutationFn: (args: { id: string; refresh?: boolean }) => api.shelf(args.id, args.refresh),
    onSuccess: (res) => {
      const next = { userId: res.userId, books: res.books, at: Date.now() };
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
    if (shelf && navigator.onLine && Date.now() - shelf.at > 60 * 60_000) {
      fetchShelf.mutate({ id: shelf.userId, refresh: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const togglePick = (p: ClubPick) =>
    setPicks((prev) => (prev.some((x) => x.id === p.id) ? prev.filter((x) => x.id !== p.id) : [...prev, p]));

  const books = shelf?.books ?? [];
  const sameUser = shelf && shelf.userId === userId.trim().match(/\d+/)?.[0];

  return (
    <div className="min-h-screen">
      <header className="safe-top border-b border-border/60 bg-card/70 backdrop-blur">
        <div className="safe-x mx-auto flex h-16 max-w-6xl items-center justify-between gap-3">
          <Logo />
          <a href="#about" className="py-2 text-sm text-muted-foreground hover:text-foreground">
            How it works
          </a>
        </div>
      </header>

      <main className="safe-x mx-auto max-w-6xl pb-28">
        <section className="pt-10 sm:pt-14">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Goodreads × {library.name}</p>
          <h1 className="mt-3 font-display text-5xl font-medium leading-[1.05] md:text-6xl">
            From your shelf
            <br />
            <span className="italic text-accent">to the stacks.</span>
          </h1>
          <p className="mt-5 max-w-xl leading-relaxed text-muted-foreground">
            Drop in your Goodreads user ID and we'll walk your want-to-read shelf against your library's catalog — no
            more searching one book at a time.
          </p>

          <form
            className="mt-7 flex max-w-2xl flex-col gap-3 sm:flex-row"
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
            <Button type="submit" disabled={fetchShelf.isPending || !userId.trim()} className="h-12 shrink-0 px-6">
              {fetchShelf.isPending ? "Loading shelf…" : "Check the catalog"}
            </Button>
          </form>

          <div className="mt-4 flex max-w-2xl flex-wrap items-center gap-x-3 gap-y-2 text-sm">
            <label htmlFor="library" className="text-muted-foreground">
              My library
            </label>
            <Select
              id="library"
              value={libId}
              onChange={(e) => {
                setLibId(e.target.value);
                save("library", e.target.value);
              }}
              className="min-w-0 max-w-full flex-1 sm:flex-none"
            >
              {LIBRARIES.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
              <option value="custom">Other library…</option>
            </Select>
          </div>

          {libId === "custom" && (
            <CustomLibraryForm
              value={custom}
              onChange={(v) => {
                setCustom(v);
                save("custom-library", v);
              }}
              library={library}
            />
          )}

          <HelpHint />

          {fetchShelf.isError && (
            <p role="alert" className="mt-4 max-w-2xl rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {(fetchShelf.error as Error).message}
            </p>
          )}
          {shelf && !fetchShelf.isPending && (
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
        </section>

        {books.length > 0 && (
          <>
            <ShelfResults key={`${library.id}:${library.biblioCode ?? ""}`} books={books} library={library} picks={picks} onTogglePick={togglePick} />
            <BookClubPanel picks={picks} onRemove={(id) => setPicks((p) => p.filter((x) => x.id !== id))} />
            {config.data?.recommendations && <Recommendations books={books} library={library} />}
          </>
        )}
        {shelf && books.length === 0 && (
          <p className="mt-8 italic text-muted-foreground">
            That shelf came back empty. Check that your Goodreads profile and Want to Read shelf are public.
          </p>
        )}

        <About />
      </main>

      <footer className="safe-bottom border-t border-border/60 py-8 text-center text-xs text-muted-foreground">
        Made for library readers. Catalog data via BiblioCommons · Ebooks via Libby · Shelf data via Goodreads.
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

function About() {
  return (
    <section id="about" className="mt-16 max-w-2xl border-t border-border/60 pt-10 text-sm leading-relaxed text-muted-foreground">
      <h2 className="font-display text-xl text-foreground">How it works</h2>
      <p className="mt-2">
        We read your public Goodreads Want to Read shelf, then look each book up in your library's catalog. Boston Public
        Library (and any library on BiblioCommons) gets live availability; Minuteman libraries get a direct catalog link
        for each book.
      </p>
      <p className="mt-2">
        No account needed. Your Goodreads ID, library and last results are saved only on this device, so the app opens
        instantly next time and still works offline.
      </p>
    </section>
  );
}
