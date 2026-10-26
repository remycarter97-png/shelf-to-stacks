/** Hand-drawn style illustrations. Decorative; colors stay pastel in both themes. */

/** Reading nook: arched window, armchair, book stack, tea, plant and a sleeping cat. */
export function ReadingNook({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 520 440" className={className} role="img" aria-label="A cozy reading nook with an armchair, a stack of books, a cup of tea, a plant and a sleeping cat">
      <circle cx="20" cy="150" r="60" fill="#f8e9c9" opacity=".6" />
      <ellipse cx="270" cy="395" rx="235" ry="30" fill="#f8e9c9" />
      <path d="M150 40h160a70 70 0 0 1 70 70v170H80V110a70 70 0 0 1 70-70z" fill="#e7efe4" />
      <path d="M150 40h160a70 70 0 0 1 70 70v170H80V110a70 70 0 0 1 70-70z" fill="none" stroke="#d4a59a" strokeWidth="8" />
      <path d="M230 44v236M84 165h292" stroke="#d4a59a" strokeWidth="6" />
      <g fill="#fffcf8" opacity=".9">
        <path d="M120 120c10 0 16 6 18 12 10-2 18 4 18 12h-62c0-12 12-14 26-24z" />
        <path d="M265 95c8 0 13 5 14 9 8-1 14 3 14 9h-48c0-9 9-11 20-18z" />
      </g>
      <g stroke="#a8c3a0" strokeWidth="2" strokeLinecap="round" opacity=".7">
        <path d="M300 185l-6 14M318 205l-6 14M282 220l-6 14M340 182l-6 14M130 200l-6 14M160 222l-6 14M110 236l-6 14" />
      </g>
      <path d="M60 250c0-30 20-48 60-48h120c40 0 60 18 60 48v40H60z" fill="#f2c4c4" />
      <path d="M40 270c0-14 10-22 24-22s24 8 24 22v80H40zM276 270c0-14 10-22 24-22s24 8 24 22v80h-48z" fill="#e8a9a9" />
      <rect x="84" y="290" width="196" height="50" rx="16" fill="#f6d3d3" />
      <rect x="60" y="336" width="244" height="26" rx="12" fill="#e8a9a9" />
      <path d="M72 362v26M292 362v26" stroke="#a0614f" strokeWidth="8" strokeLinecap="round" />
      <path d="M120 296c14-6 28-6 40 0 12-6 26-6 40 0v8c-14-5-28-5-40 1-12-6-26-6-40-1z" fill="#fffcf8" stroke="#4a3728" strokeWidth="2" strokeLinejoin="round" />
      <rect x="350" y="352" width="128" height="26" rx="5" fill="#a8c3a0" />
      <rect x="362" y="360" width="60" height="4" rx="2" fill="#fffcf8" opacity=".7" />
      <rect x="360" y="326" width="110" height="26" rx="5" fill="#d9cde6" />
      <rect x="372" y="334" width="44" height="4" rx="2" fill="#fffcf8" opacity=".8" />
      <rect x="344" y="300" width="124" height="26" rx="5" fill="#d4a59a" />
      <rect x="356" y="308" width="52" height="4" rx="2" fill="#fffcf8" opacity=".7" />
      <rect x="356" y="276" width="104" height="24" rx="5" fill="#f8e9c9" stroke="#e2cfa7" strokeWidth="2" />
      <path d="M384 248h36v14a14 14 0 0 1-14 14h-8a14 14 0 0 1-14-14z" fill="#fffcf8" stroke="#4a3728" strokeWidth="2" />
      <path d="M420 254h5a6 6 0 0 1 0 12h-6" fill="none" stroke="#4a3728" strokeWidth="2" />
      <path d="M372 276h60" stroke="#4a3728" strokeWidth="2" strokeLinecap="round" />
      <path d="M396 236c-5-6 5-9 0-16M408 238c-5-6 5-9 0-16" stroke="#d4a59a" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <g transform="translate(424 246)">
        <path d="M0 30c0-16 14-26 32-26s30 10 30 22c0 8-6 10-14 10H6c-4 0-6-2-6-6z" fill="#4a3728" />
        <path d="M42 8l4-10 6 10zM54 12l6-8 2 12z" fill="#4a3728" />
        <path d="M46 20c2 2 5 2 7 0" stroke="#fdf8f3" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <path d="M0 30c-10 0-14 6-8 10" stroke="#4a3728" strokeWidth="6" fill="none" strokeLinecap="round" />
        <text x="58" y="-6" fontFamily="Caveat, cursive" fontSize="18" fill="#a0614f">
          z z
        </text>
      </g>
      <g transform="translate(440 140)">
        <path d="M14 80h36l-5 44H19z" fill="#d4a59a" />
        <path d="M32 80C20 60 8 56 0 40c18 2 28 14 32 40z" fill="#a8c3a0" />
        <path d="M32 80c4-26 14-38 32-40-8 16-20 22-32 40z" fill="#a8c3a0" />
        <path d="M32 80c-6-30-2-48 8-62 6 18 2 40-8 62z" fill="#7f9f77" />
      </g>
    </svg>
  );
}

