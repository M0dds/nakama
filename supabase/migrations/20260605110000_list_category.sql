-- F9 — Listen-Kategorien.
--
-- A list optionally carries ONE media category (anime/manga/series/movie/game)
-- that determines what may be added to it. NULL = "Alle" (uncategorized) — the
-- default state: such lists live in the "Meine Listen" section and the AddSheet
-- imposes no type restriction (today's behaviour). A non-null category is the
-- primary grouping axis on /lists and locks the AddSheet's type filter.
--
-- Category writes ride the existing owner-only `lists_update_owner` policy
-- (verified against 00000000000000_baseline.sql — it's the only UPDATE policy
-- on lists), so no RLS change is needed: only the list's owner may set/change
-- the category, members see it read-only. The `lists` table is already in the
-- realtime publication, so an owner's change propagates to members live.

alter table public.lists
  add column if not exists category text;

alter table public.lists
  add constraint lists_category_check
  check (category is null or category in ('anime', 'manga', 'series', 'movie', 'game'));
