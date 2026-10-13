// Book recommendations, with the AI provider left pluggable.
//
// Recommendations are OFF until you set these environment variables in Vercel:
//   AI_PROVIDER = "anthropic"  or  "openai"   (any OpenAI-compatible API, e.g. OpenAI, Gemini, OpenRouter)
//   AI_API_KEY  = your provider key
//   AI_MODEL    = the model name to use, e.g. a current Claude or GPT model
//   AI_BASE_URL = optional; for OpenAI-compatible providers other than OpenAI
//                 (e.g. https://generativelanguage.googleapis.com/v1beta/openai for Gemini)
//
// To add another provider later, add a function with the same shape as `callAnthropic`
// and register it in PROVIDERS.

import type { Recommendation } from "../shared/types.js";
import { HttpError, fetchWithTimeout } from "./http.js";

type Provider = (prompt: string, cfg: { key: string; model: string; baseUrl?: string }) => Promise<string>;

const callAnthropic: Provider = async (prompt, { key, model, baseUrl }) => {
  const res = await fetchWithTimeout(
    `${baseUrl || "https://api.anthropic.com"}/v1/messages`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model, max_tokens: 2000, messages: [{ role: "user", content: prompt }] }),
    },
    45_000,
  );
  if (!res.ok) throw new HttpError(providerError(res.status), 502);
  const body = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  return (body.content || []).map((c) => c.text || "").join("");
};

const callOpenAiCompatible: Provider = async (prompt, { key, model, baseUrl }) => {
  const res = await fetchWithTimeout(
    `${(baseUrl || "https://api.openai.com/v1").replace(/\/$/, "")}/chat/completions`,
    {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }] }),
    },
    45_000,
  );
  if (!res.ok) throw new HttpError(providerError(res.status), 502);
  const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return body.choices?.[0]?.message?.content || "";
};

const PROVIDERS: Record<string, Provider> = {
  anthropic: callAnthropic,
  openai: callOpenAiCompatible,
};

function providerError(status: number) {
  if (status === 429) return "The recommendation service is busy. Try again in a minute.";
  if (status === 401 || status === 403) return "Recommendations aren't set up correctly (the AI key was refused).";
  if (status === 402) return "The recommendation service is out of credits.";
  return "Couldn't get recommendations right now.";
}

export function aiConfig() {
  const provider = (process.env.AI_PROVIDER || "").toLowerCase().trim();
  const key = process.env.AI_API_KEY || "";
  const model = process.env.AI_MODEL || "";
  if (!PROVIDERS[provider] || !key || !model) return null;
  return { provider, key, model, baseUrl: process.env.AI_BASE_URL || undefined };
}

export function buildPrompt(books: Array<{ title: string; author: string }>) {
  const shelf = books.map((b, i) => `${i + 1}. "${b.title}"${b.author ? ` by ${b.author}` : ""}`).join("\n");
  return `You are a thoughtful librarian. Below is a reader's Goodreads "want to read" shelf.
Recommend 10 books they would likely enjoy that are NOT already on the list. Look for overlapping themes, tones and author affinities.
For each, give one short sentence explaining the pick by pointing to patterns in the shelf.
Avoid books already on the list, sequels to books on the list, and obvious bestsellers unrelated to the patterns.

Reply with ONLY a JSON array, no other text, in this shape:
[{"title": "...", "author": "...", "reason": "..."}]

Shelf:
${shelf}`;
}

export function parseRecommendations(text: string): Recommendation[] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end <= start) throw new HttpError("Couldn't read the recommendations. Try again.", 502);
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new HttpError("Couldn't read the recommendations. Try again.", 502);
  }
  if (!Array.isArray(raw)) throw new HttpError("Couldn't read the recommendations. Try again.", 502);
  return raw
    .filter((r): r is Recommendation => !!r && typeof r.title === "string" && typeof r.author === "string")
    .map((r) => ({ title: r.title.slice(0, 200), author: r.author.slice(0, 120), reason: String(r.reason || "").slice(0, 300) }))
    .slice(0, 12);
}

/** Sends a prompt to the configured provider and returns its text reply. */
export async function askAi(prompt: string): Promise<string> {
  const cfg = aiConfig();
  if (!cfg) throw new HttpError("Recommendations aren't turned on for this site yet.", 501);
  return PROVIDERS[cfg.provider](prompt, cfg);
}

export async function recommend(books: Array<{ title: string; author: string }>): Promise<Recommendation[]> {
  const cfg = aiConfig();
  if (!cfg) throw new HttpError("Recommendations aren't turned on for this site yet.", 501);
  const text = await PROVIDERS[cfg.provider](buildPrompt(books), cfg);
  return parseRecommendations(text);
}
