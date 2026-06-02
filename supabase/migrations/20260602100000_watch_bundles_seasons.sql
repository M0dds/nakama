-- ============================================================================
-- Logbuch (#5): season-aware watch bundles.
-- ============================================================================
-- home_watch_bundles clustered ticks per (actor, item, session) and returned a
-- bare min/max episode_number. That reads fine for AniList anime/manga (always
-- season 1, episode_number is effectively a global sequence) but is WRONG for
-- TMDB multi-season series, where episode_number resets per season (S2E1) — a
-- session spanning seasons collapsed into a meaningless "E03–E12".
--
-- Same fix as continue-watching got in 20260531180000: make it season-aware.
-- We add season_number to the GROUP BY (the time-gap session detection still
-- partitions by (actor, item), so a cross-season binge stays one session but
-- splits into one bundle row per season — clean "S1 · E10–E12" + "S2 · E01–E03"
-- instead of a collapsed range). The new `season` column lets the client render
-- the season prefix (season 1 stays bare, matching seasonEpisodeLabel).
--
-- Return signature changes (new `season` column) → drop + recreate. SECURITY
-- INVOKER + global-lane filter (list_item_id IS NULL) unchanged from
-- 20260531120000.
-- ============================================================================

drop function if exists public.home_watch_bundles(timestamptz, int, int);

create function public.home_watch_bundles(
  _since timestamptz,
  _gap_seconds int,
  _limit int
)
returns table (
  actor_user_id uuid,
  item_id uuid,
  season int,
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
      e.season_number,
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
    season_number::int as season,
    min(episode_number)::int as min_episode,
    max(episode_number)::int as max_episode,
    count(*)::int as episode_count,
    max(watched_at) as last_watched_at
  from bucketed
  group by actor_user_id, item_id, session_id, season_number
  order by last_watched_at desc
  limit _limit;
$$;

grant execute on function public.home_watch_bundles(timestamptz, int, int) to authenticated;
