-- PRIVACY FIX: global-lane episode_watches leaked across users.
--
-- The previous episode_watches_select_co policy gated the GLOBAL lane
-- (list_item_id IS NULL) on `is_co_member(episode_id, auth.uid())`, which only
-- asks "is the VIEWER a member of any list containing this episode's item?" —
-- it never references the row's `user_id` (the watcher). So anyone who merely
-- had the same item in any (even private) list could read EVERY user's global
-- progress on it, with no shared list between them.
--
-- Fix: gate the global lane on actually sharing a list WITH THE WATCHER
-- (shares_list_with(user_id, auth.uid())) — the same predicate
-- profiles_select_co_member and item_history_select_co already use, so the
-- watch visibility matches the profile visibility (no more "Jemand" ghosts).
-- The instance lane (list_item_id IS NOT NULL) is already correctly scoped to
-- the list_item's members via is_list_item_member and is left unchanged.
--
-- Strictly more restrictive: legitimate co-members (who share a list) still see
-- each other's global progress (the Mitseher eye + Logbuch co-member activity);
-- only the cross-account leak to non-co-members is closed.

drop policy if exists "episode_watches_select_co" on public.episode_watches;
create policy "episode_watches_select_co" on public.episode_watches for select to authenticated
  using (
    user_id = auth.uid()
    or (list_item_id is null and public.shares_list_with(user_id, auth.uid()))
    or (list_item_id is not null and public.is_list_item_member(list_item_id, auth.uid()))
  );
