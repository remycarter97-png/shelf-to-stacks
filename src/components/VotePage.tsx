import { useCallback, useEffect, useMemo, useState } from "react";
import { MAX_RANKS, countRankedChoice } from "../../shared/rankedChoice";
import { supabase, voterToken } from "../lib/supabase";
import { navigate } from "../lib/router";
import { load, save } from "../lib/storage";
import { organizerKey, setStatus } from "../lib/hub";
import { Button, Input, cx } from "./ui";

type Option = { id: string; title: string; author: string; image_url: string };
type Vote = { option_id: string; voter_name: string; rankings: string[] | null };

const ORDINAL = ["1st", "2nd", "3rd"];

/** This device's ranking for each poll. Older single-choice votes were saved as a plain id. */
function myRankings(pollId: string): string[] {
  const v = load<Record<string, string | string[]>>("my-votes", {})[pollId];
  return Array.isArray(v) ? v : v ? [v] : [];
}

export function VotePage({ pollId }: { pollId: string }) {
  const [poll, setPoll] = useState<{ title: string } | null>(null);
  const [options, setOptions] = useState<Option[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [name, setName] = useState(() => load("voter-name", ""));
  const [ranking, setRanking] = useState<string[]>(() => myRankings(pollId));
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showRounds, setShowRounds] = useState(false);
  // Votes started from a shared club page link back to it.
  const [hub, setHub] = useState<{ id: string; name: string; bookFor: Record<string, string> } | null>(null);
  const [promoting, setPromoting] = useState(false);
  const isCreator = load<string[]>("my-polls", []).includes(pollId);
  const voted = myRankings(pollId).length > 0;
  const maxRanks = Math.min(MAX_RANKS, options.length || MAX_RANKS);

  const refresh = useCallback(async () => {
    if (!supabase) return setLoading(false);
    const [p, o] = await Promise.all([
      supabase.from("club_polls").select("title").eq("id", pollId).maybeSingle(),
      supabase.from("club_poll_options").select("id,title,author,image_url").eq("poll_id", pollId).order("position"),
    ]);
    let rows: Array<Partial<Vote>> | null = null;
    const ranked = await supabase.from("club_poll_votes").select("option_id,voter_name,rankings").eq("poll_id", pollId);
    if (ranked.error) {
      // Ranked voting not set up in the database yet: read plain votes.
      const plain = await supabase.from("club_poll_votes").select("option_id,voter_name").eq("poll_id", pollId);
      rows = plain.data;
    } else rows = ranked.data;
    setPoll(p.data);
    setOptions(o.data ?? []);
    setVotes((rows ?? []).map((x) => ({ option_id: x.option_id!, voter_name: x.voter_name!, rankings: x.rankings ?? [x.option_id!] })));
    setLoading(false);
  }, [pollId]);

  useEffect(() => {
    const db = supabase;
    if (!db) return;
    let gone = false;
    (async () => {
      // These columns only exist once the club page setup has been run; errors just mean no club.
      const p = await db.from("club_polls").select("hub_id").eq("id", pollId).maybeSingle();
      const hubId = p.error ? null : (p.data?.hub_id as string | null);
      if (!hubId) return;
      const [h, o] = await Promise.all([
        db.from("club_hubs").select("name").eq("id", hubId).maybeSingle(),
        db.from("club_poll_options").select("id,hub_book_id").eq("poll_id", pollId),
      ]);
      if (gone || h.error || !h.data) return;
      const bookFor: Record<string, string> = {};
      for (const row of o.data ?? []) if (row.hub_book_id) bookFor[row.id] = row.hub_book_id;
      setHub({ id: hubId, name: h.data.name, bookFor });
    })();
    return () => {
      gone = true;
    };
  }, [pollId]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => document.visibilityState === "visible" && refresh(), 15_000);
    return () => clearInterval(t);
  }, [refresh]);

  // Tap to add a book as your next choice; tap again to remove it (later choices move up).
  const toggle = (id: string) => {
    setMsg(null);
    setRanking((r) => (r.includes(id) ? r.filter((x) => x !== id) : r.length < maxRanks ? [...r, id] : r));
  };

  const submit = async () => {
    if (!supabase || ranking.length === 0 || !name.trim()) return;
    setBusy(true);
    setMsg(null);
    const voter = name.trim().slice(0, 60);
    save("voter-name", voter);
    const { error } = await supabase.rpc("cast_ranked_vote", {
      p_poll: pollId,
      p_rankings: ranking,
      p_name: voter,
      p_token: voterToken(),
    });
    setBusy(false);
    if (error) {
      setMsg({
        ok: false,
        text: error.message.includes("name_taken")
          ? `Someone else already voted as “${voter}”. Add an initial to your name.`
          : /cast_ranked_vote|function/i.test(error.message)
            ? "Ranked voting isn't switched on for this site yet. The site owner needs to run the ranked-choice setup in Supabase."
            : "Couldn't save your vote. Try again.",
      });
      return;
    }
    save("my-votes", { ...load<Record<string, unknown>>("my-votes", {}), [pollId]: ranking });
    setMsg({ ok: true, text: voted ? "Your rankings were updated." : "Thanks — your rankings are in!" });
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

  const count = useMemo(
    () => countRankedChoice(options.map((o) => o.id), votes.map((v) => v.rankings ?? [v.option_id])),
    [options, votes],
  );
  const titleOf = (id: string) => options.find((o) => o.id === id)?.title ?? "A book";
  const lastRound = count.rounds.at(-1);
  const outInRound = (id: string) => count.rounds.findIndex((r) => r.eliminated.includes(id));

  return (
    <div className="safe-top min-h-screen">
      {/* Voters see only the survey. The person who created it on this device gets a way back. */}
      <main className="safe-x safe-bottom mx-auto max-w-3xl pb-16 pt-6">
        {hub ? (
          <button type="button" onClick={() => navigate(`/c/${hub.id}`)} className="py-2 text-sm text-muted-foreground hover:text-foreground [overflow-wrap:anywhere]">
            ← Back to {hub.name}
          </button>
        ) : (
          isCreator && (
            <button type="button" onClick={() => navigate("/")} className="py-2 text-sm text-muted-foreground hover:text-foreground">
              ← Back to my shelf
            </button>
          )
        )}
        {!supabase ? (
          <p className="mt-8 text-muted-foreground">Book club voting isn't set up on this site yet.</p>
        ) : loading ? (
          <p className="mt-8 text-muted-foreground">Loading vote…</p>
        ) : !poll ? (
          <p className="mt-8 text-muted-foreground">This vote doesn't exist. Check the link.</p>
        ) : (
          <>
            <p className={cx("text-sm font-bold text-muted-foreground", isCreator || hub ? "mt-4" : "mt-4 sm:mt-8")}>
              Book club vote · ranked choice
            </p>
            <h1 className="mt-2 font-display text-4xl [overflow-wrap:anywhere]">{poll.title}</h1>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
              <span className="text-muted-foreground">
                {votes.length} {votes.length === 1 ? "person has" : "people have"} voted
              </span>
              <Button variant="outline" className="min-h-9 px-3" onClick={share}>
                {copied ? "Link copied!" : "Share this vote"}
              </Button>
            </div>

            <h2 className="mt-8 font-display text-xl">Rank your top {maxRanks}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Tap your favorite first, then your {maxRanks === 3 ? "2nd and 3rd choices" : "2nd choice"}. Tap a book again to
              remove it. You can rank just one if you like.
            </p>

            <ul className="mt-4 grid gap-3" aria-label="Books to rank">
              {options.map((o) => {
                const pos = ranking.indexOf(o.id);
                const full = pos < 0 && ranking.length >= maxRanks;
                return (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => toggle(o.id)}
                      aria-pressed={pos >= 0}
                      aria-label={pos >= 0 ? `${o.title}, your ${ORDINAL[pos]} choice. Tap to remove.` : `Rank ${o.title}`}
                      disabled={full}
                      className={cx(
                        "flex w-full items-center gap-4 rounded-lg border bg-card p-4 text-left transition-colors disabled:opacity-50",
                        pos >= 0 ? "border-accent-strong ring-2 ring-accent/40" : "border-border/70",
                      )}
                    >
                      <span
                        className={cx(
                          "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-sm font-semibold tabular-nums",
                          pos >= 0 ? "border-primary bg-primary text-primary-foreground" : "border-dashed border-border text-muted-foreground",
                        )}
                        aria-hidden
                      >
                        {pos >= 0 ? ORDINAL[pos] : "+"}
                      </span>
                      {o.image_url ? (
                        <img src={o.image_url} alt="" className="h-18 w-12 shrink-0 rounded-sm object-cover" />
                      ) : (
                        <div className="h-18 w-12 shrink-0 rounded-sm bg-muted" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-display text-lg leading-snug [overflow-wrap:anywhere]">{o.title}</p>
                        {o.author && <p className="text-sm text-muted-foreground">by {o.author}</p>}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>

            {ranking.length > 0 && (
              <ol className="mt-4 space-y-1 rounded-md border border-border/60 bg-muted/50 p-3 text-sm">
                {ranking.map((id, i) => (
                  <li key={id}>
                    <span className="font-medium">{ORDINAL[i]}:</span> {titleOf(id)}
                  </li>
                ))}
              </ol>
            )}

            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" maxLength={60} aria-label="Your name" className="h-11" />
              <Button onClick={submit} disabled={busy || ranking.length === 0 || !name.trim()}>
                {busy ? "Saving…" : voted ? "Update my rankings" : "Submit my rankings"}
              </Button>
            </div>
            {msg && (
              <p role="status" className={cx("mt-3 text-sm", msg.ok ? "text-success" : "text-destructive")}>
                {msg.text}
              </p>
            )}

            <section className="mt-10 border-t border-border/60 pt-6" aria-labelledby="results-title">
              <h2 id="results-title" className="font-display text-xl">
                Results so far
              </h2>
              {count.totalBallots === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">No votes yet. Results appear here as people vote.</p>
              ) : (
                <>
                  <p className="mt-2 text-sm">
                    {count.winners.length === 1 ? (
                      <>
                        <b>{titleOf(count.winners[0])}</b> is winning
                        {count.rounds.length > 1 ? ` after ${count.rounds.length} rounds` : ""}, with{" "}
                        {lastRound?.counts[count.winners[0]]} of {lastRound?.active} votes in the final round.
                      </>
                    ) : (
                      <>
                        It's a tie between <b>{count.winners.map(titleOf).join(" and ")}</b>.
                      </>
                    )}
                  </p>
                  <ul className="mt-4 grid gap-3">
                    {[...options]
                      .sort((a, b) => {
                        const ra = outInRound(a.id), rb = outInRound(b.id);
                        // Still in the race first (by final votes), then by how late they were eliminated.
                        if (ra < 0 && rb < 0) return (lastRound?.counts[b.id] ?? 0) - (lastRound?.counts[a.id] ?? 0);
                        if (ra < 0) return -1;
                        if (rb < 0) return 1;
                        return rb - ra;
                      })
                      .map((o) => {
                        const out = outInRound(o.id);
                        const final = lastRound?.counts[o.id];
                        const win = count.winners.includes(o.id);
                        return (
                          <li key={o.id} className="text-sm">
                            <div className="flex items-baseline justify-between gap-3">
                              <span className={cx("min-w-0 [overflow-wrap:anywhere]", win && "font-semibold")}>
                                {o.title}
                                {win && <span className="ml-1.5 text-xs font-medium text-link">{count.winners.length > 1 ? "Tied" : "Winning"}</span>}
                              </span>
                              <span className="shrink-0 tabular-nums text-muted-foreground">
                                {out >= 0 ? `Out in round ${out + 1}` : `${final ?? 0} ${final === 1 ? "vote" : "votes"}`}
                              </span>
                            </div>
                            <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                              <div
                                className={cx("h-full transition-all", out >= 0 ? "bg-muted-foreground/30" : "bg-accent")}
                                style={{ width: `${out >= 0 ? 0 : ((final ?? 0) / Math.max(1, lastRound?.active ?? 1)) * 100}%` }}
                              />
                            </div>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {count.firstChoices[o.id] ?? 0} first-choice {count.firstChoices[o.id] === 1 ? "vote" : "votes"}
                            </p>
                          </li>
                        );
                      })}
                  </ul>

                  <button
                    type="button"
                    onClick={() => setShowRounds((s) => !s)}
                    aria-expanded={showRounds}
                    className="mt-4 py-1 text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  >
                    {showRounds ? "Hide how the count works" : "How the count works"}
                  </button>
                  {showRounds && (
                    <div className="mt-2 rounded-md border border-border/60 bg-card p-3 text-sm leading-relaxed">
                      <p className="text-muted-foreground">
                        Each round, every ballot counts for its highest-ranked book still in the race. A book with more than
                        half of those votes wins. Otherwise the book with the fewest votes is dropped, and its ballots move
                        to their next choice.
                      </p>
                      <ol className="mt-3 space-y-2">
                        {count.rounds.map((r, i) => (
                          <li key={i}>
                            <b>Round {i + 1}</b> ({r.active} {r.active === 1 ? "ballot" : "ballots"} counting):{" "}
                            {Object.entries(r.counts)
                              .sort((a, b) => b[1] - a[1])
                              .map(([id, n]) => `${titleOf(id)} ${n}`)
                              .join(" · ")}
                            {r.eliminated.length > 0 && (
                              <span className="text-muted-foreground"> — {r.eliminated.map(titleOf).join(" and ")} dropped</span>
                            )}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  <p className="mt-4 text-xs text-muted-foreground">Voted: {votes.map((v) => v.voter_name).join(", ")}</p>

                  {hub && organizerKey(hub.id) && count.winners.length === 1 && hub.bookFor[count.winners[0]] && (
                    <div className="mt-6 rounded-lg border border-accent-strong/40 bg-accent/10 p-4 text-sm">
                      <p>
                        <b>Organizer:</b> when voting's done, make the winner the club's current read. It shows at the top of the
                        club page, and the book now being read moves to past reads.
                      </p>
                      <Button
                        className="mt-3"
                        disabled={promoting}
                        onClick={async () => {
                          setPromoting(true);
                          try {
                            await setStatus(hub.id, hub.bookFor[count.winners[0]], "current");
                            navigate(`/c/${hub.id}`);
                          } catch (e) {
                            setMsg({ ok: false, text: (e as Error).message });
                          } finally {
                            setPromoting(false);
                          }
                        }}
                      >
                        {promoting ? "Saving…" : `Make “${titleOf(count.winners[0])}” our current read`}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
