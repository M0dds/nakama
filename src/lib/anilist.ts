/**
 * AniList GraphQL client — runs directly in the browser. AniList allows
 * cross-origin requests without auth and rate-limits at 90 req/min, plenty
 * for live search-as-you-type from a SPA. No API key, no proxy needed.
 *
 * Shape mirrors Logbook 1:1 so the same item rows slot into the shared
 * Supabase DB across both apps. AniList covers anime + manga (the MVP
 * source); TMDB / TVMaze / IGDB land later through the same `AniListResult`
 * normalized shape.
 */

import { fetchMangaDexChapterCount } from "@/lib/mangadex";

export interface AniListResult {
  sourceId: string; // AniList media id, stringified → items.source_id
  type: "anime" | "manga";
  title: string;
  year: number | null;
  coverUrl: string | null;
  format: string | null; // TV / MOVIE / OVA / MANGA / NOVEL … → items.metadata
}

const ENDPOINT = "https://graphql.anilist.co";

const SEARCH_QUERY = `
  query ($q: String) {
    Page(perPage: 12) {
      media(search: $q, sort: SEARCH_MATCH, isAdult: false) {
        id
        type
        format
        seasonYear
        startDate { year }
        title { english romaji native }
        coverImage { large medium }
      }
    }
  }
`;

interface RawMedia {
  id: number;
  type: "ANIME" | "MANGA";
  format: string | null;
  seasonYear: number | null;
  startDate: { year: number | null } | null;
  title: {
    english: string | null;
    romaji: string | null;
    native: string | null;
  } | null;
  coverImage: { large: string | null; medium: string | null } | null;
}

/** Search anime + manga by title. Returns [] on network / parse failure so
 *  callers can render a clean empty state without a separate error path —
 *  the user can just keep typing. */
export async function searchAniList(
  q: string,
  signal?: AbortSignal,
): Promise<AniListResult[]> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ query: SEARCH_QUERY, variables: { q } }),
      signal,
    });
  } catch {
    return [];
  }
  if (!res.ok) return [];

  const json = (await res.json().catch(() => null)) as {
    data?: { Page?: { media?: RawMedia[] } };
  } | null;
  const media = json?.data?.Page?.media ?? [];

  return media.map((m) => ({
    sourceId: String(m.id),
    type: m.type === "MANGA" ? "manga" : "anime",
    title:
      m.title?.english ||
      m.title?.romaji ||
      m.title?.native ||
      "Ohne Titel",
    year: m.seasonYear ?? m.startDate?.year ?? null,
    coverUrl: m.coverImage?.large || m.coverImage?.medium || null,
    format: m.format ?? null,
  }));
}

// =========================================================================
// Episode list — populated lazily on first item-detail view (see queries/
// episodes.ts).
// =========================================================================

/** Normalized episode, mapped 1:1 into the episodes table. seasonNumber is
 *  always 1 — AniList anime is single-season and manga chapters are flat. */
export interface AniListEpisode {
  seasonNumber: number;
  episodeNumber: number;
  title: string | null;
  airDate: string | null; // ISO 8601, or null when unknown / unreleased
}

// Defensive cap so a 1000+ episode work (One Piece…) can't insert a runaway
// number of rows. Tracking still works up to the cap.
const MAX_EPISODES = 2000;
// AniList caps airingSchedule at 25 entries/page; we page through it to
// collect dates. Bounds the paging for shows with very long schedules.
const MAX_SCHEDULE_PAGES = 20;

const MEDIA_QUERY = `
  query ($id: Int) {
    Media(id: $id) {
      id
      type
      episodes
      chapters
      title { romaji english native }
      nextAiringEpisode { episode airingAt }
      airingSchedule(perPage: 25, page: 1) {
        pageInfo { lastPage }
        nodes { episode airingAt }
      }
      streamingEpisodes { title thumbnail site }
    }
  }
`;

const SCHEDULE_PAGE_QUERY = `
  query ($id: Int, $page: Int) {
    Media(id: $id) {
      airingSchedule(perPage: 25, page: $page) {
        nodes { episode airingAt }
      }
    }
  }
`;

interface RawAiringNode {
  episode: number | null;
  airingAt: number | null; // unix seconds
}

interface RawStreamingEpisode {
  title: string | null;
  thumbnail: string | null;
  site: string | null;
}

async function anilistRequest(
  query: string,
  variables: Record<string, unknown>,
): Promise<unknown> {
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch {
    return null;
  }
}

/** AniList stores streamingEpisodes as e.g.
 *    "Episode 12 - Whose Side Are You On?"
 *    "Episode 5. Title"
 *    "Ep 7: Title"
 *  We parse the leading number — that's the canonical episode mapping (more
 *  reliable than assuming the array is in order). Fall back to array index +
 *  the full title if no recognizable prefix. */
