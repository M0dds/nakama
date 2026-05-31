import { createSignal } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { createMutation, useQueryClient } from "@tanstack/solid-query";
import { Trash2 } from "lucide-solid";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/lib/toast";
import {
  deleteList,
  listsQueryKey,
  type ListSummary,
} from "@/lib/queries/lists";

/**
 * Delete a list. The trigger is a plain text button in the PageHeader aside;
 * tapping it opens the app-wide ConfirmDialog (replacing the former inline
 * "Wirklich löschen? · ✓ / ✗" — see ConfirmDialog for why).
 */
export function DeleteListButton(props: {
  listId: string;
  listName: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [confirming, setConfirming] = createSignal(false);

  const mutation = createMutation(() => ({
    mutationFn: () => deleteList(props.listId),
    onSuccess: () => {
      // Toast survives the navigate (provider lives in AppShell), so the
      // confirmation lands on /lists where the list is now gone.
      toast(`Liste „${props.listName}“ gelöscht.`, { icon: Trash2 });
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

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        class="font-mono text-mini uppercase tracking-wider text-text-muted transition-colors hover:text-accent"
      >
        Liste löschen
      </button>
      <ConfirmDialog
        open={confirming()}
        kicker="Liste löschen"
        title={props.listName}
        body="Die Liste und alle darin gesammelten Titel werden entfernt. Das lässt sich nicht rückgängig machen."
        confirmLabel="Löschen"
        pending={mutation.isPending}
        onConfirm={() => mutation.mutate()}
        onClose={() => setConfirming(false)}
      />
    </>
  );
}
