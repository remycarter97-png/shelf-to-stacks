# Shelf to Stacks

Your Goodreads or StoryGraph want-to-read list, checked against your public library's catalog. Works on desktop and phones, and installs to the home screen on iPhone and Android like an app.

## What's in it

- **Shelf check**: paste a Goodreads user ID or profile link; the whole Want to Read shelf loads (up to 1,000 books).
- **StoryGraph**: upload your StoryGraph library export (CSV) and the app uses the books marked to-read. A Goodreads library export works too. The file is read on the device and never uploaded. Covers come from Open Library by ISBN.
- **Live availability** for Boston Public Library. Books are checked about 15 at a time instead of one by one.
- **Request a different library**: readers elsewhere can ask for their library from the library picker. Requests are saved to Supabase (`library_requests`); see them in **Table Editor → library_requests**, or the `library_request_counts` view for a tally by library.
- **Never a dead end**: if a lookup fails, the book still gets a "Check availability at BPL →" link plus a Retry.
- **Book pages**: tap any title for its own page: cover, description, first published year, page count and subjects (from Open Library), full availability with every edition, Libby and where to buy, recommendations, and series info (which number it is, plus the other books from that series on your list, in order). Back returns to the same spot on your shelf.
- **More ways to read & buy**: live Libby ebook/audiobook status and Bookshop.org / Amazon / ThriftBooks / AbeBooks links.
- **Book club page** (`/club`): add each member's public Goodreads profile, StoryGraph export or Goodreads export. The app lists the books on the most members' lists (matching editions by title, author and ISBN), shows library availability, and starts a ranked vote with the picks you choose. Clubs are saved on the device; turn on **Sync across devices** to save them online under a private 16-character sync code and enter that code on other devices.
- **Shared club page** (`/c/…`): one link for the whole club. Members suggest books for upcoming sessions (search by title or type it in), see the next meeting and add it to their calendar, vote, and rate past reads. The organizer gets a separate private link to schedule meetings, start votes from the suggestions, set the current read and manage the list. Create one from the Book club page.
- **Book club vote**: shortlist books, create a voting link, share it. Members rank their top 3; the winner is decided by instant-runoff (ranked-choice) counting, with the round-by-round count shown. One ballot per device (voting again updates it).
- **AI recommendations**: built in but hidden until you plug in an AI provider (see below).
- **Installable app**: home-screen icon, full-screen launch, works offline with your last results, and an install prompt (Android) or how-to (iPhone).
- **Remembers you**: Goodreads ID, library, results and shortlist are saved on the device only. No accounts.

## Set it up (about 15 minutes)

### 1. Book club database (Supabase, free)

1. Create a new project at [supabase.com](https://supabase.com).
2. Open **SQL Editor → New query**, paste everything in `supabase/setup_all.sql` and click **Run** (it does all of the steps below in one go). Or, one file at a time: paste everything in `supabase/migrations/001_book_club.sql`, and click **Run**. Then do the same with `supabase/migrations/002_ranked_choice.sql` (ranked-choice voting) `supabase/migrations/003_club_sync.sql` (syncing book clubs across devices) and `supabase/migrations/004_club_hub.sql` (shared club pages) and `supabase/migrations/005_library_requests.sql` (library requests).
3. Open **Project Settings → API** and copy the **Project URL** and the **anon public** key.

### 2. Deploy (Vercel, free)

1. At [vercel.com](https://vercel.com), click **Add New → Project** and import this GitHub repository. Vercel detects the settings automatically.
2. Before clicking **Deploy**, open **Environment Variables** and add:

| Name | Value | Needed? |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Supabase Project URL | Yes, for book club |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon public key | Yes, for book club |
| `BRIGHTDATA_API_KEY` | Your Bright Data API key | Optional backup for BPL lookups |
| `BRIGHTDATA_ZONE` | Your Web Unlocker zone name (zone's **Overview** tab) | Needed with the Bright Data key |
| `SCRAPERAPI_KEY` | A working ScraperAPI key | Optional second backup |
| `SCRAPINGANT_KEY` | Your ScrapingAnt API key (scrapingant.com → Dashboard) | Optional third backup; the free plan has 10,000 credits a month |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Added for you by the Upstash integration (Vercel → Storage / Marketplace) | Optional; shares the cache and rate limits across servers |

3. Click **Deploy**. You get a link like `shelf-to-stacks.vercel.app`; add your own domain later under **Settings → Domains**.

### 3. Install on your phone

- **iPhone:** open the site in Safari → tap **Share** → **Add to Home Screen**.
- **Android:** open the site in Chrome → tap **Install** on the banner (or ⋮ → **Install app**).

## Turning on AI recommendations

**More like this** works with no setup: without an AI key it uses Open Library (free) to match books by shared subjects and authors. Adding a key makes its picks smarter and turns on **Books you might want to add**. If the AI fails or hits a free-tier limit, More like this falls back to Open Library automatically.

Free AI options (no credit card at the time of writing): Google Gemini via AI Studio (`AI_PROVIDER=openai`, `AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai`, a free Flash model) or Groq (`AI_PROVIDER=openai`, `AI_BASE_URL=https://api.groq.com/openai/v1`, a free chat model).

The section stays hidden until three variables are set in Vercel (then redeploy):

| Name | Example |
| --- | --- |
| `AI_PROVIDER` | `anthropic` or `openai` (any OpenAI-compatible service, e.g. Gemini or OpenRouter) |
| `AI_API_KEY` | your provider's key |
| `AI_MODEL` | the model name your provider gives you |
| `AI_BASE_URL` | only for non-OpenAI services using `openai`, e.g. `https://generativelanguage.googleapis.com/v1beta/openai` |

Requests are limited to 5 per visitor per 10 minutes and 200 per hour site-wide. To add a different kind of provider, add one function in `server/ai.ts`.

## About catalog access

Boston Public Library's catalog sometimes blocks automated requests. The app tries the catalog directly, then Bright Data, then ScraperAPI, then ScrapingAnt (whichever are set up), and pauses either path for a few minutes when it is refused, so one bad stretch doesn't slow every book. The lasting fix is permission: ask BPL or BiblioCommons for sanctioned access. Other libraries (including the Minuteman network, whose catalog blocks automated lookups) are left out until they can be checked reliably. Libby status uses the same public search the Libby app uses; it isn't an official API, so it falls back to a Libby link if it changes.

## For developers

```bash
npm install
cp .env.example .env.local   # fill in what you have
npm run dev                  # app + API at http://localhost:5173
npm test                     # server tests (outside services simulated)
npm run build                # type-check + production build
```

- `src/` — React app (Vite, Tailwind). `src/lib/useAvailability.ts` runs the parallel checks and saved results.
- `api/` — one Vercel Function per file: `shelf`, `availability`, `libby`, `recommend`, `similar`, `bookinfo`, `booksearch`, `config`.
- `server/` — shared server logic: Goodreads RSS, BiblioCommons lookups with circuit breakers, Libby, AI providers, cache.
- `supabase/migrations/` — book club tables and the two voting functions.
- `npm run icons` regenerates the home-screen icons from `scripts/make-icons.mjs`.
