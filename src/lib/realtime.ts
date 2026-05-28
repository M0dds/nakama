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
 */

export interface RealtimeSubscription {
  table: string;
  invalidates: QueryKey[];
}

export function useRealtimeInvalidation(
  channelKey: string,
  subscriptions: RealtimeSubscription[],
): void {
  const queryClient = useQueryClient();

  onMount(() => {
    let channel = supabase.channel(channelKey);
    for (const sub of subscriptions) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: sub.table },
        () => {
          for (const key of sub.invalidates) {
            queryClient.invalidateQueries({ queryKey: key });
          }
        },
      );
    }
    channel.subscribe();

    onCleanup(() => {
      supabase.removeChannel(channel);
    });
  });
}
