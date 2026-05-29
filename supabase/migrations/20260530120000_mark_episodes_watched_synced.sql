-- Nakama · auto-sync cascade — "bis hier" tick that fans out without a URL list
-- Run in Supabase Dashboard → SQL Editor → New Query → Run, AFTER all earlier
-- migrations. Idempotent (create-or-replace).
--
-- Why this exists:
--   The single-episode toggle already routes through toggle_episode_synced,
--   which infers sync from item membership and fans out to every member of
--   every sync-ON list the caller is in that holds the item — NO list context
--   in the call. The cascade ("bis hier alles") had no auto-sync twin: the
--   existing mark_episodes_watched only fans out when handed an explicit,
--   sync-ON _list_item_id. Nakama's item page + calendar are list-context-free
--   (an item can live in several lists; the item URL carries none), so the
--   cascade fell back to a caller-only write and a partner saw nothing.
--
--   This adds the cascade's auto-sync twin — same "fan out across all sync-ON
--   lists containing the item" rule as toggle_episode_synced — so a long-press
--   tick behaves identically to a single tap regardless of entry point.
--
-- Design (mirrors the final mark_episodes_watched + toggle_episode_auto_sync):
--   • Resolve the target episode's (season, episode) position; assert it
--     belongs to _item_id (stops mismatched-id calls nudging unrelated rows).
--   • Write the caller's own rows first — covers the no-sync-list case
--     unconditionally.
--   • Then fan out: every member of every sync-ON list the caller belongs to
--     that contains this item, for all episodes ≤ target.
--   • air_date guard (is null OR <= now()) keeps the bulk insert from tripping
--     the reject_unaired_watch trigger on a phantom future episode.
--   • Idempotent inserts (on conflict do nothing).
--
-- Leaves the existing 3-arg mark_episodes_watched untouched (the Logbook UI
-- still calls it with explicit list context) — new name, no signature break.
--
-- This file ALSO (re)asserts toggle_episode_synced in its auto-sync form. The
-- single-tap toggle in Nakama calls it with NAMED params (_item_id, _episode_id,
-- _watched). An older Logbook DB may still carry the first signature
-- (_episode_id, _list_item_id, _watched) — same types, different param names —
-- which would make the named call fail. Recreating it here makes this migration
-- self-sufficient: applying it guarantees BOTH auto-sync RPCs exist regardless
-- of which Logbook migrations were run on this shared project. Recreating to the
-- identical body is a no-op for Logbook.

-- =========================================================================
-- 1. toggle_episode_synced — single-episode auto-sync (verbatim from Logbook
--    20260528180000_toggle_episode_auto_sync). drop-then-create so a rename of
--    the input params over the older signature is allowed.
-- =========================================================================
drop function if exists public.toggle_episode_synced(uuid, uuid, boolean);

create or replace function public.toggle_episode_synced(
  _item_id uuid,
  _episode_id uuid,
  _watched boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
begin
  if _uid is null then
    raise exception 'not authenticated';
  end if;

  if not exists (
    select 1 from public.episodes
    where id = _episode_id and item_id = _item_id
  ) then
    raise exception 'episode % does not belong to item %', _episode_id, _item_id;
  end if;

  if _watched then
    insert into public.episode_watches (user_id, episode_id)
    values (_uid, _episode_id)
    on conflict (user_id, episode_id) do nothing;

    insert into public.episode_watches (user_id, episode_id)
    select distinct lm.user_id, _episode_id
    from public.list_items li
    join public.list_members lm on lm.list_id = li.list_id
    where li.item_id = _item_id
      and li.sync_enabled = true
      and exists (
        select 1 from public.list_members me
        where me.list_id = li.list_id and me.user_id = _uid
      )
    on conflict (user_id, episode_id) do nothing;
  else
    delete from public.episode_watches
    where user_id = _uid and episode_id = _episode_id;

    delete from public.episode_watches ew
    using (
      select distinct lm.user_id
      from public.list_items li
      join public.list_members lm on lm.list_id = li.list_id
      where li.item_id = _item_id
        and li.sync_enabled = true
        and exists (
          select 1 from public.list_members me
          where me.list_id = li.list_id and me.user_id = _uid
        )
    ) members
    where ew.episode_id = _episode_id
      and ew.user_id = members.user_id;
  end if;
end;
$$;

grant execute on function public.toggle_episode_synced(uuid, uuid, boolean) to authenticated;

-- =========================================================================
-- 2. mark_episodes_watched_synced — the cascade's auto-sync twin
-- =========================================================================
create or replace function public.mark_episodes_watched_synced(
  _item_id uuid,
  _up_to_episode_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _target_season int;
  _target_episode int;
begin
  if _uid is null then
    raise exception 'not authenticated';
  end if;

  select season_number, episode_number
    into _target_season, _target_episode
  from public.episodes
  where id = _up_to_episode_id and item_id = _item_id;
  if not found then
    raise exception 'episode % not found for item %', _up_to_episode_id, _item_id;
  end if;

  -- Caller's own rows first (covers the no-sync-list case unconditionally).
  insert into public.episode_watches (user_id, episode_id)
  select _uid, e.id
  from public.episodes e
  where e.item_id = _item_id
    and (e.season_number, e.episode_number) <= (_target_season, _target_episode)
    and (e.air_date is null or e.air_date <= now())
  on conflict (user_id, episode_id) do nothing;

  -- Fan out across every sync-ON list the caller is in that holds this item.
  insert into public.episode_watches (user_id, episode_id)
  select distinct lm.user_id, e.id
  from public.episodes e
  join public.list_items li
    on li.item_id = _item_id and li.sync_enabled = true
  join public.list_members lm
    on lm.list_id = li.list_id
  where e.item_id = _item_id
    and (e.season_number, e.episode_number) <= (_target_season, _target_episode)
    and (e.air_date is null or e.air_date <= now())
    and exists (
      select 1 from public.list_members me
      where me.list_id = li.list_id and me.user_id = _uid
    )
  on conflict (user_id, episode_id) do nothing;
end;
$$;

grant execute on function public.mark_episodes_watched_synced(uuid, uuid) to authenticated;
