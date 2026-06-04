import { supabase } from "@/lib/supabase";
import type { MediaResult } from "@/lib/search";
import { fetchTmdbMovieDetails } from "@/lib/tmdb";

/**
 * Items data layer — the side of the model that's source-of-truth-shared
 * across lists. One AniList work has exactly one row in `items`; placing it
 * into a list creates a `list_items` row pointing at it. So if two friends
 * have the same anime in two different lists, they both reference the same
 * item (and later, the same episode rows) — that's how cross-list status,
 * episode watches and history stay consistent.
 *
 * Phase 4 stub: only `addItemToList` lives here. Phase 4-late adds the
 * lazy episode fetch + episodes upsert; Phase 5 adds item progress queries.
 */

// ──────────────────────────────────────────────────────────────────────────
// Item-detail query (used on /item/:type/:slug)
// ──────────────────────────────────────────────────────────────────────────

export interface ItemDetails {
  /** UUID — used internally for RPC calls (mark_episodes_watched,
   *  reset_item_progress) that reference items.id directly. */
  id: string;
  source: string;
  sourceId: string;
  type: string;
  slug: string;
  title: string;
  coverUrl: string | null;
  metadata: Record<string, unknown> | null;
}

export const itemQueryKey = (type: string, slug: string) =>
  ["item", type, slug] as const;

/** Single item by (type, slug) — the natural key behind the URL. The DB
 *  trigger `items_set_slug_trigger` guarantees (type, slug) is unique at
 *  insert time; new items added by the AddSheet get a slug derived from
 *  the title, with `-<source_id>` appended on collision.
 *
 *  Items are effectively public to any logged-in user (RLS only scopes
 *  reads via list membership, but the SLUG itself doesn't leak privacy
 *  the way list IDs do — the item exists in the catalog independent of
 *  any list). Returns null on unknown / not-visible. */
export function itemQueryOptions(type: string, slug: string) {
  return {
    queryKey: itemQueryKey(type, slug),
    queryFn: async (): Promise<ItemDetails | null> => {
      const { data, error } = await supabase
        .from("items")
        .select("id, source, source_id, type, slug, title, cover_url, metadata")
        .eq("type", type)
        .eq("slug", slug)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        id: data.id as string,
        source: data.source as string,
        sourceId: data.source_id as string,
        type: data.type as string,
        slug: data.slug as string,
        title: data.title as string,
        coverUrl: (data.cover_url as string | null) ?? null,
        metadata: (data.metadata as Record<string, unknown> | null) ?? null,
      };
    },
  };
}

/** Upsert a search result into `items`, then link it to a list. The items
 *  upsert uses `(source, source_id)` as the conflict key, so the same work
 *  added by different users into different lists stays a single row — and so
 *  the same title from two different sources (an anime on AniList vs the same
 *  show on TMDB) stays two distinct items, which is correct: their episode
 *  numbering and ids differ.
 *
 *  Idempotent at the list_items layer too: PostgREST 23505 (unique_violation)
 *  on the (list_id, item_id) constraint means "already in this list" and is
 *  treated as a benign success — re-tapping a result that's already added
 *  doesn't error. */
export async function addItemToList(input: {
  listId: string;
  source: MediaResult;
  /** The acting user — stamped into list_items.added_by_user_id so the
   *  Logbuch can attribute the "hinzugefügt"-event. Without it the column
   *  stays NULL (no default, no trigger) and the Logbuch builder skips the
   *  row entirely, so Nakama adds never showed up in the feed. */
  userId: string;
}): Promise<string> {
  const { source } = input;

  // Step 1 — upsert the canonical item row. source.source carries the
  // provider ("anilist" / "tmdb" / "steam") — no longer hardcoded.
  // Movies ride a releaseDate into metadata so "Was kommt" can surface an
  // upcoming film (films have no episode/air_date rows to read).
  const metadata: Record<string, unknown> = {};
  if (source.format) metadata.format = source.format;
  // Movies: store the GERMAN release date so "Was kommt" surfaces a film
  // that's out in the US but not yet here. The search result only carries the
  // primary (usually US) date, so resolve the DE date via the detail call;
  // fall back to the search date if that fails.
  if (source.type === "movie" && source.source === "tmdb") {
    const details = await fetchTmdbMovieDetails(source.sourceId).catch(
      () => null,
    );
    const rel = details?.releaseDate ?? source.releaseDate ?? null;
    if (rel) metadata.releaseDate = rel;
  } else if (source.releaseDate) {
    metadata.releaseDate = source.releaseDate;
  }
  // Direct items writes are locked down (PRELAUNCH-1) — the catalog upsert
  // runs through the DEFINER `upsert_item` RPC, which inserts a new row or, on
  // a (source, source_id) conflict, returns the existing id WITHOUT clobbering
  // the first writer's title/cover/metadata (so a re-add no longer wipes
  // enrichment metadata like episodesFetchedAt — a latent bug in the old
  // upsert-overwrites-all behaviour).
  const { data: itemId, error: itemError } = await supabase.rpc("upsert_item", {
    _source: source.source,
    _source_id: source.sourceId,
    _type: source.type,
    _title: source.title,
    _cover_url: source.coverUrl,
    _metadata: metadata,
  });

  if (itemError || !itemId) {
    throw itemError ?? new Error("Item-Upsert fehlgeschlagen.");
  }

  // Step 2 — link to the list. Unique-violation = already in list → success.
  const { error: linkError } = await supabase.from("list_items").insert({
    list_id: input.listId,
    item_id: itemId,
    added_by_user_id: input.userId,
  });

  if (linkError && linkError.code !== "23505") {
    throw linkError;
  }

  // Hand the canonical item id back so the caller (AddSheet) can offer an undo
  // (F5) — removeItemFromList deletes the (list_id, item_id) link by this id.
  return itemId as string;
}

/** Undo an add (F5) — delete the list_items link for (listId, itemId). The
 *  mirror of addItemToList's step 2, used by the AddSheet to take back a
 *  mis-tap. `.select()` so a silent RLS block surfaces as an error instead of
 *  a no-op that leaves the ✓ stuck (the Logbook lesson). Deleting a row that's
 *  already gone (double-tap) is a benign no-op — not an error. */
export async function removeItemFromList(input: {
  listId: string;
  itemId: string;
}): Promise<void> {
  const { error } = await supabase
    .from("list_items")
    .delete()
    .eq("list_id", input.listId)
    .eq("item_id", input.itemId)
    .select("id");
  if (error) throw error;
}

/** Backfill/refresh a movie's release date in items.metadata (merged, so
 *  `format` etc. survive). The film detail page calls this once it has TMDB's
 *  German release, so "Was kommt" reads the right date even for films that
 *  were added before the DE date was resolved, or whose date TMDB changed. */
export async function setItemReleaseDate(
  itemId: string,
  metadata: Record<string, unknown> | null,
  releaseDate: string,
): Promise<void> {
  const next = { ...(metadata ?? {}), releaseDate };
  // Direct items writes are locked down (PRELAUNCH-1) — metadata goes through
  // the DEFINER `set_item_metadata` RPC (replace-whole; caller builds the merge).
  const { error } = await supabase.rpc("set_item_metadata", {
    _item_id: itemId,
    _metadata: next,
  });
  if (error) throw error;
}
