import type { HubMeeting, HubRating } from "../../shared/hub";
import { load, save } from "./storage";
import { supabase, voterToken } from "./supabase";

// Shared club pages (/c/<id>). See supabase/migrations/004_club_hub.sql.

export type HubBook = {
  id: string;
  title: string;
  author: string;
  image_url: string;
  isbn: string;
  note: string;
  added_by: string;
  status: "suggested" | "current" | "read";
  finished_on: string | null;
  created_at: string;
};

export type HubPoll = { id: string; title: string; created_at: string; voters: number };

export type HubData = {
  name: string;
  books: HubBook[];
  meetings: HubMeeting[];
  ratings: HubRating[];
  polls: HubPoll[];
};

/** Club pages this device has opened, newest first, so they're easy to find again. */
export type SavedHub = { id: string; name: string; at: number };

const KEYS = "hub-keys";
const HUBS = "my-hubs";
const BOOKS_I_ADDED = "hub-my-books";

export const organizerKey = (hubId: string) => load<Record<string, string>>(KEYS, {})[hubId] ?? "";
export function keepOrganizerKey(hubId: string, key: string) {
  save(KEYS, { ...load<Record<string, string>>(KEYS, {}), [hubId]: key });
}
export function forgetOrganizerKey(hubId: string) {
  const all = load<Record<string, string>>(KEYS, {});
  delete all[hubId];
  save(KEYS, all);
}

export const savedHubs = () => load<SavedHub[]>(HUBS, []);
export function rememberHub(id: string, name: string) {
  save(HUBS, [{ id, name, at: Date.now() }, ...savedHubs().filter((h) => h.id !== id)].slice(0, 20));
}
export function forgetHub(id: string) {
  save(HUBS, savedHubs().filter((h) => h.id !== id));
  forgetOrganizerKey(id);
}

/** Books suggested from this device (they can be taken back while still a suggestion). */
export const booksIAdded = () => load<string[]>(BOOKS_I_ADDED, []);

export const formatKey = (k: string) => k.replace(/(.{4})(?=.)/g, "$1-");
export const memberLink = (id: string) => `${window.location.origin}/c/${id}`;
export const organizerLink = (id: string, key: string) => `${memberLink(id)}#key=${formatKey(key)}`;

/** Turns database errors into something a reader can act on. */
export function readable(message: string | undefined, fallback: string) {
  const m = message ?? "";
  if (m.includes("already_added")) return "That book is already on the club's list.";
  if (m.includes("list_full")) return "The list is full (150 books). Ask the organizer to clear out some suggestions.";
  if (m.includes("name_taken")) return "Someone else already used that name here. Add an initial to yours.";
  if (m.includes("not_organizer")) return "Only the organizer can do that. Open the organizer link on this device first.";
  if (m.includes("not_allowed")) return "You can only remove books you suggested from this device.";
  if (m.includes("not_found")) return "That club page doesn't exist anymore.";
  if (/hub_|function|schema cache/i.test(m)) return "Shared club pages aren't switched on for this site yet. The site owner needs to run the club page setup in Supabase.";
  if (/^[A-Z][^_]*\.$/.test(m)) return m; // our own plain-English messages
  return fallback;
}

function need() {
  if (!supabase) throw new Error("Book club features aren't set up on this site yet.");
  return supabase;
}

async function rpc<T>(fn: string, args: Record<string, unknown>, fallback: string): Promise<T> {
  const { data, error } = await need().rpc(fn, args);
  if (error) throw new Error(readable(error.message, fallback));
  return data as T;
}

export async function createHub(name: string): Promise<{ id: string; key: string }> {
  const rows = await rpc<Array<{ id: string; admin_key: string }>>("hub_create", { p_name: name }, "Couldn't create the club page. Try again.");
  const row = Array.isArray(rows) ? rows[0] : (rows as unknown as { id: string; admin_key: string });
  if (!row?.id) throw new Error("Couldn't create the club page. Try again.");
  keepOrganizerKey(row.id, row.admin_key);
  rememberHub(row.id, name);
  return { id: row.id, key: row.admin_key };
}

export const checkKey = (hubId: string, key: string) =>
  rpc<boolean>("hub_check_key", { p_hub: hubId, p_key: key }, "Couldn't check the organizer link.");

