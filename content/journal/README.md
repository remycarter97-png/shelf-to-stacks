# Journal posts

Each post is one Markdown file in this folder. When a change is saved to the `main` branch,
the site rebuilds and the post is live on shelftostacks.com/journal in about a minute.

## Edit a post on GitHub

1. Open the post's file in this folder on github.com.
2. Click the pencil icon (Edit this file).
3. Make your changes. The **Preview** tab shows roughly how it will look.
4. Click **Commit changes…**, then **Commit changes** again.

## Add a new post

Click **Add file → Create new file** in this folder. Name it with the date and a few words,
like `2026-11-15-winter-reading-list.md`. The words after the date become the web address:
shelftostacks.com/journal/winter-reading-list.

Start the file with this block, then write the post underneath:

```
---
title: Our winter reading list
date: 2026-11-15
category: Reading list
excerpt: One or two sentences shown on the post's card.
picture: stack
color: blush
---
```

- **picture**: `stack`, `chair`, `card`, `rain`, `tea` or `basket`
- **color**: `blush`, `sage`, `butter` or `lavender`
- **excerpt** is optional; without it the card uses the start of the first paragraph.
- Add `draft: true` to keep a post off the site while you work on it.
- The reading time is worked out automatically.

## Writing the post

```
A normal paragraph. Leave a blank line between paragraphs.

## A section heading

- A bullet point
- Another bullet point

Use **bold**, *italic*, and links like [Boston Public Library](https://www.bpl.org)
or [the book club page](/club).
```

Posts appear newest first. The three newest also show on the home page.
