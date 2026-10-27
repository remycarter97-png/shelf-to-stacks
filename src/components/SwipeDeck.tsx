import { useEffect, useRef, useState, type ReactNode } from "react";
import { load, save } from "../lib/storage";
import { navigate, takeShelfScroll } from "../lib/router";
import { cx } from "./ui";

/** "next" = the card leaves to the left; "prev" = it leaves to the right. */
export type Flip = "next" | "prev";

/**
 * A swipeable book card for the book page, in the shelf's current order.
 * Swipe left (or →, or Next) for the next book; swipe right (or ←, or Previous) to go back.
 * The heart adds or removes the book from the book club shortlist without moving on.
 */
export function SwipeDeck({
  children,
  nextPreview,
  prevPreview,
  position,
  total,
  label,
  hasPrev,
  picked,
  onFlip,
  onTogglePick,
}: {
  children: ReactNode;
  nextPreview: ReactNode;
  prevPreview: ReactNode;
  position: number;
  total: number;
  label: string;
  hasPrev: boolean;
  picked: boolean;
  onFlip: (to: Flip) => void;
  onTogglePick: () => void;
}) {
  const card = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; t: number; id: number; axis: "h" | "v" | null } | null>(null);
  const dragged = useRef(false);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState<Flip | null>(null);
  const [hint, setHint] = useState(() => !load("swipe-hint-seen", false));
  const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  const flip = (to: Flip) => {
    if (leaving || (to === "prev" && !hasPrev)) return;
    if (hint) {
      save("swipe-hint-seen", true);
      setHint(false);
    }
    setLeaving(to);
    setTimeout(() => onFlip(to), reduce ? 0 : 220);
  };
  const flipRef = useRef(flip);
  flipRef.current = flip;

  // Arrow keys: → next book, ← previous book (ignored while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.altKey || e.ctrlKey || e.metaKey || t.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "ArrowRight") flipRef.current("next");
      if (e.key === "ArrowLeft") flipRef.current("prev");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const reset = () => {
    drag.current = null;
    setDragging(false);
    setDx(0);
  };

  const width = card.current?.offsetWidth ?? 360;
  // Going back from the first book: the card resists instead of following the finger.
  const shown = dx > 0 && !hasPrev ? dx * 0.25 : dx;
  const progress = Math.min(1, Math.abs(shown) / 120);
  const nextOpacity = leaving === "next" ? 1 : Math.max(0, Math.min(1, -shown / 90));
  const prevOpacity = leaving === "prev" ? 1 : Math.max(0, Math.min(1, shown / 90));
  const transform = leaving
    ? `translateX(${(leaving === "next" ? -1 : 1) * Math.round(width * 1.5)}px) rotate(${leaving === "next" ? -14 : 14}deg)`
    : `translateX(${shown}px) rotate(${shown / 30}deg)`;
  // The card underneath is the one you're heading towards.
  const under = shown > 0 || leaving === "prev" ? prevPreview : nextPreview;

  return (
    <div className="pt-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="font-bold text-muted-foreground">
          Book {position} of {total}
          <span className="font-semibold"> · {label}</span>
        </p>
        {hint && (
          <p className="rounded-full bg-butter px-3 py-1 text-xs font-bold text-[#4a3728]">
            Swipe to flip through your books · ♡ to shortlist
          </p>
        )}
      </div>

      <div className="relative">
        <div
          aria-hidden
          className="absolute inset-0 overflow-hidden rounded-[1.6rem] border border-border/70 bg-card p-5 sm:p-6"
          style={{
            transform: `translateY(${10 - 10 * progress}px) scale(${0.95 + 0.05 * progress})`,
            transition: dragging ? "none" : "transform 0.3s ease",
            opacity: 0.85,
          }}
        >
          {under}
        </div>

        <div
          ref={card}
          onPointerDown={(e) => {
            if (leaving || (e.pointerType === "mouse" && e.button !== 0)) return;
            drag.current = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, axis: null };
            dragged.current = false;
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d || d.id !== e.pointerId) return;
            const mx = e.clientX - d.x;
            const my = e.clientY - d.y;
            if (!d.axis) {
              if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
              d.axis = Math.abs(mx) > Math.abs(my) ? "h" : "v";
              if (d.axis === "h") {
                card.current?.setPointerCapture(e.pointerId);
                setDragging(true);
                dragged.current = true;
              }
            }
            if (d.axis === "h") setDx(mx);
          }}
          onPointerUp={(e) => {
            const d = drag.current;
            if (!d || d.axis !== "h") return reset();
            const mx = e.clientX - d.x;
            const speed = Math.abs(mx) / Math.max(1, performance.now() - d.t);
            drag.current = null;
            setDragging(false);
            const far = Math.abs(mx) > Math.min(120, width * 0.28) || (speed > 0.5 && Math.abs(mx) > 50);
            if (far && mx < 0) flip("next");
            else if (far && mx > 0 && hasPrev) flip("prev");
            else setDx(0);
          }}
          onPointerCancel={reset}
          onClickCapture={(e) => {
            // A drag shouldn't also count as a click on a link or button inside the card.
            if (dragged.current) {
              e.preventDefault();
              e.stopPropagation();
              dragged.current = false;
            }
          }}
          onDragStart={(e) => e.preventDefault()}
          className={cx(
            "relative touch-pan-y rounded-[1.6rem] border border-border/70 bg-card p-5 sm:p-6",
            dragging && "cursor-grabbing select-none",
            !dragging && !leaving && hint && !reduce && "swipe-wiggle",
          )}
          style={{
            transform,
            transition: dragging ? "none" : leaving ? "transform 0.22s ease-in" : "transform 0.35s cubic-bezier(.2,.9,.25,1.2)",
            boxShadow: "var(--shadow-lift)",
          }}
        >
          <EdgeLabel side="right" opacity={nextOpacity}>
            Next →
          </EdgeLabel>
          <EdgeLabel side="left" opacity={prevOpacity}>
            ← Back
          </EdgeLabel>
          {children}
        </div>
      </div>

      <div className="mt-6 flex items-end justify-center gap-5">
        <RoundButton label="Previous" size="sm" disabled={!hasPrev || !!leaving} onClick={() => flip("prev")}>
          <path d="M15 5l-7 7 7 7" strokeWidth="2.4" />
        </RoundButton>
        <RoundButton label={picked ? "On shortlist" : "Shortlist"} pressed={picked} onClick={onTogglePick} tone="blush">
          <path
            d="M12 20s-7-4.4-9.2-8.6C1.3 8.5 3 5 6.4 5c2 0 3.5 1.2 4.4 2.6h2.4C14.1 6.2 15.6 5 17.6 5 21 5 22.7 8.5 21.2 11.4 19 15.6 12 20 12 20z"
            fill={picked ? "#e48f8f" : "none"}
            stroke="#e48f8f"
            strokeWidth="2"
          />
        </RoundButton>
        <RoundButton label="Next" size="sm" disabled={!!leaving} onClick={() => flip("next")}>
          <path d="M9 5l7 7-7 7" strokeWidth="2.4" />
        </RoundButton>
      </div>
      <p className="mt-2 hidden text-center text-xs text-muted-foreground sm:block">Tip: use the ← and → keys to flip through books</p>
    </div>
  );
}

