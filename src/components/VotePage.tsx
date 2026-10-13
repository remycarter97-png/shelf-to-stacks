import { useCallback, useEffect, useState } from "react";
import { supabase, voterToken } from "../lib/supabase";
import { navigate } from "../lib/router";
import { load, save } from "../lib/storage";
import { Logo } from "./Logo";
import { Button, Input, cx } from "./ui";

type Option = { id: string; title: string; author: string; image_url: string };
type Vote = { option_id: string; voter_name: string };

export function VotePage({ pollId }: { pollId: string }) {
  const [poll, setPoll] = useState<{ title: string } | null>(null);
  const [options, setOptions] = useState<Option[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [name, setName] = useState(() => load("voter-name", ""));
  const [choice, setChoice] = useState<string | null>(() => load<Record<string, string>>("my-votes", {})[pollId] ?? null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const voted = !!load<Record<string, string>>("my-votes", {})[pollId];

  const refresh = useCallback(async () => {
    if (!supabase) return setLoading(false);
    const [p, o, v] = await Promise.all([
      supabase.from("club_polls").select("title").eq("id", pollId).maybeSingle(),
      supabase.from("club_poll_options").select("id,title,author,image_url").eq("poll_id", pollId).order("position"),
      supabase.from("club_poll_votes").select("option_id,voter_name").eq("poll_id", pollId),
    ]);
    setPoll(p.data);
    setOptions(o.data ?? []);
    setVotes(v.data ?? []);
    setLoading(false);
  }, [pollId]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => document.visibilityState === "visible" && refresh(), 15_000);
    return () => clearInterval(t);
  }, [refresh]);

  const submit = async () => {
    if (!supabase || !choice || !name.trim()) return;
    setBusy(true);
    setMsg(null);
    const voter = name.trim().slice(0, 60);
    save("voter-name", voter);
    const { error } = await supabase.rpc("cast_vote", {
      p_poll: pollId,
      p_option: choice,
      p_name: voter,
      p_token: voterToken(),
    });
    setBusy(false);
    if (error) {
      setMsg({
        ok: false,
        text: error.message.includes("name_taken")
          ? `Someone else already voted as “${voter}”. Add an initial to your name.`
          : "Couldn't save your vote. Try again.",
      });
      return;
    }
    const mine = load<Record<string, string>>("my-votes", {});
    save("my-votes", { ...mine, [pollId]: choice });
    setMsg({ ok: true, text: voted ? "Vote changed." : "Thanks — your vote is in!" });
    void refresh();
  };

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: poll?.title ?? "Book club vote", url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      /* share sheet closed */
    }
  };

  const tally = (id: string) => votes.filter((v) => v.option_id === id);
  const max = Math.max(1, ...options.map((o) => tally(o.id).length));
  const top = Math.max(0, ...options.map((o) => tally(o.id).length));

  return (
    <div className="min-h-screen">
      <header className="safe-top border-b border-border/60 bg-card/70 backdrop-blur">
        <div className="safe-x mx-auto flex h-16 max-w-3xl items-center justify-between">
          <button type="button" onClick={() => navigate("/")} aria-label="Shelf to Stacks home">
            <Logo />
          </button>
        </div>
      </header>
      <main className="safe-x safe-bottom mx-auto max-w-3xl pb-16 pt-8">
        <button type="button" onClick={() => navigate("/")} className="py-2 text-sm text-muted-foreground hover:text-foreground">
          ← Back to my shelf
        </button>
        {!supabase ? (
          <p className="mt-8 text-muted-foreground">Book club voting isn't set up on this site yet.</p>
        ) : loading ? (
          <p className="mt-8 text-muted-foreground">Loading vote…</p>
        ) : !poll ? (
          <p className="mt-8 text-muted-foreground">This vote doesn't exist. Check the link.</p>
        ) : (
          <>
            <p className="mt-6 text-xs uppercase tracking-[0.2em] text-muted-foreground">Book club vote</p>
            <h1 className="mt-2 font-display text-4xl [overflow-wrap:anywhere]">{poll.title}</h1>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
              <span className="text-muted-foreground">
                {votes.length} {votes.length === 1 ? "vote" : "votes"} so far
              </span>
              <Button variant="outline" className="min-h-9 px-3" onClick={share}>
                {copied ? "Link copied!" : "Share this vote"}
              </Button>
            </div>

            <ul className="mt-6 grid gap-3" role="radiogroup" aria-label="Books">
              {options.map((o) => {
                const t = tally(o.id);
                const leading = t.length > 0 && t.length === top;
                return (
                  <li key={o.id}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={choice === o.id}
                      onClick={() => setChoice(o.id)}
                      className={cx(
                        "flex w-full gap-4 rounded-lg border bg-card p-4 text-left transition-colors",
                        choice === o.id ? "border-accent-strong ring-2 ring-accent/40" : "border-border/70",
                      )}
                    >
                      {o.image_url ? (
                        <img src={o.image_url} alt="" className="h-18 w-12 shrink-0 rounded-sm object-cover" />
                      ) : (
                        <div className="h-18 w-12 shrink-0 rounded-sm bg-muted" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-display text-lg leading-snug [overflow-wrap:anywhere]">
                          {o.title} {leading && <span className="ml-1 align-middle text-xs font-sans text-link">Leading</span>}
                        </p>
                        {o.author && <p className="text-sm text-muted-foreground">by {o.author}</p>}
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                          <div className="h-full bg-accent transition-all" style={{ width: `${(t.length / max) * 100}%` }} />
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t.length} {t.length === 1 ? "vote" : "votes"}
                          {t.length > 0 && ` · ${t.map((v) => v.voter_name).join(", ")}`}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" maxLength={60} aria-label="Your name" className="h-11" />
              <Button onClick={submit} disabled={busy || !choice || !name.trim()}>
                {busy ? "Saving…" : voted ? "Change my vote" : "Cast my vote"}
              </Button>
            </div>
            {msg && (
              <p role="status" className={cx("mt-3 text-sm", msg.ok ? "text-success" : "text-destructive")}>
                {msg.text}
              </p>
            )}
          </>
        )}
      </main>
    </div>
  );
}
