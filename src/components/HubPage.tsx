import { useCallback, useEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { buildIcs, googleCalendarUrl, keyFromHash, ratingSummary, splitMeetings, toLocalInput, type HubMeeting } from "../../shared/hub";
import { api } from "../lib/api";
import {
  addBook,
  booksIAdded,
  checkKey,
  deleteMeeting,
  forgetOrganizerKey,
  keepOrganizerKey,
  loadHub,
  memberLink,
  organizerKey,
  organizerLink,
  rateBook,
  rememberHub,
  removeBook,
  renameHub,
  saveMeeting,
  setStatus,
  startHubVote,
  type HubBook,
  type HubData,
} from "../lib/hub";
import { navigate } from "../lib/router";
import { load, save } from "../lib/storage";
import { supabase } from "../lib/supabase";
import { SiteFooter, SiteHeader } from "./SiteChrome";
import { Button, Input, OutLink, Select, cx } from "./ui";

type Flash = { text: string; ok: boolean } | null;

/** One shared name for votes, suggestions and ratings, remembered on this device. */
function useName() {
  const [name, setName] = useState(() => load("voter-name", ""));
  const keep = (n: string) => {
    setName(n);
    save("voter-name", n.trim().slice(0, 60));
  };
  return [name, keep] as const;
}

async function shareOrCopy(url: string, title: string, setCopied: (s: string) => void, label: string) {
  try {
    if (navigator.share && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) await navigator.share({ title, url });
    else {
      await navigator.clipboard.writeText(url);
      setCopied(label);
      setTimeout(() => setCopied(""), 2000);
    }
  } catch {
    /* share sheet closed */
  }
}

export function HubPage({ hubId }: { hubId: string }) {
  const [data, setData] = useState<HubData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [isOrganizer, setIsOrganizer] = useState(false);
  const [flash, setFlash] = useState<Flash>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useName();
  const [copied, setCopied] = useState("");

  const refresh = useCallback(async () => {
    try {
      const d = await loadHub(hubId);
      setData(d);
      setLoadErr(null);
      if (d) rememberHub(hubId, d.name);
    } catch (e) {
      setLoadErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [hubId]);

  // The organizer link carries the key after "#key=". Keep it on this device, then take it out
  // of the address bar so sharing the page from here only ever shares the member link.
  useEffect(() => {
    if (!supabase) return setLoading(false);
    const fromLink = keyFromHash(window.location.hash);
    if (fromLink) window.history.replaceState({}, "", window.location.pathname);
    const key = fromLink || organizerKey(hubId);
    if (key) {
      checkKey(hubId, key)
        .then((ok) => {
          if (ok) keepOrganizerKey(hubId, key);
          else if (!fromLink) forgetOrganizerKey(hubId);
          setIsOrganizer(ok);
          if (fromLink && !ok) setFlash({ ok: false, text: "That organizer link isn't valid for this club. You're seeing the member view." });
        })
        .catch(() => setIsOrganizer(false));
    }
    void refresh();
    const t = setInterval(() => document.visibilityState === "visible" && refresh(), 20_000);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [hubId, refresh]);

  /** Runs a change, shows the outcome, and reloads the page's data. */
  const act = useCallback(
    async (fn: () => Promise<unknown>, ok?: string) => {
      setBusy(true);
      setFlash(null);
      try {
        await fn();
        if (ok) setFlash({ ok: true, text: ok });
        await refresh();
        return true;
      } catch (e) {
        setFlash({ ok: false, text: (e as Error).message });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const books = data?.books ?? [];
  const suggested = books.filter((b) => b.status === "suggested");
  const current = books.filter((b) => b.status === "current");
  const read = books
    .filter((b) => b.status === "read")
    .sort((a, b) => (b.finished_on ?? "").localeCompare(a.finished_on ?? ""));
  const ratings = useMemo(() => ratingSummary(data?.ratings ?? []), [data?.ratings]);
  const { upcoming } = useMemo(() => splitMeetings(data?.meetings ?? []), [data?.meetings]);
  const bookById = (id: string | null) => books.find((b) => b.id === id) ?? null;

  const shared = { hubId, busy, act, isOrganizer, name, setName };

  return (
    <div className="min-h-screen">
      <SiteHeader
        width="max-w-4xl"
        actions={
          data && (
            <Button variant="outline" className="min-h-10 px-3.5" onClick={() => shareOrCopy(memberLink(hubId), data.name, setCopied, "member")}>
              {copied === "member" ? "Link copied!" : "Share club link"}
            </Button>
          )
        }
      />

      <main className="safe-x mx-auto max-w-4xl pt-6">
        {!supabase ? (
          <p className="mt-8 text-muted-foreground">Book club features aren't set up on this site yet.</p>
        ) : loading ? (
          <p className="mt-8 text-muted-foreground">Loading your club…</p>
        ) : loadErr && !data ? (
          <div className="mt-8">
            <p className="text-destructive">{loadErr}</p>
            <Button variant="outline" className="mt-3" onClick={() => void refresh()}>
              Try again
            </Button>
          </div>
        ) : !data ? (
          <p className="mt-8 text-muted-foreground">This club page doesn't exist. Check the link with whoever sent it.</p>
        ) : (
          <>
            <p className="text-sm font-bold text-muted-foreground">Book club</p>
            <h1 className="mt-2 font-display text-4xl font-medium leading-tight [overflow-wrap:anywhere] md:text-5xl">{data.name}</h1>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Suggest books for upcoming sessions, vote on what's next, and rate what we've read.
            </p>

            {isOrganizer && <OrganizerBar {...shared} clubName={data.name} copied={copied} setCopied={setCopied} />}

            {flash && (
              <p role="status" className={cx("mt-4 rounded-md border p-3 text-sm", flash.ok ? "border-success/40 text-success" : "border-destructive/40 text-destructive")}>
                {flash.text}
              </p>
            )}

            <MeetingSection {...shared} upcoming={upcoming} clubName={data.name} books={books} bookById={bookById} />

            {current.length > 0 && (
              <Section title="Reading now" id="current">
                <ul className="mt-4 grid gap-3">
                  {current.map((b) => (
                    <li key={b.id}>
                      <BookRow book={b}>
                        <RatingBlock {...shared} book={b} summary={ratings.get(b.id)} all={data.ratings} />
                        {isOrganizer && (
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                            <LinkButton onClick={() => act(() => setStatus(hubId, b.id, "read"), `Moved “${b.title}” to past reads.`)} disabled={busy}>
                              Mark as finished
                            </LinkButton>
                            <LinkButton onClick={() => act(() => setStatus(hubId, b.id, "suggested"), "Moved back to suggestions.")} disabled={busy}>
                              Move back to suggestions
                            </LinkButton>
                          </div>
                        )}
                      </BookRow>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {data.polls.length > 0 && (
              <Section title="Votes" id="votes">
                <ul className="mt-3 grid gap-2">
                  {data.polls.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => navigate(`/vote/${p.id}`)}
                        className="flex w-full items-center justify-between gap-3 rounded-lg border border-border/70 bg-card p-4 text-left hover:bg-muted/50"
                      >
                        <span className="min-w-0">
                          <span className="block font-medium [overflow-wrap:anywhere]">{p.title}</span>
                          <span className="block text-sm text-muted-foreground">
                            {p.voters} {p.voters === 1 ? "person has" : "people have"} voted · started {new Date(p.created_at).toLocaleDateString()}
                          </span>
                        </span>
                        <span className="shrink-0 text-sm font-medium text-link">Vote →</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            <SuggestionsSection {...shared} suggested={suggested} hasCurrent={current.length > 0} currentTitle={current[0]?.title} clubName={data.name} />

            <Section title="Past reads" id="past" count={read.length}>
              {read.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  Books the club finishes show up here, where everyone can rate them.
                  {isOrganizer && " Use “Mark as finished” on the current read, or add a book you read before this page existed from the suggestions."}
                </p>
              ) : (
                <ul className="mt-4 grid gap-3">
                  {read.map((b) => (
                    <li key={b.id}>
                      <BookRow book={b} meta={b.finished_on ? `Finished ${formatDay(b.finished_on)}` : undefined}>
                        <RatingBlock {...shared} book={b} summary={ratings.get(b.id)} all={data.ratings} />
                        {isOrganizer && (
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                            <LinkButton onClick={() => act(() => setStatus(hubId, b.id, "current"), `“${b.title}” is the current read again.`)} disabled={busy}>
                              Make current again
                            </LinkButton>
                            <LinkButton
                              onClick={() => {
                                if (window.confirm(`Remove “${b.title}” and its ratings from the club page?`)) void act(() => removeBook(hubId, b.id), "Removed.");
                              }}
                              disabled={busy}
                            >
                              Remove
                            </LinkButton>
                          </div>
                        )}
                      </BookRow>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <p className="mt-12 text-xs text-muted-foreground">
              Anyone with this page's link can suggest and rate books. Your name is saved on this device so you don't have to retype it.
            </p>
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

type Shared = {
  hubId: string;
  busy: boolean;
  act: (fn: () => Promise<unknown>, ok?: string) => Promise<boolean>;
  isOrganizer: boolean;
  name: string;
  setName: (n: string) => void;
};

// ---------------- Organizer bar ----------------

function OrganizerBar({ hubId, act, busy, clubName, copied, setCopied }: Shared & { clubName: string; copied: string; setCopied: (s: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="mt-5 rounded-lg border border-accent-strong/40 bg-accent/10 p-4 text-sm" aria-label="Organizer tools">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p>
          <b>You're the organizer</b> on this device. You can schedule meetings, start votes, and manage the list.
        </p>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="py-1 text-muted-foreground underline underline-offset-2 hover:text-foreground">
          {open ? "Hide links" : "Links & settings"}
        </button>
      </div>
      {open && (
        <div className="mt-3 grid gap-3 border-t border-border/60 pt-3">
          <div>
            <p className="font-medium">Member link: send this to your club</p>
            <div className="mt-1 flex flex-col gap-2 sm:flex-row">
              <Input readOnly value={memberLink(hubId)} className="h-10 text-sm" onFocus={(e) => e.currentTarget.select()} aria-label="Member link" />
              <Button variant="outline" className="min-h-10 shrink-0" onClick={() => shareOrCopy(memberLink(hubId), clubName, setCopied, "member2")}>
                {copied === "member2" ? "Copied!" : "Copy"}
              </Button>
            </div>
          </div>
          <div>
            <p className="font-medium">Organizer link: keep this private</p>
            <p className="text-muted-foreground">
              Opens this page with organizer tools on another phone or computer, or for a co-organizer. Anyone with it can change the club.
            </p>
            <Button
              variant="outline"
              className="mt-2 min-h-10"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(organizerLink(hubId, organizerKey(hubId)));
                  setCopied("org");
                  setTimeout(() => setCopied(""), 2000);
                } catch {
                  window.prompt("Copy your organizer link:", organizerLink(hubId, organizerKey(hubId)));
                }
              }}
            >
              {copied === "org" ? "Organizer link copied!" : "Copy organizer link"}
            </Button>
          </div>
          <div>
            <LinkButton
              disabled={busy}
              onClick={() => {
                const n = window.prompt("Club name:", clubName)?.trim();
                if (n && n !== clubName) void act(() => renameHub(hubId, n), "Club renamed.");
              }}
            >
              Rename club
            </LinkButton>
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------- Meetings ----------------

function MeetingSection({
  hubId,
  act,
  busy,
  isOrganizer,
  upcoming,
  clubName,
  books,
  bookById,
}: Shared & { upcoming: HubMeeting[]; clubName: string; books: HubBook[]; bookById: (id: string | null) => HubBook | null }) {
  const [editing, setEditing] = useState<HubMeeting | "new" | null>(null);
  const next = upcoming[0];
  const later = upcoming.slice(1);

  return (
    <Section title="Next meeting" id="meeting">
      {editing ? (
        <MeetingForm
          meeting={editing === "new" ? null : editing}
          books={books}
          busy={busy}
          onCancel={() => setEditing(null)}
          onSave={async (m) => {
            if (await act(() => saveMeeting(hubId, m), "Meeting saved.")) setEditing(null);
          }}
          onDelete={
            editing !== "new"
              ? async () => {
                  if (window.confirm("Delete this meeting?") && (await act(() => deleteMeeting(hubId, editing.id), "Meeting deleted."))) setEditing(null);
                }
              : undefined
          }
        />
      ) : !next ? (
        <div className="mt-3 rounded-lg border border-dashed border-border bg-card p-4 text-sm">
          <p className="text-muted-foreground">No meeting scheduled yet.</p>
          {isOrganizer && (
            <Button className="mt-3" onClick={() => setEditing("new")}>
              Schedule the next meeting
            </Button>
          )}
        </div>
      ) : (
        <>
          <MeetingCard meeting={next} clubName={clubName} book={bookById(next.book_id)} hubId={hubId} onEdit={isOrganizer ? () => setEditing(next) : undefined} />
          {later.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-medium text-muted-foreground">Coming up after that</h3>
              <ul className="mt-2 grid gap-2">
                {later.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-card px-3 py-2 text-sm">
                    <span className="min-w-0 [overflow-wrap:anywhere]">
                      <b>{formatWhen(m.starts_at)}</b>
                      {bookById(m.book_id) ? ` · ${bookById(m.book_id)!.title}` : ""}
                      {m.location ? ` · ${m.location}` : ""}
                    </span>
                    {isOrganizer && (
                      <LinkButton onClick={() => setEditing(m)} disabled={busy}>
                        Edit
                      </LinkButton>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {isOrganizer && (
            <LinkButton className="mt-3" onClick={() => setEditing("new")} disabled={busy}>
              + Add another meeting
            </LinkButton>
          )}
        </>
      )}
    </Section>
  );
}

function MeetingCard({ meeting, clubName, book, hubId, onEdit }: { meeting: HubMeeting; clubName: string; book: HubBook | null; hubId: string; onEdit?: () => void }) {
  const event = {
    uid: meeting.id,
    title: book ? `${clubName}: ${book.title}` : clubName,
    start: new Date(meeting.starts_at),
    location: meeting.location,
    description: [
      book ? `Book: ${book.title}${book.author ? ` by ${book.author}` : ""}` : "",
      meeting.host ? `Host: ${meeting.host}` : "",
      meeting.notes,
      `Club page: ${memberLink(hubId)}`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
  const downloadIcs = () => {
    const blob = new Blob([buildIcs(event)], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "book-club.ics";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className="mt-3 rounded-lg border border-border/70 bg-card p-4">
      <div className="flex gap-4">
        {book && <Cover src={book.image_url} />}
        <div className="min-w-0 flex-1">
          <p className="font-display text-2xl leading-snug">{formatWhen(meeting.starts_at)}</p>
          <dl className="mt-2 grid gap-1 text-sm">
            {book && <Detail label="Book">{book.title}{book.author ? ` by ${book.author}` : ""}</Detail>}
            {meeting.location && (
              <Detail label="Where">
                <OutLink href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(meeting.location)}`} className="underline underline-offset-2">
                  {meeting.location}
                </OutLink>
              </Detail>
            )}
            {meeting.host && <Detail label="Host">{meeting.host}</Detail>}
          </dl>
          {meeting.notes && <p className="mt-2 whitespace-pre-line text-sm [overflow-wrap:anywhere]">{meeting.notes}</p>}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <Button variant="outline" className="min-h-10 px-3" onClick={downloadIcs}>
          Add to calendar
        </Button>
        <OutLink href={googleCalendarUrl(event)} className="py-1 text-link underline underline-offset-2">
          Google Calendar
        </OutLink>
        {onEdit && (
          <LinkButton onClick={onEdit} className="ml-auto">
            Edit meeting
          </LinkButton>
        )}
      </div>
    </div>
  );
}

function MeetingForm({
  meeting,
  books,
  busy,
  onSave,
  onCancel,
  onDelete,
}: {
  meeting: HubMeeting | null;
  books: HubBook[];
  busy: boolean;
  onSave: (m: { id: string | null; startsAt: string; location: string; host: string; notes: string; bookId: string | null }) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const current = books.find((b) => b.status === "current");
  const [when, setWhen] = useState(meeting ? toLocalInput(meeting.starts_at) : "");
  const [location, setLocation] = useState(meeting?.location ?? "");
  const [host, setHost] = useState(meeting?.host ?? "");
  const [notes, setNotes] = useState(meeting?.notes ?? "");
  const [bookId, setBookId] = useState<string>(meeting ? (meeting.book_id ?? "") : (current?.id ?? ""));
  const choices = books.filter((b) => b.status !== "read" || b.id === bookId);
  const valid = !!when && !Number.isNaN(new Date(when).getTime());

  return (
    <form
      className="mt-3 grid gap-3 rounded-lg border border-border/70 bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        onSave({ id: meeting?.id ?? null, startsAt: new Date(when).toISOString(), location, host, notes, bookId: bookId || null });
      }}
    >
      <Field label="Date and time">
        <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} required className="h-11" />
      </Field>
      <Field label="Where">
        <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Address, café, or video link" maxLength={200} className="h-11" />
      </Field>
      <Field label="Host">
        <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="Who's hosting" maxLength={60} className="h-11" />
      </Field>
      <Field label="Book we're discussing">
        <Select value={bookId} onChange={(e) => setBookId(e.target.value)} className="w-full">
          <option value="">Not decided yet</option>
          {choices.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title}
              {b.status === "current" ? " (current read)" : ""}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Notes (optional)">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={1000}
          rows={3}
          placeholder="Parking, what to bring, chapters to finish…"
          className="w-full rounded-md border border-input bg-card px-4 py-3 text-base text-foreground placeholder:text-muted-foreground/80"
        />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy || !valid}>
          {busy ? "Saving…" : "Save meeting"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        {onDelete && (
          <LinkButton onClick={onDelete} disabled={busy} className="ml-auto text-destructive">
            Delete meeting
          </LinkButton>
        )}
      </div>
    </form>
  );
}

// ---------------- Suggestions ----------------

type Draft = { title: string; author: string; imageUrl: string; isbn: string };

function SuggestionsSection({
  hubId,
  busy,
  act,
  isOrganizer,
  name,
  setName,
  suggested,
  hasCurrent,
  currentTitle,
  clubName,
}: Shared & { suggested: HubBook[]; hasCurrent: boolean; currentTitle?: string; clubName: string }) {
  const [adding, setAdding] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [voteTitle, setVoteTitle] = useState("");
  const mine = booksIAdded();

  const togglePick = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < 12 ? [...p, id] : p));

  const startVote = async () => {
    let pollId = "";
    const ok = await act(async () => {
      pollId = await startHubVote(hubId, voteTitle.trim() || `${clubName}: what's next?`, picked);
    });
    if (ok && pollId) {
      save("my-polls", [...load<string[]>("my-polls", []), pollId].slice(-50));
      navigate(`/vote/${pollId}`);
    }
  };

  return (
    <Section
      title="Suggestions for next time"
      id="suggestions"
      count={suggested.length}
      action={
        !adding && (
          <Button variant="accent" className="min-h-10 px-4" onClick={() => setAdding(true)}>
            + Suggest a book
          </Button>
        )
      }
    >
      {adding && <AddBook hubId={hubId} busy={busy} act={act} name={name} setName={setName} onDone={() => setAdding(false)} />}

      {suggested.length === 0 ? (
        !adding && <p className="mt-2 text-sm text-muted-foreground">No suggestions yet. Be the first to add one.</p>
      ) : (
        <>
          {isOrganizer && suggested.length >= 2 && !selecting && (
            <p className="mt-2 text-sm">
              <LinkButton onClick={() => setSelecting(true)}>Pick books for a vote →</LinkButton>
            </p>
          )}
          <ul className="mt-4 grid gap-3">
            {suggested.map((b) => {
              const on = picked.includes(b.id);
              const canRemove = isOrganizer || mine.includes(b.id);
              return (
                <li key={b.id}>
                  <BookRow
                    book={b}
                    meta={`Suggested by ${b.added_by}`}
                    leading={
                      selecting ? (
                        <button
                          type="button"
                          onClick={() => togglePick(b.id)}
                          aria-pressed={on}
                          aria-label={on ? `Remove ${b.title} from the vote` : `Add ${b.title} to the vote`}
                          className={cx(
                            "mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded border text-sm",
                            on ? "border-primary bg-primary text-primary-foreground" : "border-border",
                          )}
                        >
                          {on ? "✓" : ""}
                        </button>
                      ) : undefined
                    }
                    highlight={on}
                  >
                    {b.note && <p className="mt-1 text-sm italic [overflow-wrap:anywhere]">“{b.note}”</p>}
                    {!selecting && (isOrganizer || canRemove) && (
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                        {isOrganizer && (
                          <LinkButton
                            disabled={busy}
                            onClick={() => {
                              if (hasCurrent && !window.confirm(`Make “${b.title}” the current read? “${currentTitle}” moves to past reads.`)) return;
                              void act(() => setStatus(hubId, b.id, "current"), `“${b.title}” is now the current read.`);
                            }}
                          >
                            Make current read
                          </LinkButton>
                        )}
                        {isOrganizer && (
                          <LinkButton
                            disabled={busy}
                            onClick={() => {
                              const d = window.prompt("Already read this one? When did the club finish it? (YYYY-MM-DD)", new Date().toISOString().slice(0, 10));
                              if (d === null) return;
                              const day = /^\d{4}-\d{2}-\d{2}$/.test(d.trim()) ? d.trim() : null;
                              void act(() => setStatus(hubId, b.id, "read", day), `Moved “${b.title}” to past reads.`);
                            }}
                          >
                            Already read
                          </LinkButton>
                        )}
                        {canRemove && (
                          <LinkButton
                            disabled={busy}
                            onClick={() => {
                              if (window.confirm(`Remove “${b.title}” from the suggestions?`)) void act(() => removeBook(hubId, b.id), "Removed.");
                            }}
                          >
                            Remove
                          </LinkButton>
                        )}
                      </div>
                    )}
                  </BookRow>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {selecting && (
        <div className="sticky bottom-0 z-10 -mx-4 mt-4 border-t border-border/60 bg-background/95 px-4 py-4 backdrop-blur sm:mx-0 sm:rounded-lg sm:border">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <p className="text-sm sm:w-40 sm:shrink-0">
              <b>{picked.length}</b> picked {picked.length < 2 ? "· pick at least 2" : "· max 12"}
            </p>
            <Input value={voteTitle} onChange={(e) => setVoteTitle(e.target.value)} placeholder={`${clubName}: what's next?`} aria-label="Name of the vote" maxLength={120} className="h-11" />
            <Button onClick={startVote} disabled={busy || picked.length < 2} className="shrink-0">
              {busy ? "Starting…" : "Start ranked vote"}
            </Button>
            <Button
              variant="ghost"
              className="shrink-0"
              onClick={() => {
                setSelecting(false);
                setPicked([]);
              }}
            >
              Cancel
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Everyone ranks their top 3 on the vote page; the winner is decided by ranked-choice count.</p>
        </div>
      )}
    </Section>
  );
}

function AddBook({ hubId, busy, act, name, setName, onDone }: Pick<Shared, "hubId" | "busy" | "act" | "name" | "setName"> & { onDone: () => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Array<Draft & { year?: number }>>([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [manual, setManual] = useState(false);
  const [note, setNote] = useState("");
  const seq = useRef(0);

  // Search as they type, a moment after they stop.
  useEffect(() => {
    if (manual || draft) return;
    const query = q.trim();
    if (query.length < 2) {
      setResults([]);
      setSearchErr(null);
      return;
    }
    const n = ++seq.current;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api.bookSearch(query);
        if (n !== seq.current) return;
        setResults(res.results.map((r) => ({ title: r.title, author: r.author, imageUrl: r.coverUrl, isbn: r.isbn, year: r.year })));
        setSearchErr(res.results.length ? null : "No matches. Try different words, or type it in yourself.");
      } catch (e) {
        if (n === seq.current) setSearchErr((e as Error).message);
      } finally {
        if (n === seq.current) setSearching(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [q, manual, draft]);

  const submit = async () => {
    if (!draft || !draft.title.trim() || !name.trim()) return;
    const ok = await act(() => addBook(hubId, { ...draft, note }, name.trim()), `Added “${draft.title.trim()}” to the suggestions.`);
    if (ok) onDone();
  };

  return (
    <div className="mt-4 rounded-lg border border-border/70 bg-card p-4">
      {!draft && !manual && (
        <>
          <Field label="Find a book">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Title or author" autoFocus className="h-11" enterKeyHint="search" />
          </Field>
          {searching && <p className="mt-2 text-sm text-muted-foreground">Searching…</p>}
          {searchErr && !searching && <p className="mt-2 text-sm text-muted-foreground">{searchErr}</p>}
          {results.length > 0 && (
            <ul className="mt-3 grid gap-2" aria-label="Search results">
              {results.map((r, i) => (
                <li key={`${r.title}-${r.author}-${i}`}>
                  <button type="button" onClick={() => setDraft(r)} className="flex w-full items-center gap-3 rounded-md border border-border/60 p-2 text-left hover:bg-muted/50">
                    <Cover src={r.imageUrl} small />
                    <span className="min-w-0">
                      <span className="block font-medium leading-snug [overflow-wrap:anywhere]">{r.title}</span>
                      <span className="block text-sm text-muted-foreground">
                        {r.author || "Unknown author"}
                        {r.year ? ` · ${r.year}` : ""}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <LinkButton
              onClick={() => {
                setManual(true);
                setDraft({ title: q.trim(), author: "", imageUrl: "", isbn: "" });
              }}
            >
              Can't find it? Type it in yourself
            </LinkButton>
            <LinkButton onClick={onDone}>Cancel</LinkButton>
          </div>
        </>
      )}

      {draft && (
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {manual ? (
            <>
              <Field label="Title">
                <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} required maxLength={300} autoFocus className="h-11" />
              </Field>
              <Field label="Author">
                <Input value={draft.author} onChange={(e) => setDraft({ ...draft, author: e.target.value })} maxLength={200} className="h-11" />
              </Field>
            </>
          ) : (
            <div className="flex items-center gap-3">
              <Cover src={draft.imageUrl} small />
              <div className="min-w-0">
                <p className="font-display text-lg leading-snug [overflow-wrap:anywhere]">{draft.title}</p>
                {draft.author && <p className="text-sm text-muted-foreground">by {draft.author}</p>}
              </div>
            </div>
          )}
          <Field label="Why this one? (optional)">
            <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={280} placeholder="A sentence to sell it to the group" className="h-11" />
          </Field>
          <Field label="Your name">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required placeholder="So the club knows who suggested it" className="h-11" autoComplete="given-name" />
          </Field>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={busy || !draft.title.trim() || !name.trim()}>
              {busy ? "Adding…" : "Add to suggestions"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setDraft(null);
                setManual(false);
              }}
            >
              Back
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

// ---------------- Ratings ----------------

function RatingBlock({
  hubId,
  busy,
  act,
  name,
  setName,
  book,
  summary,
  all,
}: Shared & { book: HubBook; summary?: { average: number; count: number }; all: HubData["ratings"] }) {
  const mineKey = "hub-my-ratings";
  const saved = load<Record<string, { stars: number; comment: string }>>(mineKey, {})[book.id];
  const [open, setOpen] = useState(false);
  const [stars, setStars] = useState(saved?.stars ?? 0);
  const [comment, setComment] = useState(saved?.comment ?? "");
  const list = all.filter((r) => r.book_id === book.id);

  const submit = async () => {
    if (!stars || !name.trim()) return;
    const ok = await act(() => rateBook(hubId, book.id, stars, comment, name.trim()), saved ? "Your rating was updated." : "Thanks for rating!");
    if (ok) {
      save(mineKey, { ...load<Record<string, unknown>>(mineKey, {}), [book.id]: { stars, comment } });
      setOpen(false);
    }
  };

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        {summary ? (
          <span>
            <Stars value={summary.average} /> <b>{summary.average.toFixed(1)}</b>
            <span className="text-muted-foreground">
              {" "}
              · {summary.count} {summary.count === 1 ? "rating" : "ratings"}
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground">No ratings yet</span>
        )}
        <LinkButton onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? "Close" : saved ? "Change my rating" : list.length ? "See reviews & rate" : "Rate it"}
        </LinkButton>
      </div>
      {open && (
        <div className="mt-3 rounded-md border border-border/60 bg-background/60 p-3">
          {list.length > 0 && (
            <ul className="mb-3 grid gap-2 text-sm">
              {list.map((r) => (
                <li key={r.voter_name}>
                  <Stars value={r.stars} /> <b>{r.voter_name}</b>
                  {r.comment && <span className="[overflow-wrap:anywhere]"> — {r.comment}</span>}
                </li>
              ))}
            </ul>
          )}
          <form
            className="grid gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <div className="flex items-center gap-1" role="radiogroup" aria-label="Your rating">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={stars === n}
                  aria-label={`${n} ${n === 1 ? "star" : "stars"}`}
                  onClick={() => setStars(n)}
                  className={cx("h-10 w-10 rounded-md text-2xl leading-none", n <= stars ? "text-accent-strong" : "text-muted-foreground/40")}
                >
                  ★
                </button>
              ))}
            </div>
            <Input value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} placeholder="A few words (optional)" className="h-11" aria-label="Comment" />
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Your name" aria-label="Your name" className="h-11" />
              <Button type="submit" disabled={busy || !stars || !name.trim()} className="shrink-0">
                {busy ? "Saving…" : "Save rating"}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function Stars({ value }: { value: number }) {
  const full = Math.round(value);
  return (
    <span aria-label={`${value} out of 5 stars`} className="tracking-tight">
      <span className="text-accent-strong">{"★".repeat(full)}</span>
      <span className="text-muted-foreground/40">{"★".repeat(5 - full)}</span>
    </span>
  );
}

// ---------------- Small pieces ----------------

function Section({ title, id, count, action, children }: { title: string; id: string; count?: number; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-10 border-t border-border/60 pt-6" aria-labelledby={`${id}-heading`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={`${id}-heading`} className="font-display text-2xl">
          {title} {count ? <span className="text-muted-foreground">({count})</span> : null}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function BookRow({ book, meta, leading, highlight, children }: { book: HubBook; meta?: string; leading?: ReactNode; highlight?: boolean; children?: ReactNode }) {
  return (
    <div className={cx("flex min-w-0 gap-4 rounded-lg border bg-card p-4", highlight ? "border-accent-strong ring-2 ring-accent/40" : "border-border/70")}>
      {leading}
      <Cover src={book.image_url} />
      <div className="min-w-0 flex-1">
        <p className="font-display text-lg leading-snug [overflow-wrap:anywhere]">{book.title}</p>
        {book.author && <p className="text-sm text-muted-foreground">by {book.author}</p>}
        {meta && <p className="text-xs text-muted-foreground">{meta}</p>}
        {children}
      </div>
    </div>
  );
}

function Cover({ src, small }: { src: string; small?: boolean }) {
  const size = small ? "h-15 w-10" : "h-24 w-16";
  return src ? <img src={src} alt="" loading="lazy" className={cx(size, "shrink-0 rounded-sm object-cover shadow-sm")} /> : <div className={cx(size, "shrink-0 rounded-sm bg-muted")} />;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-12 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

function LinkButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props} className={cx("py-1 text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-50", className)} />;
}

function formatWhen(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatDay(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}
