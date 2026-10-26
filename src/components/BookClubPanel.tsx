import { useState } from "react";
import { supabase } from "../lib/supabase";
import { navigate } from "../lib/router";
import { createVote } from "../lib/club";
import { Button, Input } from "./ui";

export type ClubPick = { id: string; title: string; author: string; imageUrl: string };

export function BookClubPanel({ picks, onRemove }: { picks: ClubPick[]; onRemove: (id: string) => void }) {
  const [title, setTitle] = useState("Our next book club pick");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!supabase) return null;

  const create = async () => {
    setBusy(true);
    setErr(null);
    try {
      await createVote(title, picks);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-14 border-t border-border/60 pt-10" aria-labelledby="club-heading">
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Book club</p>
      <h2 id="club-heading" className="mt-2 font-display text-2xl">
        Help your club decide
      </h2>
      <p className="mt-2 text-sm">
        <button type="button" onClick={() => navigate("/club")} className="font-medium text-link underline underline-offset-2">
          Compare everyone's lists to find books in common →
        </button>
      </p>
      <p className="mt-1 text-sm">
        <button type="button" onClick={() => navigate("/club")} className="font-medium text-link underline underline-offset-2">
          Set up a shared club page (suggestions, meetings, ratings) →
        </button>
      </p>
      {picks.length === 0 ? (
        <p className="mt-3 italic text-muted-foreground">
          Tap “+ Book club shortlist” on two or more books above, then create a voting link to share with your club. Everyone ranks their top 3, and the winner is decided by ranked-choice count.
        </p>
      ) : (
        <>
          <ul className="mt-4 flex flex-wrap gap-2">
            {picks.map((p) => (
              <li key={p.id} className="flex max-w-full items-center gap-1 rounded-full border border-border/70 bg-card py-1 pl-3 pr-1 text-sm">
                <span className="truncate">{p.title}</span>
                <button
                  type="button"
                  onClick={() => onRemove(p.id)}
                  aria-label={`Remove ${p.title}`}
                  className="h-8 w-8 shrink-0 rounded-full text-muted-foreground hover:bg-muted"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex max-w-xl flex-col gap-3 sm:flex-row">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Name of the vote" maxLength={120} className="h-11" />
            <Button variant="accent" onClick={create} disabled={busy || picks.length < 2 || picks.length > 12}>
              {busy ? "Creating…" : picks.length < 2 ? "Pick at least 2" : picks.length > 12 ? "12 books max" : "Create voting link"}
            </Button>
          </div>
          {err && <p role="alert" className="mt-2 text-sm text-destructive">{err}</p>}
        </>
      )}
    </section>
  );
}
