import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSeries, sameSeries, seriesOrder } from "../shared/series.js";

test("reads series name and number from Goodreads-style titles", () => {
  assert.deepEqual(parseSeries("Aether Corruption (Aether's Revival, #13)"), { name: "Aether's Revival", number: "13" });
  assert.deepEqual(parseSeries("Edgedancer (The Stormlight Archive, #2.5)"), { name: "The Stormlight Archive", number: "2.5" });
  assert.deepEqual(parseSeries("The Wheel of Time Box Set (The Wheel of Time, #1-3)"), { name: "The Wheel of Time", number: "1-3" });
  assert.deepEqual(parseSeries("Tress of the Emerald Sea (Hoid's Travails)"), { name: "Hoid's Travails" });
});

test("no series, or a note that isn't a series", () => {
  assert.equal(parseSeries("Piranesi"), null);
  assert.equal(parseSeries("Dune (Illustrated Edition)"), null);
});

test("matching and ordering", () => {
  assert.ok(sameSeries({ name: "The Stormlight Archive" }, { name: "Stormlight Archive" }));
  assert.equal(seriesOrder({ name: "x", number: "2.5" }), 2.5);
  assert.equal(seriesOrder({ name: "x" }), Number.POSITIVE_INFINITY);
});
