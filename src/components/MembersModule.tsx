import { createSignal, For, Show } from "solid-js";
import { createMutation, createQuery, useQueryClient } from "@tanstack/solid-query";
import { Check, Crown, Mail, X } from "lucide-solid";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";
import { listsQueryKey } from "@/lib/queries/lists";
import {
  inviteToList,
  listInvitationsKey,
  listInvitationsOptions,
  listMembersKey,
  listMembersOptions,
  revokeInvitation,
  transferOwnership,
} from "@/lib/queries/sharing";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";

/**
 * Mitglieder-Modul (03) on the list-detail page. The sharing surface:
 *   - roster (every member, owner first; "du" marks self, "Ersteller" the owner).
 *     The owner sees a crown icon-button on every co-member's row to hand over
 *     ownership (inline-confirm right in the row).
 *   - invite-by-@handle (owner only) with inline result feedback
 *   - pending invitations (owner only) with revoke
 *
 * "Liste verlassen" is NOT here — it lives in the PageHeader aside (member's
 * counterpart to the owner's "Liste löschen"); see LeaveListButton.
 *
 * Mutations fan out to the cross-cutting list caches: the single-list query
 * (`["list"]` prefix) carries is_shared + member-count + owner_id, and the
 * overview (`listsQueryKey`) splits private vs shared, so an invite/transfer
 * must refresh both.
 */
const dtClass = "font-mono text-mini uppercase tracking-wider text-text-muted";
const sectionClass = "mt-5 border-t border-border pt-5";

function inviteErrorText(
  error: "empty" | "not_found" | "self" | "already_member",
  handle: string,
): string {
  switch (error) {
    case "empty":
      return "Bitte einen @handle eingeben.";
    case "not_found":
      return `Kein Nutzer „${handle}" gefunden.`;
    case "self":
      return "Das bist du selbst.";
    case "already_member":
      return `${handle} ist schon dabei.`;
    default:
      return "Einladen fehlgeschlagen.";
  }
}

