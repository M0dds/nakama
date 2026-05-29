import { createSignal, Show } from "solid-js";
import { createMutation, useQueryClient } from "@tanstack/solid-query";
import { ArrowRightLeft, Check, RotateCcw, X } from "lucide-solid";
import { Tooltip } from "@/components/Tooltip";
import {
  episodesQueryKey,
  resetItemProgress,
} from "@/lib/queries/episodes";
import {
  listItemsQueryKey,
  listsQueryKey,
  removeListItem,
} from "@/lib/queries/lists";

/**
 * Hover-revealed quick-action group on an item row in a list. Three icons,
 * Logbook-logic but Nakama-styled (hard corners, hairlines, no pills):
 *
 *   • Reset (RotateCcw)        — wipes the caller's watch history for this
 *                                item; inline two-step confirm.
 *   • Verschieben (⇄)          — opens a MoveItemDialog (Commit B).
 *   • Aus Liste entfernen (✕)  — deletes the list_items row; inline two-
 *                                step confirm. The item itself stays in the
 *                                catalogue, and watch history with it.
 *
 * Default state: opacity-0 + pointer-events-none. The parent row sets
 * `group` so on `:hover` we fade the actions in. Confirm-state pins
 * everything visible (opacity-100 unconditionally) so the two-step decision
 * doesn't disappear if the mouse drifts off the row.
 */
interface Props {
  /** Items.id UUID — what reset_item_progress takes. */
  itemId: string;
  /** Row to delete on "remove". */
  listItemId: string;
  /** Used in aria-labels + the inline confirm prompt. */
  itemTitle: string;
  /** Used to invalidate episodesQueryKey after a reset. */
  itemType: string;
  itemSlug: string;
  /** Used to invalidate listItemsQueryKey after a remove. */
  listShortCode: string;
  /** Set to true from the parent while a Move-Dialog is open, so the
   *  action group stays pinned even though the mouse has left the row. */
  pinned?: boolean;
  /** Called by the Verschieben icon — parent owns the dialog state so the
   *  dialog can portal to the page level without nesting inside the row. */
  onRequestMove: () => void;
}

type Confirming = "reset" | "remove" | null;

export function ListEntryActions(props: Props) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = createSignal<Confirming>(null);

  const resetMut = createMutation(() => ({
    mutationFn: () => resetItemProgress(props.itemId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: episodesQueryKey(props.itemType, props.itemSlug),
      });
      setConfirming(null);
    },
  }));

  const removeMut = createMutation(() => ({
    mutationFn: () => removeListItem(props.listItemId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: listItemsQueryKey(props.listShortCode),
      });
      // Overview shows itemCount on the list card — refresh it too.
      void queryClient.invalidateQueries({ queryKey: listsQueryKey });
      setConfirming(null);
    },
  }));

  const isPinned = () => !!confirming() || props.pinned === true;

  return (
    <div
      class={`flex shrink-0 items-center gap-1 transition-opacity duration-200 [transition-timing-function:var(--ease-quart)] ${
        isPinned()
          ? "opacity-100"
          : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100"
      }`}
    >
      <Show
        when={confirming()}
        fallback={
          <>
            <Tooltip label="Fortschritt zurücksetzen">
              <button
                type="button"
                onClick={() => setConfirming("reset")}
                aria-label={`Fortschritt für ${props.itemTitle} zurücksetzen`}
                class="inline-flex size-7 items-center justify-center rounded-xs text-text-muted transition-colors hover:bg-bg hover:text-text"
              >
                <RotateCcw class="size-4" strokeWidth={1.75} aria-hidden />
              </button>
            </Tooltip>
            <Tooltip label="In andere Liste verschieben">
              <button
                type="button"
                onClick={() => props.onRequestMove()}
                aria-label={`${props.itemTitle} verschieben`}
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
                onClick={() => setConfirming("remove")}
                aria-label={`${props.itemTitle} aus Liste entfernen`}
                class="inline-flex size-7 items-center justify-center rounded-xs text-text-muted transition-colors hover:bg-bg hover:text-accent"
              >
                <X class="size-4" strokeWidth={1.75} aria-hidden />
              </button>
            </Tooltip>
          </>
        }
      >
        <ConfirmStrip
          label={confirming() === "reset" ? "Zurücksetzen?" : "Entfernen?"}
          confirmAria={
            confirming() === "reset"
              ? "Fortschritt zurücksetzen bestätigen"
              : "Aus Liste entfernen bestätigen"
          }
          pending={
            confirming() === "reset"
              ? resetMut.isPending
              : removeMut.isPending
          }
          onConfirm={() => {
            if (confirming() === "reset") resetMut.mutate();
            else removeMut.mutate();
          }}
          onCancel={() => setConfirming(null)}
        />
      </Show>
    </div>
  );
}

function ConfirmStrip(props: {
  label: string;
  confirmAria: string;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <span
        class="font-mono text-mini uppercase tracking-wider text-text-muted"
        aria-live="polite"
      >
        {props.label}
      </span>
      <button
        type="button"
        disabled={props.pending}
        // Blur before the state change so focus-within doesn't keep the
        // group pinned to its now-stale children (same trick the Logbook
        // ListEntryActions uses).
        onClick={(e) => {
          e.currentTarget.blur();
          props.onConfirm();
        }}
        aria-label={props.confirmAria}
        class="inline-flex size-7 items-center justify-center rounded-xs bg-accent text-accent-on transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        <Check class="size-4" strokeWidth={2.5} aria-hidden />
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.currentTarget.blur();
          props.onCancel();
        }}
        aria-label="Abbrechen"
        class="inline-flex size-7 items-center justify-center rounded-xs border border-border text-text-muted transition-colors hover:bg-surface hover:text-text"
      >
        <X class="size-4" strokeWidth={2} aria-hidden />
      </button>
    </>
  );
}
