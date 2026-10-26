import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { usePath } from "../lib/router";
import { supabase } from "../lib/supabase";
import { InstallLink } from "./InstallPrompt";
import { Logo } from "./Logo";
import { AppLink, cx } from "./ui";

const NAV: Array<{ href: string; label: string; match: (p: string) => boolean }> = [
  { href: "/", label: "My shelf", match: (p) => p === "/" || p.startsWith("/book/") },
  { href: "/club", label: "Book club", match: (p) => p.startsWith("/club") || p.startsWith("/c/") || p.startsWith("/vote/") },
  { href: "/journal", label: "Journal", match: (p) => p.startsWith("/journal") },
  { href: "/#about", label: "About", match: () => false },
  { href: "/contact", label: "Contact", match: (p) => p.startsWith("/contact") },
];

/** The soft sticky header used on every page. `actions` adds page-specific buttons on the right. */
export function SiteHeader({ actions, width = "max-w-6xl" }: { actions?: ReactNode; width?: string }) {
  const path = usePath();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 12);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header className={cx("site-header safe-top", scrolled && "scrolled")}>
      <div className={cx("safe-x mx-auto flex h-16 items-center gap-6 md:h-[4.5rem]", width)}>
        <AppLink href="/" aria-label="Shelf to Stacks home" className="shrink-0 rounded-lg">
          <Logo />
        </AppLink>
        <nav aria-label="Main" className="hidden gap-5 text-[0.95rem] font-semibold lg:flex">
          {NAV.map((n) => {
            const on = n.match(path);
            return (
              <AppLink
                key={n.href}
                href={n.href}
                aria-current={on ? "page" : undefined}
                className={cx(
                  "relative py-1.5 transition-colors",
                  on
                    ? "text-foreground after:absolute after:inset-x-0 after:-bottom-0.5 after:h-[3px] after:rounded-full after:bg-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {n.label}
              </AppLink>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {actions}
          <InstallLink className="inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border-[1.5px] border-border bg-card px-3.5 text-sm font-semibold text-foreground transition hover:bg-butter hover:text-[#4a3728]">
            <PhoneIcon />
            <span className="hidden sm:inline">Get the app</span>
            <span className="sm:hidden">App</span>
          </InstallLink>
        </div>
      </div>
    </header>
  );
}

/** Big, friendly bottom navigation on phones. */
export function TabBar() {
  const path = usePath();
  const tabs: Array<{ href: string; label: string; icon: ReactNode; on: boolean }> = [
    { href: "/", label: "Shelf", icon: <ShelfIcon />, on: path === "/" || path.startsWith("/book/") },
    { href: "/club", label: "Club", icon: <ClubIcon />, on: path.startsWith("/club") || path.startsWith("/c/") || path.startsWith("/vote/") },
    { href: "/journal", label: "Journal", icon: <JournalIcon />, on: path.startsWith("/journal") },
    { href: "/contact", label: "Contact", icon: <MailIcon />, on: path.startsWith("/contact") },
  ];
  return (
    <nav
      aria-label="Bottom navigation"
      className="fixed inset-x-3 z-20 flex justify-around rounded-[1.6rem] border border-border/70 bg-card/95 px-1.5 py-2 backdrop-blur md:hidden"
      style={{ bottom: "calc(0.75rem + env(safe-area-inset-bottom))", boxShadow: "var(--shadow-lift)" }}
    >
      {tabs.map((t) => (
        <AppLink
          key={t.href}
          href={t.href}
          aria-current={t.on ? "page" : undefined}
          className={cx(
            "grid min-w-[4.25rem] justify-items-center gap-0.5 rounded-2xl px-2 py-1.5 text-xs font-bold transition-colors",
            t.on ? "bg-primary text-primary-foreground" : "text-muted-foreground",
          )}
        >
          {t.icon}
          {t.label}
        </AppLink>
      ))}
    </nav>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t-[6px] border-sage">
      <div className="safe-x mx-auto max-w-6xl">
        <Newsletter />
        <div className="grid grid-cols-2 gap-8 pb-8 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div className="col-span-2 md:col-span-1">
            <AppLink href="/" className="inline-block rounded-lg">
              <Logo />
            </AppLink>
            <p className="mt-3 max-w-xs text-[0.95rem] text-muted-foreground">
              Your want-to-read list, checked against your public library. Made in Boston for library lovers.
            </p>
          </div>
          <FooterCol title="Explore" links={[["/", "My shelf"], ["/journal", "Journal"], ["/#about", "How it works"]]} />
          <FooterCol title="Book club" links={[["/club", "Compare lists"], ["/club", "Start a vote"]]} />
          <FooterCol title="Help" links={[["/contact", "Contact us"], ["/contact?topic=library", "Request a library"], ["/contact?topic=bug", "Report a problem"]]} />
        </div>
        <div className="safe-bottom tabbar-space flex flex-wrap items-end justify-between gap-4 border-t-[1.5px] border-dashed border-border pb-6 pt-5 text-sm text-muted-foreground">
          <p>
            © {new Date().getFullYear()} Shelf to Stacks · made with tea and library cards
            <br />
            Catalog data via BiblioCommons · Ebooks via Libby · Lists via Goodreads or StoryGraph
          </p>
          <SleepyCat />
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: Array<[string, string]> }) {
  return (
    <div>
      <h2 className="font-display text-[1.05rem] font-medium">{title}</h2>
      <ul className="mt-2.5 grid gap-1.5 text-[0.95rem]">
        {links.map(([href, label]) => (
          <li key={label}>
            <AppLink
              href={href}
              className="text-muted-foreground decoration-sage decoration-2 underline-offset-4 hover:text-foreground hover:underline"
            >
              {label}
            </AppLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Newsletter() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setState("error");
      setError("Enter a valid email address.");
      return;
    }
    if (!supabase) {
      setState("error");
      setError("Sign-ups aren't switched on for this site yet.");
      return;
    }
    setState("sending");
    const { error: err } = await supabase.rpc("join_newsletter", { p_email: email.trim() });
    if (err) {
      setState("error");
      setError(/too many|valid/i.test(err.message) ? err.message : "That didn't go through. Try again in a moment.");
      return;
    }
    setState("done");
  };
  return (
    <div
      className="-mt-12 mb-10 grid items-center gap-5 rounded-[1.9rem] bg-gradient-to-t from-[#b9cfb2] to-sage p-6 text-[#4a3728] md:grid-cols-[1fr_1.1fr] md:p-9"
      style={{ boxShadow: "var(--shadow-soft)" }}
    >
      <div>
        <p className="font-script text-2xl">a little letter, once a month</p>
        <h2 className="font-display text-[1.75rem] leading-tight md:text-3xl">Get soft stories in your inbox</h2>
      </div>
      {state === "done" ? (
        <p role="status" className="rounded-3xl bg-[#fffcf8] px-5 py-4 font-semibold">
          You're on the list ♡ Look out for our next letter.
        </p>
      ) : (
        <form onSubmit={submit} noValidate>
          <div className="flex flex-col gap-2 rounded-[1.6rem] bg-[#fffcf8] p-1.5 sm:flex-row sm:rounded-full">
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (state === "error") setState("idle");
              }}
              placeholder="you@example.com"
              aria-label="Email address"
              autoComplete="email"
              className="h-12 min-w-0 flex-1 rounded-full bg-transparent px-4 text-base text-[#4a3728] outline-none placeholder:text-[#8d817a] focus-visible:outline-2 focus-visible:outline-[#a0614f]"
            />
            <button
              type="submit"
              disabled={state === "sending"}
              className="btn-ledge min-h-12 rounded-full bg-[#f2c4c4] px-6 text-[0.95rem] font-extrabold text-[#4a3728] transition disabled:opacity-60"
              style={{ ["--primary-edge" as string]: "#e3a7a7" }}
            >
              {state === "sending" ? "Signing up…" : "Sign me up"}
            </button>
          </div>
          {state === "error" && (
            <p role="alert" className="mt-2 px-3 text-sm font-semibold text-[#7a2e22]">
              {error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}

function SleepyCat() {
  return (
    <svg width="120" height="64" viewBox="0 0 120 64" role="img" aria-label="A small cat asleep on a stack of books">
      <rect x="18" y="48" width="84" height="12" rx="3" fill="var(--sage)" />
      <rect x="24" y="36" width="72" height="12" rx="3" fill="var(--blush)" />
      <rect x="14" y="24" width="80" height="12" rx="3" fill="var(--lavender)" />
      <path d="M34 24c0-10 8-16 18-16s18 6 18 13c0 3-2 3-5 3z" fill="var(--foreground)" />
      <path d="M58 10l3-8 4 8zM66 12l5-6 1 9z" fill="var(--foreground)" />
      <path d="M60 17c1.5 1.4 3.5 1.4 5 0" stroke="var(--background)" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      <path d="M34 22c-8 0-10 6-4 8" stroke="var(--foreground)" strokeWidth="4" fill="none" strokeLinecap="round" />
    </svg>
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

const iconProps = { width: 22, height: 22, viewBox: "0 0 24 24", "aria-hidden": true, fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
function ShelfIcon() {
  return (
    <svg {...iconProps}>
      <rect x="4" y="4" width="4" height="15" rx="1" />
      <rect x="10" y="6" width="4" height="13" rx="1" />
      <path d="m15.5 7.4 3-.8 2.9 11.3-3 .8z" />
      <path d="M2 21h20" />
    </svg>
  );
}
function ClubIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="8" cy="9" r="3" />
      <circle cx="16.5" cy="9.5" r="2.5" />
      <path d="M3 19c.5-3 2.6-4.6 5-4.6s4.5 1.6 5 4.6M13.5 15c.9-.6 1.9-.9 3-.9 2 0 3.6 1.3 4 4" />
    </svg>
  );
}
function JournalIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4 6c4-2 6-2 8 0 2-2 4-2 8 0v13c-4-2-6-2-8 0-2-2-4-2-8 0z" />
      <path d="M12 6v13" />
    </svg>
  );
}
function MailIcon() {
  return (
    <svg {...iconProps}>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}
