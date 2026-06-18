-- ============================================================================
-- Heal sync-instance rows orphaned by the old "move" bug (one-time data fix).
-- ============================================================================
-- Background: moveListItem USED to un-sync an item by merely flipping
-- list_items.sync_enabled = false, WITHOUT running unsync_item. That stranded
-- data in the sync-instances model (handshake §Gotchas → Sync-Instanzen):
--
--   • episode_watches instance rows (list_item_id = LI) were neither merged
--     back into each member's global lane nor deleted — they orphaned onto a
--     list_item that may now live in a different (often private) list. That
--     residue re-surfaced as the "ghost co-watcher eye" (a moved item in a
--     private list still showed a co-member's avatar).
--   • The mover's own progress lived in that instance lane, so after the move
--     the global-lane reads showed the item as unwatched (lost completion).
--
-- INVARIANT this fix leans on: instance rows (list_item_id IS NOT NULL) may
-- exist ONLY while that list_item is synced (sync_enabled = true). Therefore
-- every (list_item_id IS NOT NULL AND sync_enabled = false) row is, by
-- definition, a leftover from the buggy move — safe to heal.
--
-- The code path is already fixed (moveListItem now calls unsync_item before the
-- move); this migration repairs rows written before that fix. Idempotent: after
-- it runs there are no such orphans left, so a re-run is a no-op.
--
-- Order matters: UNION first (never lose progress), then tear the instance down
-- — mirrors unsync_item exactly (bare `on conflict do nothing`, like that RPC).

-- 1) Union each orphaned instance watch back into its owner's GLOBAL lane.
insert into public.episode_watches (user_id, episode_id, watched_at, list_item_id)
select ew.user_id, ew.episode_id, ew.watched_at, null
from public.episode_watches ew
join public.list_items li on li.id = ew.list_item_id
where ew.list_item_id is not null
  and li.sync_enabled = false
on conflict do nothing;

-- 2) Delete the now-merged orphan instance rows.
delete from public.episode_watches ew
using public.list_items li
where li.id = ew.list_item_id
  and ew.list_item_id is not null
  and li.sync_enabled = false;
