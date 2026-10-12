import { useMutation, useQueries } from "@tanstack/react-query";
import type { Book, Recommendation } from "../../shared/types";
import { api } from "../lib/api";
import { catalogLink, catalogLinkLabel, type LibrarySystem } from "../lib/libraries";
import { MoreWays } from "./MoreWays";
import { Button, OutLink, cx } from "./ui";

// Shown only when an AI provider is configured on the server (see server/ai.ts).
export function Recommendations({ books, library }: { books: Book[]; library: LibrarySystem }) {
  const recs = useMutation({
    mutationFn: () => api.recommend(books.map((b) => ({ title: b.title, author: b.author }))),
  });
  const list: Recommendation[] = recs.data?.recommendations ?? [];
  const live = library.mode === "live" && !!library.biblioCode;
  const checks = useQueries({
    queries: list.map((r) => ({
      queryKey: ["rec-avail", library.biblioCode, r.title, r.author],
      queryFn: async () => {
        const res = await api.availability({
          library: library.biblioCode!,
          books: [{ key: "r", title: r.title, author: r.author, isbn: "" }],
        });
        return res.results[0]?.result;
      },
      enabled: live,
      staleTime: 15 * 60_000,
    })),
  });

  return (
    <section className="mt-14 border-t border-border/60 pt-10" aria-labelledby="recs-heading">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Based on your shelf</p>
          <h2 id="recs-heading" className="mt-2 font-display text-2xl">
            Books you might want to add
          </h2>
        </div>
        <Button variant="accent" onClick={() => recs.mutate()} disabled={recs.isPending}>
          {recs.isPending ? "Reading your shelf…" : list.length ? "Get new ideas" : "Get recommendations"}
        </Button>
      </div>
      {recs.isError && (
        <p role="alert" className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {(recs.error as Error).message}
        </p>
      )}
      {!recs.data && !recs.isPending && !recs.isError && (
        <p className="mt-3 italic text-muted-foreground">
          We'll look for patterns across your {books.length} want-to-read books and suggest about ten more.
        </p>
      )}
      {list.length > 0 && (
        <ul className="mt-6 grid gap-3">
          {list.map((r, i) => {
            const a = checks[i]?.data;
            return (
              <li key={`${r.title}-${i}`} className="rounded-lg border border-border/70 bg-card p-4 sm:p-5">
                <h3 className="font-display text-lg font-medium leading-snug [overflow-wrap:anywhere]">{r.title}</h3>
                <p className="mt-0.5 text-sm text-muted-foreground">by {r.author}</p>
                <p className="mt-2 text-sm italic leading-relaxed text-foreground/85">“{r.reason}”</p>
                <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                  {live && checks[i]?.isLoading && <span className="text-muted-foreground">Checking {library.short}…</span>}
                  {live && a && (
                    <span className={cx("font-medium", a.status === "available" ? "text-success" : "text-muted-foreground")}>
                      {a.status === "available"
                        ? `Available at ${library.short}`
                        : a.status === "not_found"
                          ? `Not at ${library.short}`
                          : a.status === "error"
                            ? "Couldn't check"
                            : `Checked out at ${library.short}`}
                    </span>
                  )}
                  <OutLink
                    href={a?.catalogUrl || catalogLink(library, r.title, r.author)}
                    className="font-medium text-accent-strong underline-offset-2 hover:underline"
                  >
                    {a?.status === "available" ? `Place hold at ${library.short} →` : catalogLinkLabel(library)}
                  </OutLink>
                  <OutLink
                    href={`https://www.goodreads.com/search?q=${encodeURIComponent(`${r.title} ${r.author}`)}`}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    Goodreads ↗
                  </OutLink>
                </div>
                <MoreWays title={r.title} author={r.author} library={library} />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
