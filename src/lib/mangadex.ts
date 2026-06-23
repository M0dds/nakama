/**
 * MangaDex — chapter counts for manga AniList can't give us. AniList only
 * exposes `chapters` for FINISHED manga; for ongoing titles it's null and
 * there is no "latest chapter" field. MangaDex tracks chapters and stores
 * the AniList id on each manga (attributes.links.al), so we match on that
 * EXACT id (no fuzzy title matching) and read the latest chapter number
 * off the all-language aggregate.
 *
 * Caveat: officially-licensed series (One Piece, Kagurabachi) have many
 * chapter uploads removed, so the aggregate is sparse — but the MAX
 * chapter number still reflects the latest release. A rare mislabeled
 * upload could overshoot by a few; harmless — manga has no air dates,
 * so extra chapters are just unticked rows. Outliers above SANE_MAX
 * are ignored.
 *
 * Runs in the browser — MangaDex's public REST endpoints support CORS.
 * The browser sets its own User-Agent, so we don't override it (and
 * couldn't anyway: UA is on the fetch-forbidden-header list).
 */
import { PROXY_ENABLED, proxyBase } from "@/lib/proxy";

// Prod → same-origin Worker proxy (cached, no CORS); dev → MangaDex direct.
const ENDPOINT = PROXY_ENABLED ? proxyBase("mangadex") : "https://api.mangadex.org";
const SANE_MAX = 5000; // guard against a troll "chapter 99999" upload

interface MdManga {
  id: string;
  attributes: {
    links: Record<string, string> | null;
    title: Record<string, string>;
  };
}

async function mdRequest(path: string): Promise<unknown> {
  try {
    const res = await fetch(`${ENDPOINT}${path}`);
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch {
    return null;
  }
}

/** Search MangaDex by title and resolve the work's MD id via an exact
 *  AniList-id match on `attributes.links.al`. Shared by the chapter-count
 *  and chapter-title lookups — both want the same canonical MD entry. */
async function findMangaDexId(
  aniListId: number,
  title: string | null,
): Promise<string | null> {
  if (!title) return null;

  const search = (await mdRequest(
    `/manga?title=${encodeURIComponent(title)}&limit=10&order%5Brelevance%5D=desc`,
  )) as { data?: MdManga[] } | null;

  // Exact AniList-id match only; the list is relevance-ordered, so the first
  // hit (vs. a "Fan Colored" duplicate sharing the id) is canonical.
  const match = (search?.data ?? []).find(
    (m) => m.attributes.links?.al === String(aniListId),
  );
  return match?.id ?? null;
}

/**
 * Latest released chapter number for an AniList manga, via MangaDex matched
 * on the AniList id. Returns null when there's no reliable id match or no
 * chapter data — the caller then falls back to "no chapters" rather than
 * guessing.
 */
export async function fetchMangaDexChapterCount(
  aniListId: number,
  title: string | null,
): Promise<number | null> {
  const mdId = await findMangaDexId(aniListId, title);
  if (!mdId) return null;

  const agg = (await mdRequest(`/manga/${mdId}/aggregate`)) as {
    volumes?: Record<
      string,
      { chapters?: Record<string, { chapter?: string }> }
    >;
  } | null;
  if (!agg?.volumes) return null;

  let max = 0;
  for (const v of Object.values(agg.volumes)) {
    for (const c of Object.values(v.chapters ?? {})) {
      const n = Number(c.chapter);
      if (Number.isFinite(n) && n > max && n < SANE_MAX) max = n;
    }
  }
  return max >= 1 ? Math.floor(max) : null;
}

/**
 * Per-chapter English titles from MangaDex, keyed by chapter number.
 * Returns an empty map on no-match or no-data. Coverage is BEST-EFFORT —
 * officially-licensed series (One Piece etc.) have many uploads removed
 * and most weekly shounen chapters carry no title at all, so even a
 * successful lookup often only fills a handful of chapters. Multiple
 * translation groups can upload the same chapter; first-encountered wins.
 *
 * Pages the feed at MangaDex's max limit (500). Caps the total at SANE_MAX
 * so a runaway response can't blow the request body up on the next upsert.
 */
export async function fetchMangaDexChapterTitles(
  aniListId: number,
  title: string | null,
): Promise<{ titles: Map<number, string>; complete: boolean }> {
  const result = new Map<number, string>();
  // No id match = permanent miss (retrying won't help) → complete, so the
  // caller closes the version gate rather than retrying forever.
  const mdId = await findMangaDexId(aniListId, title);
  if (!mdId) return { titles: result, complete: true };

  const limit = 500;
  let offset = 0;
  let complete = true;

  while (offset < SANE_MAX) {
    const feed = (await mdRequest(
      `/manga/${mdId}/feed?translatedLanguage%5B%5D=en&order%5Bchapter%5D=asc&limit=${limit}&offset=${offset}`,
    )) as {
      data?: {
        attributes: {
          chapter: string | null;
          title: string | null;
        };
      }[];
      total?: number;
    } | null;

    // null = mdRequest swallowed a transient error (network / non-ok). Stop
    // and report incomplete so the gate stays open for a retry, rather than
    // locking in whatever pages we got before the failure.
    if (feed === null) {
      complete = false;
      break;
    }

    const rows = feed.data ?? [];
    for (const r of rows) {
      const n = Number(r.attributes.chapter);
      const t = typeof r.attributes.title === "string"
        ? r.attributes.title.trim()
        : "";
      if (Number.isFinite(n) && n >= 1 && n < SANE_MAX && t && !result.has(n)) {
        result.set(n, t);
      }
    }

    if (rows.length < limit) break;
    offset += rows.length;
    if (typeof feed.total === "number" && offset >= feed.total) break;
  }

  return { titles: result, complete };
}
