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
 *  (gap limit also caps storage at 5000 episodes/item — anything past
 *  that is on the same wishlist as anilist.ts MAX_EPISODES) */
const TITLE_ENRICHMENT_VERSION = 3;
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

  // Title-fallback via Jikan (MyAnimeList). AniList's streamingEpisodes is
  // a moving window of ~60-150 entries provided by streaming services —
  // for long-running anime it misses both the very-early AND the very-
  // latest episodes. Jikan ships MAL's full catalogue. We only call it
  // when (a) we have a MAL id from AniList AND (b) there's at least one
  // released-but-titleless episode worth filling. Manga gets skipped —
  // Jikan's manga endpoint has chapters but not titles for them, and
  // MangaDex already handles the chapter-count fallback.
  if (item.type === "anime" && malId != null && hasAiredTitleGap(episodes)) {
    try {
      const jikanTitles = await fetchJikanEpisodeTitles(malId);
      if (jikanTitles.size > 0) {
        for (const ep of episodes) {
          if (ep.title === null) {
            const fromJikan = jikanTitles.get(ep.episodeNumber);
            if (fromJikan) ep.title = fromJikan;
          }
        }
      }
    } catch (err) {
      // Jikan is a best-effort enrichment — never block the store.
      console.error("Jikan episode-title fallback failed", err);
    }
  }

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
  // Stamp the fetch time even on empty results so we don't pound the API for
  // works that genuinely have no countable episodes yet (ongoing manga
  // before MangaDex picks them up, etc.). Persist malId so the one-time
  // backfill below doesn't need to re-query AniList for it. Bump the
  // titleEnrichmentVersion so the version gate in ensureEpisodes knows
  // this item has up-to-date title coverage (Jikan for anime, MangaDex
  // for manga — both run inside fetchAniListEpisodes by now).
  const now = new Date().toISOString();
  await supabase
    .from("items")
    .update({
      metadata: {
        ...item.metadata,
        ...(malId != null ? { malId } : {}),
        episodesFetchedAt: now,
        titleEnrichmentVersion: TITLE_ENRICHMENT_VERSION,
      },
    })
    .eq("id", item.id);
}

/**
 * One-time title backfill driven by the version-gate. For each type the
 * source is different (Jikan for anime, MangaDex for manga). Bulk-upserts
 * all gap titles in a single round-trip — the previous per-row UPDATE
 * loop timed out for shows like One Piece (1100+ gaps × ~100 ms ≈ 110 s)
 * and stamped "done" without actually filling anything.
 *
 * Anime: needs MAL id. Reads it from items.metadata.malId (populated by
 * storeEpisodes), or one-shot queries AniList when absent (items stored
 * before that stamp existed).
 *
 * Stamps `titleEnrichmentVersion` regardless of how many titles came back
 * so we don't retry the same lookup on every load. A future logic change
 * bumps the version and forces a re-run.
 */
async function enrichJikanTitles(item: ItemForFetch): Promise<void> {
  let malId =
    typeof item.metadata.malId === "number"
      ? (item.metadata.malId as number)
      : null;

  if (malId == null) {
    const ali = await fetchAniListEpisodes(item.sourceId, "anime");
    malId = ali.malId;
  }

  if (malId != null) {
    try {
      const titles = await fetchJikanEpisodeTitles(malId);
      if (titles.size > 0) {
        const { data: gaps } = await supabase
          .from("episodes")
          .select("episode_number")
          .eq("item_id", item.id)
          .is("title", null)
          .lte("air_date", new Date().toISOString())
          .limit(GAP_QUERY_LIMIT);
        // Build the update set as a single bulk upsert. The earlier
        // per-row UPDATE-by-id loop was a non-starter for shows like One
        // Piece (1100+ gaps × ~100 ms per round-trip ≈ 110 s, way past
        // any reasonable user wait — the browser tab would be killed
        // before the loop ever stamped `jikanEnrichedAt`, so the next
        // visit re-ran the same broken loop).
        const updates = (gaps ?? []).flatMap((g) => {
          const n = g.episode_number as number;
          const t = titles.get(n);
          if (!t) return [];
          return [
            {
              item_id: item.id,
              season_number: 1,
              episode_number: n,
              title: t,
            },
          ];
        });
        if (updates.length > 0) {
          await supabase
            .from("episodes")
            .upsert(updates, {
              onConflict: "item_id,season_number,episode_number",
            });
        }
      }
    } catch (err) {
      console.error("Jikan backfill failed", err);
    }
  }

  // Stamp even on failure — we'd rather skip retrying for an item with no
  // MAL link than pound the APIs on every visit. A future logic change
  // bumps TITLE_ENRICHMENT_VERSION and forces a re-run from this gate.
  await supabase
    .from("items")
    .update({
      metadata: {
        ...item.metadata,
        ...(malId != null ? { malId } : {}),
        titleEnrichmentVersion: TITLE_ENRICHMENT_VERSION,
      },
    })
    .eq("id", item.id);
}

/**
 * MangaDex chapter-title backfill — manga counterpart to enrichJikanTitles.
 * Coverage is much patchier than Jikan's (officially-licensed series have
 * uploads removed, weeklys often carry no title at all), so the resulting
 * map may be small. We stamp the version regardless to avoid retrying the
 * same lookup on every visit.
 */
