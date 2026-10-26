import { useState } from "react";
import { createHub, forgetHub, organizerKey, savedHubs } from "../lib/hub";
import { navigate } from "../lib/router";
import { supabase } from "../lib/supabase";
import { Button } from "./ui";

/** On the club screen: create a shared club page, or reopen one used on this device. */
export function SharedClubPanel({ defaultName }: { defaultName: string }) {
  const [hubs, setHubs] = useState(savedHubs);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!supabase) return null;

  const create = async () => {
    const name = window.prompt("Name your club page (members will see this):", defaultName)?.trim();
    if (!name) return;
    setBusy(true);
    setErr(null);
    try {
      const { id } = await createHub(name.slice(0, 80));
      navigate(`/c/${id}`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-6 rounded-lg border border-accent-strong/40 bg-accent/10 p-4" aria-labelledby="shared-club-heading">
      <h2 id="shared-club-heading" className="font-display text-xl">
        Shared club page
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        One link for the whole club: members suggest books for upcoming sessions, vote on what's next, see the next meeting
        (and add it to their calendar), and rate past reads. No accounts needed.
      </p>
      {hubs.length > 0 && (
        <ul className="mt-3 grid gap-2">
          {hubs.map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-card px-3 py-2 text-sm">
              <button type="button" onClick={() => navigate(`/c/${h.id}`)} className="min-w-0 text-left font-medium text-link underline underline-offset-2 [overflow-wrap:anywhere]">
                {h.name}
              </button>
              <span className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                {organizerKey(h.id) ? "Organizer" : "Member"}
                <button
                  type="button"
                  aria-label={`Forget ${h.name} on this device`}
                  className="h-8 w-8 rounded-md hover:bg-muted"
                  onClick={() => {
                    const warn = organizerKey(h.id)
                      ? `Forget “${h.name}” on this device? You'll need your organizer link to manage it again. The club page itself isn't deleted.`
                      : `Forget “${h.name}” on this device? The club page itself isn't deleted.`;
                    if (!window.confirm(warn)) return;
                    forgetHub(h.id);
                    setHubs(savedHubs());
                  }}
                >
                  ×
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <Button variant="accent" className="mt-3" onClick={create} disabled={busy}>
        {busy ? "Creating…" : hubs.length ? "+ Create another club page" : "Create a club page"}
      </Button>
      {err && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {err}
        </p>
      )}
    </section>
  );
}
