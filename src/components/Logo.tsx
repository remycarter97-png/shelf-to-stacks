/** A small stack of books and the shop name, as painted on the sign. */
export function Logo() {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="h-9 w-9 shrink-0" aria-hidden>
        <rect x="5" y="22" width="22" height="6" rx="1.5" style={{ fill: "var(--awning-b)" }} />
        <rect x="7" y="15.5" width="19" height="6" rx="1.5" style={{ fill: "var(--accent)" }} />
        <rect x="4" y="9" width="21" height="6" rx="1.5" style={{ fill: "var(--awning-a)" }} />
        <rect x="7" y="11.2" width="12" height="1.4" rx=".7" style={{ fill: "var(--fascia)", opacity: 0.55 }} />
        <path d="M21.5 9V3.5l2 1.5 2-1.5V9" style={{ fill: "var(--awning-b)" }} />
      </svg>
      <span className="whitespace-nowrap font-display text-xl">Shelf to Stacks</span>
    </div>
  );
}
