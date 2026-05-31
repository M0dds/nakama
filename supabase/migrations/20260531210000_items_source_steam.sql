-- Thema 1c (Spiele/Steam): allow 'steam' as an items.source.
--
-- The Logbook-era core schema (20260527102000) constrained items.source to
-- ('anilist','tmdb','tvmaze','igdb','manual'). Steam games need 'steam' added,
-- otherwise addItemToList's upsert (source='steam') is rejected by the CHECK.
--
-- Postgres auto-names an inline column CHECK <table>_<column>_check, so the
-- existing constraint is items_source_check. If your DB carries a differently
-- named constraint, adjust the DROP line to match.

alter table public.items drop constraint if exists items_source_check;

alter table public.items
  add constraint items_source_check
  check (source in ('anilist', 'tmdb', 'tvmaze', 'igdb', 'manual', 'steam'));
