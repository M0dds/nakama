-- Date-only air dates (app-wide rule: no release clock times).
--
-- AniList anime episodes were stored with the precise airingAt timestamp
-- ("Heute · 17:00"); TMDB series/Steam were always date-only (UTC midnight).
-- The clock created a hard gate nobody wanted: mark_episodes_watched_upto
-- filters on `air_date <= now()`, so a cascade before the exact air time
-- silently skipped today's episode — and it fought the display-weekday
-- snapping, which is whole-day math.
--
-- Fix: normalize every timestamp that carries a clock to the UTC midnight of
-- its Europe/Berlin calendar day (the app's accepted local-day convention,
-- same shape TMDB rows already have). Ingest stores date-only from now on
-- (anilist.ts isoDay), so this is a one-time backfill. The cascade RPC needs
-- no change: `air_date <= now()` on a midnight timestamp IS the day gate.
--
-- Idempotent: normalized rows no longer match the WHERE clause.

update public.episodes
set air_date = (air_date at time zone 'Europe/Berlin')::date::timestamp
                 at time zone 'utc'
where air_date is not null
  and air_date <> date_trunc('day', air_date);
