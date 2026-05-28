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
