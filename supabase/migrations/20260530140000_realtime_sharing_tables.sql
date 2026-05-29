-- Nakama · ensure all sharing tables are in the Realtime publication
-- Run in Supabase Dashboard → SQL Editor → New Query → Run. Idempotent — the
-- DO-block skips tables already in the publication, so re-running is safe (and
-- safe for Logbook, which subscribes to the same set).
--
-- Why: cross-user live updates (a member joining, an item appearing in a shared
-- list) only fire if the underlying table publishes postgres_changes. The
-- Logbook-era publication migration (20260528190000) was meant to add the full
-- set, but on the shared project list_items / list_members weren't actually
-- published (invites + episode ticks came through live, member joins + new list
-- items did not). This re-asserts the complete set so Nakama's list-detail +
-- overview realtime invalidations actually receive the events.
--
-- RLS still scopes Realtime: a subscriber only receives a row their SELECT
-- policy allows, so no extra filtering is needed.

do $$
declare
  t text;
  tables text[] := array[
    'episode_watches',
    'episodes',
    'list_items',
    'list_members',
    'list_invitations',
    'lists',
    'list_ownership_transfers'
  ];
begin
  foreach t in array tables loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format(
        'alter publication supabase_realtime add table public.%I',
        t
      );
    end if;
  end loop;
end $$;
