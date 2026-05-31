import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

/**
 * Movie status — the episode-less counterpart to episode_watches. A film has
 * no episodes to tick; its "seen" lives as a single item_history row
 * (status='completed'). No row = unseen. Binary by design (the in-list
 * checkbox), so we only ever write 'completed' or delete the row — the
 * 'watching'/'dropped' states the table also permits stay unused here.
 *
 * RLS: item_history is per-user (own rows only) — enough for the caller's own
 * seen-toggle. Showing who ELSE saw a film in a shared list (co-watcher faces)
 * needs a read policy that doesn't exist yet → Scheibe 2 (one migration).
 *
 * The read side: `movieSeenOptions` powers the film detail page's seen-toggle.
 */

export const movieSeenKey = (itemId: string) =>
  ["movie-seen", itemId] as const;

/** The caller's binary seen-state for one film. True iff an item_history row
 *  with status='completed' exists. RLS scopes to own rows. */
export function movieSeenOptions(user: User, itemId: string) {
  return {
    queryKey: movieSeenKey(itemId),
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from("item_history")
        .select("status")
        .eq("user_id", user.id)
        .eq("item_id", itemId)
        .maybeSingle();
      if (error) throw error;
      return (data as { status: string } | null)?.status === "completed";
    },
  };
}

/** Mark a movie seen (upsert status='completed') or unseen (delete the row).
 *  Set-based + idempotent. We surface errors so a silent RLS block throws
 *  instead of lying about success (Logbook lesson). */
export async function setItemSeen(input: {
  user: User;
  itemId: string;
  seen: boolean;
}): Promise<void> {
  if (input.seen) {
    const { error } = await supabase.from("item_history").upsert(
      {
        user_id: input.user.id,
        item_id: input.itemId,
        status: "completed",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,item_id" },
    );
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("item_history")
      .delete()
      .eq("user_id", input.user.id)
      .eq("item_id", input.itemId);
    if (error) throw error;
  }
}
