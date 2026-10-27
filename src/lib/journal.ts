/** Journal posts, read from the Markdown files in content/journal (see the README there). */

import { parsePost, type Post } from "../../shared/journalMarkdown";

export type { Block, Post } from "../../shared/journalMarkdown";

const files = import.meta.glob(["/content/journal/*.md", "!/content/journal/README.md"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;

/** Published posts, newest first. Posts marked `draft: true` are left out. */
export const POSTS: Post[] = Object.entries(files)
  .map(([path, text]) => parsePost(path, text))
  .filter((p) => !p.draft)
  .sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));

export function findPost(slug: string) {
  return POSTS.find((p) => p.slug === slug) ?? null;
}

export function formatPostDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

export const TINTS: Record<Post["tint"], string> = {
  blush: "var(--blush-soft)",
  sage: "var(--sage-soft)",
  butter: "var(--butter)",
  lavender: "var(--lavender-soft)",
};
