-- Shelf to Stacks: "Contact us" form and the footer newsletter sign-up.
-- Paste this whole file into Supabase → SQL Editor → New query → Run (once).
--
-- Visitors can send messages through send_contact() and join the newsletter through
-- join_newsletter(), but can't read anything back. To read them: Supabase → Table Editor →
-- contact_messages (kind = 'contact' or 'newsletter'), or the newsletter_subscribers view.

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'contact' check (kind in ('contact', 'newsletter')),
  name text check (char_length(name) <= 120),
  email text not null check (char_length(email) between 3 and 200),
  topic text check (char_length(topic) <= 60),
  message text check (char_length(message) <= 5000),
  created_at timestamptz not null default now()
);

create index if not exists contact_messages_created_at on public.contact_messages (created_at desc);
create unique index if not exists contact_messages_newsletter_email
  on public.contact_messages (lower(email)) where kind = 'newsletter';

-- Locked down: no policies, so the public API can't read or write the table directly.
alter table public.contact_messages enable row level security;

create or replace function public.send_contact(p_name text, p_email text, p_topic text, p_message text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  em text := left(btrim(coalesce(p_email, '')), 200);
  msg text := left(btrim(coalesce(p_message, '')), 5000);
begin
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address so we can reply';
  end if;
  if char_length(msg) < 5 then
    raise exception 'Write a short message first';
  end if;
  -- Flood guard: at most 100 messages an hour across the whole site.
  if (select count(*) from public.contact_messages where kind = 'contact' and created_at > now() - interval '1 hour') >= 100 then
    raise exception 'Too many messages right now. Try again in an hour.';
  end if;
  insert into public.contact_messages (kind, name, email, topic, message)
  values (
    'contact',
    nullif(left(btrim(coalesce(p_name, '')), 120), ''),
    em,
    nullif(left(btrim(coalesce(p_topic, '')), 60), ''),
    msg
  );
end;
$$;

create or replace function public.join_newsletter(p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  em text := lower(left(btrim(coalesce(p_email, '')), 200));
begin
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address';
  end if;
  if (select count(*) from public.contact_messages where kind = 'newsletter' and created_at > now() - interval '1 hour') >= 300 then
    raise exception 'Too many sign-ups right now. Try again in an hour.';
  end if;
  -- Signing up twice is fine; it just stays one row.
  insert into public.contact_messages (kind, email) values ('newsletter', em)
  on conflict (lower(email)) where kind = 'newsletter' do nothing;
end;
$$;

revoke all on function public.send_contact(text, text, text, text) from public;
grant execute on function public.send_contact(text, text, text, text) to anon, authenticated;
revoke all on function public.join_newsletter(text) from public;
grant execute on function public.join_newsletter(text) to anon, authenticated;

-- For you in the dashboard: everyone on the newsletter list.
create or replace view public.newsletter_subscribers as
  select email, created_at as joined from public.contact_messages where kind = 'newsletter' order by created_at desc;
revoke all on public.newsletter_subscribers from anon, authenticated;

notify pgrst, 'reload schema';
