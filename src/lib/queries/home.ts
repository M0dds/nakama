/**
 * Data layer for the Home dashboard (Phase 5). Three modules feed off this
 * file — Was kommt (upcoming releases), Fortsetzen (in-progress items), and
 * Logbuch (recent ticks across shared lists). All three are derived; nothing
 * new gets written here.
 *
 * Why this lives as its own queries file: each module has a different cache
 * lifetime (Logbuch is the most volatile — partner ticks ping it constantly;
 * Was kommt invalidates only on new episode metadata or list_items changes),
 * so the three keys stay separate for granular invalidation from the
 * realtime channel on /.
 */
import type { User } from "@supabase/supabase-js";
import { queryOptions } from "@tanstack/solid-query";
import { supabase } from "@/lib/supabase";
import { unique } from "@/lib/format";

export type MediaType = "anime" | "manga" | "series" | "movie" | "game";

// ── Query keys ──────────────────────────────────────────────────────────
//
// All three are keyed by user id so account-switching invalidates cleanly.
// Invalidating ["home"] from the realtime channel hits all three at once,
// or each branch individually for targeted refreshes.

export const homeQueryKey = ["home"] as const;
export const continueWatchingKey = (userId: string) =>
  ["home", "continue", userId] as const;
export const upcomingEpisodesKey = (userId: string) =>
  ["home", "upcoming", userId] as const;
export const recentlyTickedKey = (userId: string) =>
  ["home", "logbook", userId] as const;

// ── Types ───────────────────────────────────────────────────────────────

/** Fortsetzen — items with mid-way watch progress, ranked by recent activity. */
export interface ContinueItem {
  itemId: string;
  title: string;
  type: MediaType;
  slug: string;
  coverUrl: string | null;
  total: number;
  watched: number;
  nextEpisode: number;
  /** True when an episode aired AFTER the user's most recent watch on this
   *  item — i.e. "while you were away, a new one dropped". Distinct from
   *  the list-row badge: items the user is chronically behind on (latest
   *  release predates last watch) deliberately don't light up. */
  hasNewEpisode: boolean;
}

/** Was kommt — the next release per tracked item, soonest first. */
export interface UpcomingItem {
  itemId: string;
  title: string;
  type: MediaType;
  slug: string;
  coverUrl: string | null;
  episodeNumber: number;
  airDate: string; // ISO
}

/** Logbuch — a discriminated union of factual events. Two kinds today:
 *
 *  - watch     : a bundled watch session ("Du hast E37–E1163 gesehen"),
 *                clustered by SESSION_GAP_MS so cascades collapse to one row
 *  - list_add  : someone (you or a co-member) put an item into a list. For
 *                shared lists co-members see each other's adds; for private
 *                lists RLS scopes it down to the caller's own adds.
 *
 *  The display label for `actor` uses "@username" first, then display_name,
 *  then null (component falls back to "Jemand"). For self-events actorName
 *  is null — the UI substitutes "Du". */
export type LogbookEvent = WatchBundle | ListAddEvent;

interface BaseLogbookEvent {
  eventId: string; // stable React key
  ts: string; // ISO — sort key
  itemId: string;
  title: string;
  type: MediaType;
  slug: string;
  coverUrl: string | null;
  actorUserId: string;
  actorName: string | null;
  isSelf: boolean;
}

export interface WatchBundle extends BaseLogbookEvent {
  kind: "watch";
  minEpisode: number;
  maxEpisode: number;
  episodeCount: number;
}

export interface ListAddEvent extends BaseLogbookEvent {
  kind: "list_add";
  listId: string;
  listShortCode: string;
  listName: string;
}

// ── Tunables ────────────────────────────────────────────────────────────

const CONTINUE_LIMIT = 50;
/** Window for the Was-kommt section — includes today, 14 calendar days out. */
const UPCOMING_DAYS = 14;
/** How far back the Logbuch reaches. */
const LOGBOOK_DAYS = 30;
/** Hard cap on the final bundled feed — applied per source (watch bundles,
 *  list adds) server-side and again after the merge. */
const LOGBOOK_LIMIT = 30;
/** Watches more than this apart start a new bundle. 6h matches Logbook.
 *  Passed to the home_watch_bundles RPC as seconds. */
const SESSION_GAP_MS = 6 * 60 * 60 * 1000;

// ── Query options ───────────────────────────────────────────────────────

