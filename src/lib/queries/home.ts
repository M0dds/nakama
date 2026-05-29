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
/** Raw watch rows pulled before bundling — needs to comfortably exceed any
 *  realistic cascade size so we don't truncate the middle of a session and
 *  end up with a misleading "first + last" pair like the One-Piece bug. */
const WATCH_FETCH = 250;
/** Hard cap on the final bundled feed (post-bundle). */
const LOGBOOK_LIMIT = 30;
/** Watches more than this apart start a new bundle. 6h matches Logbook. */
const SESSION_GAP_MS = 6 * 60 * 60 * 1000;

// ── Query options ───────────────────────────────────────────────────────

export function continueWatchingOptions(user: User) {
  return queryOptions({
    queryKey: continueWatchingKey(user.id),
    queryFn: () => fetchContinueWatching(user.id),
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
async function fetchContinueWatching(userId: string): Promise<ContinueItem[]> {
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
    newEpisodeSinceLastWatch(userId, itemIds),
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

/** Per-item check: did any episode air AFTER the user's most recent watch
 *  on that item? Returns the set of itemIds for which the answer is yes —
 *  i.e. "a new episode dropped since you last engaged with this".
 *
 *  Two parallel queries: (a) the user's watches over any episode of the
 *  given items, sorted newest-first; we take the first per item to derive
 *  max(watched_at). (b) released episodes for those items, sorted newest
 *  air_date first; first per item gives latest released. If (b) > (a),
 *  there's a "new since" → itemId in the set.
 *
 *  Items where the user is chronically behind (latest released aired
 *  before their last watch — e.g. they watched E5 yesterday but E40
 *  released a year ago) deliberately don't qualify. The badge is for
 *  "while you were away" not "you have a backlog". */
async function newEpisodeSinceLastWatch(
  userId: string,
  itemIds: string[],
): Promise<Set<string>> {
  if (itemIds.length === 0) return new Set();
  const nowIso = new Date().toISOString();

  const [watchesRes, episodesRes] = await Promise.all([
    supabase
      .from("episode_watches")
      .select("watched_at, episodes!inner(item_id)")
      .eq("user_id", userId)
      .in("episodes.item_id", itemIds)
      .order("watched_at", { ascending: false })
      .limit(2000),
    supabase
      .from("episodes")
      .select("item_id, air_date")
      .in("item_id", itemIds)
      .lte("air_date", nowIso)
      .order("air_date", { ascending: false })
      .limit(2000),
  ]);

  if (watchesRes.error) console.error("watches lookup failed", watchesRes.error);
  if (episodesRes.error) console.error("episodes lookup failed", episodesRes.error);

  // First entry per item wins because we sorted desc — that's the max.
  // PostgREST infers !inner embeds as arrays, but for N:1 relationships
  // (watch → episode) the runtime shape is a single object — cast through
  // unknown to suppress the false-positive type error.
  const lastWatchByItem = new Map<string, string>();
  for (const w of watchesRes.data ?? []) {
    const ep = w.episodes as unknown as { item_id: string } | null;
    if (!ep) continue;
    if (!lastWatchByItem.has(ep.item_id)) {
      lastWatchByItem.set(ep.item_id, w.watched_at as string);
    }
  }
  const latestReleasedByItem = new Map<string, string>();
  for (const e of episodesRes.data ?? []) {
    const itemId = e.item_id as string;
    const airDate = e.air_date as string | null;
    if (!airDate) continue;
    if (!latestReleasedByItem.has(itemId)) {
      latestReleasedByItem.set(itemId, airDate);
    }
  }

  const result = new Set<string>();
  for (const itemId of itemIds) {
    const lastW = lastWatchByItem.get(itemId);
    const lastR = latestReleasedByItem.get(itemId);
    // ISO 8601 strings sort lexicographically same as Date — direct compare.
    if (lastW && lastR && lastR > lastW) result.add(itemId);
  }
  return result;
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

interface WatchRow {
  id: string;
  watched_at: string;
  user_id: string;
  episode_id: string;
}

interface ResolvedWatch {
  watchId: string;
  watchedAt: string;
  userId: string;
  episodeNumber: number;
  itemId: string;
}

/** Cluster watches into sessions per (actor, item). Watches >SESSION_GAP_MS
 *  apart start a new bundle; the result is the (min, max, count, latest-ts)
 *  per cluster. Direct port of Logbook's bundleWatches — see comment block
 *  on LogbookEvent for the One-Piece motivation. */
function bundleWatches(
  rows: ResolvedWatch[],
): { min: number; max: number; count: number; ts: string }[] {
  const sorted = [...rows].sort((a, b) =>
    a.watchedAt < b.watchedAt ? -1 : a.watchedAt > b.watchedAt ? 1 : 0,
  );
  const out: { min: number; max: number; count: number; ts: string }[] = [];
  let cluster: ResolvedWatch[] = [];
  const flush = () => {
    if (cluster.length === 0) return;
    const nums = cluster.map((r) => r.episodeNumber);
    out.push({
      min: Math.min(...nums),
      max: Math.max(...nums),
      count: cluster.length,
      ts: cluster[cluster.length - 1].watchedAt, // latest in cluster
    });
    cluster = [];
  };
  for (const r of sorted) {
    const prev = cluster[cluster.length - 1];
    if (
      prev &&
      new Date(r.watchedAt).getTime() - new Date(prev.watchedAt).getTime() >
        SESSION_GAP_MS
    ) {
      flush();
    }
    cluster.push(r);
  }
  flush();
  return out;
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

  const [watchesRes, addsRes] = await Promise.all([
    supabase
      .from("episode_watches")
      .select("id, watched_at, user_id, episode_id")
      .gte("watched_at", sinceIso)
      .order("watched_at", { ascending: false })
      .limit(WATCH_FETCH),
    supabase
      .from("list_items")
      .select(
        "id, item_id, list_id, added_at, added_by_user_id, lists!inner(name, short_code)",
      )
      .gte("added_at", sinceIso)
      .order("added_at", { ascending: false })
      .limit(LOGBOOK_LIMIT),
  ]);

  if (watchesRes.error) console.error("episode_watches query failed", watchesRes.error);
  if (addsRes.error) console.error("list_items recent-adds query failed", addsRes.error);

  const watches = (watchesRes.data ?? []) as WatchRow[];
  const adds = (addsRes.data ?? []) as unknown as AddRow[];
  if (watches.length === 0 && adds.length === 0) return [];

  // Resolve episodes (for episode numbers + item ids). Only needed when
  // there are watch rows — list_add events reference the item directly.
  let epMap = new Map<string, { episodeNumber: number; itemId: string }>();
  if (watches.length > 0) {
    const episodeIds = [...new Set(watches.map((w) => w.episode_id))];
    const { data: eps, error: eErr } = await supabase
      .from("episodes")
      .select("id, episode_number, item_id")
      .in("id", episodeIds);
    if (eErr) console.error("episodes lookup failed", eErr);
    epMap = new Map(
      (eps ?? []).map((e) => [
        e.id as string,
        {
          episodeNumber: e.episode_number as number,
          itemId: e.item_id as string,
        },
      ]),
    );
  }

  // Item meta covers BOTH event kinds. Union the item ids the watches
  // resolve to + the items the adds reference directly.
  const itemIds = [
    ...new Set([
      ...[...epMap.values()].map((v) => v.itemId),
      ...adds.map((a) => a.item_id),
    ]),
  ];
  const meta = await itemMeta(itemIds);

  // Resolve + group watches by (actor, item) for SESSION_GAP_MS bundling.
  const resolved: ResolvedWatch[] = [];
  for (const w of watches) {
    const ep = epMap.get(w.episode_id);
    if (!ep) continue;
    if (!meta.has(ep.itemId)) continue;
    resolved.push({
      watchId: w.id,
      watchedAt: w.watched_at,
      userId: w.user_id,
      episodeNumber: ep.episodeNumber,
      itemId: ep.itemId,
    });
  }
  const watchGroups = new Map<string, ResolvedWatch[]>();
  for (const r of resolved) {
    const key = `${r.userId}::${r.itemId}`;
    const arr = watchGroups.get(key) ?? [];
    arr.push(r);
    watchGroups.set(key, arr);
  }

  // Profiles for every non-self actor mentioned (watches OR adds), so the
  // feed reads as "@partner" instead of "Jemand".
  const coActorIds = [
    ...new Set([
      ...[...watchGroups.keys()]
        .map((k) => k.split("::")[0])
        .filter((id) => id !== currentUserId),
      ...adds
        .map((a) => a.added_by_user_id)
        .filter((id): id is string => id !== null && id !== currentUserId),
    ]),
  ];
  const actorNames = await profileNames(coActorIds);

  const events: LogbookEvent[] = [];

  // ── Watch bundles ───────────────────────────────────────────────────
  for (const [key, items] of watchGroups) {
    const [userId, itemId] = key.split("::");
    const m = meta.get(itemId)!;
    const isSelf = userId === currentUserId;
    for (const b of bundleWatches(items)) {
      events.push({
        kind: "watch",
        eventId: `w:${userId}:${itemId}:${b.min}:${b.max}:${b.ts}`,
        ts: b.ts,
        itemId,
        title: m.title,
        type: m.type,
        slug: m.slug,
        coverUrl: m.coverUrl,
        minEpisode: b.min,
        maxEpisode: b.max,
        episodeCount: b.count,
        actorUserId: userId,
        actorName: isSelf ? null : actorNames.get(userId) ?? null,
        isSelf,
      });
    }
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
 *  home module — that's the whole point of the toggle. */
async function trackedItemIds(): Promise<string[]> {
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
  return [...new Set((items ?? []).map((r) => r.item_id as string))];
}

interface ItemMetaRow {
  title: string;
  type: MediaType;
  slug: string;
  coverUrl: string | null;
}

/** Batch fetch of item meta keyed by id. Returns an empty map for empty
 *  input so callers don't need a guard. */
async function itemMeta(ids: string[]): Promise<Map<string, ItemMetaRow>> {
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
