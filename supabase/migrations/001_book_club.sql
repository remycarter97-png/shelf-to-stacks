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
