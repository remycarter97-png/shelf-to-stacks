import { test } from "node:test";
import assert from "node:assert/strict";
import { countRankedChoice } from "../shared/rankedChoice.js";

const OPTS = ["A", "B", "C", "D"];

test("a first-round majority wins right away", () => {
  const r = countRankedChoice(OPTS, [["A", "B"], ["A"], ["A", "C"], ["B", "A"]]);
  assert.deepEqual(r.winners, ["A"]);
  assert.equal(r.rounds.length, 1);
});

test("eliminated books pass their ballots to the next choice", () => {
  // First round: A 3, B 2, C 2 (no majority of 7). B and C tie for last;
  // C has fewer overall points, so C goes, and C's ballots move to B.
  const ballots = [
    ["A"], ["A"], ["A"],
    ["B", "A"], ["B"],
    ["C", "B", "A"], ["C", "B"],
  ];
  const r = countRankedChoice(["A", "B", "C"], ballots);
  assert.deepEqual(r.rounds[0].eliminated, ["C"]);
  assert.deepEqual(r.winners, ["B"]);
  assert.equal(r.rounds[1].counts.B, 4);
});

test("exhausted ballots stop counting", () => {
  // D is eliminated first; its voter ranked nothing else, so later majorities use 4 ballots.
  const r = countRankedChoice(OPTS, [["A"], ["A"], ["B"], ["C", "B"], ["D"]]);
  const last = r.rounds.at(-1)!;
  assert.ok(last.active < 5);
  assert.equal(r.totalBallots, 5);
});

test("an exact tie on everything is reported as a tie", () => {
  const r = countRankedChoice(["A", "B"], [["A", "B"], ["B", "A"]]);
  assert.deepEqual(r.winners.sort(), ["A", "B"]);
});

test("bad ballots are cleaned: unknown books, repeats and ranks past 3 are ignored", () => {
  const r = countRankedChoice(OPTS, [["A", "A", "X", "B", "C", "D"]]);
  assert.equal(r.points.A, 3);
  assert.equal(r.points.B, 2);
  assert.equal(r.points.C, 1);
  assert.equal(r.points.D, 0);
});

test("no ballots, no winner", () => {
  assert.deepEqual(countRankedChoice(OPTS, []).winners, []);
});
