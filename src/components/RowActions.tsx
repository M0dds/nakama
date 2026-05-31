import { Show } from "solid-js";
import { createMutation, useQueryClient } from "@tanstack/solid-query";
import { ArrowRightLeft, ListX, RotateCcw, X } from "lucide-solid";
import { Tooltip } from "@/components/Tooltip";
import { PinButton } from "@/components/PinButton";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/lib/toast";
import {
  episodesQueryKey,
  resetItemProgress,
} from "@/lib/queries/episodes";
import { listsQueryKey, removeListItem } from "@/lib/queries/lists";

/**
 * Unified row-edge action cluster. Pin lives in the SAME flex group as
 * the destructive icons so they fade in/out as one visual unit on row
 * hover — previously the pin sat as a separate sibling and the two
 * groups read as detached.
 *
 * The destructive bundle (reset / move / remove) is opt-in:
 *   • /lists/:shortCode rows pass it → full cluster
 *   • /lists rows omit it → only the pin renders
 *
 * Reset / remove confirm through the app-wide ConfirmDialog (a modal), not an
 * inline strip — see ConfirmDialog for why. Confirm-state ownership stays at
 * the parent row (`confirming` in the bundle): the row drives the dialog, and
 * PinButton/DragHandle read the same signal for their `hidden` prop so they
 * fade out while the dialog is armed. Single source of truth, one sync flush.
 */
export type Confirming = "reset" | "remove" | null;

export interface DestructiveBundle {
  itemId: string;
  listItemId: string;
  itemTitle: string;
  itemType: string;
  itemSlug: string;
  listShortCode: string;
  onRequestMove: () => void;
  confirming: () => Confirming;
  setConfirming: (next: Confirming) => void;
  /** Set to true from the parent while a Move-Dialog is open so the
   *  destructive cluster stays pinned visible after the mouse leaves. */
  externallyPinned?: boolean;
}

interface Props {
  pinned: boolean;
  /** Used in pin aria-labels + the destructive prompts. "Liste" or "Eintrag". */
  noun: string;
  onTogglePin: () => void;
  destructive?: DestructiveBundle;
}

export function RowActions(props: Props) {
  const queryClient = useQueryClient();
  const toast = useToast();

  // Mutations are defined at top level (Solid components run once and
  // createMutation must live in a stable reactive scope). They're only
  // invoked from inside the destructive cluster's <Show>, where the
  // bundle is guaranteed present — hence the non-null assertions.
  const resetMut = createMutation(() => ({
    mutationFn: () => resetItemProgress(props.destructive!.itemId),
    onSuccess: () => {
      const d = props.destructive!;
      // Reset flips the "Neue Folge" badge on every list this item is in
      // (same item can live in multiple lists). Same fan-out as the
      // toggle/cascade mutations on ItemDetail.
      void queryClient.invalidateQueries({
        queryKey: episodesQueryKey(d.itemType, d.itemSlug),
      });
      void queryClient.invalidateQueries({ queryKey: listsQueryKey });
      void queryClient.invalidateQueries({ queryKey: ["list"] });
      toast(`Fortschritt für „${d.itemTitle}“ zurückgesetzt.`, {
        icon: RotateCcw,
      });
      d.setConfirming(null);
    },
  }));

  const removeMut = createMutation(() => ({
    mutationFn: () => removeListItem(props.destructive!.listItemId),
    onSuccess: () => {
      const d = props.destructive!;
      // Same fan-out reasoning as the AddSheet add path: the row vanishes
      // (listItemsQueryKey) AND itemCount drops on every list-card on
      // /lists (listsQueryKey) AND on the detail-page header (listQueryKey,
      // covered by the ["list"] prefix).
      void queryClient.invalidateQueries({ queryKey: listsQueryKey });
      void queryClient.invalidateQueries({ queryKey: ["list"] });
      toast(`„${d.itemTitle}“ aus der Liste entfernt.`, { icon: ListX });
      d.setConfirming(null);
    },
  }));

  // Keep the destructive cluster pinned visible whenever a confirm is
  // active OR the parent's MoveDialog is open. PinButton uses its own
  // independent visibility logic (sticky when item is pinned).
  const isDestructivePinned = () =>
    props.destructive?.confirming() !== null ||
    props.destructive?.externallyPinned === true;

  return (
    <div class="flex shrink-0 items-center gap-1">
      <PinButton
        pinned={props.pinned}
        noun={props.noun}
        hidden={!!props.destructive?.confirming()}
        onToggle={props.onTogglePin}
      />
      <Show when={props.destructive}>
        {(getD) => (
          <>
            <div
              class={`flex items-center gap-1 transition-opacity duration-200 [transition-timing-function:var(--ease-quart)] ${
                isDestructivePinned()
                  ? "opacity-100"
                  : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100"
              }`}
            >
              <Tooltip label="Fortschritt zurücksetzen">
                <button
                  type="button"
                  onClick={() => getD().setConfirming("reset")}
                  aria-label={`Fortschritt für ${getD().itemTitle} zurücksetzen`}
                  class="inline-flex size-7 items-center justify-center rounded-xs text-text-muted transition-colors hover:bg-bg hover:text-text"
                >
                  <RotateCcw class="size-4" strokeWidth={1.75} aria-hidden />
                </button>
              </Tooltip>
              <Tooltip label="In andere Liste verschieben">
                <button
                  type="button"
                  onClick={() => getD().onRequestMove()}
                  aria-label={`${getD().itemTitle} verschieben`}
                  class="inline-flex size-7 items-center justify-center rounded-xs text-text-muted transition-colors hover:bg-bg hover:text-text"
                >
                  <ArrowRightLeft
                    class="size-4"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                </button>
              </Tooltip>
              <Tooltip label="Aus Liste entfernen">
                <button
                  type="button"
                  onClick={() => getD().setConfirming("remove")}
                  aria-label={`${getD().itemTitle} aus Liste entfernen`}
                  class="inline-flex size-7 items-center justify-center rounded-xs text-text-muted transition-colors hover:bg-bg hover:text-accent"
                >
                  <X class="size-4" strokeWidth={1.75} aria-hidden />
                </button>
              </Tooltip>
            </div>

            {/* Reset / remove both confirm through the app-wide dialog. The
                row's confirming() picks which copy + which mutation. */}
            <ConfirmDialog
              open={getD().confirming() !== null}
              kicker={
                getD().confirming() === "remove"
                  ? "Aus Liste entfernen"
                  : "Zurücksetzen"
              }
              title={getD().itemTitle}
              body={
                getD().confirming() === "remove"
                  ? "Der Titel wird aus dieser Liste entfernt. Dein Fortschritt bleibt erhalten."
                  : "Dein Fortschritt für diesen Titel wird auf null gesetzt. Das lässt sich nicht rückgängig machen."
              }
              confirmLabel={
                getD().confirming() === "remove" ? "Entfernen" : "Zurücksetzen"
              }
              pending={
                getD().confirming() === "reset"
                  ? resetMut.isPending
                  : removeMut.isPending
              }
              onConfirm={() => {
                if (getD().confirming() === "reset") resetMut.mutate();
                else removeMut.mutate();
              }}
              onClose={() => getD().setConfirming(null)}
            />
          </>
        )}
      </Show>
    </div>
  );
}
