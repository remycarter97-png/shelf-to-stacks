import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { findCommonBooks, type ClubMember } from "../../shared/clubMatch";
import { importLibraryCsv } from "../../shared/importCsv";
import { bookKey, type Book } from "../../shared/types";
import { api } from "../lib/api";
import { createVote } from "../lib/club";
import { LIBRARIES, makeCustomLibrary, type CustomLibraryInput, type LibrarySystem } from "../lib/libraries";
import { navigate } from "../lib/router";
import { load, save } from "../lib/storage";
import { supabase } from "../lib/supabase";
import { timeAgo } from "../lib/format";
import { useAvailability } from "../lib/useAvailability";
import { formatCode, useClubSync } from "../lib/clubSync";
import { Logo } from "./Logo";
import { Button, Input, OutLink, Select, cx } from "./ui";

type Member = ClubMember & {
  source: "goodreads" | "storygraph" | "goodreads-file";
  goodreadsId?: string;
  fileName?: string;
  at: number;
};

const CLUBS_KEY = "clubs:v1";
const ACTIVE_KEY = "active-club";
const OLD_MEMBERS_KEY = "club-members";
const MAX_CLUBS = 20;

type Club = { id: string; name: string; members: Member[] };

/** Saved clubs. The first version kept one unnamed member list; it becomes "My book club". */
function loadClubs(): Club[] {
  const clubs = load<Club[] | null>(CLUBS_KEY, null);
  if (clubs?.length) return clubs;
  return [{ id: "club-1", name: "My book club", members: load<Member[]>(OLD_MEMBERS_KEY, []) }];
}
const MAX_MEMBERS = 15;

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

/** The app's own saved shelf, so "Add my list" is one tap. */
function myShelf(): { books: Book[]; source: Member["source"]; goodreadsId?: string } | null {
  const s = load<{ books: Book[]; userId: string; origin?: string; fileSource?: string } | null>("shelf", null);
  if (!s?.books?.length) return null;
  if (s.origin === "file") return { books: s.books, source: s.fileSource === "goodreads" ? "goodreads-file" : "storygraph" };
  return { books: s.books, source: "goodreads", goodreadsId: s.userId };
}

function sourceLabel(m: Member) {
  return m.source === "goodreads" ? "Goodreads profile" : m.source === "goodreads-file" ? "Goodreads export" : "StoryGraph export";
}

