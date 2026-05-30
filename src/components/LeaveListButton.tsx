import { createSignal, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { createMutation, useQueryClient } from "@tanstack/solid-query";
import { Check, LogOut, X } from "lucide-solid";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";
import { listsQueryKey, type ListSummary } from "@/lib/queries/lists";
import { leaveList } from "@/lib/queries/sharing";

/**
 * Inline-confirm "Liste verlassen" for the PageHeader aside — the member's
 * counterpart to the owner's DeleteListButton (same slot, same vocabulary).
 * Shown when the caller is a member but NOT the owner; the owner transfers
 * ownership or deletes instead.
 *
 * On success the list leaves the caller's overview (RLS drops it once they're
 * no longer a member), so we patch the overview cache + navigate back to /lists.
 */
export function LeaveListButton(props: { listId: string; listName: string }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [confirming, setConfirming] = createSignal(false);

  const mutation = createMutation(() => ({
    mutationFn: () =>
      leaveList({ listId: props.listId, userId: auth.user()!.id }),
    onSuccess: () => {
      toast(`Liste „${props.listName}“ verlassen.`, { icon: LogOut });
      queryClient.setQueryData<
        { private: ListSummary[]; shared: ListSummary[] } | undefined
      >(listsQueryKey, (prev) =>
        prev
          ? {
              private: prev.private.filter((l) => l.id !== props.listId),
              shared: prev.shared.filter((l) => l.id !== props.listId),
            }
          : prev,
      );
      void queryClient.invalidateQueries({ queryKey: listsQueryKey });
      navigate("/lists", { replace: true });
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
          Liste verlassen
        </button>
      }
    >
      <span class="inline-flex items-center gap-2">
        <span class="font-mono text-mini uppercase tracking-wider text-text-muted">
          Wirklich verlassen?
        </span>
        <button
          type="button"
          aria-label="Ja, verlassen"
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
