import { supabase } from "@/lib/supabase";
import type { AniListResult } from "@/lib/anilist";

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

/** Upsert an AniList result into `items`, then link it to a list. The items
 *  upsert uses `(source, source_id)` as the conflict key, so the same work
 *  added by different users into different lists stays a single row.
 *
 *  Idempotent at the list_items layer too: PostgREST 23505 (unique_violation)
 *  on the (list_id, item_id) constraint means "already in this list" and is
 *  treated as a benign success — re-tapping a result that's already added
 *  doesn't error. */
export async function addItemToList(input: {
  listId: string;
  source: AniListResult;
}): Promise<void> {
  const { source } = input;

  // Step 1 — upsert the canonical item row.
  const { data: item, error: itemError } = await supabase
    .from("items")
    .upsert(
      {
        source: "anilist",
        source_id: source.sourceId,
        type: source.type,
        title: source.title,
        cover_url: source.coverUrl,
        metadata: source.format ? { format: source.format } : {},
      },
      { onConflict: "source,source_id" },
    )
    .select("id")
    .single();

  if (itemError || !item) {
    throw itemError ?? new Error("Item-Upsert fehlgeschlagen.");
  }

  // Step 2 — link to the list. Unique-violation = already in list → success.
  const { error: linkError } = await supabase.from("list_items").insert({
    list_id: input.listId,
    item_id: item.id,
  });

  if (linkError && linkError.code !== "23505") {
    throw linkError;
  }
}
