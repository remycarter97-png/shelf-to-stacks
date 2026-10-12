// Two-level cache: in-memory on the running function instance, plus an optional
// shared Upstash Redis store (set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN,
// e.g. via the Upstash integration in the Vercel Marketplace). Without Upstash the
// app still works; repeat lookups are just less often cached.

const memory = new Map<string, { until: number; value: unknown }>();
const MAX_MEMORY = 5_000;

function upstash() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

export async function cacheGet<T>(key: string): Promise<T | undefined> {
  const hit = memory.get(key);
  if (hit && hit.until > Date.now()) return hit.value as T;
  if (hit) memory.delete(key);

  const u = upstash();
  if (!u) return undefined;
  try {
    const res = await fetch(`${u.url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${u.token}` },
    });
    if (!res.ok) return undefined;
    const body = (await res.json()) as { result: string | null };
    if (!body.result) return undefined;
    return JSON.parse(body.result) as T;
  } catch {
    return undefined;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number) {
  if (memory.size > MAX_MEMORY) memory.clear();
  memory.set(key, { until: Date.now() + ttlSeconds * 1000, value });

  const u = upstash();
  if (!u) return;
  try {
    await fetch(`${u.url}/set/${encodeURIComponent(key)}?EX=${ttlSeconds}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${u.token}` },
      body: JSON.stringify(value),
    });
  } catch {
    // A cache write failing never breaks a lookup.
  }
}

/** Fixed-window rate limit. Returns true when the caller is over the limit. */
export async function overLimit(bucket: string, max: number, windowSeconds: number) {
  const key = `rl:${bucket}:${Math.floor(Date.now() / (windowSeconds * 1000))}`;
  const u = upstash();
  if (u) {
    try {
      const res = await fetch(`${u.url}/pipeline`, {
        method: "POST",
        headers: { Authorization: `Bearer ${u.token}` },
        body: JSON.stringify([
          ["INCR", key],
          ["EXPIRE", key, String(windowSeconds)],
        ]),
      });
      const body = (await res.json()) as Array<{ result: number }>;
      return (body[0]?.result ?? 0) > max;
    } catch {
      // fall through to memory
    }
  }
  const cur = (memory.get(key)?.value as number | undefined) ?? 0;
  memory.set(key, { until: Date.now() + windowSeconds * 1000, value: cur + 1 });
  return cur + 1 > max;
}