export function MembersModule(props: {
  listId: string;
  isOwner: boolean;
}) {
  const auth = useAuth();
  const qc = useQueryClient();
  const toast = useToast();

  const members = createQuery(() => ({
    ...listMembersOptions(auth.user()!, props.listId),
    enabled: !!auth.user() && !!props.listId,
  }));

  const invitations = createQuery(() => ({
    ...listInvitationsOptions(props.listId),
    enabled: props.isOwner && !!props.listId,
  }));

  // Cross-cutting refresh after any membership/invitation write.
  const refreshShared = () => {
    void qc.invalidateQueries({ queryKey: listMembersKey(props.listId) });
    void qc.invalidateQueries({ queryKey: listInvitationsKey(props.listId) });
    void qc.invalidateQueries({ queryKey: ["list"] });
    void qc.invalidateQueries({ queryKey: listsQueryKey });
  };

  // ── Invite ───────────────────────────────────────────────────────────
  const [inviteValue, setInviteValue] = createSignal("");
  const [inviteMsg, setInviteMsg] = createSignal<
    { kind: "ok" | "err"; text: string } | null
  >(null);

  const inviteMut = createMutation(() => ({
    mutationFn: (username: string) =>
      inviteToList({ listId: props.listId, username }),
    onSuccess: (result) => {
      const entered = inviteValue().trim();
      const handle = entered.startsWith("@") ? entered : `@${entered}`;
      if (result.ok) {
        // Success → toast (the input clears, so a transient inline note would
        // read oddly). Errors stay inline, next to the field they belong to.
        setInviteValue("");
        setInviteMsg(null);
        toast(`Einladung an ${handle} gesendet.`, { icon: Mail });
        refreshShared();
      } else {
        setInviteMsg({ kind: "err", text: inviteErrorText(result.error, handle) });
      }
    },
    onError: () =>
      setInviteMsg({ kind: "err", text: "Einladen fehlgeschlagen." }),
  }));

  const onInvite = (e: Event) => {
    e.preventDefault();
    const v = inviteValue().trim();
    if (!v) {
      setInviteMsg({ kind: "err", text: inviteErrorText("empty", "") });
      return;
    }
    inviteMut.mutate(v);
  };

  // ── Revoke ───────────────────────────────────────────────────────────
  const revokeMut = createMutation(() => ({
    mutationFn: (invitationId: string) => revokeInvitation(invitationId),
    onSuccess: () => {
      toast("Einladung zurückgezogen.");
      refreshShared();
    },
  }));

  // ── Ownership transfer (per-row crown, inline-confirm) ─────────────────
  // Holds the user_id of the member whose row is currently in confirm state.
  const [transferConfirmId, setTransferConfirmId] = createSignal<string | null>(
    null,
  );
  const transferMut = createMutation(() => ({
    mutationFn: (newOwnerId: string) =>
      transferOwnership({ listId: props.listId, newOwnerId }),
    onSuccess: (_d, newOwnerId) => {
      const m = members.data?.find((x) => x.userId === newOwnerId);
      setTransferConfirmId(null);
      toast(m ? `${m.name} ist jetzt Ersteller.` : "Eigentum übergeben.", {
        icon: Crown,
      });
      refreshShared();
    },
    onError: () => setTransferConfirmId(null),
  }));

  return (
    <div>
      {/* Roster */}
      <Show
        when={members.data && members.data.length > 0}
        fallback={<p class="text-body text-text-muted">Lade Mitglieder …</p>}
      >
        <ul>
          <For each={members.data}>
            {(m) => (
              <li class="flex items-center gap-3 py-2">
                <Avatar handle={m.name} avatarUrl={m.avatarUrl} size={32} />
                <div class="min-w-0 flex-1">
                  <p class="truncate text-body text-text">
                    {m.name}
                    <Show when={m.isMe}>
                      <span class="text-text-muted"> · du</span>
                    </Show>
                  </p>
                  {/* @handle as a secondary id, unless it's just the @-prefixed
                      display name (magic-link users, where both derive from the
                      email — no point showing "maria" then "@maria"). */}
                  <Show
                    when={
                      m.handle &&
                      m.handle !== m.name &&
                      m.handle !== `@${m.name}`
                    }
                  >
                    <p class="truncate font-mono text-mini text-text-muted">
                      {m.handle}
                    </p>
                  </Show>
                </div>

                <Show when={m.role === "owner"}>
                  <span class={`${dtClass} shrink-0`}>Ersteller</span>
                </Show>

                {/* Hand over ownership — owner only, on co-members' rows. */}
                <Show when={props.isOwner && !m.isMe && m.role !== "owner"}>
                  <Show
                    when={transferConfirmId() === m.userId}
                    fallback={
                      <button
                        type="button"
                        aria-label={`${m.name} zum Ersteller machen`}
                        title="Eigentum übergeben"
                        disabled={transferMut.isPending}
                        onClick={() => setTransferConfirmId(m.userId)}
                        class="inline-flex size-6 shrink-0 items-center justify-center rounded-xs text-text-muted transition-colors hover:bg-surface hover:text-accent disabled:opacity-50"
                      >
                        <Crown class="size-3.5" strokeWidth={1.75} />
                      </button>
                    }
                  >
                    <span class="flex shrink-0 items-center gap-2">
                      <span class="text-mini text-text-muted">Übergeben?</span>
                      <button
                        type="button"
                        aria-label="Ja, übergeben"
                        disabled={transferMut.isPending}
                        onClick={() => transferMut.mutate(m.userId)}
                        class="inline-flex size-6 items-center justify-center rounded-xs bg-accent text-accent-on transition-opacity hover:opacity-90 disabled:opacity-50"
                      >
                        <Check class="size-3.5" strokeWidth={2.5} />
                      </button>
                      <button
                        type="button"
                        aria-label="Abbrechen"
                        onClick={(e) => {
                          e.currentTarget.blur();
                          setTransferConfirmId(null);
                        }}
                        class="inline-flex size-6 items-center justify-center rounded-xs border border-border text-text-muted transition-colors hover:bg-surface hover:text-text"
                      >
                        <X class="size-3.5" strokeWidth={2} />
                      </button>
                    </span>
                  </Show>
                </Show>
              </li>
            )}
          </For>
        </ul>
      </Show>

      {/* Invite — owner only */}
      <Show when={props.isOwner}>
        <form onSubmit={onInvite} class={sectionClass}>
          <label class={`${dtClass} block`} for="invite-handle">
            Mitglied einladen
          </label>
          <div class="mt-2 flex items-center gap-2">
            <input
              id="invite-handle"
              type="text"
              autocomplete="off"
              spellcheck={false}
              value={inviteValue()}
              onInput={(e) => {
                setInviteValue(e.currentTarget.value);
                if (inviteMsg()) setInviteMsg(null);
              }}
              placeholder="@handle"
              class="min-w-0 flex-1 rounded-sm border border-border bg-transparent px-3 py-2 text-body text-text transition-colors placeholder:text-text-muted hover:border-text-muted focus:border-accent focus:outline-none"
            />
            <Button type="submit" disabled={inviteMut.isPending}>
              Einladen
            </Button>
          </div>
          <Show when={inviteMsg()}>
            {(msg) => (
              <p
                class="mt-2 text-mini"
                classList={{
                  "text-accent": msg().kind === "ok",
                  "text-text-muted": msg().kind === "err",
                }}
              >
                {msg().text}
              </p>
            )}
          </Show>
        </form>
      </Show>

      {/* Pending invitations — owner only */}
      <Show when={props.isOwner && (invitations.data?.length ?? 0) > 0}>
        <div class={sectionClass}>
          <p class={dtClass}>Ausstehend</p>
          <ul class="mt-2">
            <For each={invitations.data}>
              {(inv) => (
                <li class="flex items-center gap-3 py-2">
                  <Avatar handle={inv.inviteeName} size={32} />
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-body text-text">{inv.inviteeName}</p>
                    <p class="font-mono text-mini text-text-muted">ausstehend</p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Einladung an ${inv.inviteeName} zurückziehen`}
                    disabled={revokeMut.isPending}
                    onClick={() => revokeMut.mutate(inv.invitationId)}
                    class="inline-flex size-6 shrink-0 items-center justify-center rounded-xs border border-border text-text-muted transition-colors hover:bg-surface hover:text-text disabled:opacity-50"
                  >
                    <X class="size-3.5" strokeWidth={2} />
                  </button>
                </li>
              )}
            </For>
          </ul>
        </div>
      </Show>
    </div>
  );
}
