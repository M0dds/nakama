-- Movies store their seen-state in item_history (status='completed'). The film
-- detail page shows a "Mitseher" eye listing co-members of a SHARED list who
-- have seen the film. That read needs co-members to see each other's
-- item_history rows — which the per-user policies (item_history_select_own)
-- don't allow.
--
-- We mirror the episode_watches co-member model exactly: a separate, additive
-- SELECT policy gated on public.shares_list_with(row_owner, me) — the row's
-- owner must actually share a list with the caller. Privacy is preserved the
-- same way as the episode eye: the QUERY (movieCoWatchersOptions) still scopes
-- to the one shared list's members and only mounts when the film is opened
-- through a shared list, so a private tracker never leaks a seen-state.
--
-- shares_list_with(_other_user, _me) is the existing SECURITY DEFINER helper
-- (Logbook 20260527170000) already used by episode_watches_select_co and the
-- profiles co-member read.

drop policy if exists "item_history_select_co" on public.item_history;
create policy "item_history_select_co" on public.item_history for select to authenticated
  using (
    user_id = auth.uid()
    or public.shares_list_with(user_id, auth.uid())
  );

-- Live eye: let postgres_changes on item_history reach clients (RLS still
-- scopes which rows each client receives). Guarded so re-running is a no-op.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'item_history'
  ) then
    alter publication supabase_realtime add table public.item_history;
  end if;
end $$;
