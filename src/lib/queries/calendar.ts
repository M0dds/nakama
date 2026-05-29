/**
 * Data layer for the Kalender (Phase 6). One query feeds both the week and
 * month grids + the day-pane: every episode airing inside a wide window
 * around today, for items on the caller's home-tracked lists, with the
 * caller's own watch state attached.
 *
 * Why one wide window instead of a per-view range read: navigating weeks /
 * months stays inside the window, so prev/next never refetches — the grids
 * just re-bucket the same cached array. The window is generous (a couple of
 * months back, a few ahead) so this holds for any realistic browsing; going
 * far outside it simply shows empty days until the next stale refresh. The
 * tracked-scope + item-meta lookups are the exact same helpers the Home
 * dashboard uses (trackedItemIds + itemMeta), so "what shows up" matches
 * the home modules by construction.
 */
import type { User } from "@supabase/supabase-js";
import { queryOptions } from "@tanstack/solid-query";
import { supabase } from "@/lib/supabase";
import { addMonths, isoDay, startOfMonth, unique } from "@/lib/format";
import { itemMeta, trackedItemIds, type MediaType } from "@/lib/queries/home";

// ── Query keys ──────────────────────────────────────────────────────────
//
// Keyed by user id so account-switching invalidates cleanly. The realtime
// channel invalidates the ["calendar"] prefix, hitting whatever user-scoped
// branch is live.

export const calendarQueryKey = ["calendar"] as const;
export const calendarEventsKey = (userId: string) =>
  ["calendar", userId] as const;

// ── Tunables ────────────────────────────────────────────────────────────

/** Months of history kept in the window (relative to the current month). */
const WINDOW_BACK = 2;
/** Months ahead kept in the window. */
const WINDOW_AHEAD = 4;
/** Explicit ceiling so a busy window can't silently truncate at PostgREST's
 *  implicit 1000-row cap (the HEALTH A7 / GAP_QUERY_LIMIT class of bug). */
const WINDOW_LIMIT = 5000;

// ── Types ───────────────────────────────────────────────────────────────

/** One episode airing on a given day, ready for the grid + day-pane. */
export interface CalendarEvent {
  episodeId: string;
  itemId: string;
  seasonNumber: number;
  episodeNumber: number;
  /** The episode's own title (Jikan/MangaDex-enriched); null when unknown. */
  episodeTitle: string | null;
  /** The item title — the headline in the grid + pane. */
  title: string;
  type: MediaType;
  slug: string;
  coverUrl: string | null;
  /** Local calendar day "YYYY-MM-DD" — the grid bucket key. */
  day: string;
  airDate: string; // raw ISO
  /** air_date <= now — only released episodes are tickable. */
  released: boolean;
  /** Whether the caller has watched this episode. */
  watched: boolean;
}

// ── Query options ───────────────────────────────────────────────────────

export function calendarEventsOptions(user: User) {
  return queryOptions({
    queryKey: calendarEventsKey(user.id),
    queryFn: () => fetchCalendarEvents(user.id),
    staleTime: 5 * 60_000,
  });
}

// ── Fetcher ─────────────────────────────────────────────────────────────

async function fetchCalendarEvents(userId: string): Promise<CalendarEvent[]> {
  const itemIds = await trackedItemIds();
  if (itemIds.length === 0) return [];

  const today = new Date();
  const from = addMonths(startOfMonth(today), -WINDOW_BACK);
  const to = addMonths(startOfMonth(today), WINDOW_AHEAD);

  const { data: eps, error } = await supabase
    .from("episodes")
    .select("id, item_id, season_number, episode_number, title, air_date")
    .in("item_id", itemIds)
    .gte("air_date", from.toISOString())
    .lt("air_date", to.toISOString())
    .order("air_date", { ascending: true })
    .limit(WINDOW_LIMIT);
  if (error) {
    console.error("calendar episodes query failed", error);
    return [];
  }
  if (!eps || eps.length === 0) return [];

  const episodeIds = eps.map((e) => e.id as string);
  const presentItemIds = unique(eps.map((e) => e.item_id as string));

  const [meta, watchedSet] = await Promise.all([
    itemMeta(presentItemIds),
    myWatchedSet(userId, episodeIds),
  ]);

  const now = Date.now();
  const events: CalendarEvent[] = [];
  for (const e of eps) {
    const air = e.air_date as string | null;
    if (!air) continue; // no date → can't place it on the grid
    const m = meta.get(e.item_id as string);
    if (!m) continue;
    events.push({
      episodeId: e.id as string,
      itemId: e.item_id as string,
      seasonNumber: (e.season_number as number | null) ?? 1,
      episodeNumber: e.episode_number as number,
      episodeTitle: (e.title as string | null) ?? null,
      title: m.title,
      type: m.type,
      slug: m.slug,
      coverUrl: m.coverUrl,
      day: isoDay(new Date(air)),
      airDate: air,
      released: new Date(air).getTime() <= now,
      watched: watchedSet.has(e.id as string),
    });
  }
  return events;
}

/** The caller's watched episode_ids within the candidate set. RLS scopes
 *  episode_watches, but we still filter user_id for "watched by ME"
 *  semantics — co-member watches (the Mitseher indicator) are a Phase 7
 *  concern once sharing lands. */
async function myWatchedSet(
  userId: string,
  episodeIds: string[],
): Promise<Set<string>> {
  if (episodeIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from("episode_watches")
    .select("episode_id")
    .eq("user_id", userId)
    .in("episode_id", episodeIds)
    .limit(WINDOW_LIMIT);
  if (error) {
    console.error("calendar watches query failed", error);
    return new Set();
  }
  return new Set((data ?? []).map((r) => r.episode_id as string));
}
