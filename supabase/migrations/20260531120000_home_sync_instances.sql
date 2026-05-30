-- ============================================================================
-- Nakama · Home read RPCs for the sync-instances model (frontend TODO 5)
-- Run in Supabase Dashboard → SQL Editor AFTER 20260531100000_sync_instances.
--
-- Two things:
--   1. The GLOBAL home RPCs must read only the global lane (list_item_id IS
--      NULL) so a synced instance's rows don't leak into Home/Logbuch. No-op on
--      existing all-NULL data; protects Logbook too (it never writes instance
--      rows). home_watch_bundles + home_new_releases get the filter.
--   2. A NEW Nakama-specific RPC, home_continue_watching, that returns BOTH the
--      global "Fortsetzen" entries AND one extra entry per ACTIVE sync instance
--      (labelled with the list). It deliberately does NOT touch the shared
--      Logbook `continue_watching` — Nakama switches to this one instead.
--
-- All three are SECURITY INVOKER (matching item_progress / the existing home_*
-- RPCs): they read the world-readable `episodes` catalog + RLS-scoped
-- `episode_watches`, so the caller sees exactly their own + co-member rows.
-- create-or-replace, safe to re-run.
-- ============================================================================

-- ── home_watch_bundles — global lane only ───────────────────────────────────
-- The Logbuch feed is a global surface; a synced instance tick must not show up
-- as a global watch bundle. Only change vs 20260529120000: the
-- `ew.list_item_id is null` predicate in `resolved`.
create or replace function public.home_watch_bundles(
  _since timestamptz,
  _gap_seconds int,
  _limit int
)
returns table (
  actor_user_id uuid,
  item_id uuid,
  min_episode int,
  max_episode int,
  episode_count int,
  last_watched_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  with resolved as (
    select
      ew.user_id as actor_user_id,
      e.item_id,
      e.episode_number,
      ew.watched_at
    from public.episode_watches ew
    join public.episodes e on e.id = ew.episode_id
    where ew.watched_at >= _since
      and ew.list_item_id is null
  ),
  marked as (
    select
      resolved.*,
      case
        when watched_at - lag(watched_at) over (
               partition by actor_user_id, item_id
               order by watched_at
             ) > make_interval(secs => _gap_seconds)
        then 1 else 0
      end as new_session
    from resolved
  ),
  bucketed as (
    select
      marked.*,
      sum(new_session) over (
        partition by actor_user_id, item_id
        order by watched_at
        rows between unbounded preceding and current row
      ) as session_id
    from marked
  )
  select
    actor_user_id,
    item_id,
    min(episode_number)::int as min_episode,
    max(episode_number)::int as max_episode,
    count(*)::int as episode_count,
    max(watched_at) as last_watched_at
  from bucketed
  group by actor_user_id, item_id, session_id
  order by last_watched_at desc
  limit _limit;
$$;

-- ── home_new_releases — global lane only ─────────────────────────────────────
-- "New since you were away" is a global signal. Only change vs 20260529120000:
-- `last_watch` filters to the global lane.
create or replace function public.home_new_releases(_item_ids uuid[])
returns table (item_id uuid)
language sql
stable
security invoker
set search_path = public
as $$
  with last_watch as (
    select e.item_id, max(ew.watched_at) as watched_at
    from public.episode_watches ew
    join public.episodes e on e.id = ew.episode_id
    where e.item_id = any(_item_ids)
      and ew.user_id = auth.uid()
      and ew.list_item_id is null
    group by e.item_id
  ),
  last_release as (
    select e.item_id, max(e.air_date) as air_date
    from public.episodes e
    where e.item_id = any(_item_ids)
      and e.air_date <= now()
    group by e.item_id
  )
  select lr.item_id
  from last_release lr
  join last_watch lw on lw.item_id = lr.item_id
  where lr.air_date > lw.watched_at;
$$;

-- ── home_continue_watching — global entries + one per active sync instance ───
-- Nakama-specific (the shared Logbook continue_watching stays untouched).
-- Returns the caller's "Fortsetzen" rows in TWO flavours, unioned + ranked by
-- recency, capped at _limit:
--
--   • GLOBAL rows  (list_item_id NULL fields): items on the caller's
--     tracks_home lists with global progress (watched>0) and an unwatched
--     released episode — exactly today's continue_watching, scoped to the
--     global lane.
--   • INSTANCE rows (list_item_id / list_* set): one per ACTIVE sync_enabled
--     list_item on a tracks_home list that still has an unwatched released
--     episode — including a freshly-enabled instance at 0 (next = ep 1), the
--     "let's watch this together" entry. Labelled with the list so the UI links
--     to /lists/:shortCode/item/... and shows the list name. A finished
--     instance (all released watched) drops out via the i_next inner join.
--
-- slug, has_new_episode and the list fields are returned inline so the frontend
-- needs no extra round-trips (replaces the slugMap + home_new_releases calls in
-- the old continue path).
create or replace function public.home_continue_watching(_limit int default 50)
returns table (
  item_id uuid,
  slug text,
  title text,
  type text,
  cover_url text,
  total_episodes int,
  watched_episodes int,
  next_episode int,
  last_watched_at timestamptz,
  has_new_episode boolean,
  list_item_id uuid,
  list_short_code text,
  list_name text
)
language sql
stable
security invoker
set search_path = public
as $$
  with home_items as (
    select distinct li.item_id
    from public.list_items li
    join public.list_members lm
      on lm.list_id = li.list_id and lm.user_id = auth.uid()
    where lm.tracks_home = true
  ),
  -- ── GLOBAL lane ──────────────────────────────────────────────────────
  g_per_item as (
    select e.item_id,
           count(*)::int as watched_episodes,
           max(ew.watched_at) as last_watched_at
    from public.episode_watches ew
    join public.episodes e on e.id = ew.episode_id
    where ew.user_id = auth.uid()
      and ew.list_item_id is null
      and e.item_id in (select item_id from home_items)
    group by e.item_id
  ),
  g_total as (
    select item_id, count(*)::int as total_episodes
    from public.episodes
    where item_id in (select item_id from g_per_item)
    group by item_id
  ),
  g_next as (
    select e.item_id, min(e.episode_number)::int as next_episode
    from public.episodes e
    where e.item_id in (select item_id from g_per_item)
      and (e.air_date is null or e.air_date <= now())
      and not exists (
        select 1 from public.episode_watches ew
        where ew.user_id = auth.uid()
          and ew.episode_id = e.id
          and ew.list_item_id is null
      )
    group by e.item_id
  ),
  g_last_release as (
    select item_id, max(air_date) as air_date
    from public.episodes
    where item_id in (select item_id from g_per_item)
      and air_date <= now()
    group by item_id
  ),
  global_rows as (
    select
      pi.item_id,
      it.slug,
      it.title,
      it.type,
      it.cover_url,
      t.total_episodes,
      pi.watched_episodes,
      ne.next_episode,
      pi.last_watched_at,
      coalesce(lr.air_date > pi.last_watched_at, false) as has_new_episode,
      null::uuid as list_item_id,
      null::text as list_short_code,
      null::text as list_name
    from g_per_item pi
    join public.items it on it.id = pi.item_id
    join g_total t on t.item_id = pi.item_id
    join g_next ne on ne.item_id = pi.item_id
    left join g_last_release lr on lr.item_id = pi.item_id
    where it.type in ('anime', 'series', 'manga')
  ),
  -- ── INSTANCE lane (one per active sync_enabled list_item) ────────────
  inst as (
    select li.id as list_item_id, li.item_id, li.added_at,
           l.short_code as list_short_code, l.name as list_name
    from public.list_items li
    join public.list_members lm
      on lm.list_id = li.list_id and lm.user_id = auth.uid()
    join public.lists l on l.id = li.list_id
    where li.sync_enabled = true
      and lm.tracks_home = true
  ),
  i_per as (
    select i.list_item_id,
           count(ew.episode_id)::int as watched_episodes,
           max(ew.watched_at) as last_watched_at
    from inst i
    left join public.episode_watches ew
      on ew.list_item_id = i.list_item_id and ew.user_id = auth.uid()
    group by i.list_item_id
  ),
  i_total as (
    select i.list_item_id, count(e.id)::int as total_episodes
    from inst i
    join public.episodes e on e.item_id = i.item_id
    group by i.list_item_id
  ),
  i_next as (
    select i.list_item_id, min(e.episode_number)::int as next_episode
    from inst i
    join public.episodes e on e.item_id = i.item_id
    where (e.air_date is null or e.air_date <= now())
      and not exists (
        select 1 from public.episode_watches ew
        where ew.user_id = auth.uid()
          and ew.episode_id = e.id
          and ew.list_item_id = i.list_item_id
      )
    group by i.list_item_id
  ),
  i_last_release as (
    select i.list_item_id, max(e.air_date) as air_date
    from inst i
    join public.episodes e on e.item_id = i.item_id and e.air_date <= now()
    group by i.list_item_id
  ),
  instance_rows as (
    select
      i.item_id,
      it.slug,
      it.title,
      it.type,
      it.cover_url,
      t.total_episodes,
      p.watched_episodes,
      ne.next_episode,
      coalesce(p.last_watched_at, i.added_at) as last_watched_at,
      coalesce(lr.air_date > p.last_watched_at, false) as has_new_episode,
      i.list_item_id,
      i.list_short_code,
      i.list_name
    from inst i
    join public.items it on it.id = i.item_id
    join i_total t on t.list_item_id = i.list_item_id
    join i_per p on p.list_item_id = i.list_item_id
    join i_next ne on ne.list_item_id = i.list_item_id
    left join i_last_release lr on lr.list_item_id = i.list_item_id
    where it.type in ('anime', 'series', 'manga')
  )
  select
    item_id, slug, title, type, cover_url,
    total_episodes, watched_episodes, next_episode, last_watched_at,
    has_new_episode, list_item_id, list_short_code, list_name
  from (
    select * from global_rows
    union all
    select * from instance_rows
  ) combined
  order by last_watched_at desc nulls last
  limit _limit;
$$;
grant execute on function public.home_continue_watching(int) to authenticated;
