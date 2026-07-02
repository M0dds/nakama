-- home_watch_bundles: read BOTH lanes (global + sync-instance), not just global.
--
-- The Logbuch is an activity feed. A co-member's ticks in a shared+synced list
-- live in the sync-instance lane (episode_watches.list_item_id <> NULL) and were
-- dropped by the old `and ew.list_item_id is null` filter, so shared-list watching
-- never appeared under "Aktivität". RLS (episode_watches_select_co) already scopes
-- visible rows correctly per lane, so reading both lanes leaks nothing.
--
-- `distinct on (user_id, episode_id)` de-dupes the rare case where the same episode
-- was ticked in both lanes by the same user (e.g. watched globally, then re-ticked
-- after the item was synced) — latest watched_at wins.
--
-- Only home_watch_bundles changes. The global-lane discipline stays intact for the
-- progress surfaces (home_continue_watching / upcoming), which are untouched.

create or replace function public.home_watch_bundles(
  _since timestamp with time zone,
  _gap_seconds integer,
  _limit integer
)
returns table(
  actor_user_id uuid,
  item_id uuid,
  season integer,
  min_episode integer,
  max_episode integer,
  episode_count integer,
  last_watched_at timestamp with time zone
)
language sql
stable
set search_path to 'public'
as $function$
  with resolved as (
    select distinct on (ew.user_id, ew.episode_id)
      ew.user_id as actor_user_id,
      e.item_id,
      e.season_number,
      e.episode_number,
      ew.watched_at
    from public.episode_watches ew
    join public.episodes e on e.id = ew.episode_id
    where ew.watched_at >= _since
    order by ew.user_id, ew.episode_id, ew.watched_at desc
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
$function$;
