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
