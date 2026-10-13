import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeClubs } from "../shared/clubMerge.js";

const club = (id: string, name: string, ...members: string[]) => ({ id, name, members: members.map((m) => ({ id: m, name: m })) });

test("joining a device keeps clubs from both sides", () => {
  const phone = [club("c1", "My book club", "sam"), club("c2", "Work", "priya")];
  const laptop = [club("c1", "My book club", "jo"), club("c3", "Family", "mom")];
  const merged = mergeClubs(phone, laptop);
  assert.deepEqual(merged.map((c) => c.id).sort(), ["c1", "c2", "c3"]);
  assert.deepEqual(merged.find((c) => c.id === "c1")!.members.map((m) => m.id).sort(), ["jo", "sam"]);
});

test("the synced copy wins for the same member and club name", () => {
  const local = [{ id: "c1", name: "Old name", members: [{ id: "sam", name: "Sam (old)" }] }];
  const synced = [{ id: "c1", name: "New name", members: [{ id: "sam", name: "Sam" }] }];
  const merged = mergeClubs(local, synced);
  assert.equal(merged[0].name, "New name");
  assert.equal(merged[0].members.length, 1);
  assert.equal(merged[0].members[0].name, "Sam");
});

test("merging doesn't change the inputs", () => {
  const local = [club("c1", "A", "x")];
  const synced = [club("c1", "A", "y")];
  mergeClubs(local, synced);
  assert.equal(synced[0].members.length, 1);
  assert.equal(local[0].members.length, 1);
});