export function ClubPage() {
  const [clubs, setClubs] = useState<Club[]>(loadClubs);
  const [activeId, setActiveId] = useState<string>(() => {
    const id = load<string>(ACTIVE_KEY, "");
    const all = loadClubs();
    return all.some((c) => c.id === id) ? id : all[0].id;
  });
  // Synced copies replace the list; never let it end up empty.
  const replaceClubs = useCallback(
    (next: Club[]) => setClubs(next.length ? next : [{ id: newId(), name: "My book club", members: [] }]),
    [],
  );
  const sync = useClubSync(clubs, replaceClubs);
  const club = clubs.find((c) => c.id === activeId) ?? clubs[0];
  const members = club.members;
  const setMembers = (fn: (list: Member[]) => Member[]) =>
    setClubs((cs) => cs.map((c) => (c.id === club.id ? { ...c, members: fn(c.members) } : c)));
  const [minLists, setMinLists] = useState(2);
  const [selected, setSelected] = useState<string[]>([]);
  const [voteTitle, setVoteTitle] = useState("");
  const [voteErr, setVoteErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [refreshing, setRefreshing] = useState<string | null>(null);

  useEffect(() => save(CLUBS_KEY, clubs), [clubs]);
  useEffect(() => save(ACTIVE_KEY, club.id), [club.id]);

  const switchClub = (id: string) => {
    setActiveId(id);
    setSelected([]);
    setMinLists(2);
  };
  const newClub = () => {
    const name = window.prompt("Name for the new book club:", `Book club ${clubs.length + 1}`)?.trim();
    if (!name) return;
    const c: Club = { id: newId(), name: name.slice(0, 60), members: [] };
    setClubs((cs) => [...cs, c].slice(0, MAX_CLUBS));
    switchClub(c.id);
  };
  const renameClub = () => {
    const name = window.prompt("Rename this book club:", club.name)?.trim();
    if (name) setClubs((cs) => cs.map((c) => (c.id === club.id ? { ...c, name: name.slice(0, 60) } : c)));
  };
  const deleteClub = () => {
    if (!window.confirm(`Delete “${club.name}” and its ${members.length} saved members from this device?`)) return;
    const rest = clubs.filter((c) => c.id !== club.id);
    const next = rest.length ? rest : [{ id: newId(), name: "My book club", members: [] }];
    setClubs(next);
    switchClub(next[0].id);
  };

  const libId = load<string>("library", "");
  const library: LibrarySystem | null =
    libId === "custom"
      ? makeCustomLibrary(load<CustomLibraryInput>("custom-library", { name: "", catalog: "", libby: "" }))
      : (LIBRARIES.find((l) => l.id === libId) ?? null);

  const common = useMemo(() => findCommonBooks(members), [members]);
  const shared = useMemo(() => common.filter((c) => c.members.length >= minLists), [common, minLists]);
  const sharedBooks = useMemo(() => shared.slice(0, 120).map((c) => c.book), [shared]);
  const maxShared = common[0]?.members.length ?? 0;

  const addMember = (m: Member) => {
    setMembers((list) => [...list.filter((x) => !(m.goodreadsId && x.goodreadsId === m.goodreadsId)), m].slice(0, MAX_MEMBERS));
    setSelected([]);
  };
  const removeMember = (id: string) => {
    setMembers((list) => list.filter((m) => m.id !== id));
    setSelected([]);
  };
  const refreshMember = async (m: Member) => {
    if (!m.goodreadsId) return;
    setRefreshing(m.id);
    try {
      const res = await api.shelf(m.goodreadsId, true);
      setMembers((list) => list.map((x) => (x.id === m.id ? { ...x, books: res.books, at: Date.now() } : x)));
    } catch {
      /* keep the last copy */
    } finally {
      setRefreshing(null);
    }
  };

  const toggle = (key: string) =>
    setSelected((s) => (s.includes(key) ? s.filter((k) => k !== key) : s.length < 12 ? [...s, key] : s));

  const startVote = async () => {
    setCreating(true);
    setVoteErr(null);
    try {
      const books = shared.filter((c) => selected.includes(c.key)).map((c) => c.book);
      await createVote(voteTitle.trim() || `${club.name}: our next pick`, books.map((b) => ({ title: b.title, author: b.author, imageUrl: b.imageUrl })));
    } catch (e) {
      setVoteErr((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const mine = myShelf();
  const haveMine = !!mine && members.some((m) => m.name === "Me");

  return (
    <div className="min-h-screen">
      <header className="safe-top border-b border-border/60 bg-card/70 backdrop-blur">
        <div className="safe-x mx-auto flex h-16 max-w-6xl items-center justify-between gap-3">
          <button type="button" onClick={() => navigate("/")} aria-label="Shelf to Stacks home">
            <Logo />
          </button>
          <button type="button" onClick={() => navigate("/")} className="py-2 text-sm text-muted-foreground hover:text-foreground">
            ← My shelf
          </button>
        </div>
      </header>

      <main className="safe-x safe-bottom mx-auto max-w-6xl pb-16 pt-8">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Book club</p>
        <h1 className="mt-2 font-display text-4xl font-medium leading-tight md:text-5xl">Find books your club has in common</h1>
        <p className="mt-3 max-w-2xl leading-relaxed text-muted-foreground">
          Add each member's Goodreads profile or StoryGraph list. We'll show the books that are on the most lists, so you
          can pick a shortlist and start a ranked vote.
        </p>

        <section className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border/70 bg-card p-3" aria-label="Your book clubs">
          <label htmlFor="club-select" className="text-sm text-muted-foreground">
            Club
          </label>
          <Select id="club-select" value={club.id} onChange={(e) => switchClub(e.target.value)} className="min-w-0 flex-1 basis-[calc(100%-4rem)] sm:max-w-sm sm:basis-auto">
            {clubs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.members.length})
              </option>
            ))}
          </Select>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {clubs.length < MAX_CLUBS && (
              <button type="button" onClick={newClub} className="py-1 font-medium text-link underline underline-offset-2">
                + New club
              </button>
            )}
            <button type="button" onClick={renameClub} className="py-1 text-muted-foreground underline underline-offset-2 hover:text-foreground">
              Rename
            </button>
            <button type="button" onClick={deleteClub} className="py-1 text-muted-foreground underline underline-offset-2 hover:text-foreground">
              Delete
            </button>
          </div>
        </section>

        {sync.available && <SyncPanel sync={sync} />}

        <section className="mt-8" aria-labelledby="members-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="members-heading" className="font-display text-2xl">
              {club.name} members {members.length > 0 && <span className="text-muted-foreground">({members.length})</span>}
            </h2>
            {mine && !haveMine && (
              <button
                type="button"
                className="py-1 text-sm font-medium text-link underline underline-offset-2"
                onClick={() => addMember({ id: newId(), name: "Me", books: mine.books, source: mine.source, goodreadsId: mine.goodreadsId, at: Date.now() })}
              >
                + Add my list ({mine.books.length} books)
              </button>
            )}
          </div>

          {members.length > 0 && (
            <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {members.map((m) => (
                <li key={m.id} className="flex min-w-0 items-start justify-between gap-3 rounded-lg border border-border/70 bg-card p-4">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{m.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {m.books.length} to-read · {sourceLabel(m)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {m.fileName ? `${m.fileName} · ` : ""}updated {timeAgo(m.at)}
                      {m.goodreadsId && (
                        <>
                          {" · "}
                          <button type="button" className="underline underline-offset-2" onClick={() => refreshMember(m)} disabled={refreshing === m.id}>
                            {refreshing === m.id ? "refreshing…" : "refresh"}
                          </button>
                        </>
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeMember(m.id)}
                    aria-label={`Remove ${m.name}`}
                    className="h-9 w-9 shrink-0 rounded-md text-muted-foreground hover:bg-muted"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}

          {members.length < MAX_MEMBERS ? (
            <AddMember onAdd={addMember} count={members.length} />
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">That's the maximum of {MAX_MEMBERS} members.</p>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Members' lists are saved only on this device. Goodreads profiles must be public; anyone with a private profile can
            send you their Goodreads or StoryGraph export file instead.
          </p>
        </section>

        <section className="mt-12 border-t border-border/60 pt-8" aria-labelledby="common-heading">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="common-heading" className="font-display text-2xl">
              Books in common
            </h2>
            {members.length >= 3 && (
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                On at least
                <Select value={minLists} onChange={(e) => { setMinLists(Number(e.target.value)); setSelected([]); }} className="h-10 w-20">
                  {Array.from({ length: members.length - 1 }, (_, i) => i + 2).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </Select>
                lists
              </label>
            )}
          </div>

          {members.length < 2 ? (
            <p className="mt-3 text-muted-foreground">Add at least two members to compare lists.</p>
          ) : shared.length === 0 ? (
            <div className="mt-3 rounded-md border border-border/60 bg-card p-4 text-sm">
              <p className="font-medium">
                {maxShared < 2 ? "No book is on more than one list yet." : `No book is on ${minLists} or more lists.`}
              </p>
              <p className="mt-1 text-muted-foreground">
                {maxShared >= 2
                  ? `The most any book is shared is ${maxShared} lists. Lower the number above to see them.`
                  : "Try adding more members, or ask everyone to add a few candidates to their to-read lists."}
              </p>
            </div>
          ) : (
            <CommonList
              shared={shared}
              books={sharedBooks}
              memberCount={members.length}
              library={library}
              selected={selected}
              onToggle={toggle}
            />
          )}
        </section>

        {shared.length > 0 && (
          <section className="sticky bottom-0 z-10 -mx-4 mt-6 border-t border-border/60 bg-background/95 px-4 py-4 backdrop-blur sm:mx-0 sm:rounded-lg sm:border" aria-label="Start a vote">
            {!supabase ? (
              <p className="text-sm text-muted-foreground">Book club voting isn't set up on this site yet.</p>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <p className="text-sm sm:w-48 sm:shrink-0">
                  <b>{selected.length}</b> selected {selected.length < 2 ? "· pick at least 2" : "· max 12"}
                </p>
                <div className="flex flex-wrap gap-2 sm:hidden">
                  <QuickPicks shared={shared} onPick={setSelected} />
                </div>
                <Input value={voteTitle} onChange={(e) => setVoteTitle(e.target.value)} placeholder={`${club.name}: our next pick`} aria-label="Name of the vote" maxLength={120} className="h-11" />
                <div className="hidden gap-2 sm:flex">
                  <QuickPicks shared={shared} onPick={setSelected} />
                </div>
                <Button variant="primary" onClick={startVote} disabled={creating || selected.length < 2} className="shrink-0">
                  {creating ? "Creating…" : "Start ranked vote"}
                </Button>
              </div>
            )}
            {voteErr && (
              <p role="alert" className="mt-2 text-sm text-destructive">
                {voteErr}
              </p>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

function QuickPicks({ shared, onPick }: { shared: ReturnType<typeof findCommonBooks>; onPick: (keys: string[]) => void }) {
  // Short lists get "Select all"; longer ones get Top 3 / Top 5.
  const sizes = shared.length <= 5 ? [Math.min(shared.length, 12)] : [3, 5];
  return (
    <>
      {sizes.map((n) => (
        <Button key={n} variant="outline" className="min-h-10 shrink-0 px-3" onClick={() => onPick(shared.slice(0, n).map((c) => c.key))}>
          {shared.length <= 5 ? `Select all ${n}` : `Top ${n}`}
        </Button>
      ))}
      <Button variant="ghost" className="min-h-10 shrink-0 px-2" onClick={() => onPick([])}>
        Clear
      </Button>
    </>
  );
}

function CommonList({
  shared,
  books,
  memberCount,
  library,
  selected,
  onToggle,
}: {
  shared: ReturnType<typeof findCommonBooks>;
  books: Book[];
  memberCount: number;
  library: LibrarySystem | null;
  selected: string[];
  onToggle: (key: string) => void;
}) {
  const [limit, setLimit] = useState(20);
  // Library availability helps pick a book everyone can actually borrow.
  const avail = useAvailability(books, library ?? { id: "none", name: "", short: "", mode: "link", network: "custom" });
  const L = library?.short;
  return (
    <>
      <p className="mt-2 text-sm text-muted-foreground">
        {shared.length} {shared.length === 1 ? "book" : "books"}, most-shared first. Tap books to add them to a vote.
        {library?.mode === "live" ? ` Availability is at ${library.name}.` : ""}
      </p>
      <ul className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        {shared.slice(0, limit).map((c) => {
          const on = selected.includes(c.key);
          const r = avail.entries.get(bookKey(c.book))?.result;
          const checking = avail.pending.has(bookKey(c.book));
          return (
            <li key={c.key}>
              <button
                type="button"
                onClick={() => onToggle(c.key)}
                aria-pressed={on}
                className={cx(
                  "flex w-full min-w-0 gap-4 rounded-lg border bg-card p-4 text-left transition-colors",
                  on ? "border-accent-strong ring-2 ring-accent/40" : "border-border/70",
                )}
              >
                <span
                  className={cx(
                    "mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded border text-sm",
                    on ? "border-primary bg-primary text-primary-foreground" : "border-border",
                  )}
                  aria-hidden
                >
                  {on ? "✓" : ""}
                </span>
                <Cover src={c.book.imageUrl} />
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-lg leading-snug [overflow-wrap:anywhere]">{c.book.title.replace(/\s*\([^)]*\)\s*$/, "")}</span>
                  {c.book.author && <span className="block text-sm text-muted-foreground">by {c.book.author}</span>}
                  <span className="mt-1.5 block text-sm">
                    <b>
                      On {c.members.length} of {memberCount} lists
                    </b>
                    <span className="text-muted-foreground"> · {c.members.map((m) => m.name).join(", ")}</span>
                  </span>
                  {library?.mode === "live" && (
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {checking && !r
                        ? `Checking ${L}…`
                        : !r
                          ? ""
                          : r.status === "available"
                            ? `Available at ${L} · ${r.availableCopies} of ${r.totalCopies} on the shelf`
                            : r.status === "checked_out"
                              ? `Owned by ${L} · all ${r.totalCopies} out${r.heldCopies ? `, ${r.heldCopies} holds` : ""}`
                              : r.status === "on_order"
                                ? `On order at ${L}`
                                : r.status === "not_found"
                                  ? `Not found at ${L}`
                                  : `Couldn't check ${L}`}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {shared.length > limit && (
        <Button variant="outline" className="mt-4" onClick={() => setLimit((n) => n + 20)}>
          Show more ({shared.length - limit} left)
        </Button>
      )}
    </>
  );
}

function Cover({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <span className="h-20 w-14 flex-shrink-0 rounded-sm bg-muted" aria-hidden />;
  return <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} className="h-20 w-14 flex-shrink-0 rounded-sm bg-muted object-cover shadow" />;
}

function AddMember({ onAdd, count }: { onAdd: (m: Member) => void; count: number }) {
  const [name, setName] = useState("");
  const [how, setHow] = useState<"goodreads" | "file">("goodreads");
  const [gid, setGid] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const displayName = name.trim() || `Member ${count + 1}`;

  const addGoodreads = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await api.shelf(gid.trim());
      if (res.books.length === 0) throw new Error("That Goodreads Want to Read shelf is empty or private.");
      onAdd({ id: newId(), name: displayName, books: res.books, source: "goodreads", goodreadsId: res.userId, at: Date.now() });
      setName("");
      setGid("");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const addFile = async (file?: File) => {
    if (!file) return;
    setErr(null);
    try {
      const res = importLibraryCsv(await file.text());
      if (res.books.length === 0) throw new Error("That export has no books marked to-read.");
      onAdd({
        id: newId(),
        name: displayName,
        books: res.books,
        source: res.source === "goodreads" ? "goodreads-file" : "storygraph",
        fileName: file.name,
        at: Date.now(),
      });
      setName("");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="mt-4 max-w-2xl rounded-lg border border-border/70 bg-card p-4">
      <p className="font-medium">Add a member</p>
      <div className="mt-3 grid gap-3">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={`Name (e.g. ${count === 0 ? "Sam" : "Jo"})`} aria-label="Member's name" maxLength={40} className="h-11" />
        <div role="tablist" aria-label="Where their list comes from" className="inline-flex w-fit rounded-md border border-border/60 bg-background p-1 text-sm">
          {(
            [
              ["goodreads", "Goodreads profile"],
              ["file", "StoryGraph / export file"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={how === id}
              onClick={() => setHow(id)}
              className={cx("min-h-10 rounded px-3 font-medium", how === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {label}
            </button>
          ))}
        </div>
        {how === "goodreads" ? (
          <form
            className="flex flex-col gap-3 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              if (gid.trim()) void addGoodreads();
            }}
          >
            <Input
              value={gid}
              onChange={(e) => setGid(e.target.value)}
              placeholder="Their Goodreads user ID or profile link"
              aria-label="Member's Goodreads user ID or profile link"
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className="h-11"
            />
            <Button type="submit" disabled={busy || !gid.trim()} className="shrink-0">
              {busy ? "Loading…" : `Add ${displayName}`}
            </Button>
          </form>
        ) : (
          <div>
            <input ref={fileRef} id="member-file" type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => addFile(e.target.files?.[0])} />
            <label
              htmlFor="member-file"
              className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:opacity-90 sm:w-auto"
            >
              Upload {displayName}'s export (.csv)
            </label>
            <p className="mt-2 text-xs text-muted-foreground">
              StoryGraph: Manage Account → Export StoryGraph Library. Goodreads:{" "}
              <OutLink href="https://www.goodreads.com/review/import" className="underline">
                goodreads.com/review/import
              </OutLink>{" "}
              → Export Library. Members can email or text you the file.
            </p>
          </div>
        )}
        {err && (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {err}
          </p>
        )}
      </div>
    </div>
  );
}

function SyncPanel({ sync }: { sync: ReturnType<typeof useClubSync> }) {
  const [open, setOpen] = useState(false);
  const [entering, setEntering] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      setEntering(false);
      setCode("");
      setOpen(true);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const label =
    sync.status === "off"
      ? "Off · clubs are saved on this device only"
      : sync.status === "saving"
        ? "Saving…"
        : sync.status === "offline"
          ? "Offline · changes will sync when you're back online"
          : sync.status === "error"
            ? "Couldn't sync"
            : "On · synced";

  return (
    <section className="mt-3 rounded-lg border border-border/70 bg-card p-3 text-sm" aria-label="Sync across devices">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p>
          <span className="font-medium">Sync across devices: </span>
          <span className={cx(sync.status === "error" ? "text-destructive" : "text-muted-foreground")}>{label}</span>
        </p>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="py-1 font-medium text-link underline underline-offset-2">
          {sync.code ? (open ? "Hide" : "Sync code") : open ? "Hide" : "Set up"}
        </button>
      </div>
      {sync.message && <p className="mt-1 text-destructive">{sync.message}</p>}

      {open && (
        <div className="mt-3 border-t border-border/60 pt-3">
          {sync.code ? (
            <>
              <p className="text-muted-foreground">Enter this code on your other phone, tablet or computer to see the same clubs there.</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <code className="rounded-md bg-muted px-3 py-2 font-mono text-base tracking-wider">{formatCode(sync.code)}</code>
                <Button
                  variant="outline"
                  className="min-h-10 px-3"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(formatCode(sync.code!));
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    } catch {
                      /* clipboard blocked */
                    }
                  }}
                >
                  {copied ? "Copied!" : "Copy"}
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Treat it like a password: anyone with the code can see and change these clubs. Share it only with people who
                help run your clubs.
              </p>
              <button
                type="button"
                className="mt-2 py-1 text-muted-foreground underline underline-offset-2 hover:text-foreground"
                onClick={() => {
                  if (window.confirm("Stop syncing on this device? Your clubs stay here, and the code keeps working on your other devices.")) sync.disable();
                }}
              >
                Turn off sync on this device
              </button>
            </>
          ) : entering ? (
            <form
              className="flex flex-col gap-2 sm:flex-row"
              onSubmit={(e) => {
                e.preventDefault();
                void run(() => sync.link(code));
              }}
            >
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="XXXX-XXXX-XXXX-XXXX"
                aria-label="Sync code from your other device"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                className="h-11 font-mono uppercase tracking-wider"
              />
              <Button type="submit" disabled={busy || !code.trim()} className="shrink-0">
                {busy ? "Connecting…" : "Connect"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setEntering(false)}>
                Cancel
              </Button>
            </form>
          ) : (
            <>
              <p className="text-muted-foreground">
                Sync saves your clubs online under a private code, so the same clubs show up on your other devices. No account
                needed.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button onClick={() => run(sync.enable)} disabled={busy}>
                  {busy ? "Turning on…" : "Turn on sync"}
                </Button>
                <Button variant="outline" onClick={() => setEntering(true)}>
                  I have a code
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Already using sync on another device? Tap “I have a code”. Clubs from both devices are combined.
              </p>
            </>
          )}
          {err && (
            <p role="alert" className="mt-2 text-destructive">
              {err}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
