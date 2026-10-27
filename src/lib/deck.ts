// The swipe deck on the book page: which books come next (in the shelf's current sort and
// filter) and what each swipe did, so it can be rewound. Kept for this visit only.

const DECK = "shelf-to-stacks:deck";
const HISTORY = "shelf-to-stacks:deck-history";

export type Deck = { ids: string[]; label: string };
export type Swipe = { id: string; dir: "left" | "right"; added: boolean };

function read<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* the deck still works for this page view */
  }
}

/** Called by the shelf whenever its visible order changes. */
export function saveDeck(deck: Deck) {
  write(DECK, deck);
}

/** The saved order, or the whole shelf in list order when the shelf hasn't saved one. */
export function loadDeck(allIds: string[]): Deck {
  const d = read<Deck | null>(DECK, null);
  const known = new Set(allIds);
  const ids = d?.ids.filter((id) => known.has(id)) ?? [];
  return ids.length ? { ids, label: d!.label } : { ids: allIds, label: "Your shelf" };
}

export function pushSwipe(s: Swipe) {
  write(HISTORY, [...read<Swipe[]>(HISTORY, []), s].slice(-200));
}

export function popSwipe(): Swipe | null {
  const h = read<Swipe[]>(HISTORY, []);
  const last = h.pop() ?? null;
  write(HISTORY, h);
  return last;
}

export function canRewind() {
  return read<Swipe[]>(HISTORY, []).length > 0;
}
