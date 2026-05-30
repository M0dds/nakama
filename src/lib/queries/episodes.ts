import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";
import { fetchAniListEpisodes } from "@/lib/anilist";
import { fetchJikanEpisodeTitles } from "@/lib/jikan";
import { fetchMangaDexChapterTitles } from "@/lib/mangadex";

/**
 * Episodes data layer. The `episodes` and `episode_watches` tables live in
 * the shared Supabase schema (inherited from Logbook). Episodes are
 * populated lazily — the first time someone opens an item detail page (or
 * 12 h after the last fetch), we pull the list from AniList, upsert it
 * into `episodes`, and stamp `items.metadata.episodesFetchedAt` so we don't
 * hammer the API on every view.
 *
 * The query in this module returns three things in one shot:
 *   - the latest 12 episodes (descending: newest on top)
 *   - the true total episode count (head-count, so it's exact past PostgREST's
 *     1000-row read cap — relevant for shows like One Piece)
 *   - the caller's true watched count (same trick)
 *
 * Per-episode watched flags are joined in for the visible window only — full
 * watch-state for older episodes loads when the older-pages UI lands.
 */

// ──────────────────────────────────────────────────────────────────────────
// Types + keys
// ──────────────────────────────────────────────────────────────────────────

export interface EpisodeRow {
  id: string;
  seasonNumber: number;
  episodeNumber: number;
  title: string | null;
  airDate: string | null;
  watched: boolean;
}

export interface EpisodePayload {
  episodes: EpisodeRow[]; // latest 12, descending
  total: number;
  watched: number;
  /** False for items we can't (yet) fetch episodes for — caller renders an
   *  informative placeholder instead of an empty list. */
  fetchable: boolean;
}

export const episodesQueryKey = (type: string, slug: string) =>
  ["episodes", type, slug] as const;

/** Types that carry an episode list. Movies / games → item_history (Phase 4-
 *  late). Series → TMDB integration (later phase). */
const EPISODIC_TYPES = new Set(["anime", "manga", "series"]);

const STALE_MS = 1000 * 60 * 60 * 12; // 12 h — re-fetch ongoing schedules

/** Bumped whenever the title-enrichment logic changes (Jikan for anime,
 *  MangaDex for manga). Items stored under an older version trigger a
 *  one-time re-enrichment on the next visit — independent of STALE_MS, so
 *  we don't have to wait 12 h for fixes to propagate. Version history:
 *    1 — initial Jikan enrichment (had a per-row UPDATE loop that timed
 *        out on long shows like One Piece, leaving titles unfilled but
 *        still stamping "done")
 *    2 — bulk-upsert + MangaDex chapter-title fallback
 *    3 — explicit 5000-row limit on the gap query — without it PostgREST
 *        capped the SELECT at 1000 rows, so on One Piece (1100+ gaps)
 *        the newest ~100 episodes silently went unfilled even though
 *        Jikan returned their titles
 *    4 — gap query includes NULL-air-date episodes (was `.lte(air_date,now)`,
 *        which silently dropped them) — finished/old shows like Naruto carry
 *        no air dates on AniList, so they found zero gaps and never got Jikan
 *        titles. Bump re-enriches every item once with the fixed query.
 *  (gap limit also caps storage at 5000 episodes/item — anything past
 *  that is on the same wishlist as anilist.ts MAX_EPISODES) */
const TITLE_ENRICHMENT_VERSION = 4;
/** Cap for the gap-detection SELECT. PostgREST's implicit default is 1000
 *  which silently lopped off the tail of long-running shows on the v2
 *  enrichment — we explicitly request more so the bulk-upsert below sees
 *  every gap that needs filling. */
const GAP_QUERY_LIMIT = 5000;

// ──────────────────────────────────────────────────────────────────────────
// Lazy fetch + upsert
// ──────────────────────────────────────────────────────────────────────────

interface ItemForFetch {
  id: string;
  source: string;
  sourceId: string;
  type: string;
  metadata: Record<string, unknown>;
}

function isFetchable(item: ItemForFetch): boolean {
  return (
    item.source === "anilist" &&
    (item.type === "anime" || item.type === "manga")
  );
}

