import { For, Show } from "solid-js";
import { createMutation, createQuery, useQueryClient } from "@tanstack/solid-query";
import { useAuth } from "@/lib/auth";
import { listsQueryKey } from "@/lib/queries/lists";
import {
  acceptInvitation,
  declineInvitation,
  myInvitationsKey,
  myInvitationsOptions,
  type IncomingInvitation,
} from "@/lib/queries/sharing";
import { Button } from "@/components/Button";

/**
 * Incoming-invitation inbox — a full-bleed banner above the /lists grid,
 * rendered only when invitations are pending. Treated as an actionable
 * notification (accent label) rather than a permanent numbered Bento cell, so
 * its appearance/disappearance doesn't renumber the sections below.
 *
 * Accept routes through the definer RPC (flips status + inserts membership);
 * decline is the invitee's own UPDATE → 'declined'. Both optimistically drop
 * the card, then invalidate the overview (a newly-joined list must appear) and
 * the badge query.
 */
export function InvitationsInbox() {
  const auth = useAuth();
  const qc = useQueryClient();

  const invitations = createQuery(() => ({
    ...myInvitationsOptions(auth.user()!),
    enabled: !!auth.user(),
  }));

  const dropCard = (invitationId: string) => {
    const key = myInvitationsKey(auth.user()!.id);
    const prev = qc.getQueryData<IncomingInvitation[]>(key);
    qc.setQueryData<IncomingInvitation[]>(key, (old) =>
      (old ?? []).filter((i) => i.invitationId !== invitationId),
    );
    return { prev, key };
  };

  const acceptMut = createMutation(() => ({
    mutationFn: (invitationId: string) => acceptInvitation(invitationId),
    onMutate: dropCard,
    onError: (_e, _id, ctx) => {
      if (ctx) qc.setQueryData(ctx.key, ctx.prev);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: myInvitationsKey(auth.user()!.id) });
      void qc.invalidateQueries({ queryKey: listsQueryKey });
    },
  }));

  const declineMut = createMutation(() => ({
    mutationFn: (invitationId: string) => declineInvitation(invitationId),
    onMutate: dropCard,
    onError: (_e, _id, ctx) => {
      if (ctx) qc.setQueryData(ctx.key, ctx.prev);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: myInvitationsKey(auth.user()!.id) });
    },
  }));

  const busy = (invitationId: string) =>
    (acceptMut.isPending && acceptMut.variables === invitationId) ||
    (declineMut.isPending && declineMut.variables === invitationId);

  return (
    <Show when={(invitations.data?.length ?? 0) > 0}>
      <section class="border-b border-rule p-5">
        <h2 class="mb-3 font-mono text-label uppercase tracking-[0.18em] text-accent">
          Einladungen
        </h2>
        <ul class="-mx-5">
          <For each={invitations.data}>
            {(inv) => (
              <li class="relative flex flex-col gap-3 px-5 py-3 after:absolute after:inset-x-5 after:bottom-0 after:h-px after:bg-border last:after:hidden sm:flex-row sm:items-center sm:justify-between">
                <p class="text-body text-text">
                  <span class="font-medium">{inv.inviterName}</span> lädt dich zu{" "}
                  <span class="font-medium">„{inv.listName}"</span> ein
                </p>
                <div class="flex shrink-0 items-center gap-2">
                  <Button
                    disabled={busy(inv.invitationId)}
                    onClick={() => acceptMut.mutate(inv.invitationId)}
                  >
                    Annehmen
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={busy(inv.invitationId)}
                    onClick={() => declineMut.mutate(inv.invitationId)}
                  >
                    Ablehnen
                  </Button>
                </div>
              </li>
            )}
          </For>
        </ul>
      </section>
    </Show>
  );
}