function EdgeLabel({ side, opacity, children }: { side: "left" | "right"; opacity: number; children: ReactNode }) {
  return (
    <span
      aria-hidden
      className={cx(
        "pointer-events-none absolute top-5 z-10 rounded-full bg-foreground px-3.5 py-1.5 text-sm font-bold text-background",
        side === "left" ? "left-5" : "right-5",
      )}
      style={{ opacity }}
    >
      {children}
    </span>
  );
}

function RoundButton({
  label,
  size = "lg",
  tone,
  pressed,
  disabled,
  onClick,
  children,
}: {
  label: string;
  size?: "sm" | "lg";
  tone?: "blush";
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <div className="grid justify-items-center gap-1.5">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        aria-pressed={pressed}
        className={cx(
          "grid place-items-center rounded-full border-[1.5px] transition hover:-translate-y-0.5 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0",
          size === "sm" ? "h-12 w-12 border-border bg-card text-muted-foreground" : "h-16 w-16",
          tone === "blush" && (pressed ? "border-primary bg-primary" : "border-primary bg-card"),
        )}
        style={{ boxShadow: "var(--shadow-soft)" }}
      >
        <svg width={size === "sm" ? 20 : 28} height={size === "sm" ? 20 : 28} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          {children}
        </svg>
      </button>
      <span className="text-xs font-bold text-muted-foreground">{label}</span>
    </div>
  );
}

/** Shown after flipping past the last card in the stack. */
export function EndOfDeck({ shortlisted, onBack, onRestart }: { shortlisted: number; onBack: () => void; onRestart: () => void }) {
  return (
    <div className="mt-6 rounded-[1.6rem] bg-card p-8 text-center" style={{ boxShadow: "var(--shadow-soft)" }}>
      <svg viewBox="0 0 150 120" className="mx-auto w-36" aria-hidden>
        <ellipse cx="75" cy="108" rx="60" ry="8" fill="var(--butter)" />
        <path d="M15 40c20-8 40-7 60 3 20-10 40-11 60-3v58c-20-8-40-7-60 3-20-10-40-11-60-3z" fill="#fffcf8" stroke="#4a3728" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M75 43v58" stroke="#4a3728" strokeWidth="2.5" />
        <path d="M28 56c12-3 24-2 36 2M28 68c12-3 24-2 36 2M86 58c12-4 24-5 36-2M86 70c12-4 24-5 36-2" stroke="#d4a59a" strokeWidth="2" strokeLinecap="round" />
        <path d="M75 30s-9-5.5-9-11.5c0-3.6 2.7-5.5 5.4-5.5 1.8 0 3 1 3.6 2.2.6-1.2 1.8-2.2 3.6-2.2 2.7 0 5.4 1.9 5.4 5.5C84 24.5 75 30 75 30z" fill="#f2c4c4" />
      </svg>
      <p className="mt-3 font-script text-2xl text-link">that's the whole stack</p>
      <h1 className="font-display text-3xl">You've seen every book here</h1>
      <p className="mx-auto mt-2 max-w-md text-muted-foreground">
        {shortlisted > 0
          ? `Your book club shortlist has ${shortlisted} ${shortlisted === 1 ? "book" : "books"}. Start a ranked vote from your shelf.`
          : "Nothing shortlisted yet. Tap the heart on any book to add it to your book club shortlist."}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {shortlisted > 0 && (
          <button
            type="button"
            onClick={() => {
              takeShelfScroll(); // go to the shortlist, not back to the old shelf position
              navigate("/");
              setTimeout(() => document.getElementById("club-heading")?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
            }}
            className="btn-ledge inline-flex min-h-11 items-center rounded-full bg-primary px-6 text-sm font-bold text-primary-foreground"
          >
            See my shortlist
          </button>
        )}
        <button type="button" onClick={onBack} className="min-h-11 rounded-full border-[1.5px] border-border bg-card px-5 text-sm font-bold hover:bg-muted">
          ← Back to the last book
        </button>
        <button type="button" onClick={onRestart} className="min-h-11 rounded-full px-4 text-sm font-bold text-link underline underline-offset-2">
          Start the stack again
        </button>
      </div>
    </div>
  );
}
