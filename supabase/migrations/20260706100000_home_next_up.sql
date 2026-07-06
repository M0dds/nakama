-- ============================================================================
-- home_next_up: unstarted entries from tracked lists — the "Als Nächstes"
-- strip (REVIEW-2026-07 Produkt-Roadmap #1).
-- ============================================================================
-- Fills the moment the app is built for: "Alles aufgeholt. Zeit für etwas
-- Neues." should answer WITH the group's own plan instead of going silent.
-- Returns items from the caller's tracked lists (tracks_home) that the caller
-- has NOT started:
--   - episodic (anime/manga/series): no episode_watch in ANY lane — global or
--     synced instance; touching an item anywhere means it's begun, not "next"
--   - movie/game: no item_history row (Nakama only writes 'completed' there)
--
-- Order: pinned first (item pins live on the SHARED list_items row — a couple
-- that pins, plans), then freshest additions. One row per item: if the same
-- item sits in several tracked lists, the pinned row wins, then the most
-- recently added — the returned list_name/short_code give the strip its
-- list-scoped link target.
--
-- SECURITY INVOKER — leans entirely on RLS (own memberships, member-visible
-- list_items/lists, public items, own watches/history), same stance as
-- home_watch_bundles / home_new_releases. The started-check runs server-side
-- because the client can't do it: a finished long show (1000+ watch rows)
-- eats PostgREST's hard db-max-rows cap and would shadow other items'
-- started-ness (see handshake §Gotchas → 1000-Row-Cap).

create or replace function public.home_next_up(_limit integer default 24)
returns table (
  item_id uuid,
  title text,
  item_type text,
  slug text,
  cover_url text,
  pinned boolean,
  added_at timestamptz,
  list_name text,
  list_short_code text
)
language sql
security invoker
set search_path = public
stable
as $$
  select *
  from (
    select distinct on (i.id)
      i.id as item_id,
      i.title,
      i.type as item_type,
      i.slug,
      i.cover_url,
      (li.pinned_at is not null) as pinned,
      li.added_at,
      l.name as list_name,
      l.short_code as list_short_code
    from list_members lm
    join list_items li on li.list_id = lm.list_id
    join lists l on l.id = li.list_id
    join items i on i.id = li.item_id
    where lm.user_id = auth.uid()
      and lm.tracks_home
      and not exists (
        select 1
        from episode_watches ew
        join episodes e on e.id = ew.episode_id
        where ew.user_id = auth.uid()
          and e.item_id = li.item_id
      )
      and not exists (
        select 1
        from item_history ih
        where ih.user_id = auth.uid()
          and ih.item_id = li.item_id
      )
    order by i.id, (li.pinned_at is not null) desc, li.added_at desc
  ) candidates
  order by candidates.pinned desc, candidates.added_at desc
  limit _limit
$$;

grant execute on function public.home_next_up(integer) to authenticated;
