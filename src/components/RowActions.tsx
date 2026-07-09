import { Show } from "solid-js";
import { createMutation, useQueryClient } from "@tanstack/solid-query";
import { ArrowRightLeft, Ellipsis, ListX, RotateCcw, X } from "lucide-solid";
import { Tooltip } from "@/components/Tooltip";
import { PinButton } from "@/components/PinButton";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/lib/toast";
import {
  episodesQueryKey,
  resetItemProgress,
} from "@/lib/queries/episodes";
import { listsQueryKey, removeListItem } from "@/lib/queries/lists";
import { coWatchersKey, syncContextKey } from "@/lib/queries/sharing";
import { homeQueryKey } from "@/lib/queries/home";
import { calendarQueryKey } from "@/lib/queries/calendar";

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
  /** Sync-instance awareness (handshake §Sync-Instanzen): reset must target
   *  the visible lane (instance when synced, global otherwise), and remove
   *  must tear the sync down via unsync_item before the row delete. Both
   *  also pick the honest confirm copy. */
  syncEnabled: boolean;
  /** Shared list ⇒ removing the one shared list_items row takes the entry
   *  away from every member — the confirm copy must say so. */
  listIsShared: boolean;
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
  /** The row's coarse-pointer "⋯" toggle is open — pin the whole cluster
   *  visible. On touch there is no hover to reveal anything; at rest the
   *  cluster is display:none there (see RowActionsToggle). */
  forceVisible?: boolean;
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
    // Lane-matched like ItemHeaderActions: a synced row's visible progress lives
    // in the INSTANCE lane — resetting without the listItemId would wipe the
    // caller's unrelated GLOBAL progress while the row appears unchanged.
    mutationFn: () => {
      const d = props.destructive!;
      return resetItemProgress(d.itemId, d.syncEnabled ? d.listItemId : null);
    },
    onSuccess: () => {
      const d = props.destructive!;
      // Reset flips the "Neue Folge" badge on every list this item is in
      // (same item can live in multiple lists). Same fan-out as the
      // toggle/cascade mutations on ItemDetail; co-watchers because a synced
      // reset fans out to every member (migration 20260531160000).
      void queryClient.invalidateQueries({
        queryKey: episodesQueryKey(d.itemType, d.itemSlug),
      });
      void queryClient.invalidateQueries({ queryKey: listsQueryKey });
      void queryClient.invalidateQueries({ queryKey: ["list"] });
      void queryClient.invalidateQueries({ queryKey: coWatchersKey(d.itemId) });
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
      if (d.syncEnabled) {
        // removeListItem ran unsync_item first (instance → global lanes for
        // every member) — same teardown fan-out as MoveItemDialog: stale sync
        // context, co-watcher eye, lane-switched episode reads, Home/Kalender.
        void queryClient.invalidateQueries({
          queryKey: syncContextKey(d.listItemId),
        });
        void queryClient.invalidateQueries({
          queryKey: coWatchersKey(d.itemId),
        });
        void queryClient.invalidateQueries({
          queryKey: episodesQueryKey(d.itemType, d.itemSlug),
        });
        void queryClient.invalidateQueries({ queryKey: homeQueryKey });
        void queryClient.invalidateQueries({ queryKey: calendarQueryKey });
      }
      toast(`„${d.itemTitle}“ aus der Liste entfernt.`, { icon: ListX });
      d.setConfirming(null);
    },
  }));

  // Keep the destructive cluster pinned visible whenever a confirm is
  // active, the parent's MoveDialog is open, OR the row's coarse-pointer
  // "⋯" toggle is open. PinButton uses its own independent visibility
  // logic (sticky when item is pinned).
  const isDestructivePinned = () =>
    props.destructive?.confirming() !== null ||
    props.destructive?.externallyPinned === true ||
    props.forceVisible === true;

  // Fold behind the coarse-pointer "⋯" only when it would reveal ≥ 2 icons —
  // i.e. only with the destructive bundle (pin + reset/move/remove). A
  // pin-only cluster (/lists overview rows) hides nothing worth folding, so
  // it stays directly visible on touch and the page renders no toggle.
  const foldable = () => !!props.destructive;

  return (
    // On coarse pointers a FOLDABLE cluster rests at display:none (carried
    // here on the root, so the row's gap-2 doesn't double up around an empty
    // box) and re-displays when the "⋯" toggle opens it — display can't
    // transition, so the reveal-row keyframe animation (fade + slide from
    // the toggle's side) plays on re-display instead.
    <div
      class="flex shrink-0 items-center gap-1"
      classList={{
        "pointer-coarse:hidden": foldable() && !props.forceVisible,
        "motion-safe:animate-reveal-row": foldable() && props.forceVisible,
      }}
    >
      <PinButton
        pinned={props.pinned}
        noun={props.noun}
        hidden={!!props.destructive?.confirming()}
        forceVisible={props.forceVisible}
        onToggle={props.onTogglePin}
      />
      <Show when={props.destructive}>
        {(getD) => (
          <>
            <div
              class={`flex items-center gap-1 transition-opacity duration-200 [transition-timing-function:var(--ease-quart)] ${
                isDestructivePinned()
                  ? "opacity-100"
                  : // Coarse-pointer rest state is handled on the ROOT div
                    // (display:none until the "⋯" toggle opens it).
                    "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100"
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
                  ? getD().listIsShared
                    ? getD().syncEnabled
                      ? "Diese Liste ist geteilt. Entfernen nimmt den Titel auch den anderen Mitgliedern und beendet die Synchronisierung. Der Fortschritt aller bleibt erhalten."
                      : "Diese Liste ist geteilt. Entfernen nimmt den Titel auch den anderen Mitgliedern. Dein Fortschritt bleibt erhalten."
                    : "Der Titel wird aus dieser Liste entfernt. Dein Fortschritt bleibt erhalten."
                  : getD().syncEnabled
                    ? "Der synchronisierte Fortschritt für diesen Titel wird für alle Mitglieder auf null gesetzt. Das lässt sich nicht rückgängig machen."
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

/**
 * Coarse-pointer entry to the row's hover-reveal vocabulary. The whole
 * cluster (pin / reset / move / remove / drag handle) reveals on hover —
 * which doesn't exist on touch, where the controls are display:none at
 * rest. This "⋯" renders ONLY on coarse pointers, at the row's right edge,
 * and toggles the row's forceVisible signal: the same cluster appears
 * inline and its buttons open the same (touch-friendly) dialogs.
 *
 * Quiet at rest (muted ghost icon, like the episode-tick idiom); open state
 * carries the surface tint so the second tap reads as "close".
 */
export function RowActionsToggle(props: {
  open: boolean;
  /** For the aria-label: "Liste" / "Eintrag". */
  noun: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        // Sits beside (lists detail) or near (overview) the row's <A> —
        // never navigate on toggle.
        e.preventDefault();
        e.stopPropagation();
        props.onToggle();
      }}
      aria-expanded={props.open}
      aria-label={
        props.open
          ? `Aktionen für ${props.noun} ausblenden`
          : `Aktionen für ${props.noun} anzeigen`
      }
      class={`hidden size-7 shrink-0 items-center justify-center rounded-xs transition-colors pointer-coarse:inline-flex ${
        props.open ? "bg-surface text-text" : "text-text-muted"
      }`}
    >
      <Ellipsis class="size-4" strokeWidth={1.75} aria-hidden />
    </button>
  );
}
