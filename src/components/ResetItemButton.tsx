import { createSignal } from "solid-js";
import { createMutation, useQueryClient } from "@tanstack/solid-query";
import { RotateCcw } from "lucide-solid";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/lib/toast";
import {
  episodesQueryKey,
  resetItemProgress,
} from "@/lib/queries/episodes";
import { listsQueryKey } from "@/lib/queries/lists";

/**
 * Reset an item's watch progress. The trigger is a plain text button in the
 * PageHeader aside; tapping it opens the app-wide ConfirmDialog (no longer an
 * inline "Wirklich? · ✓ / ✗" — that cramped the header next to a wrapping
 * title on mobile).
 *
 * Reset clears watch progress for this item in the ACTIVE lane (server-side
 * via reset_progress): the global lane (caller-only) by default, or — when a
 * synced `listItemId` is passed — the whole shared instance, FOR ALL MEMBERS
 * (the RPC fans out). The copy reflects that: `synced` → "für alle".
 *
 * Takes `itemId` (UUID, what the reset_progress RPC needs), the item `title`
 * (dialog heading), the natural-key pair (`type`, `slug`) for cache
 * invalidation, the optional `listItemId` selecting the lane, and `synced`
 * (purely for the copy — the RPC decides global-vs-instance itself).
 */
export function ResetItemButton(props: {
  itemId: string;
  title: string;
  type: string;
  slug: string;
  listItemId?: string | null;
  synced?: boolean;
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
      // own episodes query. A synced reset also clears co-members' progress →
      // refresh the co-watcher marks too.
      void queryClient.invalidateQueries({
        queryKey: episodesQueryKey(props.type, props.slug),
      });
      void queryClient.invalidateQueries({ queryKey: listsQueryKey });
      void queryClient.invalidateQueries({ queryKey: ["list"] });
      void queryClient.invalidateQueries({ queryKey: ["co-watchers"] });
      toast(
        props.synced ? "Für alle zurückgesetzt." : "Fortschritt zurückgesetzt.",
        { icon: RotateCcw },
      );
      setConfirming(false);
    },
  }));

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        class="font-mono text-mini uppercase tracking-wider text-text-muted transition-colors hover:text-accent"
      >
        Zurücksetzen
      </button>
      <ConfirmDialog
        open={confirming()}
        kicker="Zurücksetzen"
        title={props.title}
        body={
          props.synced
            ? "Der gemeinsame Fortschritt wird für alle Mitglieder auf null gesetzt. Das lässt sich nicht rückgängig machen."
            : "Dein Fortschritt für diesen Titel wird auf null gesetzt. Das lässt sich nicht rückgängig machen."
        }
        confirmLabel="Zurücksetzen"
        pending={mutation.isPending}
        onConfirm={() => mutation.mutate()}
        onClose={() => setConfirming(false)}
      />
    </>
  );
}
