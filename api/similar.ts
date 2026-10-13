import { aiConfig } from "../server/ai.js";
import { similarBooks, type SimilarResult } from "../server/similar.js";
import { similarFree } from "../server/openlibrary.js";
import { cacheGet, cacheSet, overLimit } from "../server/cache.js";
import { HttpError, clientIp, handle, json, readJson } from "../server/http.js";

type Answer = SimilarResult & { source: "ai" | "openlibrary" };

// POST /api/similar  { seed: { title, author }, shelf: [{ title, author }], mode?: "ai" | "openlibrary" }
// Returns { onList: [{ index, reason }], newBooks: [{ title, author, reason }], source }, where index points into shelf.
//
// Uses AI when AI_PROVIDER / AI_API_KEY / AI_MODEL are set (e.g. a free Gemini or Groq key).
// Without a key, or if the AI fails or hits its limit, it uses the free Open Library method instead.
// Answers are cached for a week.
export const POST = handle(async (req) => {
  const body = await readJson<{
    seed?: { title?: string; author?: string };
    shelf?: Array<{ title?: string; author?: string }>;
    mode?: string;
  }>(req);
  const seed = { title: String(body.seed?.title ?? "").trim().slice(0, 200), author: String(body.seed?.author ?? "").trim().slice(0, 120) };
  if (!seed.title) throw new HttpError("Pick a book first.");
  const shelf = (Array.isArray(body.shelf) ? body.shelf : []).slice(0, 300).map((b) => ({
    title: String(b?.title ?? "").slice(0, 200),
    author: String(b?.author ?? "").slice(0, 120),
  }));

  // The reader can choose Open Library even when AI is available.
  const useAi = aiConfig() !== null && body.mode !== "openlibrary";
  const key = `similar:v2:${useAi ? "ai" : "ol"}:${await digest(JSON.stringify([seed, shelf]))}`;
  const cached = await cacheGet<Answer>(key);
  if (cached) return json(cached);

  if (await overLimit(`sim:${clientIp(req)}`, 15, 600)) {
    throw new HttpError("You've asked for a lot of recommendations. Try again in a few minutes.", 429);
  }

  let answer: Answer | null = null;
  if (useAi && !(await overLimit("sim:ai:all", 300, 3600))) {
    try {
      answer = { ...(await similarBooks(seed, shelf)), source: "ai" };
    } catch (e) {
      console.warn("AI recommendations failed; using Open Library instead.", (e as Error).message);
    }
  }
  if (!answer) answer = { ...(await similarFree(seed, shelf)), source: "openlibrary" };
  // A fallback answer is cached briefly, so the AI is tried again soon.
  await cacheSet(key, answer, answer.source === "ai" || !useAi ? 7 * 24 * 3600 : 3600);
  return json(answer);
});

async function digest(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}
