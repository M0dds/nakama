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
  /** Season of the next (current) episode. Multi-season works (TMDB series)
   *  carry real seasons; AniList anime/manga are always season 1. The next
   *  episode is the lowest unwatched-released (season, episode), so on a
   *  multi-season show the UI shows "S2 · E03" instead of an ambiguous "E03". */
  nextSeason: number;
  nextEpisode: number;
  /** Title of the next (current) episode, when the data source has it —
   *  surfaced in the Fortsetzen row so "E07" reads as "E07 · <title>".
   *  Null for data gaps (old anime, patchy manga chapters). */
  nextEpisodeTitle: string | null;
  /** How many released-but-unwatched episodes within the last 14 days — the
   *  SAME window + count the /lists row badge uses, so Fortsetzen and the list
   *  agree (badge shown when > 0, pluralized when > 1). A chronic backlog stays
   *  quiet because those episodes aired outside the window. */
  newEpisodeCount: number;
  /** Convenience: newEpisodeCount > 0. */
  hasNewEpisode: boolean;
  /** Sync-instances: set for an INSTANCE entry — the synced list_item this row
   *  tracks, plus its list for the label + the list-scoped link. null for a
   *  global entry (the regular per-user progress). */
  listItemId: string | null;
  listShortCode: string | null;
  listName: string | null;
}

/** Was kommt — the next release per tracked item, soonest first. Episodic
 *  items carry an episodeNumber; movies (a single dated release) don't. */
export interface UpcomingItem {
  itemId: string;
  title: string;
  type: MediaType;
  slug: string;
  coverUrl: string | null;
  /** Episodic items only — the next episode's number. Absent for movies. */
  episodeNumber?: number;
  airDate: string; // ISO — episode air date, or a movie's release date
}

/** Logbuch — a discriminated union of factual events. Four kinds:
 *
 *  - watch              : a bundled watch session ("Du hast E37–E1163 gesehen"),
 *                         clustered by SESSION_GAP_MS so cascades collapse to one row
 *  - list_add           : someone (you or a co-member) put an item into a list. For
 *                         shared lists co-members see each other's adds; for private
 *                         lists RLS scopes it down to the caller's own adds.
 *  - missed             : the latest released-but-unticked episode of a tracked item
 *                         (within MISSED_DAYS) — an actionable "you're behind" nudge
 *                         carrying a quick-tick (cascade-catch-up) target.
 *  - ownership_transfer : a logged list ownership handover on a list you're in.
 *
 *  The display label for `actor` uses "@username" first, then display_name,
 *  then null (component falls back to "Jemand"). For self-events actorName
 *  is null — the UI substitutes "Du". */
export type LogbookEvent =
  | WatchBundle
  | ListAddEvent
  | MissedEvent
  | TransferEvent;

/** Common to every event — the sort key + actor attribution. */
interface BaseLogbookEvent {
  eventId: string; // stable key
  ts: string; // ISO — sort key
  actorUserId: string;
  actorName: string | null;
  /** Co-member actor's profile picture for the feed's left-slot avatar. Null
   *  for self-events and the actor-less `missed` nudge (those keep a bare
   *  kind icon). */
  actorAvatarUrl: string | null;
  isSelf: boolean;
}

/** The item-centric events (everything but ownership_transfer) carry the item
 *  identity for the inline link + cover. */
interface ItemLogbookEvent extends BaseLogbookEvent {
  itemId: string;
  title: string;
  type: MediaType;
  slug: string;
  coverUrl: string | null;
}

export interface WatchBundle extends ItemLogbookEvent {
  kind: "watch";
  minEpisode: number;
  maxEpisode: number;
  episodeCount: number;
}

export interface ListAddEvent extends ItemLogbookEvent {
  kind: "list_add";
  listId: string;
  listShortCode: string;
  listName: string;
}

/** missed — the most recent released episode of a tracked item the caller
 *  hasn't ticked. `episodeId` is the quick-tick (cascade-catch-up) target,
 *  `ts` its air_date. Never a self-action — isSelf is always false so the
 *  "Eigene ausblenden" toggle leaves it visible. */
export interface MissedEvent extends ItemLogbookEvent {
  kind: "missed";
  episodeId: string;
  episodeNumber: number;
}

/** ownership_transfer — a list handover, list-centric (no item). `isSelf` is
 *  true when the caller initiated it; `recipientIsMe` flips the sentence to
 *  "… an dich übergeben". */
