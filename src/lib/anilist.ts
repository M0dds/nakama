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

import {
  fetchMangaDexChapterCount,
  fetchMangaDexChapterTitles,
} from "@/lib/mangadex";

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
  query ($q: String, $type: MediaType) {
    Page(perPage: 12) {
      media(search: $q, type: $type, sort: SEARCH_MATCH, isAdult: false) {
        id
        type
        format
        seasonYear
        startDate { year }
        title { english romaji native }
        coverImage { extraLarge large medium }
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
  /** AniList's field naming is misleading: the URL path segment lags one
   *  step behind the field name. `medium` returns a `/cover/small/` URL,
   *  `large` returns `/cover/medium/`, and `extraLarge` returns the actual
   *  `/cover/large/` (~430×615 px) — which is what we want for cards. */
  coverImage: {
    extraLarge: string | null;
    large: string | null;
    medium: string | null;
  } | null;
}

/** Upgrade an AniList cover URL to its highest-resolution variant. Items
 *  added before we started requesting `extraLarge` were stored with a
 *  `/cover/medium/` URL (the field AniList misleadingly calls `large`) —
 *  which renders pixelated in larger surfaces like the Was-kommt hero
 *  cards. This swaps the path segment in place; new items already come
 *  in at `/cover/large/` from the updated search query.
 *
 *  Safe no-op for non-AniList URLs and for URLs that already point at the
 *  high-res variant. */
export function highResCover(url: string | null): string | null {
  if (!url) return null;
  return url.replace(
    /(\/anilistcdn\/media\/(?:anime|manga)\/cover)\/(?:small|medium)\//,
    "$1/large/",
  );
}

/** Search anime + manga by title. `mediaType` narrows to one kind ("ANIME" /
 *  "MANGA"); omit it to search both. Returns [] on network / parse failure so
 *  callers can render a clean empty state without a separate error path —
 *  the user can just keep typing. */
export async function searchAniList(
  q: string,
  signal?: AbortSignal,
  mediaType?: "ANIME" | "MANGA",
): Promise<AniListResult[]> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        query: SEARCH_QUERY,
        // type omitted → AniList's nullable $type defaults to no filter.
        variables: { q, type: mediaType },
      }),
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
    coverUrl:
      m.coverImage?.extraLarge ||
      m.coverImage?.large ||
      m.coverImage?.medium ||
      null,
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

/** What the episode fetch returns: the normalized episodes plus the linked
 *  MyAnimeList id when AniList knows one. Caller uses malId to fall back
 *  to Jikan for any titles AniList's streamingEpisodes left null. */
