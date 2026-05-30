import { onCleanup, onMount } from "solid-js";
import { useQueryClient } from "@tanstack/solid-query";
import type { QueryKey } from "@tanstack/solid-query";
import { supabase } from "@/lib/supabase";

/**
 * The Solid+TanStack-Query analogue of Logbook's <RealtimeRefresh>. Instead
 * of calling router.refresh() (which forces a full RSC re-render of the
 * whole route), we invalidate specific query keys. TanStack Query then:
 *   - marks those queries as stale,
 *   - refetches them in the background,
 *   - re-renders ONLY the Solid components that read those queries.
 *
 * That's the architectural difference the user asked us to chase — granular
 * updates, not full-page renders.
 *
 * RLS already scopes which events a user receives (Supabase publication
 * forwards rows the caller would be allowed to SELECT), so we don't filter
 * at the channel level. New surfaces just enumerate the (table → keys-to-
 * invalidate) tuples they care about.
 *
 * Usage in a route component:
 *
 *   useRealtimeInvalidation("lists-overview", [
 *     { table: "lists",        invalidates: [listsQueryKey] },
 *     { table: "list_members", invalidates: [listsQueryKey] },
 *   ]);
 *
 * ── Burst coalescing ──────────────────────────────────────────────────────
 * postgres_changes fires ONE event per changed row. A cascade tick on a long
 * show (Naruto ≈ 700 episodes), doubled by sync fan-out across members, lands
 * as ~1400 episode_watches INSERT events in a burst. Invalidating per event
 * meant ~1400 invalidateQueries calls → a refetch storm that hammered the API
 * ("TypeError: Failed to fetch") and blanked the page — exactly the storm
 * Nakama was built to avoid, via a different door. So we coalesce: events
 * accumulate the unique set of keys to invalidate and flush ONCE after a short
 * trailing-debounce window (with a max-wait cap so a steady trickle still
 * flushes). The user-visible cost is ≤ FLUSH_MS of extra latency on a remote
 * change — imperceptible — in exchange for one refetch per burst instead of
 * hundreds.
 */

export interface RealtimeSubscription {
  table: string;
  invalidates: QueryKey[];
}

const FLUSH_MS = 250; // trailing debounce: a quiet gap flushes the burst
const MAX_MS = 1000; // hard cap: a steady stream still flushes this often

export function useRealtimeInvalidation(
  channelKey: string,
  subscriptions: RealtimeSubscription[],
): void {
  const queryClient = useQueryClient();

  onMount(() => {
    // Pending keys, deduped by their serialized form so the same key queued by
    // many events (or several tables) is invalidated once per flush.
    const pending = new Map<string, QueryKey>();
    let flushTimer: number | null = null;
    let maxTimer: number | null = null;

    const flush = () => {
      if (flushTimer !== null) {
        window.clearTimeout(flushTimer);
        flushTimer = null;
      }
      if (maxTimer !== null) {
        window.clearTimeout(maxTimer);
        maxTimer = null;
      }
      const keys = [...pending.values()];
      pending.clear();
      for (const key of keys) {
        queryClient.invalidateQueries({ queryKey: key });
      }
    };

    const enqueue = (keys: QueryKey[]) => {
      for (const key of keys) pending.set(JSON.stringify(key), key);
      if (flushTimer !== null) window.clearTimeout(flushTimer);
      flushTimer = window.setTimeout(flush, FLUSH_MS);
      // Start the max-wait cap on the first event of a burst only.
      if (maxTimer === null) maxTimer = window.setTimeout(flush, MAX_MS);
    };

    let channel = supabase.channel(channelKey);
    for (const sub of subscriptions) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: sub.table },
        () => enqueue(sub.invalidates),
      );
    }
    channel.subscribe();

    onCleanup(() => {
      if (flushTimer !== null) window.clearTimeout(flushTimer);
      if (maxTimer !== null) window.clearTimeout(maxTimer);
      supabase.removeChannel(channel);
    });
  });
}
