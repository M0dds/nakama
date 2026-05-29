/**
 * Jikan (myanimelist.net) episode-title fallback. AniList's
 * `streamingEpisodes` is bound by what streaming services currently list —
 * a narrow window (~60-150 entries) that shifts over time. For long-running
 * anime like One Piece (1100+ episodes), AniList exposes only ~60-70
 * episode titles and the rest go titleless. Jikan ships with MyAnimeList's
 * full episode catalogue, including the latest airings, so this fills the
 * gap.
 *
 * Page size is Jikan's default 100; rate limit is roughly 3 req/sec, so
 * we throttle to ~one request every 400 ms to stay comfortable. Failures
 * return whatever partial map we built — callers fall through gracefully
 * to AniList-only titles for the remaining episodes.
 *
 * Mapping note: for sequential anime, Jikan's `mal_id` on each episode row
 * IS the episode number (page 12 of One Piece returns mal_id 1101-1162).
 * For shows with weird numbering (splits, OVAs sneaked in) this can drift,
 * but the merge in episodes.ts is non-destructive — Jikan only fills the
 * gaps AniList left as null, so a wrong mal_id at worst leaves the gap.
 */

const ENDPOINT = "https://api.jikan.moe/v4";
const THROTTLE_MS = 400;
/** Defensive cap matching anilist.ts MAX_EPISODES (2000 / 100 per page). */
const MAX_PAGES = 20;

interface RawJikanEpisode {
  mal_id: number | null;
  title: string | null;
}

interface RawJikanPagination {
  has_next_page: boolean | null;
}

interface RawJikanResponse {
  data: RawJikanEpisode[] | null;
  pagination: RawJikanPagination | null;
}

export async function fetchJikanEpisodeTitles(
  malId: number,
): Promise<Map<number, string>> {
  const result = new Map<number, string>();
  let page = 1;

  while (page <= MAX_PAGES) {
    let json: RawJikanResponse | null = null;
    try {
      const res = await fetch(
        `${ENDPOINT}/anime/${malId}/episodes?page=${page}`,
      );
      if (!res.ok) break;
      json = (await res.json().catch(() => null)) as RawJikanResponse | null;
    } catch {
      break;
    }
    if (!json) break;

    for (const ep of json.data ?? []) {
      const num = ep.mal_id;
      const title = typeof ep.title === "string" ? ep.title.trim() : "";
      if (typeof num === "number" && Number.isFinite(num) && num >= 1 && title) {
        result.set(num, title);
      }
    }

    if (!json.pagination?.has_next_page) break;
    page += 1;
    // Brief delay so the next request doesn't trip Jikan's ~3 req/sec limit.
    await new Promise((r) => setTimeout(r, THROTTLE_MS));
  }
  return result;
}
