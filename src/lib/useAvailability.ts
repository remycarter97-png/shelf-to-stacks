import { useCallback, useEffect, useRef, useState } from "react";
import { bookKey, type Availability, type Book } from "../../shared/types";
import { api } from "./api";
import { load, save } from "./storage";
import type { LibrarySystem } from "./libraries";

// How the shelf gets checked:
// - Results saved on this device show instantly on the next visit.
// - Anything older than FRESH_MS (or never checked) is re-checked.
// - Books go to the server in groups of CHUNK, with IN_FLIGHT groups running at once.
//   The server checks 5 books in parallel inside each group, so up to 15 lookups run together.

const CHUNK = 12;
const IN_FLIGHT = 3;
const FRESH_MS = 15 * 60_000;
const KEEP_MS = 7 * 24 * 3600_000;
/** Results older than this are flagged "may be out of date". */
export const STALE_MS = 6 * 3600_000;

/**
 * at = when this result was confirmed with the library.
 * failedAt = a later re-check failed, so this result could not be verified again.
 */
export type Entry = { result: Availability; at: number; failedAt?: number };

type Saved = Record<string, Entry>;

function storageKey(lib: LibrarySystem) {
  return `results:v2:${lib.id}:${lib.biblioCode ?? ""}`;
}

export function loadSaved(lib: LibrarySystem): Saved {
  const saved = load<Saved>(storageKey(lib), {});
  const now = Date.now();
  for (const k of Object.keys(saved)) if (now - saved[k].at > KEEP_MS) delete saved[k];
  return saved;
}

export function useAvailability(books: Book[], lib: LibrarySystem) {
  const [entries, setEntries] = useState<Map<string, Entry>>(new Map());
  const [pending, setPending] = useState<Set<string>>(new Set());
  const runId = useRef(0);
  const live = lib.mode === "live" && !!lib.biblioCode;

  const persist = useCallback(
    (map: Map<string, Entry>) => {
      // Merge into what's saved, so checking one book (e.g. on its own page) never drops the rest of the shelf.
      const out: Saved = loadSaved(lib);
      for (const [k, v] of map) if (v.result.status !== "error") out[k] = v;
      save(storageKey(lib), out);
    },
    [lib],
  );

  const run = useCallback(
    async (toCheck: Book[]) => {
      if (!live || toCheck.length === 0) return;
      const id = runId.current;
      const keys = toCheck.map(bookKey);
      setPending((p) => new Set([...p, ...keys]));

      const chunks: Book[][] = [];
      for (let i = 0; i < toCheck.length; i += CHUNK) chunks.push(toCheck.slice(i, i + CHUNK));
      let next = 0;

      const worker = async () => {
        while (next < chunks.length) {
          const chunk = chunks[next++];
          const chunkKeys = chunk.map(bookKey);
          let results: Array<{ key: string; result: Availability }>;
          try {
            const res = await api.availability({
              library: lib.biblioCode!,
              books: chunk.map((b) => ({ key: bookKey(b), title: b.title, author: b.author, isbn: b.isbn })),
            });
            results = res.results;
          } catch {
            results = chunk.map((b) => ({
              key: bookKey(b),
              result: { status: "error", catalogUrl: "" } as Availability,
            }));
          }
          if (id !== runId.current) return; // the shelf or library changed meanwhile
          const now = Date.now();
          setEntries((prev) => {
            const nextMap = new Map(prev);
            for (const r of results) {
              const old = nextMap.get(r.key);
              // Never replace a good earlier answer with a failed re-check; mark it unverified instead.
              if (r.result.status === "error" && old && old.result.status !== "error") {
                nextMap.set(r.key, { ...old, failedAt: now });
                continue;
              }
              nextMap.set(r.key, { result: r.result, at: now });
            }
            persist(nextMap);
            return nextMap;
          });
          setPending((p) => {
            const n = new Set(p);
            chunkKeys.forEach((k) => n.delete(k));
            return n;
          });
        }
      };
      await Promise.all(Array.from({ length: Math.min(IN_FLIGHT, chunks.length) }, worker));
    },
    [lib, live, persist],
  );

  // New shelf or library: show what's saved, then check the rest.
  useEffect(() => {
    runId.current++;
    setPending(new Set());
    if (!live) {
      setEntries(new Map());
      return;
    }
    const saved = loadSaved(lib);
    const map = new Map<string, Entry>();
    const now = Date.now();
    const stale: Book[] = [];
    const fresh: Book[] = [];
    for (const b of books) {
      const k = bookKey(b);
      const e = saved[k];
      if (e) map.set(k, e);
      (e && now - e.at < FRESH_MS ? fresh : stale).push(b);
    }
    setEntries(map);
    if (navigator.onLine) void run(stale);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [books, lib.id, lib.biblioCode, live]);

  const retry = useCallback((only?: Book[]) => {
    const list = only ?? books.filter((b) => entries.get(bookKey(b))?.result.status === "error");
    void run(list);
  }, [books, entries, run]);

  const refreshAll = useCallback(() => {
    runId.current++;
    setPending(new Set());
    void run(books);
  }, [books, run]);

  return { entries, pending, retry, refreshAll, live };
}
