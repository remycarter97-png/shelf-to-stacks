/** An open book with a small cat peeking over the top, and the shop name. */
export function Logo() {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <svg viewBox="0 0 46 40" className="h-9 w-10 shrink-0" aria-hidden>
        <path d="M15 13l2.5-6 3 5" fill="var(--foreground)" />
        <path d="M26 12l2.6-5 2.4 6" fill="var(--foreground)" />
        <path d="M14 16c0-5 4-8 9-8s9 3 9 8z" fill="var(--foreground)" />
        <circle cx="19.5" cy="13.5" r="1" fill="var(--background)" />
        <circle cx="26.5" cy="13.5" r="1" fill="var(--background)" />
        <path
          d="M3 17c6-2 13-1.5 20 2 7-3.5 14-4 20-2v18c-6-2-13-1.5-20 2-7-3.5-14-4-20-2z"
          fill="var(--blush)"
          stroke="var(--foreground)"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path d="M23 19v18" stroke="var(--foreground)" strokeWidth="2" />
        <path
          d="M8 22.5c3-.8 6-.6 10 .6M8 27c3-.8 6-.6 10 .6M28 23c4-1.2 7-1.4 10-.6M28 27.6c4-1.2 7-1.4 10-.6"
          stroke="#4a3728"
          strokeWidth="1.4"
          strokeLinecap="round"
          opacity=".45"
        />
      </svg>
      <span className="whitespace-nowrap font-display text-[1.35rem] font-medium">Shelf to Stacks</span>
    </span>
  );
}