export function continueWatchingOptions(user: User) {
  return queryOptions({
    queryKey: continueWatchingKey(user.id),
    queryFn: () => fetchContinueWatching(),
    staleTime: 60_000,
  });
}

export function upcomingEpisodesOptions(user: User) {
  return queryOptions({
    queryKey: upcomingEpisodesKey(user.id),
    queryFn: () => fetchUpcomingEpisodes(),
    staleTime: 5 * 60_000,
  });
}

export function recentlyTickedOptions(user: User) {
  return queryOptions({
    queryKey: recentlyTickedKey(user.id),
    queryFn: () => fetchRecentlyTicked(user.id),
    staleTime: 30_000,
  });
}

// ── Fetchers ────────────────────────────────────────────────────────────

interface ContinueRow {
  item_id: string;
  title: string;
  type: MediaType;
  cover_url: string | null;
  total_episodes: number;
  watched_episodes: number;
  next_episode: number;
}

/** Fortsetzen via the DB-side `continue_watching` RPC (inherited from
 *  Logbook). RLS scopes the rows to lists the caller is in; the RPC handles
 *  the SQL-side aggregation so 1000+-episode shows don't trip the PostgREST
 *  row cap. The RPC doesn't return slug or "new-since-last-watch" — both
 *  are batched after.
 *
 *  Note: `nextEpisode` is the next UNwatched (released) episode's number.
 *  The component renders it as "E07" / "Kap. 12" depending on type. */
async function fetchContinueWatching(): Promise<ContinueItem[]> {
  const { data, error } = await supabase.rpc("continue_watching", {
    _limit: CONTINUE_LIMIT,
  });
  if (error) {
    console.error("continue_watching RPC failed", error);
    return [];
  }
  const rows = (data ?? []) as ContinueRow[];
  if (rows.length === 0) return [];

  const itemIds = rows.map((r) => r.item_id);
  const [slugs, newSince] = await Promise.all([
    slugMap(itemIds),
    newEpisodeSinceLastWatch(itemIds),
  ]);

  return rows.flatMap((r) => {
    const slug = slugs.get(r.item_id);
    if (!slug) return []; // shouldn't happen — defensive against orphan rows
    return [
      {
        itemId: r.item_id,
        title: r.title,
        type: r.type,
        slug,
        coverUrl: r.cover_url,
        total: r.total_episodes,
        watched: r.watched_episodes,
        nextEpisode: r.next_episode,
        hasNewEpisode: newSince.has(r.item_id),
      },
    ];
  });
}

/** Per-item check: did any episode air AFTER the caller's most recent watch
 *  on that item? Returns the set of itemIds for which the answer is yes —
 *  i.e. "a new episode dropped since you last engaged with this".
 *
 *  Delegated to the `home_new_releases` RPC, which computes both per-item
 *  maxima (last watch, last release) server-side in one round-trip. The old
 *  client-side version pulled up to 2000 watch rows + 2000 episode rows and
 *  reduced them in JS — which silently truncated for heavy watchers or for
 *  candidate sets spanning several long-running shows (HEALTH A4).
 *
 *  Items where the caller is chronically behind (latest release predates
 *  their last watch) deliberately don't qualify — the badge is for "while
 *  you were away", not "you have a backlog". The RPC's inner join enforces
 *  the same "must have watched it at all" precondition. */
async function newEpisodeSinceLastWatch(
  itemIds: string[],
): Promise<Set<string>> {
  if (itemIds.length === 0) return new Set();
  const { data, error } = await supabase.rpc("home_new_releases", {
    _item_ids: itemIds,
  });
  if (error) {
    console.error("home_new_releases RPC failed", error);
    return new Set();
  }
  return new Set(
    ((data ?? []) as { item_id: string }[]).map((r) => r.item_id),
  );
}

/** Was kommt — first upcoming release inside the 14-day window per tracked
 *  item, ascending air_date. Three-step fetch (tracked-list ids → matching
 *  episodes → enrich with item meta) because we can't safely express the
 *  "first per item" reduction in a single PostgREST request. */
