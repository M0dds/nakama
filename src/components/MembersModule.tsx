import { createEffect, createSignal, For, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { createMutation, createQuery, useQueryClient } from "@tanstack/solid-query";
import { Check, X } from "lucide-solid";
import { useAuth } from "@/lib/auth";
import { listsQueryKey } from "@/lib/queries/lists";
import {
  inviteToList,
  leaveList,
  listInvitationsKey,
  listInvitationsOptions,
  listMembersKey,
  listMembersOptions,
  revokeInvitation,
  transferOwnership,
} from "@/lib/queries/sharing";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { SelectMenu } from "@/components/SelectMenu";

/**
 * Mitglieder-Modul (03) on the list-detail page. The sharing surface:
 *   - roster (every member, owner first; "du" marks self, "Ersteller" the owner)
 *   - invite-by-@handle (owner only) with inline result feedback
 *   - pending invitations (owner only) with revoke
 *   - ownership transfer (owner, when ≥1 co-member exists)
 *   - leave-list (non-owner)
 *
 * Mutations fan out to the cross-cutting list caches: the single-list query
 * (`["list"]` prefix — covers every open shortCode) carries is_shared +
 * member-count embeds, and the overview (`listsQueryKey`) splits private vs
 * shared, so an invite/accept/leave must refresh both.
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
  const navigate = useNavigate();
  const qc = useQueryClient();

  const members = createQuery(() => ({
    ...listMembersOptions(auth.user()!, props.listId),
    enabled: !!auth.user() && !!props.listId,
  }));

  const invitations = createQuery(() => ({
    ...listInvitationsOptions(props.listId),
    enabled: props.isOwner && !!props.listId,
  }));

  const otherMembers = () => (members.data ?? []).filter((m) => !m.isMe);

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
      if (result.ok) {
        setInviteValue("");
        setInviteMsg({ kind: "ok", text: "Einladung gesendet." });
        refreshShared();
      } else {
        const entered = inviteValue().trim();
        const handle = entered.startsWith("@") ? entered : `@${entered}`;
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
    onSuccess: refreshShared,
  }));

  // ── Ownership transfer ─────────────────────────────────────────────────
  const [transferTarget, setTransferTarget] = createSignal("");
  const [transferConfirming, setTransferConfirming] = createSignal(false);
  // Default the picker to the first co-member once the roster loads.
  createEffect(() => {
    const others = otherMembers();
    if (others.length > 0 && !others.some((m) => m.userId === transferTarget()))
      setTransferTarget(others[0].userId);
  });
  const transferTargetHandle = () =>
    otherMembers().find((m) => m.userId === transferTarget())?.handle ?? "";

  const transferMut = createMutation(() => ({
    mutationFn: (newOwnerId: string) =>
      transferOwnership({ listId: props.listId, newOwnerId }),
    onSuccess: () => {
      setTransferConfirming(false);
      refreshShared();
    },
  }));

  // ── Leave ────────────────────────────────────────────────────────────
  const [leaveConfirming, setLeaveConfirming] = createSignal(false);
  const leaveMut = createMutation(() => ({
    mutationFn: () =>
      leaveList({ listId: props.listId, userId: auth.user()!.id }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: listsQueryKey });
      navigate("/lists", { replace: true });
    },
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
                <Avatar handle={m.handle} avatarUrl={m.avatarUrl} size={32} />
                <div class="min-w-0 flex-1">
                  <p class="truncate text-body text-text">
                    {m.handle}
                    <Show when={m.isMe}>
                      <span class="text-text-muted"> · du</span>
                    </Show>
                  </p>
                </div>
                <Show when={m.role === "owner"}>
                  <span class={`${dtClass} shrink-0`}>Ersteller</span>
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

      {/* Ownership transfer — owner, when a co-member exists */}
      <Show when={props.isOwner && otherMembers().length > 0}>
        <div class={sectionClass}>
          <p class={dtClass}>Eigentum übergeben</p>
          <Show
            when={!transferConfirming()}
            fallback={
              <span class="mt-2 flex items-center gap-2">
                <span class="flex-1 text-mini text-text-muted">
                  An {transferTargetHandle()} übergeben?
                </span>
                <button
                  type="button"
                  aria-label="Ja, übergeben"
                  disabled={transferMut.isPending}
                  onClick={() => transferMut.mutate(transferTarget())}
                  class="inline-flex size-6 items-center justify-center rounded-xs bg-accent text-accent-on transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  <Check class="size-3.5" strokeWidth={2.5} />
                </button>
                <button
                  type="button"
                  aria-label="Abbrechen"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    setTransferConfirming(false);
                  }}
                  class="inline-flex size-6 items-center justify-center rounded-xs border border-border text-text-muted transition-colors hover:bg-surface hover:text-text"
                >
                  <X class="size-3.5" strokeWidth={2} />
                </button>
              </span>
            }
          >
            <div class="mt-2 flex items-center gap-2">
              <div class="min-w-0 flex-1">
                <SelectMenu
                  ariaLabel="Mitglied auswählen"
                  value={transferTarget()}
                  onChange={setTransferTarget}
                  options={otherMembers().map((m) => ({
                    id: m.userId,
                    label: m.handle,
                  }))}
                />
              </div>
              <Button
                variant="secondary"
                onClick={() => setTransferConfirming(true)}
              >
                Übergeben
              </Button>
            </div>
          </Show>
        </div>
      </Show>

      {/* Leave — non-owner */}
      <Show when={!props.isOwner && members.data}>
        <div class={sectionClass}>
          <Show
            when={!leaveConfirming()}
            fallback={
              <span class="flex items-center gap-2">
                <span class="flex-1 text-mini text-text-muted">
                  Liste wirklich verlassen?
                </span>
                <button
                  type="button"
                  aria-label="Ja, verlassen"
                  disabled={leaveMut.isPending}
                  onClick={() => leaveMut.mutate()}
                  class="inline-flex size-6 items-center justify-center rounded-xs bg-accent text-accent-on transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  <Check class="size-3.5" strokeWidth={2.5} />
                </button>
                <button
                  type="button"
                  aria-label="Abbrechen"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    setLeaveConfirming(false);
                  }}
                  class="inline-flex size-6 items-center justify-center rounded-xs border border-border text-text-muted transition-colors hover:bg-surface hover:text-text"
                >
                  <X class="size-3.5" strokeWidth={2} />
                </button>
              </span>
            }
          >
            <button
              type="button"
              onClick={() => setLeaveConfirming(true)}
              class="font-mono text-mini uppercase tracking-wider text-text-muted transition-colors hover:text-accent"
            >
              Liste verlassen
            </button>
          </Show>
        </div>
      </Show>
    </div>
  );
}