/** A stack of library books with a library card, plus floating doodles (glasses, flower, leaf, heart). */
export function LibraryStack() {
  return (
    <div className="relative grid aspect-[1.1] place-items-center bg-butter" style={{ borderRadius: "48% 52% 45% 55% / 55% 45% 55% 45%" }}>
      <svg viewBox="0 0 300 260" className="w-[78%]" role="img" aria-label="A stack of library books with a library card tucked on top">
        <rect x="60" y="196" width="190" height="36" rx="7" fill="#a8c3a0" />
        <rect x="76" y="208" width="80" height="6" rx="3" fill="#fffcf8" opacity=".7" />
        <rect x="74" y="160" width="168" height="36" rx="7" fill="#f2c4c4" />
        <rect x="90" y="172" width="60" height="6" rx="3" fill="#fffcf8" opacity=".8" />
        <rect x="54" y="124" width="180" height="36" rx="7" fill="#d9cde6" />
        <rect x="70" y="136" width="72" height="6" rx="3" fill="#fffcf8" opacity=".8" />
        <rect x="84" y="90" width="150" height="34" rx="7" fill="#d4a59a" />
        <rect x="100" y="101" width="50" height="6" rx="3" fill="#fffcf8" opacity=".7" />
        <g transform="rotate(-10 200 90)">
          <rect x="160" y="50" width="96" height="62" rx="8" fill="#fffcf8" stroke="#4a3728" strokeWidth="2.5" />
          <path d="M172 70h50M172 82h70M172 94h40" stroke="#4a3728" strokeWidth="2" strokeLinecap="round" opacity=".4" />
          <circle cx="238" cy="68" r="7" fill="#a8c3a0" />
        </g>
        <path d="M30 236h250" stroke="#4a3728" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <svg className="float-doodle absolute left-[6%] top-[12%]" width="54" height="40" viewBox="0 0 54 40" aria-hidden>
        <circle cx="13" cy="24" r="10" fill="none" stroke="#4a3728" strokeWidth="2.5" />
        <circle cx="41" cy="24" r="10" fill="none" stroke="#4a3728" strokeWidth="2.5" />
        <path d="M23 22c2-3 6-3 8 0M3 22 1 12M51 22l2-10" stroke="#4a3728" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      </svg>
      <svg className="float-doodle absolute right-[8%] top-[8%] [animation-delay:-2s]" width="40" height="40" viewBox="0 0 40 40" aria-hidden>
        <g fill="#f2c4c4">
          <circle cx="20" cy="9" r="7" />
          <circle cx="31" cy="18" r="7" />
          <circle cx="27" cy="31" r="7" />
          <circle cx="13" cy="31" r="7" />
          <circle cx="9" cy="18" r="7" />
        </g>
        <circle cx="20" cy="21" r="5" fill="#f8d98f" />
      </svg>
      <svg className="float-doodle absolute bottom-[10%] right-[10%] [animation-delay:-4s]" width="36" height="36" viewBox="0 0 24 24" aria-hidden>
        <path d="M4 20C4 10 10 4 20 4c0 10-6 16-16 16z" fill="#a8c3a0" />
        <path d="M4 20 14 10" stroke="#fffcf8" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
      <svg className="float-doodle absolute bottom-[14%] left-[12%] [animation-delay:-2s]" width="30" height="26" viewBox="0 0 24 24" aria-hidden>
        <Heart fill="#e48f8f" />
      </svg>
    </div>
  );
}

