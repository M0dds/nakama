/**
 * Data layer for the Kalender (Phase 6). One query feeds both the week and
 * month grids + the day-pane: every episode airing inside a wide window
 * around today, for items on the caller's home-tracked lists, with the
 * caller's own watch state attached.
 *
 * The window is ANCHORED on a month (the calendar's viewed month, passed in):
 * it spans WINDOW_BACK months back to WINDOW_AHEAD ahead of that anchor.
 * Navigating weeks / months within the loaded window never refetches — the
 * grids just re-bucket the same cached array. The caller (Calendar.tsx) only
 * advances the anchor when the viewed month nears the window edge, so the
 * window follows along and far-out browsing loads its data instead of showing
 * empty days. The tracked-scope + item-meta lookups are the exact same helpers
 * the Home dashboard uses (trackedItemIds + itemMeta), so "what shows up"
 * matches the home modules by construction.
 */
import type { User } from "@supabase/supabase-js";
import { queryOptions } from "@tanstack/solid-query";
import { supabase } from "@/lib/supabase";
import {
  addMonths,
  fromIsoDay,
  isoDay,
  snapToWeekday,
  startOfMonth,
  unique,
} from "@/lib/format";
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

/** Months of history kept in the window (relative to the anchor month).
 *  Exported so Calendar.tsx can keep its recenter margin in sync. */
export const WINDOW_BACK = 2;
/** Months ahead kept in the window. */
export const WINDOW_AHEAD = 4;
/** Safety ceiling on the window read. NOTE: Supabase's hard 1000-row cap
 *  (db-max-rows) overrides any larger `.limit`, so this is effectively 1000 — a
 *  ~6-month window with 1000+ airings would truncate silently. Fine at this
 *  app's scale (a couple / small group); paginate with `.range()` if a power
 *  user ever hits it. Same cap class as the co-watcher eye / title-gap fixes. */
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

export function calendarEventsOptions(user: User, anchorIso: string) {
  return queryOptions({
    queryKey: [...calendarEventsKey(user.id), anchorIso] as const,
    queryFn: () => fetchCalendarEvents(user.id, anchorIso),
    staleTime: 5 * 60_000,
    // Keep the grid populated while a recenter (new anchor) loads — the prior
    // window's events stay visible instead of flashing empty.
    placeholderData: (prev) => prev,
  });
}

// ── Fetcher ─────────────────────────────────────────────────────────────

/** Effective Anzeige-Tag per item for the calendar — a single weekday override
 *  so each episode lands on one grid day. The per-user GLOBAL override wins;
 *  for an item that only has a synced-instance override (no global one) we fall
 *  back to that, so a group's "wir schauen freitags" still shifts the personal
 *  calendar. (The calendar is a per-user overview — it doesn't split an item
 *  across two days; that lane-split lives in "Was kommt".) */
async function effectiveOverrides(userId: string): Promise<Map<string, number>> {
  const map = new Map<string, number>();

  const { data: prefs } = await supabase
    .from("item_display_prefs")
    .select("item_id, weekday")
    .eq("user_id", userId);
  for (const p of prefs ?? [])
    map.set(p.item_id as string, p.weekday as number);

  const { data: memberships } = await supabase
    .from("list_members")
    .select("list_id")
    .eq("user_id", userId)
    .eq("tracks_home", true);
  const listIds = (memberships ?? []).map((r) => r.list_id as string);
  if (listIds.length > 0) {
    const { data: lis } = await supabase
      .from("list_items")
      .select("item_id, sync_enabled, display_weekday")
      .in("list_id", listIds);
    for (const li of lis ?? []) {
      const itemId = li.item_id as string;
      const w = li.display_weekday as number | null;
      if (li.sync_enabled && w != null && !map.has(itemId)) map.set(itemId, w);
    }
  }
  return map;
}

async function fetchCalendarEvents(
  userId: string,
  anchorIso: string,
): Promise<CalendarEvent[]> {
  const itemIds = await trackedItemIds(userId);
  if (itemIds.length === 0) return [];

  const anchor = startOfMonth(fromIsoDay(anchorIso));
  const from = addMonths(anchor, -WINDOW_BACK);
  const to = addMonths(anchor, WINDOW_AHEAD);

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

  const [meta, watchedSet, overrides] = await Promise.all([
    itemMeta(presentItemIds),
    myWatchedSet(userId, episodeIds),
    effectiveOverrides(userId),
  ]);

  const now = Date.now();
  const events: CalendarEvent[] = [];
  for (const e of eps) {
    const air = e.air_date as string | null;
    if (!air) continue; // no date → can't place it on the grid
    const m = meta.get(e.item_id as string);
    if (!m) continue;
    // Snap to the item's Anzeige-Tag so it sits on (and is tickable from) its
    // displayed availability day, not the raw origin date.
    const displayAir = snapToWeekday(air, overrides.get(e.item_id as string) ?? null);
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
      day: isoDay(new Date(displayAir)),
      airDate: displayAir,
      released: new Date(displayAir).getTime() <= now,
      watched: watchedSet.has(e.id as string),
    });
  }
  return events;
}

/** The caller's watched episode_ids within the candidate set. RLS scopes
 *  episode_watches, but we still filter user_id for "watched by ME"
 *  semantics. The calendar is a GLOBAL surface (airing is global), so it reads
 *  the global lane only (`list_item_id IS NULL`) — a synced instance's rows
 *  must not flip the calendar's watched dots. */
async function myWatchedSet(
  userId: string,
  episodeIds: string[],
): Promise<Set<string>> {
  if (episodeIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from("episode_watches")
    .select("episode_id")
    .eq("user_id", userId)
    .is("list_item_id", null)
    .in("episode_id", episodeIds)
    .limit(WINDOW_LIMIT);
  if (error) {
    console.error("calendar watches query failed", error);
    return new Set();
  }
  return new Set((data ?? []).map((r) => r.episode_id as string));
}
