// Turns a journal post written in Markdown (content/journal/*.md) into data the site renders.
// Pure, so it can be tested. Supports the small set of Markdown a post needs:
//   ## Heading, paragraphs, "- " bullet lists, **bold**, *italic* and [links](https://...).

export type Block = { h: string } | { p: string } | { ul: string[] };
export type Art = "stack" | "chair" | "card" | "rain" | "tea" | "basket";
export type Tint = "blush" | "sage" | "butter" | "lavender";

export type Post = {
  slug: string;
  title: string;
  date: string; // YYYY-MM-DD
  category: string;
  minutes: number;
  excerpt: string;
  art: Art;
  tint: Tint;
  draft: boolean;
  body: Block[];
};

const ARTS: Art[] = ["stack", "chair", "card", "rain", "tea", "basket"];
const TINTS: Tint[] = ["blush", "sage", "butter", "lavender"];

/** "2026-10-20-what-were-reading.md" → "what-were-reading" */
export function slugFromFile(path: string) {
  const name = path.split("/").pop()!.replace(/\.md$/i, "");
  return name
    .replace(/^\d{4}-\d{2}-\d{2}-/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function parsePost(path: string, text: string): Post {
  const src = text.replace(/\r\n?/g, "\n").replace(/^﻿/, "");
  const fm: Record<string, string> = {};
  let rest = src;
  const m = src.match(/^---\n([\s\S]*?)\n---\n?/);
  if (m) {
    for (const line of m[1].split("\n")) {
      const kv = line.match(/^\s*([A-Za-z]+)\s*:\s*(.*)$/);
      if (kv) fm[kv[1].toLowerCase()] = kv[2].trim().replace(/^["'](.*)["']$/, "$1");
    }
    rest = src.slice(m[0].length);
  }

  const body: Block[] = [];
  let para: string[] = [];
  let list: string[] | null = null;
  const flush = () => {
    if (para.length) body.push({ p: para.join(" ") });
    para = [];
    if (list) body.push({ ul: list });
    list = null;
  };
  for (const raw of rest.split("\n")) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const heading = line.match(/^#{1,4}\s+(.*)$/);
    if (heading) {
      flush();
      body.push({ h: heading[1].trim() });
      continue;
    }
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    if (bullet) {
      if (para.length) {
        body.push({ p: para.join(" ") });
        para = [];
      }
      (list ??= []).push(bullet[1].trim());
      continue;
    }
    if (list) {
      // A line right under a bullet continues that bullet.
      list[list.length - 1] += " " + line;
      continue;
    }
    para.push(line);
  }
  flush();

  const words = body
    .map((b) => ("h" in b ? b.h : "p" in b ? b.p : b.ul.join(" ")))
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length;
  const firstPara = body.find((b): b is { p: string } => "p" in b)?.p ?? "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(fm.date ?? "") ? fm.date : (path.split("/").pop()!.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? "2026-01-01");

  return {
    slug: slugFromFile(path),
    title: fm.title || slugFromFile(path).replace(/-/g, " "),
    date,
    category: fm.category || "Journal",
    minutes: Math.max(1, Math.round(words / 220)),
    excerpt: fm.excerpt || plain(firstPara).slice(0, 160),
    art: (ARTS as string[]).includes(fm.picture) ? (fm.picture as Art) : "stack",
    tint: (TINTS as string[]).includes(fm.color) ? (fm.color as Tint) : "blush",
    draft: /^(true|yes)$/i.test(fm.draft ?? ""),
    body,
  };
}

/** Inline Markdown as pieces: plain text, bold, italic and links. */
export type Inline = { t: string; b?: boolean; i?: boolean; href?: string };

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*|_(.+?)_|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  for (let m; (m = re.exec(text)); ) {
    if (m.index > last) out.push({ t: text.slice(last, m.index) });
    if (m[1] != null) out.push({ t: m[1], b: true });
    else if (m[2] != null || m[3] != null) out.push({ t: (m[2] ?? m[3])!, i: true });
    else if (/^(https?:\/\/|\/|mailto:)/.test(m[5])) out.push({ t: m[4], href: m[5] });
    else out.push({ t: m[4] });
    last = re.lastIndex;
  }
  if (last < text.length) out.push({ t: text.slice(last) });
  return out;
}

const plain = (s: string) => parseInline(s).map((x) => x.t).join("");
