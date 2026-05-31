/**
 * Unified media search — the provider-agnostic boundary the AddSheet talks to.
 * The AddSheet's media-type filter picks ONE type at a time, and `searchMedia`
 * routes to the single source that owns it: AniList for anime/manga, TMDB for
 * series (movies next), Steam for games (next). Routing by type — rather than
 * querying everything and interleaving — keeps results un-mixed (the whole
 * point of the filter) and avoids hitting providers the user didn't ask for.
 *
 * `addItemToList` (queries/items.ts) reads `result.source` to stamp items.source
 * — that's why the field is part of the normalized shape rather than implicit.
 */

import { searchAniList } from "@/lib/anilist";
import { searchTmdbSeries, searchTmdbMovies } from "@/lib/tmdb";
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
  /** ISO release date — movies only (TMDB `release_date`). Stamped into
   *  items.metadata.releaseDate on add so "Was kommt" can surface a film
   *  that hasn't come out yet (films are episode-less → no air_date row). */
  releaseDate?: string | null;
}

/** Search the single source that owns `type`. Returns [] for types whose
 *  source isn't wired yet (movie → TMDB movies, game → Steam) — the AddSheet
 *  disables those filter labels, so this is just a forward-safe default. */
export async function searchMedia(
  q: string,
  type: MediaType,
  signal?: AbortSignal,
): Promise<MediaResult[]> {
  switch (type) {
    case "anime":
      return (await searchAniList(q, signal, "ANIME")).map((r) => ({
        ...r,
        source: "anilist" as const,
      }));
    case "manga":
      return (await searchAniList(q, signal, "MANGA")).map((r) => ({
        ...r,
        source: "anilist" as const,
      }));
    case "series":
      return searchTmdbSeries(q, signal);
    case "movie":
      return searchTmdbMovies(q, signal);
    default:
      // game — source (Steam) not implemented yet.
      return [];
  }
}