function parseStreamingEpisode(
  s: RawStreamingEpisode,
  index: number,
): { episode: number; title: string } | null {
  if (!s.title) return null;
  const m = s.title.match(/^Ep(?:isode)?\.?\s*(\d+)\s*[-:.]?\s*(.*)$/i);
  if (m) {
    const n = Number(m[1]);
    const title = m[2].trim();
    return { episode: n, title: title || s.title.trim() };
  }
  return { episode: index + 1, title: s.title.trim() };
}

/**
 * Fetch the episode/chapter list for one AniList work. Anime → one row per
 * episode, with air dates from the airing schedule + titles from
 * streamingEpisodes (when present). Manga → one row per chapter (no air
 * dates, no titles). For ongoing manga (AniList `chapters` is null) the
 * MangaDex aggregate fills in the count via the linked AniList id.
 *
 * Returns [] on failure / genuinely-unknown length.
 */
export async function fetchAniListEpisodes(
  sourceId: string,
  type: "anime" | "manga",
): Promise<AniListEpisode[]> {
  const id = Number(sourceId);
  if (!Number.isFinite(id)) return [];

  const json = (await anilistRequest(MEDIA_QUERY, { id })) as {
    data?: {
      Media?: {
        episodes: number | null;
        chapters: number | null;
        title: {
          romaji: string | null;
          english: string | null;
          native: string | null;
        } | null;
        nextAiringEpisode: {
          episode: number | null;
          airingAt: number | null;
        } | null;
        airingSchedule: {
          pageInfo: { lastPage: number | null } | null;
          nodes: RawAiringNode[] | null;
        } | null;
        streamingEpisodes: RawStreamingEpisode[] | null;
      };
    };
  } | null;
  const m = json?.data?.Media;
  if (!m) return [];

  // ── Manga branch ─────────────────────────────────────────────────────
  if (type === "manga") {
    let count = m.chapters ?? 0;
    if (count < 1) {
      const title =
        m.title?.english || m.title?.romaji || m.title?.native || null;
      count = (await fetchMangaDexChapterCount(id, title)) ?? 0;
    }
    if (count < 1) return [];
    return range(Math.min(count, MAX_EPISODES)).map((n) => ({
      seasonNumber: 1,
      episodeNumber: n,
      title: null,
      airDate: null,
    }));
  }

  // ── Anime branch ─────────────────────────────────────────────────────
  // The true episode count — never the schedule max (that includes AniList's
  // projected future airings). null when AniList knows neither (rare).
  const knownCount = m.episodes ?? m.nextAiringEpisode?.episode ?? null;

  // Collect air dates by episode, paging the (ascending) schedule. Early-
  // stop once we've covered the known count.
  const airByEpisode = new Map<number, number>();
  let maxSeen = 0;
  const ingest = (nodes: RawAiringNode[] | null | undefined) => {
    for (const n of nodes ?? []) {
      if (n?.episode != null && n?.airingAt != null) {
        airByEpisode.set(n.episode, n.airingAt);
        if (n.episode > maxSeen) maxSeen = n.episode;
      }
    }
  };
  ingest(m.airingSchedule?.nodes);
  const lastPage = m.airingSchedule?.pageInfo?.lastPage ?? 1;

  let page = 1;
  while (page < lastPage && page < MAX_SCHEDULE_PAGES) {
    if (knownCount != null && maxSeen >= knownCount) break;
    page += 1;
    const pj = (await anilistRequest(SCHEDULE_PAGE_QUERY, { id, page })) as {
      data?: {
        Media?: { airingSchedule?: { nodes: RawAiringNode[] | null } };
      };
    } | null;
    const nodes = pj?.data?.Media?.airingSchedule?.nodes;
    if (!nodes || nodes.length === 0) break;
    ingest(nodes);
  }

  // The next upcoming episode's airing time is authoritative — store it
  // directly so the soonest release always carries a date.
  const next = m.nextAiringEpisode;
  if (next?.episode != null && next.airingAt != null) {
    airByEpisode.set(next.episode, next.airingAt);
    if (next.episode > maxSeen) maxSeen = next.episode;
  }

  // streamingEpisodes → episode-number-keyed titles. Only the FIRST entry
  // for each number wins, so we don't overwrite a parsed match with a later
  // duplicate.
  const titleByEpisode = new Map<number, string>();
  (m.streamingEpisodes ?? []).forEach((s, idx) => {
    const parsed = parseStreamingEpisode(s, idx);
    if (parsed && !titleByEpisode.has(parsed.episode)) {
      titleByEpisode.set(parsed.episode, parsed.title);
    }
  });

  const count = Math.min(knownCount ?? maxSeen, MAX_EPISODES);
  if (count < 1) return [];

  return range(count).map((n) => {
    const at = airByEpisode.get(n);
    return {
      seasonNumber: 1,
      episodeNumber: n,
      title: titleByEpisode.get(n) ?? null,
      airDate: at != null ? new Date(at * 1000).toISOString() : null,
    };
  });
}

/** [1, 2, …, n] */
function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i + 1);
}