export interface TransferEvent extends BaseLogbookEvent {
  kind: "ownership_transfer";
  listId: string;
  listShortCode: string;
  listName: string;
  recipientName: string | null;
  recipientIsMe: boolean;
}

// ── Tunables ────────────────────────────────────────────────────────────

const CONTINUE_LIMIT = 50;
/** Window for the Was-kommt section — includes today, 14 calendar days out. */
const UPCOMING_DAYS = 14;
/** How far back the Logbuch reaches. */
const LOGBOOK_DAYS = 30;
/** Tighter window for the "you're behind" missed nudge — an episode that aired
 *  longer ago than this stops being a fresh prompt. */
const MISSED_DAYS = 14;
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
    queryFn: async (): Promise<UpcomingItem[]> => {
      const itemIds = await trackedItemIds();
      if (itemIds.length === 0) return [];
      // Episodes (next 14 days) + unreleased movies & games (any future date),
      // merged and sorted soonest-first into one "Was kommt" stream.
      const [eps, dated] = await Promise.all([
        fetchUpcomingEpisodes(itemIds),
        fetchUpcomingDated(itemIds),
      ]);
      return [...eps, ...dated].sort((a, b) =>
        a.airDate.localeCompare(b.airDate),
      );
    },
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
  slug: string;
  title: string;
  type: MediaType;
  cover_url: string | null;
  total_episodes: number;
  watched_episodes: number;
  next_season: number;
  next_episode: number;
  last_watched_at: string;
  new_episode_count: number;
  list_item_id: string | null;
  list_short_code: string | null;
  list_name: string | null;
}

/** Fortsetzen via the Nakama-specific `home_continue_watching` RPC (sync-
 *  instances). It returns BOTH the global per-user entries AND one extra entry
 *  per active sync instance (labelled with its list), all ranked by recency
 *  server-side — so 1000+-episode shows don't trip the PostgREST row cap. slug,
 *  has_new_episode and the list fields come back inline, so the only follow-up
 *  is the batched next-episode title lookup.
 *
 *  `nextEpisode` is the next UNwatched (released) episode's number; the
 *  component renders it as "E07" / "Kap. 12". An instance entry carries
 *  listItemId/listShortCode/listName so the row links into the list-scoped item
 *  page and shows the list name. */
async function fetchContinueWatching(): Promise<ContinueItem[]> {
  const { data, error } = await supabase.rpc("home_continue_watching", {
    _limit: CONTINUE_LIMIT,
  });
  if (error) {
    console.error("home_continue_watching RPC failed", error);
    return [];
  }
  const rows = (data ?? []) as ContinueRow[];
  if (rows.length === 0) return [];

  const nextTitles = await nextEpisodeTitles(
    rows.map((r) => ({
      itemId: r.item_id,
      season: r.next_season,
      episode: r.next_episode,
    })),
  );

  return rows.map((r) => ({
    itemId: r.item_id,
    title: r.title,
    type: r.type,
    slug: r.slug,
    coverUrl: r.cover_url,
    total: r.total_episodes,
    watched: r.watched_episodes,
    nextSeason: r.next_season,
    nextEpisode: r.next_episode,
    nextEpisodeTitle:
      nextTitles.get(`${r.item_id}:${r.next_season}:${r.next_episode}`) ?? null,
    newEpisodeCount: r.new_episode_count,
    hasNewEpisode: r.new_episode_count > 0,
    listItemId: r.list_item_id,
    listShortCode: r.list_short_code,
    listName: r.list_name,
  }));
}

/** Was kommt — first upcoming release inside the 14-day window per tracked
 *  item, ascending air_date. Three-step fetch (tracked-list ids → matching
 *  episodes → enrich with item meta) because we can't safely express the
 *  "first per item" reduction in a single PostgREST request. */