export function Heart({ fill }: { fill: string }) {
  return <path d="M12 20s-7-4.4-9.2-8.6C1.3 8.5 3 5 6.4 5c2 0 3.5 1.2 4.4 2.6h2.4C14.1 6.2 15.6 5 17.6 5 21 5 22.7 8.5 21.2 11.4 19 15.6 12 20 12 20z" fill={fill} />;
}

/** Small pictures for journal cards, keyed by name. */
export function JournalArt({ kind }: { kind: "stack" | "chair" | "card" | "rain" | "tea" | "basket" }) {
  const common = { width: 120, height: 96, viewBox: "0 0 120 96", "aria-hidden": true } as const;
  switch (kind) {
    case "stack":
      return (
        <svg {...common}>
          <rect x="16" y="54" width="88" height="18" rx="4" fill="#a8c3a0" />
          <rect x="24" y="36" width="76" height="18" rx="4" fill="#d9cde6" />
          <rect x="12" y="18" width="84" height="18" rx="4" fill="#fffcf8" stroke="#d4a59a" strokeWidth="2" />
          <path d="M6 80h108" stroke="#4a3728" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      );
    case "chair":
      return (
        <svg {...common}>
          <path d="M20 60c0-16 10-24 26-24h28c16 0 26 8 26 24v14H20z" fill="#f2c4c4" />
          <rect x="28" y="62" width="64" height="14" rx="6" fill="#f6d3d3" />
          <path d="M28 76v10M92 76v10" stroke="#a0614f" strokeWidth="4" strokeLinecap="round" />
          <circle cx="104" cy="20" r="12" fill="#f8e9c9" />
          <path d="M104 32v50" stroke="#4a3728" strokeWidth="2.5" />
        </svg>
      );
    case "card":
      return (
        <svg {...common}>
          <g transform="rotate(-8 60 48)">
            <rect x="22" y="22" width="76" height="50" rx="8" fill="#fffcf8" stroke="#4a3728" strokeWidth="2.5" />
            <path d="M34 40h36M34 50h48M34 60h28" stroke="#4a3728" strokeWidth="2" strokeLinecap="round" opacity=".4" />
            <circle cx="84" cy="38" r="6" fill="#a8c3a0" />
          </g>
        </svg>
      );
    case "rain":
      return (
        <svg {...common}>
          <path d="M32 50a28 28 0 0 1 56 0z" fill="#a8c3a0" stroke="#4a3728" strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M60 50v26a6 6 0 0 1-12 0" fill="none" stroke="#4a3728" strokeWidth="2.5" strokeLinecap="round" />
          <g stroke="#7f9fbf" strokeWidth="2.5" strokeLinecap="round">
            <path d="M22 22l-3 7M96 18l-3 7M86 64l-3 7M30 70l-3 7M74 10l-3 7" />
          </g>
        </svg>
      );
    case "tea":
      return (
        <svg {...common}>
          <path d="M38 40h40v18a16 16 0 0 1-16 16h-8a16 16 0 0 1-16-16z" fill="#fffcf8" stroke="#4a3728" strokeWidth="2.5" />
          <path d="M78 46h5a8 8 0 0 1 0 16h-6" fill="none" stroke="#4a3728" strokeWidth="2.5" />
          <path d="M28 80h64" stroke="#4a3728" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M50 32c-6-6 6-9 0-17M62 32c-6-6 6-9 0-17" stroke="#d4a59a" strokeWidth="3" fill="none" strokeLinecap="round" />
        </svg>
      );
    case "basket":
      return (
        <svg {...common}>
          <path d="M24 44h72l-8 34H32z" fill="#d4a59a" stroke="#4a3728" strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M40 44c0-16 40-16 40 0" fill="none" stroke="#4a3728" strokeWidth="2.5" />
          <rect x="40" y="26" width="10" height="22" rx="2" fill="#f2c4c4" />
          <rect x="52" y="22" width="10" height="26" rx="2" fill="#d9cde6" />
          <rect x="64" y="28" width="10" height="20" rx="2" fill="#a8c3a0" />
          <path d="M34 58h52M36 68h48" stroke="#4a3728" strokeWidth="1.6" opacity=".35" />
        </svg>
      );
  }
}
