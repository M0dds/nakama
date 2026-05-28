import { createSignal, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { createMutation, useQueryClient } from "@tanstack/solid-query";
import { Check, X } from "lucide-solid";
import {
  deleteList,
  listsQueryKey,
  type ListSummary,
} from "@/lib/queries/lists";

/**
 * Inline-confirm delete. Click the trigger → it expands to
 * "Wirklich löschen? · ✓ / ✗" in the same slot. Reduces dialog footprint
 * per the handshake's "Dialog-Reduktion" directive.
 *
 * The reverse-action (✗) blurs itself before flipping state to avoid the
 * React-DOM-node-reuse focus-leak that bit us in Logbook — Solid reconciles
 * differently, but the discipline ports cleanly: never expect a transient
 * Confirm button to keep focus through its own state change.
 */
export function DeleteListButton(props: {
  listId: string;
  listName: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = createSignal(false);

  const mutation = createMutation(() => ({
    mutationFn: () => deleteList(props.listId),
    onSuccess: () => {
      // Patch the overview cache directly so the deleted row vanishes
      // before the refetch lands.
      queryClient.setQueryData<{
        private: ListSummary[];
        shared: ListSummary[];
      } | undefined>(listsQueryKey, (prev) => {
        if (!prev) return prev;
        return {
          private: prev.private.filter((l) => l.id !== props.listId),
          shared: prev.shared.filter((l) => l.id !== props.listId),
        };
      });
      navigate("/lists", { replace: true });
    },
  }));

  // The PageHeader aside slot is h-6 items-center. The trigger renders
  // as plain text (centered in 24px). The confirm cluster uses items-
  // center too so size-6 buttons (24px) fill the slot exactly and the
  // text sits centered in the same band — no baseline shift between
  // the two states.
  return (
    <Show
      when={confirming()}
      fallback={
        <button
          type="button"
          onClick={() => setConfirming(true)}
          class="font-mono text-mini uppercase tracking-wider text-text-muted transition-colors hover:text-accent"
        >
          Liste löschen
        </button>
      }
    >
      <span class="inline-flex items-center gap-2">
        <span class="font-mono text-mini uppercase tracking-wider text-text-muted">
          Wirklich löschen?
        </span>
        <button
          type="button"
          aria-label="Ja, löschen"
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
