import { useState, type FormEvent } from "react";
import { api } from "../lib/api";
import { usePageTitle } from "./JournalPages";
import { SiteFooter, SiteHeader } from "./SiteChrome";
import { AppLink, Button, Input, Select } from "./ui";

const TOPICS: Array<[string, string]> = [
  ["general", "Just saying hello"],
  ["bug", "Something isn't working"],
  ["library", "Add my library"],
  ["club", "Book club question"],
  ["idea", "An idea for the site"],
  ["press", "Press or partnership"],
];

/** "Contact us": saved to Supabase (contact_messages) through the send_contact function. */
export function ContactPage() {
  usePageTitle("Contact us");
  const initialTopic = new URLSearchParams(window.location.search).get("topic");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState(TOPICS.some(([id]) => id === initialTopic) ? initialTopic! : "general");
  const [message, setMessage] = useState("");
  const [honey, setHoney] = useState(""); // hidden field; only bots fill it in
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return fail("Enter a valid email address so we can reply.");
    if (message.trim().length < 5) return fail("Write a short message first.");
    setState("sending");
    try {
      await api.contact({ name: name.trim(), email: email.trim(), topic, message: message.trim(), website: honey });
    } catch (err) {
      return fail(navigator.onLine ? (err as Error).message : "You're offline. Connect to the internet and send it again.");
    }
    setState("sent");
  };
  const fail = (msg: string) => {
    setState("error");
    setError(msg);
  };

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="safe-x mx-auto grid max-w-6xl gap-10 pt-10 md:grid-cols-[1fr_1.2fr] md:gap-16">
        <div>
          <p className="font-script text-2xl text-link">we'd love to hear from you</p>
          <h1 className="font-display text-5xl leading-tight md:text-6xl">Contact us</h1>
          <p className="mt-4 max-w-md text-lg text-muted-foreground">
            Questions, ideas, a library you'd like added, or a bug that needs squashing. Send a note and we'll write back
            to the email you give us.
          </p>
          <ul className="mt-6 grid max-w-md gap-3 text-[0.95rem]">
            <li className="rounded-2xl bg-sage-soft px-4 py-3" style={{ background: "var(--sage-soft)" }}>
              <b>Something not working?</b> Tell us which page you were on and what you expected to happen.
            </li>
            <li className="rounded-2xl px-4 py-3" style={{ background: "var(--blush-soft)" }}>
              <b>Want your library added?</b> Include the library's name and town.
            </li>
          </ul>
          <svg viewBox="0 0 150 120" className="mt-8 hidden w-44 md:block" aria-hidden>
            <ellipse cx="75" cy="108" rx="60" ry="8" fill="var(--butter)" />
            <rect x="25" y="36" width="100" height="66" rx="10" fill="#fffcf8" stroke="#4a3728" strokeWidth="2.5" />
            <path d="M28 40l47 34 47-34" fill="none" stroke="#4a3728" strokeWidth="2.5" strokeLinejoin="round" />
            <path d="M75 30s-9-5.5-9-11.5c0-3.6 2.7-5.5 5.4-5.5 1.8 0 3 1 3.6 2.2.6-1.2 1.8-2.2 3.6-2.2 2.7 0 5.4 1.9 5.4 5.5C84 24.5 75 30 75 30z" fill="#f2c4c4" />
          </svg>
        </div>

        {state === "sent" ? (
          <div role="status" className="self-start rounded-[1.6rem] bg-card p-8" style={{ boxShadow: "var(--shadow-soft)" }}>
            <p className="font-script text-3xl text-link">thank you ♡</p>
            <h2 className="mt-1 font-display text-3xl">Your message is on its way</h2>
            <p className="mt-3 text-muted-foreground">We read every note and will reply to {email.trim()}.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <AppLink href="/" className="btn-ledge inline-flex min-h-11 items-center rounded-full bg-primary px-6 text-sm font-bold text-primary-foreground">
                Back to my shelf
              </AppLink>
              <button
                type="button"
                className="min-h-11 rounded-full border-[1.5px] border-border px-5 text-sm font-bold hover:bg-muted"
                onClick={() => {
                  setMessage("");
                  setState("idle");
                }}
              >
                Send another
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="relative grid gap-4 self-start rounded-[1.6rem] bg-card p-6 md:p-8" style={{ boxShadow: "var(--shadow-soft)" }}>
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              value={honey}
              onChange={(e) => setHoney(e.target.value)}
              className="absolute -left-[9999px] h-px w-px opacity-0"
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Your name" hint="optional">
                <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={120} />
              </Field>
              <Field label="Email">
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required maxLength={200} />
              </Field>
            </div>
            <Field label="What's it about?">
              <Select value={topic} onChange={(e) => setTopic(e.target.value)} className="h-12 w-full rounded-full border-[1.5px] px-4">
                {TOPICS.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Message">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={6}
                maxLength={5000}
                required
                className="w-full rounded-[1.2rem] border-[1.5px] border-input bg-card px-4 py-3 text-base text-foreground placeholder:text-muted-foreground/80"
              />
            </Field>
            {state === "error" && (
              <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={state === "sending"} className="h-12 px-8 text-base">
                {state === "sending" ? "Sending…" : "Send message"}
              </Button>
              <p className="text-sm text-muted-foreground">We only use your email to reply.</p>
            </div>
          </form>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm font-bold">
      <span>
        {label} {hint && <span className="font-normal text-muted-foreground">({hint})</span>}
      </span>
      {children}
    </label>
  );
}
