/**
 * TMDB (The Movie Database) client — runs directly in the browser. TMDB sets
 * permissive CORS headers, so (unlike Steam) we can call it client-side just
 * like AniList. Auth is a v4 "API Read Access Token" (a long-lived bearer
 * token, NOT the legacy v3 `api_key` query param) read from
 * `VITE_TMDB_TOKEN` — see .env.local.
 *
 * Phase "Serien": this module covers TV series only. Movies (same source,
 * but no episodes → item_history status control) land in the next sub-step;
 * the search shape is already movie-ready (`type` widened to MediaType).
 *
 * Results are normalized into the shared `MediaResult` shape (src/lib/search.ts)
 * so the same item rows slot into the shared Supabase DB next to AniList ones.
 */

import type { MediaResult } from "@/lib/search";

const TOKEN = import.meta.env.VITE_TMDB_TOKEN as string | undefined;
const BASE = "https://api.themoviedb.org/3";

// German UI → German metadata. TMDB localizes titles + episode names per
// `language`; where a show has no localized data it returns the original,
// so this is a safe default (worst case: an English episode title).
const LANG = "de-DE";

// TMDB image CDN. w780 is a good middle: sharp enough for the Was-kommt hero
// card, still a fraction of `original`'s weight on the 48px list thumbnails.
const IMG_BASE = "https://image.tmdb.org/t/p/w780";

// Defensive caps, mirroring anilist.ts — a runaway show can't insert an
// unbounded number of rows or fan out into hundreds of season round-trips.
const MAX_EPISODES = 2000;
const MAX_SEASONS = 60;

function coverUrl(posterPath: string | null | undefined): string | null {
  return posterPath ? `${IMG_BASE}${posterPath}` : null;
}

function yearOf(date: string | null | undefined): number | null {
  if (!date) return null;
  const y = Number(date.slice(0, 4));
  return Number.isFinite(y) && y > 1800 ? y : null;
}

async function tmdbGet<T>(
  path: string,
  params: Record<string, string> = {},
  signal?: AbortSignal,
): Promise<T | null> {
  if (!TOKEN) {
    // No key configured → behave like a source with zero hits, so the app
    // still works (AniList carries search) and nothing throws. One console
    // hint rather than a per-request spam.
    warnOnce();
    return null;
  }
  const qs = new URLSearchParams({ language: LANG, ...params });
  try {
    const res = await fetch(`${BASE}${path}?${qs}`, {
      headers: { Authorization: `Bearer ${TOKEN}`, accept: "application/json" },
      signal,
    });
    if (!res.ok) return null;
    return (await res.json().catch(() => null)) as T | null;
  } catch {
    return null;
  }
}

let warned = false;
function warnOnce(): void {
  if (warned) return;
  warned = true;
  console.warn(
    "[tmdb] VITE_TMDB_TOKEN is not set — TV series search is disabled. " +
      "Add the token to .env.local and restart the dev server.",
  );
}

// =========================================================================
// Search — TV series
// =========================================================================

interface RawTvSearch {
  results?: Array<{
    id: number;
    name: string | null;
    original_name: string | null;
    first_air_date: string | null;
    poster_path: string | null;
  }>;
}

/** Search TV series by title. Returns normalized MediaResults (source "tmdb",
 *  type "series"). [] on any failure so the AddSheet renders a clean empty
 *  state — the user just keeps typing. */
export async function searchTmdbSeries(
  q: string,
  signal?: AbortSignal,
): Promise<MediaResult[]> {
  const json = await tmdbGet<RawTvSearch>(
    "/search/tv",
    { query: q, include_adult: "false", page: "1" },
    signal,
  );
  const rows = json?.results ?? [];
  return rows.map((r) => ({
    source: "tmdb" as const,
    sourceId: String(r.id),
    type: "series" as const,
    title: r.name || r.original_name || "Ohne Titel",
    year: yearOf(r.first_air_date),
    coverUrl: coverUrl(r.poster_path),
    format: null,
  }));
}

// =========================================================================
// Episode list — populated lazily on first item-detail view
// (see queries/episodes.ts → storeEpisodes dispatch).
// =========================================================================

/** Normalized episode, structurally identical to AniListEpisode so it flows
 *  through the same `episodes` upsert in queries/episodes.ts. TMDB carries
 *  real season numbers (AniList is always season 1), and the episodes table's
 *  (item_id, season_number, episode_number) key keeps multi-season shows
 *  unambiguous. */
export interface TmdbEpisode {
  seasonNumber: number;
  episodeNumber: number;
  title: string | null;
  airDate: string | null; // ISO 8601, or null when unknown / unaired
}

interface RawTvDetail {
  seasons?: Array<{
    season_number: number;
    episode_count: number;
  }>;
}

interface RawSeasonDetail {
  episodes?: Array<{
    season_number: number;
    episode_number: number;
    name: string | null;
    air_date: string | null;
  }>;
}

/** Drop TMDB's generic "Episode 12" / "Folge 12" placeholder names → null,
 *  so the UI shows its proper "Titel noch nicht bekannt" fallback instead of
 *  a meaningless label. Real titles pass through untouched. */
function realTitle(name: string | null): string | null {
  if (!name) return null;
  const t = name.trim();
  if (!t) return null;
  if (/^(episode|folge|ep\.?)\s*\d+$/i.test(t)) return null;
  return t;
}

/**
 * Fetch the full episode list for one TMDB series. One round-trip for the
 * series detail (to learn its seasons), then one per season in parallel.
 * Specials (season 0) are skipped — they clutter the list and rarely map to
 * a viewing order. Returns [] on failure / genuinely-unknown structure.
 */
export async function fetchTmdbSeriesEpisodes(
  sourceId: string,
): Promise<TmdbEpisode[]> {
  const id = Number(sourceId);
  if (!Number.isFinite(id)) return [];

  const detail = await tmdbGet<RawTvDetail>(`/tv/${id}`);
  if (!detail) return [];

  const seasons = (detail.seasons ?? [])
    .filter((s) => s.season_number >= 1 && s.episode_count > 0)
    .slice(0, MAX_SEASONS);
  if (seasons.length === 0) return [];

  const perSeason = await Promise.all(
    seasons.map((s) =>
      tmdbGet<RawSeasonDetail>(`/tv/${id}/season/${s.season_number}`),
    ),
  );

  const episodes: TmdbEpisode[] = [];
  for (const season of perSeason) {
    for (const e of season?.episodes ?? []) {
      if (episodes.length >= MAX_EPISODES) break;
      episodes.push({
        seasonNumber: e.season_number,
        episodeNumber: e.episode_number,
        title: realTitle(e.name),
        airDate: e.air_date ? new Date(e.air_date).toISOString() : null,
      });
    }
  }
  return episodes;
}
