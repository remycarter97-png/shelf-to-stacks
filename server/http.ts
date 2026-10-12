// Small helpers shared by the API routes (Vercel Functions, Web Request/Response).

export function json(data: unknown, init: ResponseInit & { cacheSeconds?: number } = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  if (init.cacheSeconds) {
    // Lets Vercel's CDN reuse identical GET answers for everyone.
    headers.set(
      "Cache-Control",
      `public, max-age=0, s-maxage=${init.cacheSeconds}, stale-while-revalidate=${init.cacheSeconds}`,
    );
  } else {
    headers.set("Cache-Control", "no-store");
  }
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function errorJson(message: string, status = 400, extra: Record<string, unknown> = {}) {
  return json({ error: message, ...extra }, { status });
}

export async function readJson<T>(req: Request): Promise<T> {
  const text = await req.text();
  if (text.length > 200_000) throw new HttpError("Request too large.", 413);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError("Request body must be JSON.", 400);
  }
}

export class HttpError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export function handle(fn: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    try {
      return await fn(req);
    } catch (e) {
      if (e instanceof HttpError) return errorJson(e.message, e.status);
      console.error("Unhandled API error", e);
      return errorJson("Something went wrong. Please try again.", 500);
    }
  };
}

export function clientIp(req: Request) {
  return (
    req.headers.get("x-real-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "local"
  );
}

/** Run `worker` over `items` with at most `limit` running at once, keeping order. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return out;
}

export async function fetchWithTimeout(url: string, init: RequestInit, ms: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
