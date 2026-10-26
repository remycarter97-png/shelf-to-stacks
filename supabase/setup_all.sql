-- Shelf to Stacks: complete database setup (001 + 002 + 003 + 004 + 005 in order).
-- For a NEW Supabase project: paste this whole file into SQL Editor → New query → Run, once.

-- ================= 001_book_club.sql =================
-- Shelf to Stacks: book club voting.
-- Paste this whole file into Supabase → SQL Editor → New query → Run (once, on a new project).
--
-- Changes from the prototype:
-- - Polls and their books are created together by create_poll(); nobody can add books to
--   someone else's poll afterward.
-- - Votes go through cast_vote(), which checks the book belongs to the poll and allows one
--   vote per device per poll (voting again changes your vote instead of adding one).
-- - The per-device token is never readable by visitors; only names and choices are.

create extension if not exists pgcrypto;

create table public.club_polls (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Book club vote' check (char_length(title) between 1 and 120),
  created_at timestamptz not null default now()
);

create table public.club_poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.club_polls(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 300),
  author text not null default '' check (char_length(author) <= 200),
  image_url text not null default '' check (char_length(image_url) <= 500),
  position int not null default 0
);
create index on public.club_poll_options (poll_id);

create table public.club_poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.club_polls(id) on delete cascade,
  option_id uuid not null references public.club_poll_options(id) on delete cascade,
  voter_name text not null check (char_length(voter_name) between 1 and 60),
  voter_token text not null check (char_length(voter_token) between 16 and 64),
  created_at timestamptz not null default now(),
  unique (poll_id, voter_token)
);
create unique index club_poll_votes_name on public.club_poll_votes (poll_id, lower(voter_name));

alter table public.club_polls enable row level security;
alter table public.club_poll_options enable row level security;
alter table public.club_poll_votes enable row level security;

-- Anyone with a link can read a poll, its books, and who voted for what.
create policy "read polls" on public.club_polls for select using (true);
create policy "read options" on public.club_poll_options for select using (true);
create policy "read votes" on public.club_poll_votes for select using (true);

-- No direct writes from the browser; only the two functions below can write.
revoke insert, update, delete on public.club_polls, public.club_poll_options, public.club_poll_votes from anon, authenticated;
revoke select on public.club_poll_votes from anon, authenticated;
grant select on public.club_polls, public.club_poll_options to anon, authenticated;
grant select (id, poll_id, option_id, voter_name, created_at) on public.club_poll_votes to anon, authenticated;

