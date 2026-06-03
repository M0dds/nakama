/**
 * Steam (store) client. Unlike AniList/TMDB, Steam's store endpoints block
 * CORS, so the browser can't call them directly. We route through a proxy:
 *   - dev:  Vite proxies `/steam-store` → store.steampowered.com (vite.config)
 *   - prod: a Supabase Edge Function forwards the same path (supabase/functions/
 *           steam-proxy) — Phase 9, not deployed yet.
 * `steamApiUrl` picks the right base per `import.meta.env.DEV`.
 *
 * Covers game search (`searchSteamGames` via /api/storesearch) and game detail
 * (`fetchSteamGameDetails` via /api/appdetails). Games are episode-less: like
 * films they carry only a release date + a binary "played" state in
 * item_history — no episode fetch, no per-episode tracking.
 *
 * Results normalize into the shared `MediaResult` shape (src/lib/search.ts) so
 * Steam items slot into the same Supabase `items` rows next to AniList/TMDB.
 * NOTE: items.source must allow 'steam' — see migration 20260531210000.
 */

import type { MediaResult } from "@/lib/search";
import { supabase } from "@/lib/supabase";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// German store locale → German descriptions, prices, release strings.
const STORE_PARAMS = { l: "german", cc: "DE" };

/** Build the proxied URL for a Steam store endpoint (e.g. "storesearch",
 *  "appdetails"). Dev hits the Vite proxy; prod the Edge Function. */
function steamApiUrl(endpoint: string, params: Record<string, string>): string {
  const qs = new URLSearchParams({ ...STORE_PARAMS, ...params }).toString();
  if (import.meta.env.DEV) return `/steam-store/api/${endpoint}/?${qs}`;
  return `${SUPABASE_URL}/functions/v1/steam-proxy/${endpoint}?${qs}`;
}

async function steamGet<T>(
  endpoint: string,
  params: Record<string, string>,
  signal?: AbortSignal,
): Promise<T | null> {
  try {
    // The Edge Function authenticates the USER (auth.getUser), so prod calls
    // send the live session access_token as the bearer — NOT the anon key
    // (which would resolve to no user → 401). apikey stays the anon key for the
    // Supabase gateway. The Vite dev proxy ignores headers, so dev skips this.
    let headers: Record<string, string> | undefined;
    if (!import.meta.env.DEV) {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token ?? ANON_KEY ?? "";
      headers = { apikey: ANON_KEY ?? "", Authorization: `Bearer ${token}` };
    }
    const res = await fetch(steamApiUrl(endpoint, params), { headers, signal });
    if (!res.ok) return null;
    return (await res.json().catch(() => null)) as T | null;
  } catch {
    return null;
  }
}

/** The 616×353 store capsule — landscape key art, sharp enough to fill the
 *  detail-page cover column without upscaling (the 460px header would blur
 *  there). Built from the appid, served by Steam's CDN (plain image, no CORS).
 *  Note: on this CDN host `header.jpg` 301-redirects, but `capsule_616x353.jpg`
 *  resolves directly. */
