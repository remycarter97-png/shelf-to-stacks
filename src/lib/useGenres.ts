import { useEffect, useState } from "react";
import type { GenreId } from "../../shared/genres";
import { bookKey, type Book } from "../../shared/types";
import { api } from "./api";
import { load, save } from "./storage";

const STORE = "genres-v1";

/**
 * Genres for each book (keyed by bookKey), looked up once and remembered on this device.
 * `missing` counts books still waiting for an answer.
 */
export function useGenres(books: Book[]) {
  const [map, setMap] = useState<Record<string, GenreId[]>>(() => load(STORE, {}));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const known = load<Record<string, GenreId[]>>(STORE, {});
    const todo = books.filter((b) => !(bookKey(b) in known));
    if (todo.length === 0 || !navigator.onLine) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      for (let i = 0; i < todo.length && !cancelled; i += 40) {
        const chunk = todo.slice(i, i + 40);
        try {
          const res = await api.genres(chunk.map((b) => ({ key: bookKey(b), title: b.title, author: b.author, isbn: b.isbn })));
          if (cancelled) return;
          setMap((prev) => {
            const next = { ...prev };
            for (const r of res.results) if (r.genres) next[r.key] = r.genres;
            save(STORE, next);
            return next;
          });
        } catch {
          break; // try again next visit
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [books]);

  const missing = books.filter((b) => !(bookKey(b) in map)).length;
  return { genres: map, loading: loading && missing > 0, missing };
}
