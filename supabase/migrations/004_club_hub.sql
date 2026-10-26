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
