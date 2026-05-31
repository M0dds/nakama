/**
 * TMDB (The Movie Database) client — runs directly in the browser. TMDB sets
 * permissive CORS headers, so (unlike Steam) we can call it client-side just
 * like AniList. Auth is a v4 "API Read Access Token" (a long-lived bearer
 * token, NOT the legacy v3 `api_key` query param) read from
 * `VITE_TMDB_TOKEN` — see .env.local.
 *
 * Covers TV series (`searchTmdbSeries` + episode list) and movies
 * (`searchTmdbMovies`). Movies are episode-less: they carry only a release
 * date (stamped into items.metadata on add) and a binary seen-state in
 * item_history — no episode fetch, no detail page.
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
// Search — movies
// =========================================================================

interface RawMovieSearch {
  results?: Array<{
    id: number;
    title: string | null;
    original_title: string | null;
    release_date: string | null;
    poster_path: string | null;
  }>;
}

/** Search movies by title. Same shape as the series search, but `release_date`
 *  rides along on the result (→ items.metadata.releaseDate on add) so a film
 *  that's still upcoming can surface in "Was kommt". [] on any failure. */
export async function searchTmdbMovies(
  q: string,
  signal?: AbortSignal,
): Promise<MediaResult[]> {
  const json = await tmdbGet<RawMovieSearch>(
    "/search/movie",
    { query: q, include_adult: "false", page: "1" },
    signal,
  );
  const rows = json?.results ?? [];
  return rows.map((r) => ({
    source: "tmdb" as const,
    sourceId: String(r.id),
    type: "movie" as const,
    title: r.title || r.original_title || "Ohne Titel",
    year: yearOf(r.release_date),
    coverUrl: coverUrl(r.poster_path),
    format: null,
    // TMDB date-only → store as UTC midnight ISO, mirroring the series
    // air_date convention (no fabricated clock time; see format.ts).
    releaseDate: r.release_date
      ? new Date(r.release_date).toISOString()
      : null,
  }));
}

// =========================================================================
// Movie details — the film detail page (no episodes; rich metadata instead)
// =========================================================================

/** What the film detail page shows next to the seen-toggle. All fields are
 *  best-effort (null/[] when TMDB doesn't have them). Fetched live (not stored
 *  in the DB) — credits don't change, so TanStack's cache + a long staleTime
 *  is enough, and the items table stays lean. */
export interface TmdbCastMember {
  name: string;
  character: string | null;
  profileUrl: string | null; // headshot, or null when TMDB has none
}

export interface TmdbMovieDetails {
  overview: string | null;
  tagline: string | null;
  runtime: number | null; // minutes
  /** German release if TMDB has a DE entry (theatrical preferred), else the
   *  primary release (usually the earliest/US date). ISO 8601, UTC midnight. */
  releaseDate: string | null;
  /** German age rating (FSK), e.g. "16" — from the DE release_dates entry. */
  certification: string | null;
  genres: string[];
  directors: string[];
  cast: TmdbCastMember[]; // top-billed, in billing order
}

interface RawMovieDetail {
  overview: string | null;
  tagline?: string | null;
  runtime: number | null;
  release_date: string | null;
  genres?: Array<{ name: string }>;
  credits?: {
    crew?: Array<{ job: string; name: string }>;
    cast?: Array<{
      name: string;
      character: string | null;
      order: number;
      profile_path: string | null;
    }>;
  };
  release_dates?: {
    results?: Array<{
      iso_3166_1: string;
      release_dates?: Array<{
        type: number;
        release_date: string;
        certification?: string;
      }>;
    }>;
  };
}

const MAX_CAST = 8;

// Headshots are small (next to a name) → w185 is plenty and light.
const PROFILE_BASE = "https://image.tmdb.org/t/p/w185";
function profileUrl(path: string | null | undefined): string | null {
  return path ? `${PROFILE_BASE}${path}` : null;
}

/** German age rating (FSK), if TMDB has one in the DE release_dates entry.
 *  Certification rides per release_date row; we take the first non-empty one. */
function germanCertification(raw: RawMovieDetail): string | null {
  const de = raw.release_dates?.results?.find((r) => r.iso_3166_1 === "DE");
  const cert = (de?.release_dates ?? [])
    .map((d) => d.certification?.trim())
    .find((c) => c);
  return cert || null;
}

/** The German release date, if TMDB carries a DE entry. TMDB's flat
 *  `release_date` is the "primary" (often the earliest, i.e. the US date) — a
 *  film can be out in the US but not yet here (Backrooms: US done, DE 17 Jun).
 *  We pick the DE date, preferring theatrical (type 3) → theatrical-limited (2)
 *  → premiere (1) → whatever's earliest. Returns null when there's no DE row. */
function germanReleaseDate(raw: RawMovieDetail): string | null {
  const de = raw.release_dates?.results?.find((r) => r.iso_3166_1 === "DE");
  const dates = de?.release_dates ?? [];
  if (dates.length === 0) return null;
  const rank = (t: number) => (t === 3 ? 0 : t === 2 ? 1 : t === 1 ? 2 : 3);
  const best = [...dates].sort((a, b) => {
    const r = rank(a.type) - rank(b.type);
    return r !== 0 ? r : a.release_date.localeCompare(b.release_date);
  })[0];
  return best?.release_date ? new Date(best.release_date).toISOString() : null;
}

/** Fetch one movie's detail + credits + per-country release dates in a single
 *  round-trip (`append_to_response`). Returns null on failure / no token, so
 *  the detail page falls back to the bare seen-toggle without throwing. */
export async function fetchTmdbMovieDetails(
  sourceId: string,
): Promise<TmdbMovieDetails | null> {
  const id = Number(sourceId);
  if (!Number.isFinite(id)) return null;

  const d = await tmdbGet<RawMovieDetail>(`/movie/${id}`, {
    append_to_response: "credits,release_dates",
  });
  if (!d) return null;

  const directors = (d.credits?.crew ?? [])
    .filter((c) => c.job === "Director")
    .map((c) => c.name);
  const cast = [...(d.credits?.cast ?? [])]
    .sort((a, b) => a.order - b.order)
    .slice(0, MAX_CAST)
    .map((c) => ({
      name: c.name,
      character: c.character?.trim() || null,
      profileUrl: profileUrl(c.profile_path),
    }));

  return {
    overview: d.overview?.trim() || null,
    tagline: d.tagline?.trim() || null,
    runtime: d.runtime && d.runtime > 0 ? d.runtime : null,
    releaseDate:
      germanReleaseDate(d) ??
      (d.release_date ? new Date(d.release_date).toISOString() : null),
    certification: germanCertification(d),
    genres: (d.genres ?? []).map((g) => g.name),
    directors,
    cast,
  };
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
