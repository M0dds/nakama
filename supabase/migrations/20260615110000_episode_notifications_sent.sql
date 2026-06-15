-- ============================================================================
-- Push Phase 2 — auto-notify on new episodes: dedup ledger + detection RPC.
-- ============================================================================
-- Phase 1 (manual subscribe + a test push to the caller's own devices) is live.
-- Phase 2 sends a push automatically when a new episode of a TRACKED title airs.
--
-- Trigger source = the ALREADY-STORED `episodes` table (same coverage as the
-- Home "Was kommt" module; no server-side re-fetch from AniList/TMDB). A title
-- nobody ever opened has no episode rows → no push (accepted gap).
--
-- DEDUP MODEL (looks wrong on review — read this):
--   The ledger key is (user_id, episode_id) and the "already seen" suppression
--   is ANY-lane (a watch row in *any* lane suppresses). Both are deliberate
--   simplifications that cancel out: exactly ONE push per person per episode,
--   suppressed the moment they've consumed it anywhere. So — unlike
--   home_continue_watching — the detection RPC does NOT branch per sync lane.
-- ============================================================================

-- ── Dedup ledger ────────────────────────────────────────────────────────────
create table if not exists public.episode_notifications_sent (
  user_id uuid not null references auth.users(id) on delete cascade,
  episode_id uuid not null references public.episodes(id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (user_id, episode_id)
);

alter table public.episode_notifications_sent enable row level security;

-- Own-only SELECT (lets a future "notification history" UI read it). There is
-- NO insert/update/delete policy for authenticated: only the service role
-- (which bypasses RLS, used by the cron Edge Function) ever writes here.
do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'episode_notifications_sent'
      and policyname = 'ens_select_own'
  ) then
    create policy ens_select_own on public.episode_notifications_sent
      for select to authenticated using (user_id = auth.uid());
  end if;
end $$;

-- ── Detection RPC ────────────────────────────────────────────────────────────
-- One flat row per (user, episode, push subscription) to notify. SECURITY
-- DEFINER because it returns push keys + crosses users → callable ONLY by the
-- service role (the cron Edge Function); execute is revoked from everyone else.
create or replace function public.pending_episode_notifications(
  _lookback interval default interval '24 hours'
)
returns table (
  user_id uuid,
  endpoint text,
  p256dh text,
  auth text,
  item_id uuid,
  item_type text,
  item_slug text,
  item_title text,
  season_number int,
  episode_number int,
  episode_id uuid,
  episode_title text,
  air_date timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select distinct
    sub.user_id,
    sub.endpoint,
    sub.p256dh,
    sub.auth,
    it.id            as item_id,
    it.type          as item_type,
    it.slug          as item_slug,
    it.title         as item_title,
    e.season_number::int  as season_number,
    e.episode_number::int as episode_number,
    e.id             as episode_id,
    e.title          as episode_title,
    e.air_date
  from public.episodes e
  join public.items it on it.id = e.item_id
  -- episode is on at least one list this user actively tracks
  join public.list_items li on li.item_id = e.item_id
  join public.list_members lm
    on lm.list_id = li.list_id and lm.tracks_home = true
  -- the user has at least one active push subscription (one row per device)
  join public.push_subscriptions sub on sub.user_id = lm.user_id
  where it.type in ('anime', 'series')   -- manga: NULL air_date; movies/games: no episodes
    and e.air_date is not null
    and e.air_date >  now() - _lookback
    and e.air_date <= now()
    -- not watched in ANY lane (global or any synced instance)
    and not exists (
      select 1 from public.episode_watches ew
      where ew.user_id = lm.user_id
        and ew.episode_id = e.id
    )
    -- not already notified
    and not exists (
      select 1 from public.episode_notifications_sent ens
      where ens.user_id = lm.user_id
        and ens.episode_id = e.id
    );
  -- DISTINCT collapses the multi-list fan-out (same item on two tracked lists →
  -- one row); multiple devices keep distinct endpoints → one row each.
$$;

revoke all on function public.pending_episode_notifications(interval)
  from public, anon, authenticated;
grant execute on function public.pending_episode_notifications(interval)
  to service_role;

-- ── Anti-"backfill-blast" seed ───────────────────────────────────────────────
-- The ledger starts empty, so the first cron run would otherwise notify for the
-- entire backlog inside the lookback window. Seed EVERY already-aired episode of
-- a tracked title (not just the window) so the first run is silent for history
-- and only genuinely-new episodes notify going forward. Idempotent via the PK.
insert into public.episode_notifications_sent (user_id, episode_id)
select distinct lm.user_id, e.id
from public.episodes e
join public.list_items li on li.item_id = e.item_id
join public.list_members lm on lm.list_id = li.list_id and lm.tracks_home = true
where e.air_date is not null
  and e.air_date <= now()
on conflict do nothing;
