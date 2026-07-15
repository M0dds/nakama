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
 * Delete a list. The trigger lives in the PageHeader aside: spelled out on
 * desktop, icon-only (trash) below md — the aside is shrink-0, so the text
 * button ate the title's width on phones and truncated it early (user call,
 * 2026-07-15). Either trigger opens the app-wide ConfirmDialog (replacing the
 * former inline "Wirklich löschen? · ✓ / ✗" — see ConfirmDialog for why).
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
        class="hidden font-mono text-mini uppercase tracking-wider text-text-muted transition-colors hover:text-accent md:block"
      >
        Liste löschen
      </button>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label="Liste löschen"
        class="inline-flex size-7 items-center justify-center rounded-xs text-text-muted transition-colors hover:bg-surface hover:text-accent md:hidden"
      >
        <Trash2 class="size-4" strokeWidth={1.75} aria-hidden />
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
