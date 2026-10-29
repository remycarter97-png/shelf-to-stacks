import type {
  AppConfig,
  AvailabilityRequest,
  AvailabilityResponse,
  LibbyResponse,
  Recommendation,
  ShelfResponse,
} from "../../shared/types";
import type { GenreId } from "../../shared/genres";

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new Error(navigator.onLine ? "Couldn't reach Shelf to Stacks. Try again." : "You're offline.");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error || `Request failed (${res.status}).`), { status: res.status, code: body.code as string | undefined });
  return body as T;
}

const post = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const api = {
  shelf: (userId: string, refresh = false) =>
    call<ShelfResponse & { userId: string }>("/api/shelf", post({ userId, refresh })),
  availability: (req: AvailabilityRequest) => call<AvailabilityResponse>("/api/availability", post(req)),
  libby: (key: string, title: string, author: string) =>
    call<LibbyResponse>(
      `/api/libby?${new URLSearchParams({ key, title, author }).toString()}`,
    ),
  recommend: (books: Array<{ title: string; author: string }>) =>
    call<{ recommendations: Recommendation[] }>("/api/recommend", post({ books })),
  genres: (books: Array<{ key: string; title: string; author: string; isbn: string }>) =>
    call<{ results: Array<{ key: string; genres: GenreId[] | null }> }>("/api/genres", post({ books })),
  contact: (msg: { name: string; email: string; topic: string; message: string; website: string }) =>
    call<{ ok: boolean; saved?: boolean; emailed?: boolean }>("/api/contact", post(msg)),
  config: () => call<AppConfig>("/api/config"),
  bookInfo: (title: string, author: string, isbn: string) =>
    call<{
      found: boolean;
      description?: string;
      firstPublished?: number;
      pages?: number;
      subjects: string[];
      coverUrl?: string;
      openLibraryUrl?: string;
      ratingsAverage?: number;
      ratingsCount?: number;
    }>(`/api/bookinfo?${new URLSearchParams({ title, author, isbn }).toString()}`),
  bookSearch: (q: string) =>
    call<{ results: Array<{ title: string; author: string; year?: number; isbn: string; coverUrl: string }> }>(
      `/api/booksearch?${new URLSearchParams({ q }).toString()}`,
    ),
  similar: (seed: { title: string; author: string }, shelf: Array<{ title: string; author: string }>, mode: "ai" | "openlibrary") =>
    call<{
      onList: Array<{ index: number; reason: string }>;
      newBooks: Array<{ title: string; author: string; reason: string }>;
      source: "ai" | "openlibrary";
    }>(
      "/api/similar",
      post({ seed, shelf, mode }),
    ),
};
