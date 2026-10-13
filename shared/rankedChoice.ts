// Ranked-choice (instant-runoff) counting for book club votes.
//
// Each ballot ranks up to 3 books. Every round, each ballot counts for its highest-ranked book
// that's still in the race. If a book has more than half of those votes, it wins. Otherwise the
// book with the fewest votes is eliminated and its ballots move to their next choice.
// Ballots whose ranked books have all been eliminated sit out the remaining rounds ("exhausted").
//
// Ties for last place: the book ranked lower overall (fewer 3-2-1 points across all ballots) is
// eliminated first. If books are still tied on everything, all of them are eliminated together,
// unless that would remove every remaining book, in which case the vote ends in a tie.

export const MAX_RANKS = 3;

export type Round = {
  /** Votes per book still in the race this round. */
  counts: Record<string, number>;
  /** Ballots still counting (not exhausted). */
  active: number;
  /** Books eliminated at the end of this round. */
  eliminated: string[];
};

export type RcvResult = {
  winners: string[]; // one id, or several for an unbreakable tie; empty when there are no ballots
  rounds: Round[];
  totalBallots: number;
  firstChoices: Record<string, number>;
  points: Record<string, number>;
};

export function countRankedChoice(optionIds: string[], ballots: string[][]): RcvResult {
  const valid = new Set(optionIds);
  // Clean ballots: known books only, no repeats, top 3.
  const clean = ballots
    .map((b) => [...new Set(b.filter((id) => valid.has(id)))].slice(0, MAX_RANKS))
    .filter((b) => b.length > 0);

  const points: Record<string, number> = Object.fromEntries(optionIds.map((id) => [id, 0]));
  const firstChoices: Record<string, number> = Object.fromEntries(optionIds.map((id) => [id, 0]));
  for (const b of clean) {
    b.forEach((id, i) => (points[id] += MAX_RANKS - i));
    firstChoices[b[0]]++;
  }

  const result: RcvResult = { winners: [], rounds: [], totalBallots: clean.length, firstChoices, points };
  if (clean.length === 0) return result;

  let remaining = new Set(optionIds);
  while (remaining.size > 0) {
    const counts: Record<string, number> = Object.fromEntries([...remaining].map((id) => [id, 0]));
    let active = 0;
    for (const b of clean) {
      const pick = b.find((id) => remaining.has(id));
      if (pick) {
        counts[pick]++;
        active++;
      }
    }
    const round: Round = { counts, active, eliminated: [] };
    result.rounds.push(round);

    const ids = [...remaining];
    const top = Math.max(...ids.map((id) => counts[id]));
    const leaders = ids.filter((id) => counts[id] === top);
    if (active > 0 && top * 2 > active) {
      result.winners = leaders;
      return result;
    }
    if (remaining.size === 1) {
      result.winners = ids;
      return result;
    }

    // Eliminate the weakest: fewest votes this round, then fewest overall points.
    const low = Math.min(...ids.map((id) => counts[id]));
    let losers = ids.filter((id) => counts[id] === low);
    if (losers.length > 1) {
      const lowPts = Math.min(...losers.map((id) => points[id]));
      losers = losers.filter((id) => points[id] === lowPts);
    }
    if (losers.length === remaining.size) {
      // Everyone left is tied on everything.
      result.winners = ids;
      return result;
    }
    round.eliminated = losers;
    remaining = new Set(ids.filter((id) => !losers.includes(id)));
  }
  return result;
}