function capsuleImage(appid: number): string {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/capsule_616x353.jpg`;
}

/** Render-time upgrade for game covers stored before we bumped the resolution:
 *  swaps a 460px `/header.jpg` for the 616px capsule. No-op for non-Steam URLs
 *  or ones already on the capsule. Mirrors anilist.ts → highResCover. */
export function steamHiResCover(url: string | null): string | null {
  if (!url) return url;
  return url.replace("/header.jpg", "/capsule_616x353.jpg");
}

// =========================================================================
// Search
// =========================================================================

interface RawStoreSearch {
  items?: Array<{
    id: number;
    name: string;
    tiny_image?: string;
  }>;
}

/** Search games by title via the store search endpoint. storesearch carries no
 *  release date (that needs appdetails → backfilled on the detail page, like
 *  films). [] on any failure so the AddSheet shows a clean empty state. */
export async function searchSteamGames(
  q: string,
  signal?: AbortSignal,
): Promise<MediaResult[]> {
  const json = await steamGet<RawStoreSearch>(
    "storesearch",
    { term: q },
    signal,
  );
  const rows = json?.items ?? [];
  return rows.map((r) => ({
    source: "steam" as const,
    sourceId: String(r.id),
    type: "game" as const,
    title: r.name || "Ohne Titel",
    year: null, // storesearch has no date; the detail page fills it in
    coverUrl: capsuleImage(r.id),
    format: null,
  }));
}

// =========================================================================
// Game details — the game detail page (no episodes; rich metadata instead)
// =========================================================================

/** What the game detail page shows next to the played-toggle. All fields are
 *  best-effort (null/[] when Steam doesn't have them). Fetched live (not
 *  stored): keeps the items table lean, TanStack's cache + long staleTime is
 *  enough since this rarely changes. */
export interface SteamScreenshot {
  thumb: string; // 600×338 — the thumbnail strip
  full: string; // 1920×1080 — the large preview
}

export interface SteamGameDetails {
  description: string | null; // short_description
  developers: string[];
  publishers: string[];
  genres: string[];
  screenshots: SteamScreenshot[];
  /** Localized human release string for display ("10. Okt. 2007", "Q2 2025",
   *  "Demnächst"). Steam has no structured date. */
  releaseDateRaw: string | null;
  /** ISO date IFF the raw string parses to a real calendar date — feeds "Was
   *  kommt" + the Heute/Morgen/Demnächst tag. null for fuzzy ("Q2 2025"). */
  releaseDate: string | null;
  comingSoon: boolean;
  metacritic: number | null;
}

interface RawAppDetails {
  [appid: string]: {
    success: boolean;
    data?: {
      short_description?: string;
      developers?: string[];
      publishers?: string[];
      genres?: Array<{ description: string }>;
      screenshots?: Array<{
        id: number;
        path_thumbnail?: string;
        path_full?: string;
      }>;
      release_date?: { coming_soon?: boolean; date?: string };
      metacritic?: { score?: number };
    };
  };
}

// Steam returns up to ~15 shots; cap so the strip stays reasonable.
const MAX_SCREENSHOTS = 12;

/** Try to turn Steam's localized release string into an ISO date. Steam has no
 *  structured field — only a display string that may be exact ("10. Okt. 2007")
 *  or fuzzy ("Q2 2025", "2025", "Demnächst"). We parse the exact German
 *  "DD. Mon. YYYY" form (the common released-game case) and bail to null on
 *  anything fuzzy — the detail page still shows the raw string either way. */
const DE_MONTHS: Record<string, number> = {
  jan: 0, feb: 1, "mär": 2, mar: 2, apr: 3, mai: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, okt: 9, nov: 10, dez: 11,
};
function parseSteamDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = raw
    .trim()
    .toLowerCase()
    .match(/^(\d{1,2})\.\s*([a-zä]+)\.?\s*(\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = DE_MONTHS[m[2].slice(0, 3)];
  const year = Number(m[3]);
  if (month === undefined || !Number.isFinite(day) || !Number.isFinite(year))
    return null;
  // UTC midnight, mirroring the TMDB date-only convention (no fabricated time).
  return new Date(Date.UTC(year, month, day)).toISOString();
}

/** Fetch one game's details. Returns null on failure / unknown app, so the
 *  detail page falls back to the bare played-toggle without throwing. */
export async function fetchSteamGameDetails(
  sourceId: string,
): Promise<SteamGameDetails | null> {
  const id = Number(sourceId);
  if (!Number.isFinite(id)) return null;

  const json = await steamGet<RawAppDetails>("appdetails", {
    appids: String(id),
  });
  const entry = json?.[String(id)];
  if (!entry?.success || !entry.data) return null;
  const d = entry.data;

  const raw = d.release_date?.date?.trim() || null;
  return {
    description: d.short_description?.trim() || null,
    developers: d.developers ?? [],
    publishers: d.publishers ?? [],
    genres: (d.genres ?? []).map((g) => g.description),
    screenshots: (d.screenshots ?? [])
      .filter((s) => s.path_thumbnail && s.path_full)
      .slice(0, MAX_SCREENSHOTS)
      .map((s) => ({ thumb: s.path_thumbnail!, full: s.path_full! })),
    releaseDateRaw: raw,
    releaseDate: parseSteamDate(raw),
    comingSoon: d.release_date?.coming_soon ?? false,
    metacritic:
      typeof d.metacritic?.score === "number" ? d.metacritic.score : null,
  };
}
