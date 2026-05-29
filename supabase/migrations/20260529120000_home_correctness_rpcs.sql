-- Nakama · home-dashboard correctness RPCs (Bundle 5 — HEALTH A4 + A6)
-- Run in Supabase Dashboard → SQL Editor → New Query → Run.
-- Shared backend with Logbook; these RPCs are Nakama-specific (home_*).
-- create-or-replace, safe to re-run.
--
-- Both are SECURITY INVOKER (matching item_progress): they read the world-
-- readable `episodes` catalog plus RLS-scoped `episode_watches`. The
-- `episode_watches_select_co` policy already grants "my own rows OR rows
-- owned by someone I share a list with", so the caller sees exactly the
-- watches they'd see querying the table directly — no privilege escalation,
-- no hand-rolled visibility logic to drift out of sync with the policy.

-- ── home_new_releases ───────────────────────────────────────────────────────
-- Replaces home.ts `newEpisodeSinceLastWatch`'s two client-side limit-2000
-- queries (HEALTH A4). For the given items, returns the subset whose latest
-- RELEASED episode aired AFTER the caller's most recent watch on that item —
-- the "while you were away, a new one dropped" signal that lights the
-- Fortsetzen badge. Both per-item maxima are aggregated server-side, so heavy
-- watchers (>2000 watches / >2000 episodes across the candidate set) no longer
-- silently truncate.
--
-- An item the caller has never watched does NOT qualify: the inner join drops
-- items with no watch row, preserving the previous (lastW && lastR && lastR >
-- lastW) semantics. Items where the latest release predates the last watch
-- (chronic backlog) also don't qualify — by design, this is "new since you
-- were away", not "you're behind".

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

-- ── home_watch_bundles ──────────────────────────────────────────────────────
-- Replaces the WATCH_FETCH=250 raw-watch fetch + client-side `bundleWatches`
-- (HEALTH A6). Clusters episode_watches into sessions per (actor, item) with a
-- gaps-and-islands window pass: a watch more than `_gap_seconds` after its
-- predecessor in the same (actor, item) partition starts a new session. Returns
-- the already-bundled sessions ordered by recency and capped at `_limit`.
--
-- The cap therefore applies to BUNDLES, not raw rows: a long cascade (One
-- Piece E1–E1100 in one sitting) collapses to a single bundle and can never be
-- truncated mid-session into a misleading "first + last" pair the way the
-- client-side latest-250 fetch could. RLS scopes the visible watches to the
-- caller + co-members in shared lists, identical to the direct table read it
-- replaces.

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
