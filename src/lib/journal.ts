/** Journal posts. Newest first. To add a post, put a new entry at the top of POSTS. */

export type Block = { h: string } | { p: string } | { ul: string[] };
export type Art = "stack" | "chair" | "card" | "rain" | "tea" | "basket";

export type Post = {
  slug: string;
  title: string;
  date: string; // YYYY-MM-DD
  category: string;
  minutes: number;
  excerpt: string;
  art: Art;
  tint: "blush" | "sage" | "butter" | "lavender";
  body: Block[];
};

export const POSTS: Post[] = [
  {
    slug: "what-were-reading-this-month",
    title: "What we're reading this month",
    date: "2026-10-20",
    category: "Reading list",
    minutes: 4,
    excerpt: "Three strange, gentle, lovely books for long autumn evenings, and how to find them at your library.",
    art: "stack",
    tint: "blush",
    body: [
      { p: "October is for blankets and the kind of book you can sink into for a whole rainy Sunday. Here's what's been on our nightstand this month." },
      { h: "Piranesi, by Susanna Clarke" },
      { p: "A man lives alone in an endless house of marble halls and statues, where the tides come in through the lower floors. He keeps careful journals and loves the House completely. It's short, quiet and quietly astonishing, and it's best if you know as little as possible going in." },
      { h: "Legends & Lattes, by Travis Baldree" },
      { p: "An orc mercenary hangs up her sword and opens a coffee shop in a town that has never heard of coffee. The stakes are low on purpose: found family, cinnamon rolls, and a bard who wants to play on the patio. If you need a book that feels like a warm mug, this is it." },
      { h: "Remarkably Bright Creatures, by Shelby Van Pelt" },
      { p: "A widow who works the night shift at an aquarium strikes up a friendship with a very clever, very grumpy octopus. Funny and tender, with a mystery folded inside a story about grief." },
      { h: "Finding them at the library" },
      { p: "Popular titles often have a hold list, but there's usually a faster route: another format (ebook or audiobook in Libby), a large-print copy, or a branch that has one sitting on the shelf. Add these to your Goodreads or StoryGraph want-to-read list and Shelf to Stacks will show you every option at once." },
    ],
  },
  {
    slug: "how-to-build-a-cozy-reading-corner",
    title: "How to build a cozy reading corner",
    date: "2026-10-06",
    category: "Guide",
    minutes: 5,
    excerpt: "A good chair, warm light and one small shelf for library books. Nothing fancy required.",
    art: "chair",
    tint: "sage",
    body: [
      { p: "You don't need a window seat or a spare room. A reading corner is just a spot that tells your brain: this is where we slow down. Here's how to make one with what you already have." },
      { h: "Start with the seat" },
      { p: "Pick the most comfortable chair you own and give it a permanent home. If it's an armchair, great. If it's a floor cushion against the wall, also great. What matters is that you want to sit there." },
      { h: "Get the light right" },
      { ul: [
        "Put a lamp just behind your shoulder, on the side opposite your writing hand, so the page is lit without glare.",
        "Choose a warm bulb (around 2700K). Cool white light feels like an office.",
        "A small clip light is enough for a corner with no outlet nearby.",
      ] },
      { h: "Keep everything within reach" },
      { p: "A side table, a stool or even a sturdy box works. It holds your tea, your bookmark and the book you're reading next. Add a throw blanket and you have the whole kit." },
      { h: "Give library books their own shelf" },
      { p: "Pick one small shelf or basket just for borrowed books. You'll always know what's due back, and fewer library books get lost under the sofa. When the basket empties, it's time to check your list for what's on the shelf at the library." },
      { h: "Add one living thing" },
      { p: "A plant (a pothos is very forgiving), a cat who agrees to share, or a vase of whatever's in season. It makes the corner feel looked after." },
    ],
  },
  {
    slug: "getting-the-most-from-your-library-card",
    title: "Getting the most from your library card",
    date: "2026-09-22",
    category: "Library tips",
    minutes: 6,
    excerpt: "Holds, Libby, purchase suggestions and the interlibrary loan trick most readers never use.",
    art: "card",
    tint: "butter",
    body: [
      { p: "A library card is one of the best deals around, and most of us use a small part of it. A few habits make it much more useful." },
      { h: "Place holds early, and freeze them" },
      { p: "For a popular new release, get on the hold list as soon as you can. If you're not ready to read it yet, many library systems let you pause (or \"freeze\") a hold and keep your place in line." },
      { h: "Read and listen in Libby" },
      { p: "Most public libraries, including Boston Public Library, lend ebooks and audiobooks through the Libby app. Ebook and print hold lists are separate, so one is often much shorter than the other. Shelf to Stacks shows both side by side." },
      { h: "Ask the library to buy it" },
      { p: "If a book isn't in the catalog at all, look for a \"suggest a purchase\" form on your library's website. Libraries use these requests to decide what to order." },
      { h: "Borrow from other libraries" },
      { p: "Interlibrary loan lets your library borrow a book from another library for you. It takes a little longer, but it opens up an enormous catalog. Ask at the desk or look for it on your library's website." },
      { h: "Look beyond books" },
      { ul: [
        "Museum passes and free or discounted admission at many libraries.",
        "Online learning, newspapers and magazines you'd otherwise pay for.",
        "Quiet study rooms, events and author talks.",
      ] },
      { p: "Check your library's website for what's on offer. You might find you've been paying for something you could have borrowed." },
    ],
  },
  {
    slug: "picking-a-book-club-book-everyone-reads",
    title: "Picking a book club book everyone will actually read",
    date: "2026-09-08",
    category: "Book clubs",
    minutes: 4,
    excerpt: "Start from what people already want to read, keep the shortlist short, and let everyone rank it.",
    art: "tea",
    tint: "lavender",
    body: [
      { p: "Every book club knows the feeling: someone picks a book, half the group doesn't finish it, and the meeting turns into a chat about something else. Picking well helps more than you'd think." },
      { h: "Start with what people already want to read" },
      { p: "Most readers already keep a want-to-read list. Books that show up on several members' lists are a much safer bet than a title nobody has heard of. On Shelf to Stacks, the Book club page compares everyone's lists and shows the overlaps first." },
      { h: "Check the library before you vote" },
      { p: "A book with a 40-person hold list won't reach everyone in time. Favor books with copies on the shelf, or with a short ebook or audiobook wait." },
      { h: "Keep the shortlist short" },
      { p: "Three to five options is plenty. More than that and the vote splits." },
      { h: "Rank, don't just vote" },
      { p: "With a ranked vote, everyone orders the shortlist from favorite to least favorite. The winner is the book most people are happy with, not just the one with the loudest fans. Start a vote from your club's page and share the link." },
    ],
  },
];

export function findPost(slug: string) {
  return POSTS.find((p) => p.slug === slug) ?? null;
}

export function formatPostDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

export const TINTS: Record<Post["tint"], string> = {
  blush: "var(--blush-soft)",
  sage: "var(--sage-soft)",
  butter: "var(--butter)",
  lavender: "var(--lavender-soft)",
};