async function fetchUpcomingEpisodes(): Promise<UpcomingItem[]> {
  const itemIds = await trackedItemIds();
  if (itemIds.length === 0) return [];

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start.getTime() + UPCOMING_DAYS * 86_400_000);

  const { data: eps, error } = await supabase
    .from("episodes")
    .select("item_id, episode_number, air_date")
    .in("item_id", itemIds)
    .gte("air_date", start.toISOString())
    .lt("air_date", end.toISOString())
    .order("air_date", { ascending: true });
  if (error) {
    console.error("episodes upcoming query failed", error);
    return [];
  }
  if (!eps || eps.length === 0) return [];

  // First episode per item, preserving ascending air_date order.
  const seen = new Set<string>();
  const firsts: {
    item_id: string;
    episode_number: number;
    air_date: string;
  }[] = [];
  for (const e of eps) {
    if (!e.air_date || seen.has(e.item_id)) continue;
    seen.add(e.item_id);
    firsts.push({
      item_id: e.item_id,
      episode_number: e.episode_number,
      air_date: e.air_date,
    });
  }

  const meta = await itemMeta(firsts.map((f) => f.item_id));

  return firsts.flatMap((f) => {
    const m = meta.get(f.item_id);
    if (!m) return [];
    return [
      {
        itemId: f.item_id,
        title: m.title,
        type: m.type,
        slug: m.slug,
        coverUrl: m.coverUrl,
        episodeNumber: f.episode_number,
        airDate: f.air_date,
      },
    ];
  });
}

/** One bundled watch session as returned by the home_watch_bundles RPC —
 *  already clustered per (actor, item) by SESSION_GAP_MS, server-side. */
interface BundleRow {
  actor_user_id: string;
  item_id: string;
  min_episode: number;
  max_episode: number;
  episode_count: number;
  last_watched_at: string;
}

interface AddRow {
  id: string;
  item_id: string;
  list_id: string;
  added_at: string;
  added_by_user_id: string | null;
  lists: { name: string; short_code: string } | null;
}

/** Logbuch — recent activity across visible lists, newest first. RLS does
 *  the heavy lifting: episode_watches and list_items both scope to lists
 *  the caller is a member of, so co-member ticks AND co-member adds in
 *  shared lists land automatically. Private lists return only the
 *  caller's own rows because they're the only member.
 *
 *  Two kinds today: bundled-watch sessions (SESSION_GAP_MS clustered) and
 *  list_add ("X hat <item> zu <list> hinzugefügt"). Missed + ownership
 *  transfer kinds wait for the Sharing phase (Welle-2). */
async function fetchRecentlyTicked(currentUserId: string): Promise<LogbookEvent[]> {
  const sinceIso = new Date(Date.now() - LOGBOOK_DAYS * 86_400_000).toISOString();

  const [bundlesRes, addsRes] = await Promise.all([
    supabase.rpc("home_watch_bundles", {
      _since: sinceIso,
      _gap_seconds: SESSION_GAP_MS / 1000,
      _limit: LOGBOOK_LIMIT,
    }),
    supabase
      .from("list_items")
      .select(
        "id, item_id, list_id, added_at, added_by_user_id, lists!inner(name, short_code)",
      )
      .gte("added_at", sinceIso)
      .order("added_at", { ascending: false })
      .limit(LOGBOOK_LIMIT),
  ]);

  if (bundlesRes.error) console.error("home_watch_bundles RPC failed", bundlesRes.error);
  if (addsRes.error) console.error("list_items recent-adds query failed", addsRes.error);

  const bundles = (bundlesRes.data ?? []) as BundleRow[];
  const adds = (addsRes.data ?? []) as unknown as AddRow[];
  if (bundles.length === 0 && adds.length === 0) return [];

  // Item meta covers BOTH event kinds — the items the bundles reference + the
  // items the adds reference directly.
  const itemIds = unique([
    ...bundles.map((b) => b.item_id),
    ...adds.map((a) => a.item_id),
  ]);
  const meta = await itemMeta(itemIds);

  // Profiles for every non-self actor mentioned (bundles OR adds), so the
  // feed reads as "@partner" instead of "Jemand".
  const coActorIds = unique([
    ...bundles
      .map((b) => b.actor_user_id)
      .filter((id) => id !== currentUserId),
    ...adds
      .map((a) => a.added_by_user_id)
      .filter((id): id is string => id !== null && id !== currentUserId),
  ]);
  const actorNames = await profileNames(coActorIds);

  const events: LogbookEvent[] = [];

  // ── Watch bundles (already clustered per (actor, item) server-side) ─────
  for (const b of bundles) {
    const m = meta.get(b.item_id);
    if (!m) continue;
    const isSelf = b.actor_user_id === currentUserId;
    events.push({
      kind: "watch",
      eventId: `w:${b.actor_user_id}:${b.item_id}:${b.min_episode}:${b.max_episode}:${b.last_watched_at}`,
      ts: b.last_watched_at,
      itemId: b.item_id,
      title: m.title,
      type: m.type,
      slug: m.slug,
      coverUrl: m.coverUrl,
      minEpisode: b.min_episode,
      maxEpisode: b.max_episode,
      episodeCount: b.episode_count,
      actorUserId: b.actor_user_id,
      actorName: isSelf ? null : actorNames.get(b.actor_user_id) ?? null,
      isSelf,
    });
  }

  // ── List adds ───────────────────────────────────────────────────────
  for (const a of adds) {
    if (!a.added_by_user_id || !a.lists) continue;
    const m = meta.get(a.item_id);
    if (!m) continue;
    const isSelf = a.added_by_user_id === currentUserId;
    events.push({
      kind: "list_add",
      eventId: `a:${a.id}`,
      ts: a.added_at,
      itemId: a.item_id,
      title: m.title,
      type: m.type,
      slug: m.slug,
      coverUrl: m.coverUrl,
      listId: a.list_id,
      listShortCode: a.lists.short_code,
      listName: a.lists.name,
      actorUserId: a.added_by_user_id,
      actorName: isSelf ? null : actorNames.get(a.added_by_user_id) ?? null,
      isSelf,
    });
  }

  events.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
  return events.slice(0, LOGBOOK_LIMIT);
}

