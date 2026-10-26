// Pure helpers for shared club pages (/c/<id>), kept here so they can be tested.

export type HubMeeting = {
  id: string;
  starts_at: string;
  location: string;
  host: string;
  notes: string;
  book_id: string | null;
};

export type HubRating = { book_id: string; voter_name: string; stars: number; comment: string };

/** Reads the organizer key from a link's #key=… part. Returns "" when there is none. */
export function keyFromHash(hash: string): string {
  const m = /(?:^#|&)key=([A-Za-z0-9-]{16,40})(?:&|$)/.exec(hash || "");
  return m ? m[1].replace(/-/g, "").toUpperCase() : "";
}

/** A meeting is shown as upcoming until 3 hours after it starts (so it stays up during the meeting). */
export function splitMeetings<T extends { starts_at: string }>(meetings: T[], now = Date.now()) {
  const sorted = [...meetings].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  const cutoff = now - 3 * 3600_000;
  return {
    upcoming: sorted.filter((m) => Date.parse(m.starts_at) >= cutoff),
    past: sorted.filter((m) => Date.parse(m.starts_at) < cutoff).reverse(),
  };
}

/** Average stars (one decimal) and count for each book. */
export function ratingSummary(ratings: HubRating[]) {
  const out = new Map<string, { average: number; count: number }>();
  const sums = new Map<string, { total: number; count: number }>();
  for (const r of ratings) {
    const s = sums.get(r.book_id) ?? { total: 0, count: 0 };
    s.total += r.stars;
    s.count += 1;
    sums.set(r.book_id, s);
  }
  for (const [id, s] of sums) out.set(id, { average: Math.round((s.total / s.count) * 10) / 10, count: s.count });
  return out;
}

// ---- Calendar ----

const icsDate = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Escapes text for an .ics field (commas, semicolons, backslashes and new lines). */
export function icsEscape(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

/** Folds lines longer than 75 bytes, as the calendar format requires. */
function fold(line: string) {
  const out: string[] = [];
  let rest = line;
  while (new TextEncoder().encode(rest).length > 75) {
    let cut = 75;
    while (new TextEncoder().encode(rest.slice(0, cut)).length > 75) cut--;
    out.push(rest.slice(0, cut));
    rest = " " + rest.slice(cut);
  }
  out.push(rest);
  return out.join("\r\n");
}

export type CalendarEvent = {
  uid: string;
  title: string;
  start: Date;
  /** Defaults to 2 hours after the start. */
  end?: Date;
  location: string;
  description: string;
};

/** A one-event calendar file that Apple, Google and Outlook calendars can all open. */
export function buildIcs(e: CalendarEvent, now = new Date()) {
  const end = e.end ?? new Date(e.start.getTime() + 2 * 3600_000);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Shelf to Stacks//Book club//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.uid}@shelftostacks`,
    `DTSTAMP:${icsDate(now)}`,
    `DTSTART:${icsDate(e.start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsEscape(e.title)}`,
    ...(e.location ? [`LOCATION:${icsEscape(e.location)}`] : []),
    ...(e.description ? [`DESCRIPTION:${icsEscape(e.description)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** A Google Calendar "add event" link for the same meeting. */
export function googleCalendarUrl(e: CalendarEvent) {
  const end = e.end ?? new Date(e.start.getTime() + 2 * 3600_000);
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${icsDate(e.start)}/${icsDate(end)}`,
    details: e.description,
    location: e.location,
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

/** Value for an <input type="datetime-local"> from a stored time, in the viewer's own time zone. */
export function toLocalInput(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
