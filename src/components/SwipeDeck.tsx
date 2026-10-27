import { useEffect, useRef, useState, type ReactNode } from "react";
import { load, save } from "../lib/storage";
import { navigate, takeShelfScroll } from "../lib/router";
import { cx } from "./ui";

export type SwipeDir = "left" | "right";

/**
 * A Tinder-style card for the book page. Drag (or use the buttons / arrow keys):
 * right = add to the book club shortlist, left = not now. Either way the next book in the
 * shelf's current order comes up. Rewind undoes the last swipe.
 */
export function SwipeDeck({
  children,
  nextPreview,
  position,
  total,
  label,
  picked,
  canRewind,
  onSwipe,
  onRewind,
}: {
  children: ReactNode;
  nextPreview: ReactNode;
  position: number;
  total: number;
  label: string;
  picked: boolean;
  canRewind: boolean;
  onSwipe: (dir: SwipeDir) => void;
  onRewind: () => void;
}) {
  const card = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; t: number; id: number; axis: "h" | "v" | null } | null>(null);
  const dragged = useRef(false);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState<SwipeDir | null>(null);
  const [hint, setHint] = useState(() => !load("swipe-hint-seen", false));
  const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  const fly = (dir: SwipeDir) => {
    if (leaving) return;
    if (hint) {
      save("swipe-hint-seen", true);
      setHint(false);
    }
    setLeaving(dir);
    setTimeout(() => onSwipe(dir), reduce ? 0 : 240);
  };
  const flyRef = useRef(fly);
  flyRef.current = fly;

  // Arrow keys: ← not now, → shortlist (ignored while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.altKey || e.ctrlKey || e.metaKey || t.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "ArrowRight") flyRef.current("right");
      if (e.key === "ArrowLeft") flyRef.current("left");
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
  const progress = Math.min(1, Math.abs(dx) / 120);
  const likeOpacity = leaving === "right" ? 1 : Math.max(0, Math.min(1, dx / 90));
  const nopeOpacity = leaving === "left" ? 1 : Math.max(0, Math.min(1, -dx / 90));
  const transform = leaving
    ? `translateX(${(leaving === "right" ? 1 : -1) * Math.round(width * 1.6)}px) rotate(${leaving === "right" ? 22 : -22}deg)`
    : `translateX(${dx}px) rotate(${dx / 18}deg)`;

  return (
    <div className="pt-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="font-bold text-muted-foreground">
          Book {position} of {total}
          <span className="font-semibold"> · {label}</span>
        </p>
        {hint && (
          <p className="rounded-full bg-butter px-3 py-1 text-xs font-bold text-[#4a3728]">
            Swipe right ♡ to shortlist · left to skip
          </p>
        )}
      </div>

      <div className="relative">
        {/* The next book, waiting underneath */}
        <div
          aria-hidden
          className="absolute inset-0 overflow-hidden rounded-[1.6rem] border border-border/70 bg-card p-5 sm:p-6"
          style={{
            transform: `translateY(${10 - 10 * progress}px) scale(${0.95 + 0.05 * progress})`,
            transition: dragging ? "none" : "transform 0.3s ease",
            opacity: 0.85,
          }}
        >
          {nextPreview}
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
            if (Math.abs(mx) > Math.min(140, width * 0.3) || (speed > 0.5 && Math.abs(mx) > 50)) fly(mx > 0 ? "right" : "left");
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
            transition: dragging ? "none" : leaving ? "transform 0.24s ease-in" : "transform 0.35s cubic-bezier(.2,.9,.25,1.2)",
            boxShadow: "var(--shadow-lift)",
          }}
        >
          <Stamp side="left" opacity={likeOpacity} className="border-[#d9777f] text-[#c25b66]">
            {picked ? "Still keen ♡" : "Shortlist ♡"}
          </Stamp>
          <Stamp side="right" opacity={nopeOpacity} className="border-[#8fa98a] text-[#5f7d59]">
            Not now
          </Stamp>
          {children}
        </div>
      </div>

      <div className="mt-6 flex items-end justify-center gap-5">
        <RoundButton label="Rewind" size="sm" disabled={!canRewind || !!leaving} onClick={onRewind}>
          <path d="M9 7H5V3" />
          <path d="M5.5 7A8 8 0 1 1 4 12" />
        </RoundButton>
        <RoundButton label="Not now" disabled={!!leaving} onClick={() => fly("left")} tone="sage">
          <path d="M7 7l10 10M17 7 7 17" strokeWidth="2.6" />
        </RoundButton>
        <RoundButton label={picked ? "Keep" : "Shortlist"} disabled={!!leaving} onClick={() => fly("right")} tone="blush">
          <path
            d="M12 20s-7-4.4-9.2-8.6C1.3 8.5 3 5 6.4 5c2 0 3.5 1.2 4.4 2.6h2.4C14.1 6.2 15.6 5 17.6 5 21 5 22.7 8.5 21.2 11.4 19 15.6 12 20 12 20z"
            fill="#e48f8f"
            stroke="none"
          />
        </RoundButton>
      </div>
      <p className="mt-2 hidden text-center text-xs text-muted-foreground sm:block">Tip: use the ← and → keys</p>
    </div>
  );
}

function Stamp({ side, opacity, className, children }: { side: "left" | "right"; opacity: number; className: string; children: ReactNode }) {
  return (
    <span
      aria-hidden
      className={cx(
        "pointer-events-none absolute top-5 z-10 rounded-xl border-[3px] bg-card/90 px-3 py-1 font-display text-xl font-semibold uppercase tracking-wide",
        side === "left" ? "left-5 -rotate-12" : "right-5 rotate-12",
        className,
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
  disabled,
  onClick,
  children,
}: {
  label: string;
  size?: "sm" | "lg";
  tone?: "sage" | "blush";
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
        className={cx(
          "grid place-items-center rounded-full border-[1.5px] bg-card transition hover:-translate-y-0.5 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0",
          size === "sm" ? "h-12 w-12 border-border text-muted-foreground" : "h-16 w-16",
          tone === "sage" && "border-sage text-[#5f7d59]",
          tone === "blush" && "border-primary",
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

/** Shown after the last card in the stack. */
export function EndOfDeck({ shortlisted, canRewind, onRewind, onRestart }: { shortlisted: number; canRewind: boolean; onRewind: () => void; onRestart: () => void }) {
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
          : "Nothing shortlisted yet. Swipe right on a book to add it to your book club shortlist."}
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
        <button type="button" onClick={onRestart} className="min-h-11 rounded-full border-[1.5px] border-border bg-card px-5 text-sm font-bold hover:bg-muted">
          Start the stack again
        </button>
        {canRewind && (
          <button type="button" onClick={onRewind} className="min-h-11 rounded-full px-4 text-sm font-bold text-link underline underline-offset-2">
            ↶ Rewind last swipe
          </button>
        )}
      </div>
    </div>
  );
}
