import { test } from "node:test";
import assert from "node:assert/strict";
import { findCommonBooks, titleKey, toIsbn13, type ClubMember } from "../shared/clubMatch.js";
import type { Book } from "../shared/types.js";

const bk = (title: string, author: string, isbn = "", imageUrl = ""): Book => ({
  id: `${title}|${author}`,
  title,
  author,
  isbn,
  imageUrl,
  goodreadsUrl: "",
});

test("title keys ignore series, subtitles, leading articles and accents", () => {
  assert.equal(titleKey("The Hobbit: or There and Back Again (Middle-earth, #1)"), "hobbit");
  assert.equal(titleKey("Piranesi"), titleKey("piranési"));
});

test("ISBN-10 converts to ISBN-13", () => {
  assert.equal(toIsbn13("0060853980"), "9780060853983");
  assert.equal(toIsbn13("978-0-06-085398-3"), "9780060853983");
});

test("finds books on several lists, most shared first", () => {
  const members: ClubMember[] = [
    { id: "1", name: "Remy", books: [bk("Piranesi", "Susanna Clarke"), bk("Tress of the Emerald Sea (Hoid's Travails)", "Brandon Sanderson"), bk("Dune", "Frank Herbert")] },
    // Same Tress, different title formatting and author style; Piranesi with accents.
    { id: "2", name: "Sam", books: [bk("Tress of the Emerald Sea", "Sanderson, Brandon"), bk("Piranési", "Susanna Clarke")] },
    { id: "3", name: "Jo", books: [bk("Tress of the Emerald Sea", "Brandon Sanderson", "", "cover.jpg"), bk("Emma", "Jane Austen")] },
  ];
  const common = findCommonBooks(members);
  assert.equal(common[0].book.title, "Tress of the Emerald Sea", "on 3 lists, so first; picks the copy with a cover");
  assert.deepEqual(common[0].members.map((m) => m.name), ["Remy", "Sam", "Jo"]);
  assert.equal(common[1].book.title, "Piranesi");
  assert.equal(common[1].members.length, 2);
  assert.equal(common.filter((c) => c.members.length >= 2).length, 2);
});

test("an ISBN match joins entries whose titles are written differently", () => {
  const members: ClubMember[] = [
    { id: "1", name: "A", books: [bk("Good Omens", "Terry Pratchett", "0060853980")] },
    { id: "2", name: "B", books: [bk("Good Omens: The Nice and Accurate Prophecies of Agnes Nutter, Witch", "Neil Gaiman", "9780060853983")] },
  ];
  assert.equal(findCommonBooks(members)[0].members.length, 2);
});

test("different books with the same title by different authors stay apart", () => {
  const members: ClubMember[] = [
    { id: "1", name: "A", books: [bk("Persuasion", "Jane Austen")] },
    { id: "2", name: "B", books: [bk("Persuasion", "Robert Cialdini")] },
  ];
  assert.ok(findCommonBooks(members).every((c) => c.members.length === 1));
});

test("a member listing the same book twice counts once", () => {
  const members: ClubMember[] = [
    { id: "1", name: "A", books: [bk("Dune", "Frank Herbert"), bk("Dune (Dune #1)", "Frank Herbert")] },
    { id: "2", name: "B", books: [bk("Dune", "Frank Herbert")] },
  ];
  assert.equal(findCommonBooks(members)[0].members.length, 2);
});
