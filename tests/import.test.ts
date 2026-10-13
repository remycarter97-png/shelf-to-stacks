import { test } from "node:test";
import assert from "node:assert/strict";
import { importLibraryCsv, parseCsv, cleanIsbn } from "../shared/importCsv.js";

test("CSV parser handles quotes, commas and line breaks inside fields", () => {
  const rows = parseCsv('a,b,c\r\n"x, y","he said ""hi""","line1\nline2"\n');
  assert.deepEqual(rows, [["a", "b", "c"], ["x, y", 'he said "hi"', "line1\nline2"]]);
});

test("StoryGraph export: keeps only to-read books, first author, real ISBNs", () => {
  const csv = [
    "Title,Authors,Contributors,ISBN/UID,Format,Read Status,Date Added,Star Rating",
    'Piranesi,Susanna Clarke,,9781635575996,hardcover,to-read,2026/01/02,',
    '"Good Omens","Terry Pratchett, Neil Gaiman",,0060853980,paperback,to-read,2026/01/03,',
    'Project Hail Mary,Andy Weir,,9780593135204,ebook,read,2025/05/01,4.5',
    'Some Indie Book,An Author,,sg-uid-12345,ebook,to-read,2026/02/01,',
  ].join("\n");
  const r = importLibraryCsv(csv);
  assert.equal(r.source, "storygraph");
  assert.equal(r.books.length, 3);
  assert.deepEqual(r.books.map((b) => b.title), ["Piranesi", "Good Omens", "Some Indie Book"]);
  assert.equal(r.books[1].author, "Terry Pratchett");
  assert.equal(r.books[1].isbn, "0060853980");
  assert.equal(r.books[2].isbn, "", "StoryGraph's own IDs aren't ISBNs");
  assert.equal(r.books[2].imageUrl, "");
  assert.match(r.books[0].imageUrl, /covers\.openlibrary\.org\/b\/isbn\/9781635575996/);
  assert.match(r.books[0].goodreadsUrl, /app\.thestorygraph\.com/);
  assert.equal(r.books[0].source, "storygraph");
});

test("Goodreads export: reads the to-read shelf and the =\"…\" ISBN format", () => {
  const csv = [
    "Book Id,Title,Author,Author l-f,Additional Authors,ISBN,ISBN13,My Rating,Exclusive Shelf,Bookshelves",
    '54493401,Tress of the Emerald Sea,Brandon Sanderson,"Sanderson, Brandon",,"=""1250899656""","=""9781250899651""",0,to-read,to-read',
    '1,Dune,Frank Herbert,"Herbert, Frank",,"=""""","=""""",5,read,',
  ].join("\n");
  const r = importLibraryCsv(csv);
  assert.equal(r.source, "goodreads");
  assert.equal(r.books.length, 1);
  assert.equal(r.books[0].isbn, "9781250899651");
  assert.equal(r.books[0].goodreadsUrl, "https://www.goodreads.com/book/show/54493401");
});

test("Wrong file gives a clear message", () => {
  assert.throws(() => importLibraryCsv("name,email\nA,a@b.c"), /StoryGraph or Goodreads/);
  assert.throws(() => importLibraryCsv(""), /empty/);
});

test("ISBN cleanup", () => {
  assert.equal(cleanIsbn('="978-0-316-76948-0"'), "9780316769480");
  assert.equal(cleanIsbn("080442957X"), "080442957X");
  assert.equal(cleanIsbn("12345"), "");
});
