// Genres ("moods") worked out from a book's Open Library subjects. Pure, so it can be tested.

export type GenreId =
  | "cozy"
  | "romance"
  | "mystery"
  | "fantasy"
  | "scifi"
  | "historical"
  | "spooky"
  | "literary"
  | "nonfiction"
  | "poetry"
  | "kids"
  | "ya";

export type Tint = "blush" | "sage" | "butter" | "lavender" | "clay";

export const GENRES: Array<{ id: GenreId; label: string; short: string; tint: Tint }> = [
  { id: "cozy", label: "Cozy Reads", short: "Cozy", tint: "butter" },
  { id: "romance", label: "Romance & Soft Hearts", short: "Romance", tint: "blush" },
  { id: "mystery", label: "Mystery & Rainy Days", short: "Mystery", tint: "sage" },
  { id: "fantasy", label: "Fantasy & Magic", short: "Fantasy", tint: "lavender" },
  { id: "scifi", label: "Sci-Fi & Faraway Worlds", short: "Sci-fi", tint: "sage" },
  { id: "historical", label: "Historical Escapes", short: "Historical", tint: "clay" },
  { id: "spooky", label: "Spooky & Gothic", short: "Spooky", tint: "lavender" },
  { id: "literary", label: "Literary & Book Club", short: "Literary", tint: "blush" },
  { id: "nonfiction", label: "Real Lives & Big Ideas", short: "Nonfiction", tint: "butter" },
  { id: "poetry", label: "Poetry & Quiet Moments", short: "Poetry", tint: "clay" },
  { id: "kids", label: "Children's Corner", short: "Kids", tint: "lavender" },
  { id: "ya", label: "Young Adult", short: "YA", tint: "sage" },
];

export const GENRE_BY_ID = Object.fromEntries(GENRES.map((g) => [g.id, g])) as Record<GenreId, (typeof GENRES)[number]>;

const RULES: Array<[GenreId, RegExp]> = [
  ["cozy", /\b(cozy|cosy|found family|slice of life|feel good|small town life|bakeries|bakery|bookstores|coffee shops?|tea shops?|cafes?|friendship|humorous|humor|comedy|gentle)\b/],
  ["romance", /\b(romance|romances|love stories|love story|romantic|man woman relationships|dating|courtship|weddings?)\b/],
  ["mystery", /\b(mystery|mysteries|detective|detectives|crime|thrillers?|suspense|murder|private investigators|police|whodunit|missing persons|serial murderers)\b/],
  ["fantasy", /\b(fantasy|magic|magicians|dragons|wizards|witches|witchcraft|fairy tales|fairies|mythology|elves|sorcery|quests?|imaginary places|curses)\b/],
  ["scifi", /\b(science fiction|dystopias?|dystopian|space|time travel|robots|artificial intelligence|extraterrestrial|aliens|interplanetary|post apocalyptic|cyberpunk|space ships|androids|genetic engineering)\b/],
  ["historical", /\b(historical fiction|fiction historical|historical|world war|regency|victorian|middle ages|19th century|18th century|ancient|tudors?)\b/],
  ["spooky", /\b(horror|ghosts?|ghost stories|gothic|haunted|supernatural|vampires|paranormal|occult|monsters)\b/],
  ["literary", /\b(literary|domestic fiction|psychological fiction|family life|families|coming of age|bildungsroman|grief|loss|book club|marriage|mothers and daughters|sisters|brothers)\b/],
  ["poetry", /\b(poetry|poems|verse|sonnets|haiku)\b/],
  ["kids", /\b(juvenile|children s|childrens|picture books|chapter books|early readers|bedtime)\b/],
  ["ya", /\b(young adult|teen|teenagers?|adolescence|high schools?|ya)\b/],
];

const NONFICTION = /\b(biography|biographies|autobiography|memoirs?|essays|self help|psychology|history|science|politics|political|economics|social|sociology|philosophy|true crime|journalism|travel|business|health|cooking|nature|personal narratives|religion|spirituality|education|management)\b/;
const FICTION = /\b(fiction|novels?|stories|tales|romance|fantasy|mystery|mysteries|thrillers?|science fiction|fairy tales)\b/;

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Up to three genres for a book, strongest first. */
export function genresFromSubjects(raw: string[]): GenreId[] {
  const subjects = raw.map(norm).filter(Boolean);
  if (subjects.length === 0) return [];
  const isFiction = subjects.some((s) => FICTION.test(s));
  const score = new Map<GenreId, number>();
  for (const s of subjects) {
    for (const [id, re] of RULES) if (re.test(s)) score.set(id, (score.get(id) ?? 0) + 1);
    if (!isFiction && NONFICTION.test(s)) score.set("nonfiction", (score.get("nonfiction") ?? 0) + 1);
  }
  // "History" in fiction means historical fiction; in nonfiction it's the nonfiction shelf.
  if (!isFiction) {
    score.delete("historical");
    score.delete("literary");
    score.delete("cozy");
  }
  // Young adult books are usually also tagged "juvenile"; they belong on the YA shelf.
  if (score.has("ya")) score.delete("kids");
  // Science fiction subjects mention "science"; never call those nonfiction.
  if (score.has("scifi")) score.delete("nonfiction");
  const ranked = [...score.entries()].sort((a, b) => b[1] - a[1] || order(a[0]) - order(b[0])).map(([id]) => id);
  // "Literary" is a catch-all, so only keep it when little else fits.
  const out = ranked.filter((id) => id !== "literary" || ranked.length <= 2);
  return out.slice(0, 3);
}

const order = (id: GenreId) => GENRES.findIndex((g) => g.id === id);
