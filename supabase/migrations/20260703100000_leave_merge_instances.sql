-- ============================================================================
-- Leave/remove must merge sync-instance progress — RPCs + safety net + heal.
-- (REVIEW-2026-07 C2)
-- ============================================================================
-- Background (handshake §Gotchas → Sync-Instanzen): every path that ends a
-- user's participation in a synced list_item MUST union-merge their instance
-- rows (episode_watches.list_item_id = LI) back into their global lane — the
-- move path learned this (moveListItem → unsync_item, heal 20260618100000).
-- Two paths never did:
--
--   • Leaving a list / being removed: leaveList/removeMember were bare
--     list_members DELETEs. The departed member's instance rows survived,
--     attached to a list they are no longer in — their progress stranded
--     (invisible in the global lane), and since watch_bundles_all_lanes
--     (20260702100000) reads both lanes, the leftovers surface in remaining
--     members' Logbuch as ghost "Jemand" activity (the instance-lane SELECT
--     policy binds to the VIEWER's membership, not the row owner's).
--
--   • Deleting a list_items row (remove-from-list, delete-list cascade):
--     episode_watches.list_item_id is ON DELETE CASCADE (20260531100000), so
--     a bare delete DESTROYED every member's instance progress outright.
--     The client now runs unsync_item before single-row removes; the trigger
--     below covers the delete-list cascade and any future bare-delete path.
--
-- Pieces:
--   1. merge_member_instances(list, member) — internal helper (no grants).
--   2. leave_list(list)                    — self-scoped leave RPC.
--   3. remove_list_member(list, member)    — owner-scoped removal RPC.
--   4. BEFORE DELETE trigger on list_items — merge-then-cascade safety net.
--   5. One-time heal for already-stranded ex-member instance rows.
--
-- Idempotent: create-or-replace + drop-if-exists + union-merge with
-- `on conflict do nothing` (bare, like unsync_item — AUD-2).

-- ----------------------------------------------------------------------------
-- 1. Internal helper: union one member's instance rows across a list into
--    their global lane, then drop them. SECURITY DEFINER because it touches
--    rows the eventual caller (owner removing a member) doesn't own. NOT
--    granted to clients: calling it on an ACTIVELY synced item would collapse
--    a live instance lane — only the RPCs/trigger below may invoke it.
-- ----------------------------------------------------------------------------
create or replace function public.merge_member_instances(_list_id uuid, _member uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  -- Union first (never lose progress) …
  insert into public.episode_watches (user_id, episode_id, watched_at, list_item_id)
  select ew.user_id, ew.episode_id, ew.watched_at, null
  from public.episode_watches ew
  join public.list_items li on li.id = ew.list_item_id
  where li.list_id = _list_id
    and ew.user_id = _member
  on conflict do nothing;

  -- … then tear the member's instance rows down.
  delete from public.episode_watches ew
  using public.list_items li
  where li.id = ew.list_item_id
    and li.list_id = _list_id
    and ew.user_id = _member;
end;
$$;
revoke all on function public.merge_member_instances(uuid, uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. Leave a list (self-scoped). Mirrors the UI rule of the old RLS path
--    (list_members_delete_owner_or_self): the owner can't leave — they
--    transfer ownership or delete the list.
-- ----------------------------------------------------------------------------
create or replace function public.leave_list(_list_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare
  _uid uuid := auth.uid();
begin
  if _uid is null then raise exception 'not authenticated'; end if;
  if not public.is_list_member(_list_id, _uid) then
    raise exception 'not a member of list %', _list_id;
  end if;
  if exists (select 1 from public.lists where id = _list_id and owner_id = _uid) then
    raise exception 'owner cannot leave — transfer ownership or delete the list';
  end if;

  perform public.merge_member_instances(_list_id, _uid);
  delete from public.list_members where list_id = _list_id and user_id = _uid;
end;
$$;
grant execute on function public.leave_list(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Remove another member (owner-only, PRELAUNCH-2 semantics).
-- ----------------------------------------------------------------------------
create or replace function public.remove_list_member(_list_id uuid, _member uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare
  _uid uuid := auth.uid();
begin
  if _uid is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from public.lists where id = _list_id and owner_id = _uid) then
    raise exception 'only the list owner can remove members';
  end if;
  if _member = _uid then
    raise exception 'cannot remove yourself — owners delete or transfer the list';
  end if;

  perform public.merge_member_instances(_list_id, _member);
  delete from public.list_members where list_id = _list_id and user_id = _member;
end;
$$;
grant execute on function public.remove_list_member(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Safety net: merge EVERY member's instance rows before a list_items row
--    dies, so the FK cascade (20260531100000) can never destroy progress —
--    covers delete-list (cascade over all rows) and any future bare delete.
--    After unsync_item already ran (move/remove client paths) this is a no-op.
--
--    The auth.users existence guard matters for delete_account: that RPC
--    deletes auth.users and lets everything cascade. Mid-cascade the dying
--    user's row is already gone — inserting a global watch row for them would
--    violate the user_id FK. Their rows are being cascade-deleted anyway;
--    other (living) members still get their merge.
-- ----------------------------------------------------------------------------
create or replace function public.merge_instances_on_list_item_delete()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.episode_watches (user_id, episode_id, watched_at, list_item_id)
  select ew.user_id, ew.episode_id, ew.watched_at, null
  from public.episode_watches ew
  where ew.list_item_id = old.id
    and exists (select 1 from auth.users u where u.id = ew.user_id)
  on conflict do nothing;

  delete from public.episode_watches where list_item_id = old.id;
  return old;
end;
$$;

drop trigger if exists list_items_merge_instances_before_delete on public.list_items;
create trigger list_items_merge_instances_before_delete
  before delete on public.list_items
  for each row execute function public.merge_instances_on_list_item_delete();

-- ----------------------------------------------------------------------------
-- 5. One-time heal: instance rows whose watcher is NO LONGER a member of the
--    list holding that list_item (historic leavers/removals). Union first,
--    then delete — the 20260618100000 pattern, but keyed on membership loss
--    instead of sync_enabled (those rows still have sync_enabled = true, so
--    that heal never touched them).
-- ----------------------------------------------------------------------------
insert into public.episode_watches (user_id, episode_id, watched_at, list_item_id)
select ew.user_id, ew.episode_id, ew.watched_at, null
from public.episode_watches ew
join public.list_items li on li.id = ew.list_item_id
where ew.list_item_id is not null
  and not public.is_list_member(li.list_id, ew.user_id)
on conflict do nothing;

delete from public.episode_watches ew
using public.list_items li
where li.id = ew.list_item_id
  and ew.list_item_id is not null
  and not public.is_list_member(li.list_id, ew.user_id);
