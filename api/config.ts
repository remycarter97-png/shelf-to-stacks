import { aiConfig } from "../server/ai.js";
import { json } from "../server/http.js";
import { goodreadsFeedStatus } from "../server/goodreads.js";
import type { AppConfig } from "../shared/types.js";

// GET /api/config — tells the app which optional features are switched on.
export async function GET() {
  return json({ recommendations: aiConfig() !== null, goodreadsFeed: await goodreadsFeedStatus() } satisfies AppConfig, { cacheSeconds: 300 });
}