export interface AniListEpisodesResult {
  episodes: AniListEpisode[];
  malId: number | null;
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
      idMal
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

/** Extra catalogue facts for the detail page's Details column (F12): genres,
 *  the main production studio(s), and the start year. NOT stored in
 *  items.metadata (only format + year are) — fetched live like the movie facts,
 *  cached by TanStack. Manga have no studios → studios is empty. */
export interface AniListDetails {
  genres: string[];
  studios: string[];
  year: number | null;
}

export async function fetchAniListDetails(
  sourceId: string,
): Promise<AniListDetails | null> {
  const id = Number(sourceId);
  if (!Number.isFinite(id)) return null;
  const query = `query ($id: Int) {
    Media(id: $id) {
      genres
      startDate { year }
      studios { edges { isMain node { name } } }
    }
  }`;
  const json = (await anilistRequest(query, { id })) as {
    data?: {
      Media?: {
        genres?: string[] | null;
        startDate?: { year: number | null } | null;
        studios?: {
          edges?: Array<{ isMain: boolean; node: { name: string } }> | null;
        } | null;
      } | null;
    };
  } | null;
  const media = json?.data?.Media;
  if (!media) return null;
  const edges = media.studios?.edges ?? [];
  // Prefer the main animation studio; fall back to whatever is listed.
  const mains = edges.filter((e) => e.isMain).map((e) => e.node.name);
  const studios = (mains.length ? mains : edges.map((e) => e.node.name)).filter(
    Boolean,
  );
  return {
    genres: media.genres ?? [],
    studios,
    year: media.startDate?.year ?? null,
  };
}

/** AniList stores streamingEpisodes as e.g.
 *    "Episode 12 - Whose Side Are You On?"
 *    "Episode 5. Title"
 *    "Ep 7: Title"
 *  We parse the leading number — that IS the canonical episode mapping.
 *
 *  No index-based fallback: for long-running anime AniList only exposes
 *  a window of streaming entries (~60-150) which often does NOT start at
 *  episode 1 — e.g. One Piece returns indices 0..68 for episodes 62..130.
 *  An "index + 1" fallback would assign those titles to episodes 1..69
 *  and the real episode-1 title would silently disappear. Better: drop
 *  unparseable entries and let Jikan (jikan.ts) fill the gaps. */
function parseStreamingEpisode(
  s: RawStreamingEpisode,
): { episode: number; title: string } | null {
  if (!s.title) return null;
  // Accept "Episode N", "Ep. N", "Ep N", "EP N" with any separator
  // (hyphen, en-dash, em-dash, colon, period, pipe) before the title.
  const m = s.title.match(/^Ep(?:isode)?\.?\s*(\d+)\b[\s\-–—:|.]*(.*)$/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < 1) return null;
  const title = m[2].trim();
  // Return only when there's actual title text — bare "Episode 1163" with
  // nothing after is no signal worth storing.
  if (!title) return null;
  return { episode: n, title };
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
): Promise<AniListEpisodesResult> {
  const id = Number(sourceId);
  if (!Number.isFinite(id)) return { episodes: [], malId: null };

  const json = (await anilistRequest(MEDIA_QUERY, { id })) as {
    data?: {
      Media?: {
        idMal: number | null;
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
  if (!m) return { episodes: [], malId: null };
  const malId = m.idMal;

  // ── Manga branch ─────────────────────────────────────────────────────
  if (type === "manga") {
    const fallbackTitle =
      m.title?.english || m.title?.romaji || m.title?.native || null;
    let count = m.chapters ?? 0;
    if (count < 1) {
      count = (await fetchMangaDexChapterCount(id, fallbackTitle)) ?? 0;
    }
    if (count < 1) return { episodes: [], malId };

    // Best-effort chapter titles via MangaDex. Coverage varies wildly:
    // weeklys often carry no title, officially-licensed runs (One Piece)
    // have most chapters removed from MD. We get what we can; missing
    // chapters keep title=null and the UI surfaces the standard fallback
    // for them.
    const { titles: mdTitles } = await fetchMangaDexChapterTitles(
      id,
      fallbackTitle,
    );

    return {
      episodes: range(Math.min(count, MAX_EPISODES)).map((n) => ({
        seasonNumber: 1,
        episodeNumber: n,
        title: mdTitles.get(n) ?? null,
        airDate: null,
      })),
      malId,
    };
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
  // duplicate. Unparseable entries (no leading "Episode N") are dropped —
  // Jikan fills those gaps downstream (see jikan.ts).
  const titleByEpisode = new Map<number, string>();
  for (const s of m.streamingEpisodes ?? []) {
    const parsed = parseStreamingEpisode(s);
    if (parsed && !titleByEpisode.has(parsed.episode)) {
      titleByEpisode.set(parsed.episode, parsed.title);
    }
  }

  const count = Math.min(knownCount ?? maxSeen, MAX_EPISODES);
  if (count < 1) return { episodes: [], malId };

  return {
    episodes: range(count).map((n) => {
      const at = airByEpisode.get(n);
      return {
        seasonNumber: 1,
        episodeNumber: n,
        title: titleByEpisode.get(n) ?? null,
        airDate: at != null ? new Date(at * 1000).toISOString() : null,
      };
    }),
    malId,
  };
}

/** [1, 2, …, n] */
function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i + 1);
}
