import { test } from "node:test";
import assert from "node:assert/strict";
import { parseInline, parsePost, slugFromFile } from "../shared/journalMarkdown.js";

const md = `---
title: "Hello, readers"
date: 2026-11-02
category: Reading list
picture: tea
color: sage
---

First paragraph with **bold** and a [link](https://example.com).
It keeps going on the next line.

## A heading

- one
- two
  continued

Last words.
`;

test("reads front matter and body", () => {
  const p = parsePost("/content/journal/2026-11-02-hello-readers.md", md);
  assert.equal(p.slug, "hello-readers");
  assert.equal(p.title, "Hello, readers");
  assert.equal(p.date, "2026-11-02");
  assert.equal(p.art, "tea");
  assert.equal(p.tint, "sage");
  assert.equal(p.draft, false);
  assert.deepEqual(p.body, [
    { p: "First paragraph with **bold** and a [link](https://example.com). It keeps going on the next line." },
    { h: "A heading" },
    { ul: ["one", "two continued"] },
    { p: "Last words." },
  ]);
  assert.equal(p.excerpt, "First paragraph with bold and a link. It keeps going on the next line.");
});

test("sensible defaults and drafts", () => {
  const p = parsePost("2026-12-01-quick-note.md", "---\ndraft: true\n---\nJust a note.");
  assert.equal(p.title, "quick note");
  assert.equal(p.date, "2026-12-01");
  assert.equal(p.art, "stack");
  assert.equal(p.draft, true);
  assert.equal(slugFromFile("My Post!.md"), "my-post");
});

test("inline formatting", () => {
  assert.deepEqual(parseInline("a *b* [c](/club)"), [{ t: "a " }, { t: "b", i: true }, { t: " " }, { t: "c", href: "/club" }]);
  // Only web, site and mailto links become links.
  assert.ok(parseInline("[c](javascript:alert(1))").every((x) => !x.href));
});
