import { Button, Select } from "./ui";

export const PAGE_SIZES = [10, 25, 50, 100, 200, 300] as const;

/** Page numbers to show: always first and last, the current page and its neighbours, with gaps as "…". */
function pageList(page: number, pages: number): Array<number | "gap"> {
  const want = new Set([1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages));
  const sorted = [...want].sort((a, b) => a - b);
  const out: Array<number | "gap"> = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push("gap");
    out.push(p);
  });
  return out;
}

export function Pagination({
  page,
  pages,
  total,
  pageSize,
  onPage,
  onPageSize,
  label,
}: {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  onPage: (p: number) => void;
  onPageSize: (n: number) => void;
  label: string;
}) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav aria-label={label} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 text-sm">
      <div className="flex items-center gap-3">
        <span className="tabular-nums text-muted-foreground" aria-live="polite">
          {from}–{to} of {total}
        </span>
        <label className="flex items-center gap-2 text-muted-foreground">
          <span>Show</span>
          <Select value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))} className="h-10 w-20">
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </label>
      </div>
      {pages > 1 && (
        <div className="flex items-center gap-1">
          <Button variant="outline" className="min-h-10 px-3" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
            ‹ Prev
          </Button>
          {pageList(page, pages).map((p, i) =>
            p === "gap" ? (
              <span key={`gap-${i}`} className="hidden px-1 text-muted-foreground sm:inline" aria-hidden>
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => onPage(p)}
                aria-current={p === page ? "page" : undefined}
                aria-label={`Page ${p}`}
                className={
                  p === page
                    ? "min-h-10 min-w-10 rounded-md bg-primary px-2 font-medium tabular-nums text-primary-foreground"
                    : "hidden min-h-10 min-w-10 rounded-md px-2 tabular-nums text-muted-foreground hover:bg-muted hover:text-foreground sm:block"
                }
              >
                {p}
              </button>
            ),
          )}
          <span className="px-1 tabular-nums text-muted-foreground sm:hidden">of {pages}</span>
          <Button variant="outline" className="min-h-10 px-3" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
            Next ›
          </Button>
        </div>
      )}
    </nav>
  );
}
