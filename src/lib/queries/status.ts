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
  /** Completion timestamp override (ISO). Default now — the episodic
   *  Abschluss reconcile passes the caller's LAST WATCH time instead, so a
   *  retroactive heal lands at its true historical position in the Logbuch
   *  window rather than faking a fresh event. */
  at?: string;
}): Promise<void> {
  if (input.seen) {
    const { error } = await supabase.from("item_history").upsert(
      {
        user_id: input.user.id,
        item_id: input.itemId,
        status: "completed",
        updated_at: input.at ?? new Date().toISOString(),
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

/**
 * Abschluss reconcile for EPISODIC items (anime/series/manga) — Review P3 #2.
 * The item page derives "completed" (lane watched == total AND
 * metadata.finished) and calls this to converge the item_history stamp:
 *
 *   complete + not stamped → upsert. `live` (an explicit tick on the page
 *     just produced the completion) stamps NOW; a passive heal (show finished
 *     before this feature existed, or a partner completed via sync fan-out)
 *     is backdated to the caller's LATEST WATCH — the true historical moment,
 *     usually outside the Logbuch window, so healing never fakes fresh events.
 *   not complete + stamped → delete (an un-tick broke completeness).
 *
 * The live path must NOT read episode_watches for its timestamp: the effect
 * fires off the OPTIMISTIC cache while the completing tick's RPC is still in
 * flight, so the lookup would return a months-old watch and a genuinely fresh
 * Abschluss would land outside the Logbuch window (= no feed event).
 *
 * The stamp is what the Logbuch 'status' kind and the list-row marker read —
 * same pipeline the movie/game seen-toggle feeds.
 */
export async function reconcileEpisodicCompletion(input: {
  user: User;
  itemId: string;
  complete: boolean;
  /** True when an explicit tick on this page produced the completion. */
  live: boolean;
}): Promise<void> {
  if (!input.complete) {
    await setItemSeen({ user: input.user, itemId: input.itemId, seen: false });
    return;
  }
  if (input.live) {
    await setItemSeen({ user: input.user, itemId: input.itemId, seen: true });
    return;
  }
  // Passive heal: latest own watch across BOTH lanes (a synced instance
  // completes the show just as much as the global lane does). RLS covers
  // own rows.
  const { data, error } = await supabase
    .from("episode_watches")
    .select("watched_at, episodes!inner(item_id)")
    .eq("episodes.item_id", input.itemId)
    .eq("user_id", input.user.id)
    .order("watched_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  const at = (data?.[0] as { watched_at: string } | undefined)?.watched_at;
  await setItemSeen({ user: input.user, itemId: input.itemId, seen: true, at });
}