create or replace function public.create_poll(p_title text, p_options jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_count int := jsonb_array_length(coalesce(p_options, '[]'::jsonb));
begin
  if v_count < 2 or v_count > 12 then
    raise exception 'A vote needs between 2 and 12 books.';
  end if;
  insert into club_polls (title) values (left(coalesce(nullif(trim(p_title), ''), 'Book club vote'), 120))
  returning id into v_id;
  insert into club_poll_options (poll_id, title, author, image_url, position)
  select v_id,
         left(o.value->>'title', 300),
         left(coalesce(o.value->>'author', ''), 200),
         case when (o.value->>'image_url') ~ '^https://' then left(o.value->>'image_url', 500) else '' end,
         (o.ordinality - 1)::int
  from jsonb_array_elements(p_options) with ordinality as o(value, ordinality)
  where coalesce(trim(o.value->>'title'), '') <> '';
  return v_id;
end;
$$;

create or replace function public.cast_vote(p_poll uuid, p_option uuid, p_name text, p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := left(trim(coalesce(p_name, '')), 60);
begin
  if v_name = '' then
    raise exception 'Name is required.';
  end if;
  if not exists (select 1 from club_poll_options where id = p_option and poll_id = p_poll) then
    raise exception 'That book is not part of this vote.';
  end if;
  if exists (
    select 1 from club_poll_votes
    where poll_id = p_poll and lower(voter_name) = lower(v_name) and voter_token <> p_token
  ) then
    raise exception 'name_taken';
  end if;
  insert into club_poll_votes (poll_id, option_id, voter_name, voter_token)
  values (p_poll, p_option, v_name, p_token)
  on conflict (poll_id, voter_token)
  do update set option_id = excluded.option_id, voter_name = excluded.voter_name, created_at = now();
end;
$$;

revoke all on function public.create_poll(text, jsonb) from public;
revoke all on function public.cast_vote(uuid, uuid, text, text) from public;
grant execute on function public.create_poll(text, jsonb) to anon, authenticated;
grant execute on function public.cast_vote(uuid, uuid, text, text) to anon, authenticated;

-- ================= 002_ranked_choice.sql =================
-- Shelf to Stacks: ranked-choice book club votes (top 3).
-- Run once in Supabase → SQL Editor, after 001_book_club.sql. Safe to run on a project
-- that already has votes: old single-choice votes count as a ballot with one ranked book.

alter table public.club_poll_votes add column if not exists rankings uuid[];

-- Existing votes become one-book ballots.
update public.club_poll_votes set rankings = array[option_id] where rankings is null;

alter table public.club_poll_votes
  add constraint club_poll_votes_rankings_size check (cardinality(rankings) between 1 and 3);

-- Visitors can read the ranked ballots (with voter names), never the per-device token.
grant select (rankings) on public.club_poll_votes to anon, authenticated;

create or replace function public.cast_ranked_vote(p_poll uuid, p_rankings uuid[], p_name text, p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := left(trim(coalesce(p_name, '')), 60);
  v_count int := coalesce(cardinality(p_rankings), 0);
begin
  if v_name = '' then
    raise exception 'Name is required.';
  end if;
  if v_count < 1 or v_count > 3 then
    raise exception 'Rank between 1 and 3 books.';
  end if;
  if (select count(distinct r) from unnest(p_rankings) as r) <> v_count then
    raise exception 'Each book can only be ranked once.';
  end if;
  if (select count(*) from club_poll_options where poll_id = p_poll and id = any(p_rankings)) <> v_count then
    raise exception 'Those books are not part of this vote.';
  end if;
  if exists (
    select 1 from club_poll_votes
    where poll_id = p_poll and lower(voter_name) = lower(v_name) and voter_token <> p_token
  ) then
    raise exception 'name_taken';
  end if;
  insert into club_poll_votes (poll_id, option_id, rankings, voter_name, voter_token)
  values (p_poll, p_rankings[1], p_rankings, v_name, p_token)
  on conflict (poll_id, voter_token)
  do update set option_id = excluded.option_id, rankings = excluded.rankings,
                voter_name = excluded.voter_name, created_at = now();
end;
$$;

revoke all on function public.cast_ranked_vote(uuid, uuid[], text, text) from public;
grant execute on function public.cast_ranked_vote(uuid, uuid[], text, text) to anon, authenticated;

-- ================= 003_club_sync.sql =================
-- Shelf to Stacks: sync saved book clubs across devices with a private sync code.
-- Run once in Supabase → SQL Editor, after 001 and 002.
--
-- How it works: turning on sync stores the clubs under a random code (about 80 bits).
-- Anyone with the code can read and update those clubs, so it works like a password.
-- The table can't be read or listed directly; only the three functions below touch it.

create extension if not exists pgcrypto;

create table if not exists public.club_sync (
  code text primary key,
  data jsonb not null,
  version int not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.club_sync enable row level security;
revoke all on public.club_sync from anon, authenticated;

-- 16 characters from an alphabet without look-alikes (no 0/O, 1/I/L), shown as XXXX-XXXX-XXXX-XXXX.
create or replace function public.sync_new_code()
returns text
language plpgsql
volatile
set search_path = public, extensions
as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea := gen_random_bytes(16);
  out text := '';
begin
  for i in 0..15 loop
    out := out || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
  end loop;
  return out;
end;
$$;

create or replace function public.sync_create(p_data jsonb)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_code text;
begin
  if octet_length(p_data::text) > 3000000 then
    raise exception 'too_large';
  end if;
  loop
    v_code := sync_new_code();
    begin
      insert into club_sync (code, data) values (v_code, p_data);
      return v_code;
    exception when unique_violation then
      -- astronomically unlikely; try another code
    end;
  end loop;
end;
$$;

create or replace function public.sync_get(p_code text)
returns table (data jsonb, version int, updated_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select s.data, s.version, s.updated_at
  from club_sync s
  where s.code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

-- Saves new data only if nobody else saved since p_version; otherwise raises 'conflict'
-- so the app can load the newer copy first.
create or replace function public.sync_put(p_code text, p_data jsonb, p_version int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_new int;
begin
  if octet_length(p_data::text) > 3000000 then
    raise exception 'too_large';
  end if;
  update club_sync
     set data = p_data, version = version + 1, updated_at = now()
   where code = v_code and version = p_version
  returning version into v_new;
  if v_new is null then
    if exists (select 1 from club_sync where code = v_code) then
      raise exception 'conflict';
    end if;
    raise exception 'not_found';
  end if;
  return v_new;
end;
$$;

revoke all on function public.sync_new_code() from public;
revoke all on function public.sync_create(jsonb) from public;
revoke all on function public.sync_get(text) from public;
revoke all on function public.sync_put(text, jsonb, int) from public;
grant execute on function public.sync_create(jsonb) to anon, authenticated;
grant execute on function public.sync_get(text) to anon, authenticated;
grant execute on function public.sync_put(text, jsonb, int) to anon, authenticated;

notify pgrst, 'reload schema';

-- ================= 004_club_hub.sql =================
-- Shelf to Stacks: shared book club pages.
-- Run once in Supabase → SQL Editor, after 001, 002 and 003.
--
-- A shared club page has two links:
-- - The member link (/c/<id>) lets anyone who has it suggest books, rate books the club has
--   read, and see the next meeting. Like a vote link, the id is a random UUID, so the page
--   can't be found without the link.
-- - The organizer link (/c/<id>#key=<key>) also lets you set the meeting, start votes,
--   mark books as current or read, remove books and rename the club. Only a hash of the key
--   is stored, and it is never readable by visitors.
--
-- As with votes, the browser can only read these tables; every change goes through the
-- functions below, which check the organizer key where needed.

create extension if not exists pgcrypto;

create table if not exists public.club_hubs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  admin_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.club_hub_books (
  id uuid primary key default gen_random_uuid(),
  hub_id uuid not null references public.club_hubs(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 300),
  author text not null default '' check (char_length(author) <= 200),
  image_url text not null default '' check (char_length(image_url) <= 500),
  isbn text not null default '' check (char_length(isbn) <= 13),
  note text not null default '' check (char_length(note) <= 280),
  added_by text not null check (char_length(added_by) between 1 and 60),
  added_token text not null check (char_length(added_token) between 16 and 64),
  status text not null default 'suggested' check (status in ('suggested', 'current', 'read')),
  finished_on date,
  match_key text not null,
  created_at timestamptz not null default now()
);
create index if not exists club_hub_books_hub on public.club_hub_books (hub_id);
create unique index if not exists club_hub_books_match on public.club_hub_books (hub_id, match_key);

create table if not exists public.club_hub_meetings (
  id uuid primary key default gen_random_uuid(),
  hub_id uuid not null references public.club_hubs(id) on delete cascade,
  starts_at timestamptz not null,
  location text not null default '' check (char_length(location) <= 200),
  host text not null default '' check (char_length(host) <= 60),
  notes text not null default '' check (char_length(notes) <= 1000),
  book_id uuid references public.club_hub_books(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists club_hub_meetings_hub on public.club_hub_meetings (hub_id, starts_at);

create table if not exists public.club_hub_ratings (
  id uuid primary key default gen_random_uuid(),
  hub_id uuid not null references public.club_hubs(id) on delete cascade,
  book_id uuid not null references public.club_hub_books(id) on delete cascade,
  voter_name text not null check (char_length(voter_name) between 1 and 60),
  voter_token text not null check (char_length(voter_token) between 16 and 64),
  stars int not null check (stars between 1 and 5),
  comment text not null default '' check (char_length(comment) <= 500),
  created_at timestamptz not null default now(),
  unique (book_id, voter_token)
);
create unique index if not exists club_hub_ratings_name on public.club_hub_ratings (book_id, lower(voter_name));

-- Votes started from a club page remember the club and which suggested book each option is.
alter table public.club_polls add column if not exists hub_id uuid references public.club_hubs(id) on delete cascade;
alter table public.club_poll_options add column if not exists hub_book_id uuid references public.club_hub_books(id) on delete set null;
create index if not exists club_polls_hub on public.club_polls (hub_id);

alter table public.club_hubs enable row level security;
alter table public.club_hub_books enable row level security;
alter table public.club_hub_meetings enable row level security;
alter table public.club_hub_ratings enable row level security;

drop policy if exists "read hubs" on public.club_hubs;
drop policy if exists "read hub books" on public.club_hub_books;
drop policy if exists "read hub meetings" on public.club_hub_meetings;
drop policy if exists "read hub ratings" on public.club_hub_ratings;
create policy "read hubs" on public.club_hubs for select using (true);
create policy "read hub books" on public.club_hub_books for select using (true);
create policy "read hub meetings" on public.club_hub_meetings for select using (true);
create policy "read hub ratings" on public.club_hub_ratings for select using (true);

-- Visitors can read everything except the organizer key hash and the per-device tokens.
revoke all on public.club_hubs, public.club_hub_books, public.club_hub_meetings, public.club_hub_ratings from anon, authenticated;
grant select (id, name, created_at) on public.club_hubs to anon, authenticated;
grant select (id, hub_id, title, author, image_url, isbn, note, added_by, status, finished_on, created_at)
  on public.club_hub_books to anon, authenticated;
grant select on public.club_hub_meetings to anon, authenticated;
grant select (id, hub_id, book_id, voter_name, stars, comment, created_at) on public.club_hub_ratings to anon, authenticated;

-- ---------- helpers (not callable from the browser) ----------

-- Same title/author treated as the same book: ignores case, punctuation, a leading "The/A/An",
-- a "(Series #1)" note and anything after a colon.
create or replace function public.hub_match_key(p_title text, p_author text)
returns text
language sql
immutable
as $$
  select regexp_replace(
           regexp_replace(
             lower(split_part(regexp_replace(coalesce(p_title, ''), '\([^)]*\)', '', 'g'), ':', 1)),
             '^\s*(the|a|an)\s+', ''),
           '[^a-z0-9]+', '', 'g')
      || '|'
      || regexp_replace(lower(coalesce(p_author, '')), '[^a-z]+', '', 'g');
$$;

create or replace function public.hub_key_ok(p_hub uuid, p_key text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from club_hubs
    where id = p_hub
      and coalesce(p_key, '') <> ''
      and admin_hash = encode(digest(upper(regexp_replace(p_key, '[^A-Za-z0-9]', '', 'g')), 'sha256'), 'hex')
  );
$$;

create or replace function public.hub_require_key(p_hub uuid, p_key text)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not hub_key_ok(p_hub, p_key) then
    raise exception 'not_organizer';
  end if;
end;
$$;

-- ---------- functions the app calls ----------

-- Creates a club page. Returns its id and the organizer key (shown once; only its hash is kept).
create or replace function public.hub_create(p_name text)
returns table (id uuid, admin_key text)
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea := gen_random_bytes(20);
  v_key text := '';
  v_id uuid;
  v_name text := left(trim(coalesce(p_name, '')), 80);
begin
  if v_name = '' then
    v_name := 'Our book club';
  end if;
  for i in 0..19 loop
    v_key := v_key || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
  end loop;
  insert into club_hubs (name, admin_hash)
  values (v_name, encode(digest(v_key, 'sha256'), 'hex'))
  returning club_hubs.id into v_id;
  return query select v_id, v_key;
end;
$$;

create or replace function public.hub_check_key(p_hub uuid, p_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select hub_key_ok(p_hub, p_key);
$$;

create or replace function public.hub_rename(p_hub uuid, p_key text, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := left(trim(coalesce(p_name, '')), 80);
begin
  perform hub_require_key(p_hub, p_key);
  if v_name = '' then
    raise exception 'Name is required.';
  end if;
  update club_hubs set name = v_name where id = p_hub;
end;
$$;

-- Anyone with the member link can suggest a book.
create or replace function public.hub_add_book(
  p_hub uuid, p_title text, p_author text, p_image text, p_isbn text, p_note text, p_name text, p_token text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text := left(trim(coalesce(p_title, '')), 300);
  v_author text := left(trim(coalesce(p_author, '')), 200);
  v_name text := left(trim(coalesce(p_name, '')), 60);
  v_key text;
  v_id uuid;
begin
  if not exists (select 1 from club_hubs where id = p_hub) then
    raise exception 'not_found';
  end if;
  if v_title = '' then
    raise exception 'A title is required.';
  end if;
  if v_name = '' then
    raise exception 'Name is required.';
  end if;
  if char_length(coalesce(p_token, '')) not between 16 and 64 then
    raise exception 'Bad device token.';
  end if;
  if (select count(*) from club_hub_books where hub_id = p_hub and status = 'suggested') >= 150 then
    raise exception 'list_full';
  end if;
  v_key := hub_match_key(v_title, v_author);
  if exists (select 1 from club_hub_books where hub_id = p_hub and match_key = v_key) then
    raise exception 'already_added';
  end if;
  insert into club_hub_books (hub_id, title, author, image_url, isbn, note, added_by, added_token, match_key)
  values (
    p_hub, v_title, v_author,
    case when coalesce(p_image, '') ~ '^https://' then left(p_image, 500) else '' end,
    left(regexp_replace(coalesce(p_isbn, ''), '[^0-9Xx]', '', 'g'), 13),
    left(trim(coalesce(p_note, '')), 280),
    v_name, p_token, v_key
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- The person who suggested a book (same device) can take it back while it's still a suggestion;
-- the organizer can remove any book.
create or replace function public.hub_remove_book(p_hub uuid, p_book uuid, p_token text, p_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted int;
begin
  if hub_key_ok(p_hub, p_key) then
    delete from club_hub_books where id = p_book and hub_id = p_hub;
  else
    delete from club_hub_books
    where id = p_book and hub_id = p_hub and status = 'suggested' and added_token = coalesce(p_token, '');
  end if;
  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    raise exception 'not_allowed';
  end if;
end;
$$;

-- Organizer: move a book between suggested, current and read.
-- Starting a new current book moves the previous current book to past reads.
create or replace function public.hub_set_status(p_hub uuid, p_key text, p_book uuid, p_status text, p_finished_on date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform hub_require_key(p_hub, p_key);
  if p_status not in ('suggested', 'current', 'read') then
    raise exception 'Unknown status.';
  end if;
  if not exists (select 1 from club_hub_books where id = p_book and hub_id = p_hub) then
    raise exception 'not_found';
  end if;
  if p_status = 'current' then
    update club_hub_books
       set status = 'read', finished_on = coalesce(finished_on, current_date)
     where hub_id = p_hub and status = 'current' and id <> p_book;
  end if;
  update club_hub_books
     set status = p_status,
         finished_on = case when p_status = 'read' then coalesce(p_finished_on, finished_on, current_date) else null end
   where id = p_book and hub_id = p_hub;
end;
$$;

-- Organizer: add (p_id null) or update a meeting.
create or replace function public.hub_save_meeting(
  p_hub uuid, p_key text, p_id uuid, p_starts timestamptz, p_location text, p_host text, p_notes text, p_book uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  perform hub_require_key(p_hub, p_key);
  if p_starts is null then
    raise exception 'A date and time are required.';
  end if;
  if p_book is not null and not exists (select 1 from club_hub_books where id = p_book and hub_id = p_hub) then
    raise exception 'That book is not part of this club.';
  end if;
  if p_id is null then
    if (select count(*) from club_hub_meetings where hub_id = p_hub) >= 200 then
      raise exception 'Too many meetings.';
    end if;
    insert into club_hub_meetings (hub_id, starts_at, location, host, notes, book_id)
    values (p_hub, p_starts, left(trim(coalesce(p_location, '')), 200), left(trim(coalesce(p_host, '')), 60),
            left(trim(coalesce(p_notes, '')), 1000), p_book)
    returning id into v_id;
  else
    update club_hub_meetings
       set starts_at = p_starts,
           location = left(trim(coalesce(p_location, '')), 200),
           host = left(trim(coalesce(p_host, '')), 60),
           notes = left(trim(coalesce(p_notes, '')), 1000),
           book_id = p_book
     where id = p_id and hub_id = p_hub
    returning id into v_id;
    if v_id is null then
      raise exception 'not_found';
    end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.hub_delete_meeting(p_hub uuid, p_key text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform hub_require_key(p_hub, p_key);
  delete from club_hub_meetings where id = p_id and hub_id = p_hub;
end;
$$;

-- Anyone with the member link can rate a book the club is reading or has read (once per
-- device; rating again updates it).
create or replace function public.hub_rate(
  p_hub uuid, p_book uuid, p_stars int, p_comment text, p_name text, p_token text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := left(trim(coalesce(p_name, '')), 60);
begin
  if v_name = '' then
    raise exception 'Name is required.';
  end if;
  if p_stars is null or p_stars not between 1 and 5 then
    raise exception 'Pick 1 to 5 stars.';
  end if;
  if char_length(coalesce(p_token, '')) not between 16 and 64 then
    raise exception 'Bad device token.';
  end if;
  if not exists (select 1 from club_hub_books where id = p_book and hub_id = p_hub and status in ('current', 'read')) then
    raise exception 'Only books the club has read can be rated.';
  end if;
  if exists (
    select 1 from club_hub_ratings
    where book_id = p_book and lower(voter_name) = lower(v_name) and voter_token <> p_token
  ) then
    raise exception 'name_taken';
  end if;
  insert into club_hub_ratings (hub_id, book_id, voter_name, voter_token, stars, comment)
  values (p_hub, p_book, v_name, p_token, p_stars, left(trim(coalesce(p_comment, '')), 500))
  on conflict (book_id, voter_token)
  do update set stars = excluded.stars, comment = excluded.comment, voter_name = excluded.voter_name, created_at = now();
end;
$$;

-- Organizer: start a ranked-choice vote on 2 to 12 suggested books. Uses the same vote page
-- and ballots as 001/002.
create or replace function public.hub_start_vote(p_hub uuid, p_key text, p_title text, p_books uuid[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := coalesce(cardinality(p_books), 0);
  v_id uuid;
begin
  perform hub_require_key(p_hub, p_key);
  if v_count < 2 or v_count > 12 then
    raise exception 'A vote needs between 2 and 12 books.';
  end if;
  if (select count(distinct b) from unnest(p_books) as b) <> v_count then
    raise exception 'Each book can only be in a vote once.';
  end if;
  if (select count(*) from club_hub_books where hub_id = p_hub and id = any(p_books)) <> v_count then
    raise exception 'Those books are not part of this club.';
  end if;
  insert into club_polls (title, hub_id)
  values (left(coalesce(nullif(trim(p_title), ''), 'Our next book'), 120), p_hub)
  returning id into v_id;
  insert into club_poll_options (poll_id, title, author, image_url, position, hub_book_id)
  select v_id, b.title, b.author, b.image_url, (o.ord - 1)::int, b.id
  from unnest(p_books) with ordinality as o(book_id, ord)
  join club_hub_books b on b.id = o.book_id;
  return v_id;
end;
$$;

revoke all on function public.hub_match_key(text, text) from public;
revoke all on function public.hub_key_ok(uuid, text) from public;
revoke all on function public.hub_require_key(uuid, text) from public;
revoke all on function public.hub_create(text) from public;
revoke all on function public.hub_check_key(uuid, text) from public;
revoke all on function public.hub_rename(uuid, text, text) from public;
revoke all on function public.hub_add_book(uuid, text, text, text, text, text, text, text) from public;
revoke all on function public.hub_remove_book(uuid, uuid, text, text) from public;
revoke all on function public.hub_set_status(uuid, text, uuid, text, date) from public;
revoke all on function public.hub_save_meeting(uuid, text, uuid, timestamptz, text, text, text, uuid) from public;
revoke all on function public.hub_delete_meeting(uuid, text, uuid) from public;
revoke all on function public.hub_rate(uuid, uuid, int, text, text, text) from public;
revoke all on function public.hub_start_vote(uuid, text, text, uuid[]) from public;

grant execute on function public.hub_create(text) to anon, authenticated;
grant execute on function public.hub_check_key(uuid, text) to anon, authenticated;
grant execute on function public.hub_rename(uuid, text, text) to anon, authenticated;
grant execute on function public.hub_add_book(uuid, text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.hub_remove_book(uuid, uuid, text, text) to anon, authenticated;
grant execute on function public.hub_set_status(uuid, text, uuid, text, date) to anon, authenticated;
grant execute on function public.hub_save_meeting(uuid, text, uuid, timestamptz, text, text, text, uuid) to anon, authenticated;
grant execute on function public.hub_delete_meeting(uuid, text, uuid) to anon, authenticated;
grant execute on function public.hub_rate(uuid, uuid, int, text, text, text) to anon, authenticated;
grant execute on function public.hub_start_vote(uuid, text, text, uuid[]) to anon, authenticated;

notify pgrst, 'reload schema';

-- ================= 005_library_requests.sql =================
-- Shelf to Stacks: "Request a different library".
-- Paste this whole file into Supabase → SQL Editor → New query → Run (once).
--
-- Visitors can send a request through request_library() but can't read anyone's requests.
-- To see them: Supabase → Table Editor → library_requests (or the library_request_counts view
-- for a tally by library).

create table if not exists public.library_requests (
  id uuid primary key default gen_random_uuid(),
  library text not null check (char_length(library) between 2 and 120),
  location text check (char_length(location) <= 120),
  contact text check (char_length(contact) <= 200),
  created_at timestamptz not null default now()
);

-- Locked down: no policies, so the public API can't read or write the table directly.
alter table public.library_requests enable row level security;

create or replace function public.request_library(p_library text, p_location text default null, p_contact text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  lib text := left(btrim(coalesce(p_library, '')), 120);
begin
  if char_length(lib) < 2 then
    raise exception 'Enter the name of the library you''d like added';
  end if;
  -- Flood guard: at most 200 requests an hour across the whole site.
  if (select count(*) from public.library_requests where created_at > now() - interval '1 hour') >= 200 then
    raise exception 'Too many requests right now. Try again in an hour.';
  end if;
  insert into public.library_requests (library, location, contact)
  values (
    lib,
    nullif(left(btrim(coalesce(p_location, '')), 120), ''),
    nullif(left(btrim(coalesce(p_contact, '')), 200), '')
  );
end;
$$;

revoke all on function public.request_library(text, text, text) from public;
grant execute on function public.request_library(text, text, text) to anon, authenticated;

-- For you in the dashboard: how many people asked for each library.
create or replace view public.library_request_counts as
  select initcap(lower(library)) as library, count(*) as requests, max(created_at) as latest
  from public.library_requests
  group by initcap(lower(library))
  order by requests desc, latest desc;
revoke all on public.library_request_counts from anon, authenticated;

notify pgrst, 'reload schema';
