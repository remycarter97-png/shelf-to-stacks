import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSimilarPrompt, parseSimilar } from "../server/similar.js";

const shelf = [
  { title: "Piranesi", author: "Susanna Clarke" },
  { title: "The Starless Sea", author: "Erin Morgenstern" },
  { title: "Jonathan Strange & Mr Norrell", author: "Susanna Clarke" },
  { title: "Project Hail Mary", author: "Andy Weir" },
];
const seed = shelf[0];

test("the prompt numbers the reader's list", () => {
  const p = buildSimilarPrompt(seed, shelf);
  assert.match(p, /\n1\. "The Starless Sea" by Erin Morgenstern\n/);
});

test("keeps valid list picks, drops the picked book, bad indexes and repeats", () => {
  const reply = `Here you go:
  {"onList": [{"index": 1, "reason": "dreamlike labyrinth"}, {"index": 0, "reason": "itself"}, {"index": 9, "reason": "bad"}, {"index": 1, "reason": "dup"}, {"index": 2, "reason": "same author"}],
   "newBooks": [{"title": "The Night Circus", "author": "Erin Morgenstern", "reason": "lush magic"},
                {"title": "Piranesi", "author": "Susanna Clarke", "reason": "the seed"},
                {"title": "The Starless Sea", "author": "Erin Morgenstern", "reason": "already listed"},
                {"title": "The Night Circus", "author": "x", "reason": "dup"},
                {"title": "Babel", "author": "R. F. Kuang", "reason": "scholarly magic"}]}`;
  const r = parseSimilar(reply, seed, shelf);
  assert.deepEqual(r.onList.map((x) => x.index), [1, 2]);
  assert.deepEqual(r.newBooks.map((x) => x.title), ["The Night Circus", "Babel"]);
});

test("an unreadable reply gives a clear error", () => {
  assert.throws(() => parseSimilar("sorry, no", seed, shelf), /Couldn't read/);
});
