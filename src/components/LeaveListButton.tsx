import { createSignal } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { createMutation, useQueryClient } from "@tanstack/solid-query";
import { LogOut } from "lucide-solid";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";
import { listsQueryKey, type ListSummary } from "@/lib/queries/lists";
import { leaveList } from "@/lib/queries/sharing";

/**
 * "Liste verlassen" for the PageHeader aside — the member's counterpart to the
 * owner's DeleteListButton (same slot, same vocabulary, same ConfirmDialog).
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
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        class="font-mono text-mini uppercase tracking-wider text-text-muted transition-colors hover:text-accent"
      >
        Liste verlassen
      </button>
      <ConfirmDialog
        open={confirming()}
        kicker="Liste verlassen"
        title={props.listName}
        body="Du verlässt diese geteilte Liste. Dein eigener Fortschritt bleibt erhalten; du siehst die Liste danach nicht mehr."
        confirmLabel="Verlassen"
        pending={mutation.isPending}
        onConfirm={() => mutation.mutate()}
        onClose={() => setConfirming(false)}
      />
    </>
  );
}