async function enrichMangaDexTitles(item: ItemForFetch): Promise<void> {
  // Need the AniList title for the MangaDex lookup. items.title is the
  // canonical AniList title at insert time — fetch it once here.
  const { data: itemRow } = await supabase
    .from("items")
    .select("title")
    .eq("id", item.id)
    .maybeSingle();
  const title =
    typeof itemRow?.title === "string" ? (itemRow.title as string) : null;

  try {
    const titles = await fetchMangaDexChapterTitles(
      Number(item.sourceId),
      title,
    );
    if (titles.size > 0) {
      const { data: gaps } = await supabase
        .from("episodes")
        .select("episode_number")
        .eq("item_id", item.id)
        .is("title", null)
        .limit(GAP_QUERY_LIMIT);
      const updates = (gaps ?? []).flatMap((g) => {
        const n = g.episode_number as number;
        const t = titles.get(n);
        if (!t) return [];
        return [
          {
            item_id: item.id,
            season_number: 1,
            episode_number: n,
            title: t,
          },
        ];
      });
      if (updates.length > 0) {
        await supabase
          .from("episodes")
          .upsert(updates, {
            onConflict: "item_id,season_number,episode_number",
          });
      }
    }
  } catch (err) {
    console.error("MangaDex chapter-title backfill failed", err);
  }

  await supabase
    .from("items")
    .update({
      metadata: {
        ...item.metadata,
        titleEnrichmentVersion: TITLE_ENRICHMENT_VERSION,
      },
    })
    .eq("id", item.id);
}

/** True when there's at least one released episode (air_date in the past)
 *  with no title — the case Jikan can fill. Future episodes without titles
 *  aren't a Jikan job (MAL doesn't have unaired titles either). */
function hasAiredTitleGap(
  episodes: { title: string | null; airDate: string | null }[],
): boolean {
  const now = Date.now();
  for (const e of episodes) {
    if (e.title !== null) continue;
    if (!e.airDate) continue;
    const t = Date.parse(e.airDate);
    if (Number.isFinite(t) && t <= now) return true;
  }
  return false;
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
    if (item.type === "anime") await enrichJikanTitles(item);
    else if (item.type === "manga") await enrichMangaDexTitles(item);
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
 *  more). "Weitere laden" in the UI bumps the limit by another 26. The
 *  queryKey is `[...episodesQueryKey(type, slug), limit]` so each step is
 *  its own cache entry; invalidations target the prefix and clear all
 *  paginations at once. */
export function episodesQueryOptions(
  user: User,
  type: string,
  slug: string,
  limit: number = 26,
) {
  return {
    queryKey: [...episodesQueryKey(type, slug), limit] as const,
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

      // Now read: total + watched (head counts) + latest `limit` in parallel.
      const [totalRes, watchedRes, latestRes] = await Promise.all([
        supabase
          .from("episodes")
          .select("id", { count: "exact", head: true })
          .eq("item_id", item.id),
        supabase
          .from("episode_watches")
          .select("episode_id, episodes!inner(item_id)", {
            count: "exact",
            head: true,
          })
          .eq("user_id", user.id)
          .eq("episodes.item_id", item.id),
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
        const { data: w } = await supabase
          .from("episode_watches")
          .select("episode_id")
          .eq("user_id", user.id)
          .in("episode_id", visibleIds);
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

/** Single-tap toggle. Plain insert/delete on episode_watches — sync fan-out
 *  to other list members lands with Phase 7 via the toggle_episode_synced
 *  RPC. Idempotent in both directions (upsert on insert, eq-delete is a
 *  no-op when there's nothing to delete). */
export async function toggleEpisode(input: {
  episodeId: string;
  userId: string;
  watched: boolean;
}): Promise<void> {
  if (input.watched) {
    const { error } = await supabase
      .from("episode_watches")
      .upsert(
        { user_id: input.userId, episode_id: input.episodeId },
        { onConflict: "user_id,episode_id" },
      );
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("episode_watches")
      .delete()
      .eq("user_id", input.userId)
      .eq("episode_id", input.episodeId);
    if (error) throw error;
  }
}

/** Long-press cascade. Goes through the mark_episodes_watched RPC, which
 *  resolves the "all episodes ≤ upToEpisodeId" set server-side in one
 *  statement (faster than a client-side fan-out + N inserts, and the only
 *  path allowed to write other users' rows when sharing lands).
 *
 *  Pass _list_item_id=null for Phase 4 — sync fan-out is gated on a
 *  sync-enabled list_item, which Phase 7 introduces. */
export async function markEpisodesWatchedUpTo(input: {
  itemId: string;
  upToEpisodeId: string;
}): Promise<void> {
  const { error } = await supabase.rpc("mark_episodes_watched", {
    _item_id: input.itemId,
    _up_to_episode_id: input.upToEpisodeId,
    _list_item_id: null,
  });
  if (error) throw error;
}

/** Reset all of the caller's watch progress for one item via the
 *  reset_item_progress RPC — a set-based delete server-side, so it doesn't
 *  pull every episode id to the client first. */
export async function resetItemProgress(itemId: string): Promise<void> {
  const { error } = await supabase.rpc("reset_item_progress", {
    _item_id: itemId,
  });
  if (error) throw error;
}