// ── Helpers ─────────────────────────────────────────────────────────────

/** Distinct item_ids the caller has on lists with tracks_home=true. Items
 *  on archived lists (the per-user toggle) deliberately fall out of every
 *  home module — that's the whole point of the toggle. Exported because the
 *  calendar shares the exact same "what's on my home scope" definition. */
export async function trackedItemIds(): Promise<string[]> {
  // Lists this user is tracking on home. RLS already scopes list_members to
  // the caller; the .eq("tracks_home", true) filter is the per-user archive.
  const { data: memberships, error: mErr } = await supabase
    .from("list_members")
    .select("list_id")
    .eq("tracks_home", true);
  if (mErr) {
    console.error("list_members query failed", mErr);
    return [];
  }
  const listIds = (memberships ?? []).map((r) => r.list_id as string);
  if (listIds.length === 0) return [];

  const { data: items, error: iErr } = await supabase
    .from("list_items")
    .select("item_id")
    .in("list_id", listIds);
  if (iErr) {
    console.error("list_items query failed", iErr);
    return [];
  }
  return unique((items ?? []).map((r) => r.item_id as string));
}

export interface ItemMetaRow {
  title: string;
  type: MediaType;
  slug: string;
  coverUrl: string | null;
}

/** Batch fetch of item meta keyed by id. Returns an empty map for empty
 *  input so callers don't need a guard. Exported for reuse by the calendar
 *  query layer. */
export async function itemMeta(ids: string[]): Promise<Map<string, ItemMetaRow>> {
  const map = new Map<string, ItemMetaRow>();
  if (ids.length === 0) return map;
  const { data, error } = await supabase
    .from("items")
    .select("id, title, type, slug, cover_url")
    .in("id", ids);
  if (error) {
    console.error("items meta lookup failed", error);
    return map;
  }
  for (const r of data ?? []) {
    map.set(r.id as string, {
      title: r.title as string,
      type: r.type as MediaType,
      slug: r.slug as string,
      coverUrl: (r.cover_url as string | null) ?? null,
    });
  }
  return map;
}

/** Batch profile-name lookup for co-watcher display in the Logbuch.
 *  Prefers `@username` (mono handle), falls back to display_name, returns
 *  an empty map for empty input so callers don't need a guard. */
async function profileNames(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, username, display_name")
    .in("user_id", ids);
  if (error) {
    console.error("profiles lookup failed", error);
    return map;
  }
  for (const p of data ?? []) {
    const username = p.username as string | null;
    const displayName = p.display_name as string | null;
    const name = username ? `@${username}` : displayName ?? null;
    if (name) map.set(p.user_id as string, name);
  }
  return map;
}

/** Slim slug-only variant of itemMeta — used by continue_watching where
 *  the RPC already returns title + type + cover but not slug. */
async function slugMap(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const { data, error } = await supabase
    .from("items")
    .select("id, slug")
    .in("id", ids);
  if (error) {
    console.error("items slug lookup failed", error);
    return map;
  }
  for (const r of data ?? []) {
    map.set(r.id as string, r.slug as string);
  }
  return map;
}