async function storeEpisodes(item: ItemForFetch): Promise<void> {
  const { episodes, malId } = await fetchAniListEpisodes(
    item.sourceId,
    item.type as "anime" | "manga",
  );

  if (episodes.length > 0) {
    await supabase.from("episodes").upsert(
      episodes.map((e) => ({
        item_id: item.id,
        season_number: e.seasonNumber,
        episode_number: e.episodeNumber,
        title: e.title,
        air_date: e.airDate,
      })),
      { onConflict: "item_id,season_number,episode_number" },
    );
  }

  // Fill missing titles through the SAME backfill path the version gate
  // uses (was a duplicated inline Jikan loop here — C4). Only anime needs
  // the explicit call: fetchAniListEpisodes already runs MangaDex for manga
  // above, so a second pass would just re-fetch the same patchy coverage.
  // Carry the fresh malId in so the Jikan path skips re-querying AniList.
  const withMal: ItemForFetch = {
    ...item,
    metadata: { ...item.metadata, ...(malId != null ? { malId } : {}) },
  };
  const enrich: EnrichResult =
    item.type === "anime"
      ? await enrichTitles(withMal)
      : { ok: true, malId };

  // Single metadata write: episodesFetchedAt always (gates the 12 h re-
  // store, even on empty results so we don't pound the API for works with
  // no countable episodes yet); titleEnrichmentVersion only when enrichment
  // didn't transiently fail (B3 — a transient miss leaves the gate open so
  // the next visit retries via ensureEpisodes); resolved malId persisted so
  // future runs skip the AniList lookup.
  await stampEnrichment(item, {
    bumpVersion: enrich.ok,
    malId: enrich.malId ?? malId,
    touchFetchedAt: true,
  });
}

// ──────────────────────────────────────────────────────────────────────────
// Title enrichment — shared gap-backfill core + per-source wrappers
// ──────────────────────────────────────────────────────────────────────────

interface EnrichResult {
  /** True when the source lookup completed without throwing — including the
   *  permanent-miss case (no MAL link, no MangaDex match). False ONLY on a
   *  transient API error (network / rate-limit / 5xx), which leaves the
   *  version gate open so the next visit retries. */
  ok: boolean;
  /** A freshly-resolved MAL id worth persisting, or null. Existing
   *  metadata.malId is preserved by the spread in stampEnrichment either
   *  way — this only carries a NEW resolution forward. */
  malId: number | null;
}

/** Aired/untitled gap episode-numbers for one item. `airedOnly` restricts to
 *  released episodes — MAL has no unaired titles either, so for anime an
 *  unaired gap isn't fillable. Manga passes false: chapters carry no air-date
 *  release model. Bounded by GAP_QUERY_LIMIT so long shows don't hit
 *  PostgREST's implicit 1000-row default (the v2-enrichment tail-loss bug). */
async function selectTitleGaps(
  itemId: string,
  airedOnly: boolean,
): Promise<number[]> {
  let q = supabase
    .from("episodes")
    .select("episode_number")
    .eq("item_id", itemId)
    .is("title", null);
  if (airedOnly) {
    // Fillable = aired OR no-air-date. Finished/old shows (Naruto, Bleach)
    // carry NULL air dates on AniList, but MAL HAS their titles — so we must
    // include NULL here and only EXCLUDE known-future episodes. The previous
    // `.lte("air_date", now)` dropped NULL rows too, so those shows found zero
    // gaps → never fetched Jikan → titles stayed empty + the version gate
    // closed. Mirrors the `(air_date is null or air_date <= now())` guard the
    // mark/backfill RPCs use.
    q = q.or(`air_date.is.null,air_date.lte.${new Date().toISOString()}`);
  }
  const { data } = await q.limit(GAP_QUERY_LIMIT);
  return (data ?? []).map((g) => g.episode_number as number);
}

/** Bulk-upsert titles for the given gap episode-numbers. Single round-trip —
 *  the per-row UPDATE-by-id loop this replaced was a non-starter for shows
 *  like One Piece (1100+ gaps × ~100 ms ≈ 110 s; the tab got killed before
 *  it ever committed, so the next visit re-ran the same broken loop). */
async function writeTitles(
  itemId: string,
  gaps: number[],
  titles: Map<number, string>,
): Promise<void> {
  const updates = gaps.flatMap((n) => {
    const t = titles.get(n);
    if (!t) return [];
    return [{ item_id: itemId, season_number: 1, episode_number: n, title: t }];
  });
  if (updates.length > 0) {
    await supabase
      .from("episodes")
      .upsert(updates, { onConflict: "item_id,season_number,episode_number" });
  }
}

