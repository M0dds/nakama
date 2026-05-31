-- ============================================================================
-- Nakama · reset_progress fan-out for synced instances
--
-- Run in Supabase Dashboard → SQL Editor AFTER 20260531100000_sync_instances.
--
-- Bug: the original reset_progress (sync_instances §5c) deleted only the
-- CALLER's rows (`ew.user_id = _uid`) even for a synced list_item. That's
-- correct for the global lane (private progress), but a synced instance is
-- SHARED — resetting it must clear it for every member, the same way
-- set_episode_watch's un-watch branch fans out. Otherwise "reset" leaves the
-- other members still marked watched, and a single re-tick fans the old state
-- back to the resetter.
--
-- Fix: when the list_item is synced, drop the whole instance (all members'
-- rows) → a fresh 0 for everyone. Non-synced / global stays caller-only.
-- SECURITY DEFINER, so it may delete co-members' instance rows (same trust
-- model as the other synced write RPCs); the caller is still gated to list
-- membership. Idempotent / additive — only replaces the one function.
-- ============================================================================

create or replace function public.reset_progress(
  _item_id uuid,
  _list_item_id uuid default null
)
returns void language plpgsql security definer set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _sync boolean := false;
  _list_id uuid;
begin
  if _uid is null then raise exception 'not authenticated'; end if;

  if _list_item_id is not null then
    select li.sync_enabled, li.list_id into _sync, _list_id
    from public.list_items li
    where li.id = _list_item_id and li.item_id = _item_id;
    if _list_id is null then
      raise exception 'list_item % not found for item %', _list_item_id, _item_id;
    end if;
    if not public.is_list_member(_list_id, _uid) then
      raise exception 'not a member of list %', _list_id;
    end if;
  end if;

  if _sync then
    -- Synced instance is shared → reset it for ALL members (drop the whole
    -- instance; every member's rows carry the same list_item_id).
    delete from public.episode_watches
    where list_item_id = _list_item_id;
  else
    -- Global lane → caller only (private progress).
    delete from public.episode_watches ew
    using public.episodes e
    where ew.episode_id = e.id
      and e.item_id = _item_id
      and ew.user_id = _uid
      and ew.list_item_id is null;
  end if;
end;
$$;
grant execute on function public.reset_progress(uuid, uuid) to authenticated;
