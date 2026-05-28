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