async function fetchUpcomingEpisodes(
  itemIds: string[],
): Promise<UpcomingItem[]> {
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

/** Unreleased episode-less items in the tracked lists, by their release date.
 *  Movies (TMDB DE release) and games (Steam release) are episode-less: the
 *  date lives in items.metadata.releaseDate (stamped on add / backfilled on the
 *  detail page). No upper window — an item stays in "Was kommt" until it's out,
 *  then drops off (start = local midnight today, so a release today counts). */
async function fetchUpcomingDated(
  itemIds: string[],
): Promise<UpcomingItem[]> {
  if (itemIds.length === 0) return [];

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const { data, error } = await supabase
    .from("items")
    .select("id, title, type, slug, cover_url, metadata")
    .in("id", itemIds)
    .in("type", ["movie", "game"])
    .gte("metadata->>releaseDate", start.toISOString());
  if (error) {
    console.error("upcoming dated-items query failed", error);
    return [];
  }

  return (data ?? []).flatMap((r) => {
    const rel = (r.metadata as Record<string, unknown> | null)?.releaseDate;
    if (typeof rel !== "string") return [];
    return [
      {
        itemId: r.id as string,
        title: r.title as string,
        type: r.type as MediaType,
        slug: r.slug as string,
        coverUrl: (r.cover_url as string | null) ?? null,
        airDate: rel,
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

interface TransferRow {
  id: string;
  list_id: string;
  from_user_id: string | null;
  to_user_id: string | null;
  transferred_at: string;
  lists: { name: string; short_code: string } | null;
}

/** One candidate for a `missed` event — a released episode of a tracked item,
 *  before the watched-state filter narrows it to the actually-unticked ones. */
interface MissedCandidate {
  episodeId: string;
  itemId: string;
  episodeNumber: number;
  airDate: string;
}

/** The latest released-but-unticked episode per tracked item that the caller
 *  has ALREADY STARTED, within the missed window. Three round-trips: the
 *  released episodes in the window, the caller's own watches among them, then
 *  a started-check.
 *
 *  episode_watches RLS spans own + co-member rows, so we filter to the caller
 *  explicitly — a co-member's tick must NOT clear the caller's own nudge. */
async function fetchMissedCandidates(
  itemIds: string[],
  currentUserId: string,
  sinceIso: string,
): Promise<MissedCandidate[]> {
  if (itemIds.length === 0) return [];
  const nowIso = new Date().toISOString();
  const { data: eps, error } = await supabase
    .from("episodes")
    .select("id, item_id, episode_number, air_date")
    .in("item_id", itemIds)
    .gte("air_date", sinceIso)
    .lte("air_date", nowIso)
    .order("air_date", { ascending: false })
    .limit(5000);
  if (error) {
    console.error("missed episodes query failed", error);
    return [];
  }
  const recent = (eps ?? []) as {
    id: string;
    item_id: string;
    episode_number: number;
    air_date: string;
  }[];
  if (recent.length === 0) return [];

  const { data: watched, error: wErr } = await supabase
    .from("episode_watches")
    .select("episode_id")
    .eq("user_id", currentUserId)
    // Home is a GLOBAL surface — the missed nudge reads the global lane only,
    // so a synced instance's catch-up doesn't silence the global prompt.
    .is("list_item_id", null)
    .in(
      "episode_id",
      recent.map((e) => e.id),
    )
    .limit(5000);
  if (wErr) {
    console.error("missed watch-state query failed", wErr);
    return [];
  }
  const watchedSet = new Set((watched ?? []).map((r) => r.episode_id as string));

  // One entry per item: its latest released, still-unticked episode. recent[]
  // is descending air_date, so the first unwatched hit per item is the latest.
  // A cascade-catch-up to that episode then clears any older gaps too.
  const byItem = new Map<string, MissedCandidate>();
  for (const e of recent) {
    if (watchedSet.has(e.id) || byItem.has(e.item_id)) continue;
    byItem.set(e.item_id, {
      episodeId: e.id,
      itemId: e.item_id,
      episodeNumber: e.episode_number,
      airDate: e.air_date,
    });
  }
  const candidateItemIds = [...byItem.keys()];
  if (candidateItemIds.length === 0) return [];

  // Keep only items the caller has actually STARTED (≥1 watch on any episode).
  // A freshly-added, never-watched show would otherwise surface its latest
  // episode as "missed" — and the Abhaken quick-tick would cascade-tick its
  // whole back-catalogue. "missed" is a catch-up nudge for shows you're behind
  // on, not a start-watching prompt. Scoped to the (few) candidate items, so
  // the row count stays small.
  const { data: startedRows, error: sErr } = await supabase
    .from("episode_watches")
    .select("episodes!inner(item_id)")
    .eq("user_id", currentUserId)
    // Global lane only — "started" means started GLOBALLY; a synced-instance
    // tick shouldn't count as having begun the item on Home.
    .is("list_item_id", null)
    .in("episodes.item_id", candidateItemIds)
    .limit(5000);
  if (sErr) {
    console.error("missed started-check query failed", sErr);
    return [];
  }
  const startedSet = new Set<string>();
  for (const row of startedRows ?? []) {
    const emb = (row as {
      episodes: { item_id: string } | { item_id: string }[] | null;
    }).episodes;
    const itemId = Array.isArray(emb) ? emb[0]?.item_id : emb?.item_id;
    if (itemId) startedSet.add(itemId);
  }

  return candidateItemIds
    .filter((id) => startedSet.has(id))
    .map((id) => byItem.get(id)!);
}

/** Logbuch — recent activity across visible lists, newest first. RLS does
 *  the heavy lifting: episode_watches, list_items and list_ownership_transfers
 *  all scope to lists the caller is a member of, so co-member ticks, co-member
 *  adds and transfers in shared lists land automatically. Private lists return
 *  only the caller's own rows because they're the only member.
 *
 *  Four kinds: bundled-watch sessions (SESSION_GAP_MS clustered), list_add
 *  ("X hat <item> zu <list> hinzugefügt"), missed (latest released-but-unticked
 *  episode of a tracked item, with a quick-tick CTA) and ownership_transfer. */
async function fetchRecentlyTicked(currentUserId: string): Promise<LogbookEvent[]> {
  const sinceIso = new Date(Date.now() - LOGBOOK_DAYS * 86_400_000).toISOString();
  const missedSinceIso = new Date(
    Date.now() - MISSED_DAYS * 86_400_000,
  ).toISOString();

  // trackedItemIds (home scope) feeds the missed query; it's independent of the
  // activity sources so it rides in the same fan-out.
  const [trackedIds, bundlesRes, addsRes, transfersRes] = await Promise.all([
    trackedItemIds(),
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
    supabase
      .from("list_ownership_transfers")
      .select(
        "id, list_id, from_user_id, to_user_id, transferred_at, lists!inner(name, short_code)",
      )
      .gte("transferred_at", sinceIso)
      .order("transferred_at", { ascending: false })
      .limit(LOGBOOK_LIMIT),
  ]);

  if (bundlesRes.error) console.error("home_watch_bundles RPC failed", bundlesRes.error);
  if (addsRes.error) console.error("list_items recent-adds query failed", addsRes.error);
  if (transfersRes.error)
    console.error("list_ownership_transfers query failed", transfersRes.error);

  const bundles = (bundlesRes.data ?? []) as BundleRow[];
  const adds = (addsRes.data ?? []) as unknown as AddRow[];
  const transfers = (transfersRes.data ?? []) as unknown as TransferRow[];

  // Missed depends on the tracked-item scope, so it can't ride the fan-out
  // above; it's its own (cheap, windowed) two-query step.
  const missed = await fetchMissedCandidates(
    trackedIds,
    currentUserId,
    missedSinceIso,
  );

  if (
    bundles.length === 0 &&
    adds.length === 0 &&
    transfers.length === 0 &&
    missed.length === 0
  )
    return [];

  // Item meta covers every item-centric kind — bundles, adds, and missed.
  const itemIds = unique([
    ...bundles.map((b) => b.item_id),
    ...adds.map((a) => a.item_id),
    ...missed.map((m) => m.itemId),
  ]);
  const meta = await itemMeta(itemIds);

  // Profiles for every non-self actor mentioned (bundles, adds, or either side
  // of a transfer), so the feed reads as "@partner" instead of "Jemand".
  const coActorIds = unique([
    ...bundles
      .map((b) => b.actor_user_id)
      .filter((id) => id !== currentUserId),
    ...adds
      .map((a) => a.added_by_user_id)
      .filter((id): id is string => id !== null && id !== currentUserId),
    ...transfers
      .flatMap((t) => [t.from_user_id, t.to_user_id])
      .filter((id): id is string => id !== null && id !== currentUserId),
  ]);
  const actors = await actorProfiles(coActorIds);

  const events: LogbookEvent[] = [];

  // ── Watch bundles (already clustered per (actor, item) server-side) ─────
  for (const b of bundles) {
    const m = meta.get(b.item_id);
    if (!m) continue;
    const isSelf = b.actor_user_id === currentUserId;
    const actor = isSelf ? undefined : actors.get(b.actor_user_id);
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
      actorName: actor?.name ?? null,
      actorAvatarUrl: actor?.avatarUrl ?? null,
      isSelf,
    });
  }

  // ── List adds ───────────────────────────────────────────────────────
  for (const a of adds) {
    if (!a.added_by_user_id || !a.lists) continue;
    const m = meta.get(a.item_id);
    if (!m) continue;
    const isSelf = a.added_by_user_id === currentUserId;
    const actor = isSelf ? undefined : actors.get(a.added_by_user_id);
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
      actorName: actor?.name ?? null,
      actorAvatarUrl: actor?.avatarUrl ?? null,
      isSelf,
    });
  }

  // ── Missed (latest released-but-unticked episode per tracked item) ──────
  for (const c of missed) {
    const m = meta.get(c.itemId);
    if (!m) continue;
    events.push({
      kind: "missed",
      eventId: `m:${c.episodeId}`,
      ts: c.airDate,
      itemId: c.itemId,
      title: m.title,
      type: m.type,
      slug: m.slug,
      coverUrl: m.coverUrl,
      episodeId: c.episodeId,
      episodeNumber: c.episodeNumber,
      actorUserId: currentUserId,
      actorName: null,
      actorAvatarUrl: null,
      isSelf: false,
    });
  }

  // ── Ownership transfers ─────────────────────────────────────────────────
  for (const t of transfers) {
    if (!t.lists) continue;
    const isFromMe = t.from_user_id === currentUserId;
    const isToMe = t.to_user_id === currentUserId;
    const initiator = isFromMe || !t.from_user_id
      ? undefined
      : actors.get(t.from_user_id);
    events.push({
      kind: "ownership_transfer",
      eventId: `t:${t.id}`,
      ts: t.transferred_at,
      listId: t.list_id,
      listShortCode: t.lists.short_code,
      listName: t.lists.name,
      actorUserId: t.from_user_id ?? "",
      actorName: initiator?.name ?? null,
      actorAvatarUrl: initiator?.avatarUrl ?? null,
      isSelf: isFromMe,
      recipientName:
        isToMe || !t.to_user_id ? null : actors.get(t.to_user_id)?.name ?? null,
      recipientIsMe: isToMe,
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

/** Display label + avatar for one co-member actor. */
interface ActorProfile {
  /** display_name preferred, then "@username", else null (→ UI falls back
   *  to "Jemand"). */
  name: string | null;
  avatarUrl: string | null;
}

/** Batch actor-profile lookup for co-member attribution in the Logbuch —
 *  the @handle/display name plus the avatar for the feed's left-slot face.
 *  Returns an empty map for empty input so callers don't need a guard. */
async function actorProfiles(
  ids: string[],
): Promise<Map<string, ActorProfile>> {
  const map = new Map<string, ActorProfile>();
  if (ids.length === 0) return map;
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, username, display_name, avatar_url")
    .in("user_id", ids);
  if (error) {
    console.error("profiles lookup failed", error);
    return map;
  }
  for (const p of data ?? []) {
    const username = p.username as string | null;
    const displayName = p.display_name as string | null;
    map.set(p.user_id as string, {
      // Display name preferred app-wide; @handle is the fallback.
      name: displayName ?? (username ? `@${username}` : null),
      avatarUrl: (p.avatar_url as string | null) ?? null,
    });
  }
  return map;
}

/** Titles for specific (item, season, episode) triples — the "current" episode
 *  per Fortsetzen row. MUST include the season: on a multi-season series
 *  episode_number resets per season (S1E6 and S2E6 both exist), so an
 *  episode_number-only match would pull an arbitrary season's title. PostgREST
 *  can't express a compound-key IN, so we over-fetch on the cross product of
 *  item_ids × seasons × episode_numbers and pick the exact triples client-side.
 *  The candidate set is small (continue list capped at CONTINUE_LIMIT); the
 *  explicit .limit() guards the 1000-row cap regardless. Keyed
 *  `${itemId}:${season}:${episode}`. */
async function nextEpisodeTitles(
  pairs: { itemId: string; season: number; episode: number }[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (pairs.length === 0) return map;
  const itemIds = unique(pairs.map((p) => p.itemId));
  const seasons = unique(pairs.map((p) => p.season));
  const numbers = unique(pairs.map((p) => p.episode));
  const { data, error } = await supabase
    .from("episodes")
    .select("item_id, season_number, episode_number, title")
    .in("item_id", itemIds)
    .in("season_number", seasons)
    .in("episode_number", numbers)
    .limit(5000);
  if (error) {
    console.error("next-episode titles lookup failed", error);
    return map;
  }
  for (const r of data ?? []) {
    const title = r.title as string | null;
    if (title)
      map.set(`${r.item_id}:${r.season_number}:${r.episode_number}`, title);
  }
  return map;
}
