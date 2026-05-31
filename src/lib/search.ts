/**
 * Unified media search — the provider-agnostic boundary the AddSheet talks to.
 * Each source (AniList for anime/manga, TMDB for series; Steam for games next)
 * normalizes into one `MediaResult` shape, and `searchMedia` fans out to all
 * of them and interleaves the hits so no single source gets buried.
 *
 * `addItemToList` (queries/items.ts) reads `result.source` to stamp items.source
 * — that's why the field is part of the normalized shape rather than implicit.
 */

import { searchAniList } from "@/lib/anilist";
import { searchTmdbSeries } from "@/lib/tmdb";
import type { MediaType } from "@/lib/queries/home";

export type MediaSource = "anilist" | "tmdb" | "steam";

/** Normalized search hit. Shape is the AniList result widened with an explicit
 *  `source` discriminator and the full MediaType union (AniList → anime/manga,
 *  TMDB → series, later movie/game). */
export interface MediaResult {
  source: MediaSource;
  sourceId: string; // provider-native id, stringified → items.source_id
  type: MediaType;
  title: string;
  year: number | null;
  coverUrl: string | null;
  format: string | null; // AniList format (TV/MOVIE/…) or null → items.metadata
}

/** Total hits shown across all sources. The per-source queries already cap
 *  themselves (AniList perPage 12, TMDB page 1 ≈ 20); this bounds the merged
 *  list so the panel stays scannable. */
const MAX_RESULTS = 16;

/** Round-robin interleave: one from each source in turn until exhausted.
 *  Keeps both anime and series visible near the top instead of concatenating
 *  (which would bury the second source below a full page of the first). */
function interleave<T>(lists: T[][]): T[] {
  const out: T[] = [];
  const max = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < max; i++) {
    for (const list of lists) {
      if (i < list.length) out.push(list[i]);
    }
  }
  return out;
}

/** Search every source in parallel and return interleaved, capped results.
 *  A source that throws/aborts contributes nothing (Promise.allSettled) rather
 *  than failing the whole search — so e.g. a missing TMDB token still leaves
 *  AniList search fully working. */
export async function searchMedia(
  q: string,
  signal?: AbortSignal,
): Promise<MediaResult[]> {
  const settled = await Promise.allSettled([
    searchAniList(q, signal).then((rows) =>
      rows.map((r) => ({ ...r, source: "anilist" as const })),
    ),
    searchTmdbSeries(q, signal),
  ]);

  const lists = settled.map((s) =>
    s.status === "fulfilled" ? s.value : [],
  );
  return interleave(lists).slice(0, MAX_RESULTS);
}
