import { test } from "node:test";
import assert from "node:assert/strict";
import { buildIcs, googleCalendarUrl, icsEscape, keyFromHash, ratingSummary, splitMeetings } from "../shared/hub.js";
import { toSearchHit } from "../server/openlibrary.js";

test("organizer key is read from the link's #key= part", () => {
  assert.equal(keyFromHash("#key=ABCDEFGHJKMNPQRSTUVW"), "ABCDEFGHJKMNPQRSTUVW");
  assert.equal(keyFromHash("#key=abcd-efgh-jkmn-pqrs-tuvw"), "ABCDEFGHJKMNPQRSTUVW");
  assert.equal(keyFromHash("#x=1&key=ABCDEFGHJKMNPQRSTUVW"), "ABCDEFGHJKMNPQRSTUVW");
  assert.equal(keyFromHash(""), "");
  assert.equal(keyFromHash("#key=short"), "");
});

test("meetings: upcoming soonest first, and one in progress still counts as upcoming", () => {
  const now = Date.parse("2026-11-18T20:00:00-05:00");
  const m = (id: string, at: string) => ({ id, starts_at: at });
  const { upcoming, past } = splitMeetings(
    [m("dec", "2026-12-16T19:00:00-05:00"), m("oct", "2026-10-21T19:00:00-04:00"), m("now", "2026-11-18T19:00:00-05:00")],
    now,
  );
  assert.deepEqual(upcoming.map((x) => x.id), ["now", "dec"]);
  assert.deepEqual(past.map((x) => x.id), ["oct"]);
});

test("ratings are averaged per book to one decimal", () => {
  const s = ratingSummary([
    { book_id: "a", voter_name: "Ana", stars: 5, comment: "" },
    { book_id: "a", voter_name: "Ben", stars: 4, comment: "" },
    { book_id: "a", voter_name: "Cy", stars: 4, comment: "" },
    { book_id: "b", voter_name: "Ana", stars: 2, comment: "" },
  ]);
  assert.deepEqual(s.get("a"), { average: 4.3, count: 3 });
  assert.deepEqual(s.get("b"), { average: 2, count: 1 });
  assert.equal(s.get("c"), undefined);
});

test("calendar file has the meeting in UTC, escapes text, and folds long lines", () => {
  const ics = buildIcs(
    {
      uid: "m1",
      title: "Book club: Piranesi",
      start: new Date("2026-11-18T19:00:00-05:00"),
      location: "Ana's place, 12 Elm St; ring bell",
      description: "Bring snacks.\nNext book vote is open: " + "x".repeat(120),
    },
    new Date("2026-10-26T12:00:00Z"),
  );
  assert.match(ics, /DTSTART:20261119T000000Z/);
  assert.match(ics, /DTEND:20261119T020000Z/);
  assert.match(ics, /LOCATION:Ana's place\\, 12 Elm St\\; ring bell/);
  assert.ok(ics.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75));
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  assert.equal(icsEscape("a\\b"), "a\\\\b");
});

test("Google Calendar link carries the same times", () => {
  const url = new URL(
    googleCalendarUrl({ uid: "m", title: "Club", start: new Date("2026-11-18T19:00:00-05:00"), location: "Here", description: "" }),
  );
  assert.equal(url.searchParams.get("dates"), "20261119T000000Z/20261119T020000Z");
  assert.equal(url.searchParams.get("text"), "Club");
});

test("book search results: prefer a 13-digit ISBN, build an https cover link, skip untitled", () => {
  assert.deepEqual(
    toSearchHit({ title: "Piranesi", author_name: ["Susanna Clarke"], first_publish_year: 2020, cover_i: 10, isbn: ["1635575630", "9781635575637"] }),
    { title: "Piranesi", author: "Susanna Clarke", year: 2020, isbn: "9781635575637", coverUrl: "https://covers.openlibrary.org/b/id/10-M.jpg" },
  );
  assert.equal(toSearchHit({ title: "" }), null);
  assert.deepEqual(toSearchHit({ title: "No cover" }), { title: "No cover", author: "", year: undefined, isbn: "", coverUrl: "" });
});
