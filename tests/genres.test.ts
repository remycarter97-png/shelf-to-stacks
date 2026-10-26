import { test } from "node:test";
import assert from "node:assert/strict";
import { genresFromSubjects } from "../shared/genres.js";

test("fiction gets mood genres", () => {
  assert.deepEqual(genresFromSubjects(["Fiction, fantasy, general", "Labyrinths, fiction", "Fantasy fiction", "Magic"]).slice(0, 1), ["fantasy"]);
  const lattes = genresFromSubjects(["Fantasy", "Coffee shops", "Fiction, fantasy, general", "Friendship", "Orcs"]);
  assert.ok(lattes.includes("fantasy") && lattes.includes("cozy"));
  const gone = genresFromSubjects(["Fiction, suspense", "Married people", "Missing persons", "Thrillers"]);
  assert.equal(gone[0], "mystery");
  assert.deepEqual(genresFromSubjects(["Science fiction", "Space", "Fiction", "Deserts"]), ["scifi"]);
});

test("nonfiction stays nonfiction, even with history", () => {
  assert.deepEqual(genresFromSubjects(["Biography", "Women", "Education", "History"]), ["nonfiction"]);
});

test("young adult wins over juvenile", () => {
  const g = genresFromSubjects(["Young adult fiction", "Juvenile fiction", "Fantasy"]);
  assert.ok(g.includes("ya"));
  assert.ok(!g.includes("kids"));
});

test("no subjects, no genres", () => {
  assert.deepEqual(genresFromSubjects([]), []);
});
