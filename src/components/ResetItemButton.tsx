import { createSignal, Show } from "solid-js";
import { createMutation, useQueryClient } from "@tanstack/solid-query";
import { Check, RotateCcw, X } from "lucide-solid";
import { useToast } from "@/lib/toast";
import {
  episodesQueryKey,
  resetItemProgress,
} from "@/lib/queries/episodes";
import { listsQueryKey } from "@/lib/queries/lists";

/**
 * Inline-confirm reset for an item's watch progress. Same shape as
 * DeleteListButton: trigger → "Wirklich zurücksetzen? · ✓ / ✗" in place.
 * Reset clears the caller's watch progress for this item in the ACTIVE lane
 * (server-side via reset_progress): the global lane by default, or — when a
 * synced `listItemId` is passed — just that instance. Doesn't touch other
 * members' global progress.
 *
 * Sits in the PageHeader aside slot (h-6 items-center), so both states
 * share the same 24 px band — no baseline shift between trigger and
 * confirm.
 *
 * Takes `itemId` (UUID, what the reset_progress RPC needs), the natural-key
 * pair (`type`, `slug`) for the cache invalidation (keyed on the URL-stable
 * identifier), and the optional `listItemId` selecting the lane.
 */
export function ResetItemButton(props: {
  itemId: string;
  type: string;
  slug: string;
  listItemId?: string | null;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [confirming, setConfirming] = createSignal(false);

  const mutation = createMutation(() => ({
    mutationFn: () => resetItemProgress(props.itemId, props.listItemId),
    onSuccess: () => {
      // Reset wipes every watch for this item, which flips the "Neue Folge"
      // badge on every list this item is in (if any of its recent episodes
      // becomes unwatched). Invalidate the lists caches alongside the item's
      // own episodes query.
      void queryClient.invalidateQueries({
        queryKey: episodesQueryKey(props.type, props.slug),
      });
      void queryClient.invalidateQueries({ queryKey: listsQueryKey });
      void queryClient.invalidateQueries({ queryKey: ["list"] });
      // Generic copy — we're on the item's own page, context is clear (and the
      // component doesn't carry the title).
      toast("Fortschritt zurückgesetzt.", { icon: RotateCcw });
      setConfirming(false);
    },
  }));

  return (
    <Show
      when={confirming()}
      fallback={
        <button
          type="button"
          onClick={() => setConfirming(true)}
          class="font-mono text-mini uppercase tracking-wider text-text-muted transition-colors hover:text-accent"
        >
          Zurücksetzen
        </button>
      }
    >
      <span class="inline-flex items-center gap-2">
        <span class="font-mono text-mini uppercase tracking-wider text-text-muted">
          Wirklich zurücksetzen?
        </span>
        <button
          type="button"
          aria-label="Ja, zurücksetzen"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate()}
          class="inline-flex size-6 items-center justify-center rounded-xs bg-accent text-accent-on transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Check class="size-3.5" strokeWidth={2.5} />
        </button>
        <button
          type="button"
          aria-label="Abbrechen"
          onClick={(e) => {
            e.currentTarget.blur();
            setConfirming(false);
          }}
          class="inline-flex size-6 items-center justify-center rounded-xs border border-border text-text-muted transition-colors hover:bg-surface hover:text-text"
        >
          <X class="size-3.5" strokeWidth={2} />
        </button>
      </span>
    </Show>
  );
}
