-- Run this once in the Supabase SQL Editor for the project hosting DEEP CUT's grading.
-- Tables are private to the backend even though they live in the public schema.
create table if not exists public.deepcut_grade_cache (
  category_id text not null,
  answer_key text not null,
  canonical text not null,
  tier smallint not null check (tier between 0 and 4),
  created_at timestamptz not null default now(),
  primary key (category_id, answer_key)
);
-- Bump this column when the rarity rubric changes so old AI judgments
-- are recalculated instead of silently reused.
alter table public.deepcut_grade_cache
  add column if not exists grading_version smallint not null default 1;
alter table public.deepcut_grade_cache enable row level security;
revoke all on public.deepcut_grade_cache from anon, authenticated;
grant select, insert, update on public.deepcut_grade_cache to service_role;

create table if not exists public.deepcut_quota (
  bucket text primary key,
  count integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.deepcut_quota enable row level security;
revoke all on public.deepcut_quota from anon, authenticated;
grant select, insert, update on public.deepcut_quota to service_role;

-- This function is callable only by the backend's service role.
-- Globally cap uncached AI evaluations at 120/day (UTC), per IP at 30/day
-- and 6/min. Fail closed if this SQL hasn't been applied.
create or replace function public.deepcut_claim_request(client_hash text)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  utc_day text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD');
  minute_window text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI');
  global_count integer;
  daily_count integer;
  minute_count integer;
begin
  if client_hash is null or length(client_hash) <> 64 then
    return false;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(88241762);

  insert into public.deepcut_quota(bucket, count)
  values ('global:' || utc_day, 1)
  on conflict (bucket) do update
    set count = public.deepcut_quota.count + 1, updated_at = now()
  returning count into global_count;

  if global_count > 120 then return false; end if;

  insert into public.deepcut_quota(bucket, count)
  values ('ip-day:' || utc_day || ':' || client_hash, 1)
  on conflict (bucket) do update
    set count = public.deepcut_quota.count + 1, updated_at = now()
  returning count into daily_count;

  if daily_count > 30 then return false; end if;

  insert into public.deepcut_quota(bucket, count)
  values ('ip-minute:' || minute_window || ':' || client_hash, 1)
  on conflict (bucket) do update
    set count = public.deepcut_quota.count + 1, updated_at = now()
  returning count into minute_count;

  return minute_count <= 6;
end;
$$;
revoke all on function public.deepcut_claim_request(text) from public, anon, authenticated;
grant execute on function public.deepcut_claim_request(text) to service_role;

-- This is a capped API request budget, not a guaranteed OpenAI dollar spend cap.
-- Delete old deepcut_quota rows periodically if the table grows too large.
