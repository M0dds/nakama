import { createSignal, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { createMutation, useQueryClient } from "@tanstack/solid-query";
import { ArrowRightLeft, ListX, RotateCcw, X } from "lucide-solid";
import { Tooltip } from "@/components/Tooltip";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { MoveItemDialog } from "@/components/MoveItemDialog";
import { useToast } from "@/lib/toast";
import {
  episodesQueryKey,
  resetItemProgress,
} from "@/lib/queries/episodes";
import { listsQueryKey, removeListItem } from "@/lib/queries/lists";
import {
  coWatchersKey,
  syncContextKey,
  syncedListsForItemKey,
} from "@/lib/queries/sharing";
import { homeQueryKey } from "@/lib/queries/home";
import { calendarQueryKey } from "@/lib/queries/calendar";

type Confirming = "reset" | "remove" | null;

/**
 * The item page's PageHeader-aside action cluster — the row actions' icon
 * vocabulary (reset / move / remove, same order as RowActions' destructive
 * bundle), so an entry can be managed from its detail page too, not only from
 * the list row. Replaces the old text-only ResetItemButton in that slot.
 *
 * Reset shows only with progress to reset (episodic, lane-aware: the RPC
 * branches global vs instance server-side). Move + remove need the LIST
 * context (list-scoped route): both act on the list_items row, and both
 * navigate back to the source list on success — the list-scoped page they
 * leave behind no longer contains the item.
 */
export function ItemHeaderActions(props: {
  itemId: string;
  itemTitle: string;
  itemType: string;
  itemSlug: string;
  /** Reset is only offered when there's progress to reset. */
  canReset: boolean;
  /** List context — enables move + remove. Null on the global route. */
  listItemId: string | null;
  listShortCode: string | null;
  /** Sync-instance awareness: lane-honest confirm copy (see RowActions). */
  synced: boolean;
  listIsShared: boolean;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();

  const [confirming, setConfirming] = createSignal<Confirming>(null);
  const [moveOpen, setMoveOpen] = createSignal(false);

  const hasListContext = () => !!props.listItemId && !!props.listShortCode;
  const backToList = () => navigate(`/lists/${props.listShortCode}`);

  const resetMut = createMutation(() => ({
    // The RPC decides global-vs-instance from the list_item itself; passing
    // the id on a non-synced context still resets the global lane.
    mutationFn: () => resetItemProgress(props.itemId, props.listItemId),
    onSuccess: () => {
      // Same fan-out as RowActions' reset: badges on every list holding the
      // item, the episode list, co-watcher marks (a synced reset fans out to
      // all members) and the "Gesynct in" section's instance progress.
      void queryClient.invalidateQueries({
        queryKey: episodesQueryKey(props.itemType, props.itemSlug),
      });
      void queryClient.invalidateQueries({ queryKey: listsQueryKey });
      void queryClient.invalidateQueries({ queryKey: ["list"] });
      void queryClient.invalidateQueries({
        queryKey: coWatchersKey(props.itemId),
      });
      void queryClient.invalidateQueries({
        queryKey: syncedListsForItemKey(props.itemId),
      });
      toast(
        props.synced ? "Für alle zurückgesetzt." : "Fortschritt zurückgesetzt.",
        { icon: RotateCcw },
      );
      setConfirming(null);
    },
  }));

  const removeMut = createMutation(() => ({
    mutationFn: () => removeListItem(props.listItemId!),
    onSuccess: () => {
      // Same fan-out as RowActions' remove; removeListItem tears a sync down
      // via unsync_item first, so the lane-switched reads must refetch.
      void queryClient.invalidateQueries({ queryKey: listsQueryKey });
      void queryClient.invalidateQueries({ queryKey: ["list"] });
      if (props.synced) {
        void queryClient.invalidateQueries({
          queryKey: syncContextKey(props.listItemId!),
        });
        void queryClient.invalidateQueries({
          queryKey: coWatchersKey(props.itemId),
        });
        void queryClient.invalidateQueries({
          queryKey: episodesQueryKey(props.itemType, props.itemSlug),
        });
        void queryClient.invalidateQueries({ queryKey: homeQueryKey });
        void queryClient.invalidateQueries({ queryKey: calendarQueryKey });
      }
      void queryClient.invalidateQueries({
        queryKey: syncedListsForItemKey(props.itemId),
      });
      toast(`„${props.itemTitle}“ aus der Liste entfernt.`, { icon: ListX });
      setConfirming(null);
      // The list-scoped page we're on just lost its item — back to the list.
      backToList();
    },
  }));

  const iconBtn =
    "inline-flex size-7 items-center justify-center rounded-xs text-text-muted transition-colors hover:bg-surface";

  return (
    <>
      <div class="flex items-center gap-1">
        <Show when={props.canReset}>
          <Tooltip label="Fortschritt zurücksetzen">
            <button
              type="button"
              onClick={() => setConfirming("reset")}
              aria-label={`Fortschritt für ${props.itemTitle} zurücksetzen`}
              class={`${iconBtn} hover:text-text`}
            >
              <RotateCcw class="size-4" strokeWidth={1.75} aria-hidden />
            </button>
          </Tooltip>
        </Show>
        <Show when={hasListContext()}>
          <Tooltip label="In andere Liste verschieben">
            <button
              type="button"
              onClick={() => setMoveOpen(true)}
              aria-label={`${props.itemTitle} verschieben`}
              class={`${iconBtn} hover:text-text`}
            >
              <ArrowRightLeft class="size-4" strokeWidth={1.75} aria-hidden />
            </button>
          </Tooltip>
          <Tooltip label="Aus Liste entfernen">
            <button
              type="button"
              onClick={() => setConfirming("remove")}
              aria-label={`${props.itemTitle} aus Liste entfernen`}
              class={`${iconBtn} hover:text-accent`}
            >
              <X class="size-4" strokeWidth={1.75} aria-hidden />
            </button>
          </Tooltip>
        </Show>
      </div>

      {/* Confirm copy mirrors RowActions verbatim — lane-honest either way. */}
      <ConfirmDialog
        open={confirming() !== null}
        kicker={confirming() === "remove" ? "Aus Liste entfernen" : "Zurücksetzen"}
        title={props.itemTitle}
        body={
          confirming() === "remove"
            ? props.listIsShared
              ? props.synced
                ? "Diese Liste ist geteilt. Entfernen nimmt den Titel auch den anderen Mitgliedern und beendet die Synchronisierung. Der Fortschritt aller bleibt erhalten."
                : "Diese Liste ist geteilt. Entfernen nimmt den Titel auch den anderen Mitgliedern. Dein Fortschritt bleibt erhalten."
              : "Der Titel wird aus dieser Liste entfernt. Dein Fortschritt bleibt erhalten."
            : props.synced
              ? "Der synchronisierte Fortschritt für diesen Titel wird für alle Mitglieder auf null gesetzt. Das lässt sich nicht rückgängig machen."
              : "Dein Fortschritt für diesen Titel wird auf null gesetzt. Das lässt sich nicht rückgängig machen."
        }
        confirmLabel={confirming() === "remove" ? "Entfernen" : "Zurücksetzen"}
        pending={
          confirming() === "reset" ? resetMut.isPending : removeMut.isPending
        }
        onConfirm={() => {
          if (confirming() === "reset") resetMut.mutate();
          else removeMut.mutate();
        }}
        onClose={() => setConfirming(null)}
      />

      <Show when={hasListContext()}>
        <MoveItemDialog
          listItemId={props.listItemId!}
          itemId={props.itemId}
          itemTitle={props.itemTitle}
          itemType={props.itemType}
          itemSlug={props.itemSlug}
          itemSynced={props.synced}
          sourceIsShared={props.listIsShared}
          currentListShortCode={props.listShortCode!}
          open={moveOpen()}
          onClose={() => setMoveOpen(false)}
          onMoved={backToList}
        />
      </Show>
    </>
  );
}
