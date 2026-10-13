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
