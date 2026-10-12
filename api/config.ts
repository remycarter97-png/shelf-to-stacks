import { aiConfig } from "../server/ai.js";
import { json } from "../server/http.js";
import type { AppConfig } from "../shared/types.js";

// GET /api/config — tells the app which optional features are switched on.
export function GET() {
  return json({ recommendations: aiConfig() !== null } satisfies AppConfig, { cacheSeconds: 300 });
}
