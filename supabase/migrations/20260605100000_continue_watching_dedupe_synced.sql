-- ============================================================================
-- Continue-watching: a synced-only item no longer shows a stray global row.
-- ============================================================================
-- home_continue_watching unions a GLOBAL lane (episode_watches.list_item_id IS
-- NULL) with an INSTANCE lane (one row per active sync_enabled list_item). The
-- bare global row represents progress tracked via a NON-synced list — but it
-- was shown for ANY home-tracked item with global progress, so an item that
-- lives ONLY in a synced list showed up twice in "Fortsetzen": once bare
-- (global), once with the list label (instance).
--
-- Fix: show the global row only when the item is actually tracked in a
-- non-synced home list for the caller. An item in BOTH a solo (non-synced) list
-- AND a synced list still shows both — the global solo progress here + each
-- synced instance below — which is intended (e.g. One Piece solo at ep 1100,
-- plus a synced group rewatch at ep 200). A synced-only item shows just its
-- instance row.
--
-- Only global_rows' WHERE changes; everything else matches 20260531180000.
-- Signature unchanged, but recreate via drop+create to keep it self-contained.
-- SECURITY INVOKER as before.
-- ============================================================================

drop function if exists public.home_continue_watching(int);

create function public.home_continue_watching(_limit int default 50)
returns table (
  item_id uuid,
  slug text,
  title text,
  type text,
  cover_url text,
  total_episodes int,
  watched_episodes int,
  next_season int,
  next_episode int,
  last_watched_at timestamptz,
  new_episode_count int,
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
  -- ── GLOBAL lane (list_item_id IS NULL) ───────────────────────────────
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
  -- Lowest unwatched-released (season, episode) — DISTINCT ON keeps the first
  -- row per item under the (item, season, episode) ordering.
  g_next as (
    select distinct on (e.item_id)
           e.item_id,
           e.season_number::int as next_season,
           e.episode_number::int as next_episode
    from public.episodes e
    where e.item_id in (select item_id from g_per_item)
      and (e.air_date is null or e.air_date <= now())
      and not exists (
        select 1 from public.episode_watches ew
        where ew.user_id = auth.uid()
          and ew.episode_id = e.id
          and ew.list_item_id is null
      )
    order by e.item_id, e.season_number, e.episode_number
  ),
  -- Released-but-unwatched episodes in the last 14 days — same window + lane as
  -- the /lists badge engine, counted per item.
  g_new as (
    select e.item_id, count(*)::int as new_episode_count
    from public.episodes e
    where e.item_id in (select item_id from g_per_item)
      and e.air_date >= now() - interval '14 days'
      and e.air_date <= now()
      and not exists (
        select 1 from public.episode_watches ew
        where ew.user_id = auth.uid()
          and ew.episode_id = e.id
          and ew.list_item_id is null
      )
    group by e.item_id
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
      ne.next_season,
      ne.next_episode,
      pi.last_watched_at,
      coalesce(gn.new_episode_count, 0) as new_episode_count,
      null::uuid as list_item_id,
      null::text as list_short_code,
      null::text as list_name
    from g_per_item pi
    join public.items it on it.id = pi.item_id
    join g_total t on t.item_id = pi.item_id
    join g_next ne on ne.item_id = pi.item_id
    left join g_new gn on gn.item_id = pi.item_id
    where it.type in ('anime', 'series', 'manga')
      -- The bare global row represents progress tracked via a NON-synced list,
      -- so only show it when the item is actually in such a list for the caller.
      -- An item that lives only in synced lists would otherwise show its global
      -- progress as a stray bare row next to its instance row(s). An item in
      -- both a solo (non-synced) list and a synced list correctly shows BOTH:
      -- the solo progress here + each synced instance below.
      and exists (
        select 1
        from public.list_items li2
        join public.list_members lm2
          on lm2.list_id = li2.list_id and lm2.user_id = auth.uid()
        where li2.item_id = pi.item_id
          and li2.sync_enabled = false
          and lm2.tracks_home = true
      )
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
    select distinct on (i.list_item_id)
           i.list_item_id,
           e.season_number::int as next_season,
           e.episode_number::int as next_episode
    from inst i
    join public.episodes e on e.item_id = i.item_id
    where (e.air_date is null or e.air_date <= now())
      and not exists (
        select 1 from public.episode_watches ew
        where ew.user_id = auth.uid()
          and ew.episode_id = e.id
          and ew.list_item_id = i.list_item_id
      )
    order by i.list_item_id, e.season_number, e.episode_number
  ),
  i_new as (
    select i.list_item_id, count(*)::int as new_episode_count
    from inst i
    join public.episodes e on e.item_id = i.item_id
    where e.air_date >= now() - interval '14 days'
      and e.air_date <= now()
      and not exists (
        select 1 from public.episode_watches ew
        where ew.user_id = auth.uid()
          and ew.episode_id = e.id
          and ew.list_item_id = i.list_item_id
      )
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
      ne.next_season,
      ne.next_episode,
      coalesce(p.last_watched_at, i.added_at) as last_watched_at,
      coalesce(n.new_episode_count, 0) as new_episode_count,
      i.list_item_id,
      i.list_short_code,
      i.list_name
    from inst i
    join public.items it on it.id = i.item_id
    join i_total t on t.list_item_id = i.list_item_id
    join i_per p on p.list_item_id = i.list_item_id
    join i_next ne on ne.list_item_id = i.list_item_id
    left join i_new n on n.list_item_id = i.list_item_id
    where it.type in ('anime', 'series', 'manga')
  )
  select
    item_id, slug, title, type, cover_url,
    total_episodes, watched_episodes, next_season, next_episode, last_watched_at,
    new_episode_count, list_item_id, list_short_code, list_name
  from (
    select * from global_rows
    union all
    select * from instance_rows
  ) combined
  order by last_watched_at desc nulls last
  limit _limit;
$$;

grant execute on function public.home_continue_watching(int) to authenticated;