/** Persist enrichment metadata in one write. Bumps titleEnrichmentVersion
 *  only when `bumpVersion`; carries a freshly-resolved malId forward;
 *  touches episodesFetchedAt on the store path. Skips the write entirely
 *  when there's nothing to persist (transient failure with no new malId). */
async function stampEnrichment(
  item: ItemForFetch,
  opts: { bumpVersion: boolean; malId?: number | null; touchFetchedAt?: boolean },
): Promise<void> {
  const extra: Record<string, unknown> = {};
  if (opts.malId != null) extra.malId = opts.malId;
  if (opts.bumpVersion) extra.titleEnrichmentVersion = TITLE_ENRICHMENT_VERSION;
  if (opts.touchFetchedAt) extra.episodesFetchedAt = new Date().toISOString();
  if (Object.keys(extra).length === 0) return;
  await supabase
    .from("items")
    .update({ metadata: { ...item.metadata, ...extra } })
    .eq("id", item.id);
}

/**
 * Shared title-backfill core. Cheap gap check FIRST — skip the external API
 * entirely when nothing's missing (the common case on freshly-stored items
 * whose AniList/MangaDex pass already covered every gap; also subsumes the
 * old `hasAiredTitleGap` short-circuit). Then fetch from the source and bulk-
 * fill. Returns `ok: false` only on a transient throw so the caller leaves
 * the version gate open; a successful lookup that finds nothing still
 * returns ok (retrying won't help until the logic — and version — changes).
 */
async function backfillTitles(
  item: ItemForFetch,
  opts: {
    label: string;
    airedOnly: boolean;
    fetchTitles: () => Promise<{ titles: Map<number, string>; malId: number | null }>;
  },
): Promise<EnrichResult> {
  try {
    const gaps = await selectTitleGaps(item.id, opts.airedOnly);
    if (gaps.length === 0) return { ok: true, malId: null };
    const { titles, malId } = await opts.fetchTitles();
    if (titles.size > 0) await writeTitles(item.id, gaps, titles);
    return { ok: true, malId };
  } catch (err) {
    console.error(`${opts.label} title backfill failed`, err);
    return { ok: false, malId: null };
  }
}

/** Anime → Jikan (MyAnimeList) episode titles. AniList's streamingEpisodes
 *  is a moving ~60-150 entry window from streaming services that misses both
 *  the very-early and very-latest episodes of long shows; Jikan ships MAL's
 *  full catalogue. Resolves the MAL id from metadata, or one-shot from
 *  AniList for items stored before the malId stamp existed. */
function enrichAnime(item: ItemForFetch): Promise<EnrichResult> {
  return backfillTitles(item, {
    label: "Jikan",
    airedOnly: true,
    fetchTitles: async () => {
      let malId =
        typeof item.metadata.malId === "number"
          ? (item.metadata.malId as number)
          : null;
      if (malId == null) {
        const ali = await fetchAniListEpisodes(item.sourceId, "anime");
        malId = ali.malId;
      }
      if (malId == null) return { titles: new Map(), malId: null };
      return { titles: await fetchJikanEpisodeTitles(malId), malId };
    },
  });
}

/** Manga → MangaDex chapter titles via the AniList-id bridge. Coverage is
 *  patchier than Jikan's (officially-licensed series have uploads removed,
 *  weeklys often carry no title), so the map may be small — best-effort.
 *  Needs the AniList title (items.title) for the lookup. */
function enrichManga(item: ItemForFetch): Promise<EnrichResult> {
  return backfillTitles(item, {
    label: "MangaDex",
    airedOnly: false,
    fetchTitles: async () => {
      const { data: itemRow } = await supabase
        .from("items")
        .select("title")
        .eq("id", item.id)
        .maybeSingle();
      const title =
        typeof itemRow?.title === "string" ? (itemRow.title as string) : null;
      const titles = await fetchMangaDexChapterTitles(Number(item.sourceId), title);
      return { titles, malId: null };
    },
  });
}

/** Dispatch title enrichment by type. Other types resolve to a no-op ok
 *  result (shouldn't reach here — callers gate on anime/manga). */
function enrichTitles(item: ItemForFetch): Promise<EnrichResult> {
  if (item.type === "anime") return enrichAnime(item);
  if (item.type === "manga") return enrichManga(item);
  return Promise.resolve({ ok: true, malId: null });
}