/** Everything on a club page. Returns null when the club doesn't exist. */
export async function loadHub(hubId: string): Promise<HubData | null> {
  const db = need();
  const [hub, books, meetings, ratings, polls] = await Promise.all([
    db.from("club_hubs").select("name").eq("id", hubId).maybeSingle(),
    db
      .from("club_hub_books")
      .select("id,title,author,image_url,isbn,note,added_by,status,finished_on,created_at")
      .eq("hub_id", hubId)
      .order("created_at", { ascending: false }),
    db.from("club_hub_meetings").select("id,starts_at,location,host,notes,book_id").eq("hub_id", hubId),
    db.from("club_hub_ratings").select("book_id,voter_name,stars,comment").eq("hub_id", hubId).order("created_at"),
    db.from("club_polls").select("id,title,created_at").eq("hub_id", hubId).order("created_at", { ascending: false }).limit(5),
  ]);
  const err = hub.error ?? books.error ?? meetings.error ?? ratings.error ?? polls.error;
  if (err) throw new Error(readable(err.message, "Couldn't load the club page. Check your connection and try again."));
  if (!hub.data) return null;
  // How many people have voted in each recent vote.
  const ids = (polls.data ?? []).map((p) => p.id);
  const counts = new Map<string, number>();
  if (ids.length) {
    const v = await db.from("club_poll_votes").select("poll_id").in("poll_id", ids);
    for (const row of v.data ?? []) counts.set(row.poll_id, (counts.get(row.poll_id) ?? 0) + 1);
  }
  return {
    name: hub.data.name,
    books: (books.data ?? []) as HubBook[],
    meetings: (meetings.data ?? []) as HubMeeting[],
    ratings: (ratings.data ?? []) as HubRating[],
    polls: (polls.data ?? []).map((p) => ({ ...p, voters: counts.get(p.id) ?? 0 })),
  };
}

export async function addBook(
  hubId: string,
  book: { title: string; author: string; imageUrl: string; isbn: string; note: string },
  name: string,
) {
  const id = await rpc<string>(
    "hub_add_book",
    {
      p_hub: hubId,
      p_title: book.title,
      p_author: book.author,
      p_image: book.imageUrl,
      p_isbn: book.isbn,
      p_note: book.note,
      p_name: name,
      p_token: voterToken(),
    },
    "Couldn't add that book. Try again.",
  );
  save(BOOKS_I_ADDED, [...booksIAdded(), id].slice(-300));
  return id;
}

export const removeBook = (hubId: string, bookId: string) =>
  rpc<void>(
    "hub_remove_book",
    { p_hub: hubId, p_book: bookId, p_token: voterToken(), p_key: organizerKey(hubId) || null },
    "Couldn't remove that book. Try again.",
  );

export const setStatus = (hubId: string, bookId: string, status: HubBook["status"], finishedOn: string | null = null) =>
  rpc<void>(
    "hub_set_status",
    { p_hub: hubId, p_key: organizerKey(hubId), p_book: bookId, p_status: status, p_finished_on: finishedOn },
    "Couldn't update that book. Try again.",
  );

export const rateBook = (hubId: string, bookId: string, stars: number, comment: string, name: string) =>
  rpc<void>(
    "hub_rate",
    { p_hub: hubId, p_book: bookId, p_stars: stars, p_comment: comment, p_name: name, p_token: voterToken() },
    "Couldn't save your rating. Try again.",
  );

export const saveMeeting = (
  hubId: string,
  m: { id: string | null; startsAt: string; location: string; host: string; notes: string; bookId: string | null },
) =>
  rpc<string>(
    "hub_save_meeting",
    {
      p_hub: hubId,
      p_key: organizerKey(hubId),
      p_id: m.id,
      p_starts: m.startsAt,
      p_location: m.location,
      p_host: m.host,
      p_notes: m.notes,
      p_book: m.bookId,
    },
    "Couldn't save the meeting. Try again.",
  );

export const deleteMeeting = (hubId: string, id: string) =>
  rpc<void>("hub_delete_meeting", { p_hub: hubId, p_key: organizerKey(hubId), p_id: id }, "Couldn't delete the meeting.");

export const renameHub = (hubId: string, name: string) =>
  rpc<void>("hub_rename", { p_hub: hubId, p_key: organizerKey(hubId), p_name: name }, "Couldn't rename the club.");

export const startHubVote = (hubId: string, title: string, bookIds: string[]) =>
  rpc<string>(
    "hub_start_vote",
    { p_hub: hubId, p_key: organizerKey(hubId), p_title: title, p_books: bookIds },
    "Couldn't start the vote. Try again.",
  );
