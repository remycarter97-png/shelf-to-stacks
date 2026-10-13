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