/** Populate episodes from AniList the first time (or after STALE_MS). Only
 *  for fetchable items — others are no-ops. When the stored data is still
 *  fresh but its title-enrichment version is older than the current logic
 *  (TITLE_ENRICHMENT_VERSION), trigger a one-time backfill so existing
 *  items pick up the missing-title coverage without waiting for the 12 h
 *  stale window. */
async function ensureEpisodes(item: ItemForFetch): Promise<void> {
  if (!isFetchable(item)) return;
  const at = item.metadata.episodesFetchedAt;
  const fetchedAt = typeof at === "string" ? Date.parse(at) : NaN;
  const isFresh = Number.isFinite(fetchedAt) && Date.now() - fetchedAt < STALE_MS;

  if (!isFresh) {
    await storeEpisodes(item);
    return;
  }

  const v = item.metadata.titleEnrichmentVersion;
  const enrichedVersion = typeof v === "number" ? v : 0;
  if (enrichedVersion < TITLE_ENRICHMENT_VERSION) {
    // One-time backfill for items stored under older enrichment logic.
    // bumpVersion gates on a non-transient run so a network blip doesn't
    // permanently silence the retry (B3); the gate stays open until a
    // lookup actually completes.
    const { ok, malId } = await enrichTitles(item);
    await stampEnrichment(item, { bumpVersion: ok, malId });
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Query options
// ──────────────────────────────────────────────────────────────────────────

/** Episode payload for /item/:type/:slug. Triggers a lazy AniList fetch
 *  the first time + after 12 h. Empty + fetchable:false for non-episodic
 *  items.
 *
 *  `limit` controls how many of the latest episodes are returned (default
 *  26 — roughly one cour, fits most ongoing anime without needing to load
 *  more). "Weitere laden" in the UI bumps the limit by another 26.
 *
 *  `instanceListItemId` selects the progress lane (sync-instances model):
 *    - null   → GLOBAL progress (`episode_watches.list_item_id IS NULL`) —
 *               Home / Calendar / search / non-synced lists / the global item
 *               page all read this lane.
 *    - <LI>   → that synced list_item's INSTANCE (`list_item_id = <LI>`) — the
 *               list-scoped item page passes it only when sync is actually on.
 *  The explicit IS NULL matters once instances exist: without it a synced
 *  instance elsewhere would leak its rows into the global watched count.
 *
 *  The queryKey is `[...episodesQueryKey(type, slug), limit, instanceListItemId]`
 *  so each pagination step AND each lane is its own cache entry; invalidations
 *  target the prefix and clear all of them at once. */
export function episodesQueryOptions(
  user: User,
  type: string,
  slug: string,
  limit: number = 26,
  instanceListItemId: string | null = null,
) {
  return {
    queryKey: [
      ...episodesQueryKey(type, slug),
      limit,
      instanceListItemId,
    ] as const,
    queryFn: async (): Promise<EpisodePayload> => {
      // Resolve the item via the natural key — we need its UUID for the
      // episodes/episode_watches joins (foreign-keyed on items.id) and the
      // source/sourceId/metadata for the lazy fetch decision.
      const { data: itemData } = await supabase
        .from("items")
        .select("id, source, source_id, type, metadata")
        .eq("type", type)
        .eq("slug", slug)
        .maybeSingle();

      if (!itemData) {
        return { episodes: [], total: 0, watched: 0, fetchable: false };
      }

      const item: ItemForFetch = {
        id: itemData.id as string,
        source: itemData.source as string,
        sourceId: itemData.source_id as string,
        type: itemData.type as string,
        metadata: (itemData.metadata as Record<string, unknown>) ?? {},
      };

      const fetchable = isFetchable(item);

      if (!EPISODIC_TYPES.has(item.type)) {
        return { episodes: [], total: 0, watched: 0, fetchable };
      }

      await ensureEpisodes(item);

      // Watched-count head query, scoped to the active progress lane (global
      // NULL rows, or this synced instance's rows). Built up first so the
      // lane filter applies before it joins the parallel batch below.
      const watchedHead = supabase
        .from("episode_watches")
        .select("episode_id, episodes!inner(item_id)", {
          count: "exact",
          head: true,
        })
        .eq("user_id", user.id)
        .eq("episodes.item_id", item.id);

      // Now read: total + watched (head counts) + latest `limit` in parallel.
      const [totalRes, watchedRes, latestRes] = await Promise.all([
        supabase
          .from("episodes")
          .select("id", { count: "exact", head: true })
          .eq("item_id", item.id),
        instanceListItemId
          ? watchedHead.eq("list_item_id", instanceListItemId)
          : watchedHead.is("list_item_id", null),
        supabase
          .from("episodes")
          .select("id, season_number, episode_number, title, air_date")
          .eq("item_id", item.id)
          .order("season_number", { ascending: false })
          .order("episode_number", { ascending: false })
          .limit(limit),
      ]);

      const total = totalRes.count ?? 0;
      const watched = watchedRes.count ?? 0;

      const latestRows = (latestRes.data ?? []) as Array<{
        id: string;
        season_number: number;
        episode_number: number;
        title: string | null;
        air_date: string | null;
      }>;

      // Watch state for just the visible window (a second-only roundtrip is
      // cheap and avoids embedding the join in the head-count query above).
      const visibleIds = latestRows.map((e) => e.id);
      let watchedSet = new Set<string>();
      if (visibleIds.length > 0) {
        const visibleWatch = supabase
          .from("episode_watches")
          .select("episode_id")
          .eq("user_id", user.id)
          .in("episode_id", visibleIds);
        const { data: w } = await (instanceListItemId
          ? visibleWatch.eq("list_item_id", instanceListItemId)
          : visibleWatch.is("list_item_id", null));
        watchedSet = new Set(
          (w ?? []).map((r) => (r as { episode_id: string }).episode_id),
        );
      }

      return {
        episodes: latestRows.map((e) => ({
          id: e.id,
          seasonNumber: e.season_number,
          episodeNumber: e.episode_number,
          title: e.title,
          airDate: e.air_date,
          watched: watchedSet.has(e.id),
        })),
        total,
        watched,
        fetchable,
      };
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Mutations
// ──────────────────────────────────────────────────────────────────────────

/** Single-tap toggle, via the instance-aware set_episode_watch RPC.
 *
 *  `listItemId` carries the list context when the item was opened from a list
 *  row (the list-scoped item page); omit it on the global item page / Home /
 *  Calendar. The RPC picks the lane server-side:
 *    - null OR a non-synced list_item → GLOBAL lane (own `list_item_id IS NULL`
 *      row, NO fan-out — global progress is per-user even inside a shared,
 *      non-synced list).
 *    - a synced list_item → that INSTANCE's row + fan-out to the list's members
 *      (sync = a shared watch-through from 0).
 *  So the caller just passes its list_item_id (if any) and lets the RPC decide.
 *
 *  Deliberately no `.select()`/row-count check (HEALTH B2): the RPC returns
 *  void and the operation is idempotent, so 0 affected rows is ambiguous, not
 *  an error — errors still throw. */
export async function toggleEpisode(input: {
  itemId: string;
  episodeId: string;
  watched: boolean;
  listItemId?: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc("set_episode_watch", {
    _item_id: input.itemId,
    _episode_id: input.episodeId,
    _watched: input.watched,
    _list_item_id: input.listItemId ?? null,
  });
  if (error) throw error;
}

/** Long-press cascade ("bis hier alles"), via the instance-aware
 *  mark_episodes_watched_upto RPC: it resolves the "all episodes ≤
 *  upToEpisodeId" set server-side in one statement and branches on the SAME
 *  global-vs-instance rule as set_episode_watch (see there). `listItemId` is
 *  the list context when opened from a list row; omit on the global item page. */
export async function markEpisodesWatchedUpTo(input: {
  itemId: string;
  upToEpisodeId: string;
  listItemId?: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc("mark_episodes_watched_upto", {
    _item_id: input.itemId,
    _up_to_episode_id: input.upToEpisodeId,
    _list_item_id: input.listItemId ?? null,
  });
  if (error) throw error;
}

/** Reset the caller's watch progress for one item via the reset_progress RPC —
 *  a set-based delete server-side, so it doesn't pull every episode id to the
 *  client first. Resets the GLOBAL lane by default; pass a synced `listItemId`
 *  to reset just that instance (caller-only either way). */
export async function resetItemProgress(
  itemId: string,
  listItemId?: string | null,
): Promise<void> {
  const { error } = await supabase.rpc("reset_progress", {
    _item_id: itemId,
    _list_item_id: listItemId ?? null,
  });
  if (error) throw error;
}
