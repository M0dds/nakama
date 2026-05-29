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
const ENDPOINT = "https://api.mangadex.org";
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
  if (!title) return null;

  const search = (await mdRequest(
    `/manga?title=${encodeURIComponent(title)}&limit=10&order%5Brelevance%5D=desc`,
  )) as { data?: MdManga[] } | null;

  // Exact AniList-id match only; the list is relevance-ordered, so the first
  // hit (vs. a "Fan Colored" duplicate sharing the id) is canonical.
  const match = (search?.data ?? []).find(
    (m) => m.attributes.links?.al === String(aniListId),
  );
  if (!match) return null;

  const agg = (await mdRequest(`/manga/${match.id}/aggregate`)) as {
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
