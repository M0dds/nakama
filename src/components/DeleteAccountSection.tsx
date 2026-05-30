import { createSignal, createMemo, For, Show } from "solid-js";
import { A, useNavigate } from "@solidjs/router";
import { createMutation, createQuery } from "@tanstack/solid-query";
import { Check, Trash2, X } from "lucide-solid";
import { useAuth } from "@/lib/auth";
import { signOut } from "@/lib/auth-actions";
import { useToast } from "@/lib/toast";
import { listsQueryOptions, type ListSummary } from "@/lib/queries/lists";
import { deleteAccount } from "@/lib/queries/profile";

/**
 * Danger zone — bottom section of the Konto module. Per the chosen policy,
 * deletion is BLOCKED while the user still owns any list shared with other
 * members: those lists are listed (as links to where transfer/delete live) and
 * the button is disabled. Otherwise it's the app's standard inline-confirm
 * (mirrors DeleteListButton) → delete_account RPC → sign out → /login.
 *
 * Blocking is derived from the already-modelled listsQueryOptions (isOwner +
 * memberCount, where memberCount counts self), so no extra query shape.
 */
export function DeleteAccountSection() {
  const auth = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [confirming, setConfirming] = createSignal(false);

  const lists = createQuery(() => ({
    ...listsQueryOptions(auth.user()!),
    enabled: !!auth.user(),
  }));

  const blocking = createMemo<ListSummary[]>(() => {
    const data = lists.data;
    if (!data) return [];
    return [...data.private, ...data.shared].filter(
      (l) => l.isOwner && l.memberCount > 1,
    );
  });

  const mutation = createMutation(() => ({
    mutationFn: () => deleteAccount(),
    onSuccess: async () => {
      // Toast survives the navigate (provider lives in AppShell).
      toast("Account gelöscht.", { icon: Trash2 });
      await signOut();
      navigate("/login", { replace: true });
    },
    onError: () => {
      toast("Account konnte nicht gelöscht werden.");
      setConfirming(false);
    },
  }));

  return (
    <div class="mt-5 border-t border-border pt-5">
      <Show
        when={blocking().length > 0}
        fallback={
          <Show
            when={confirming()}
            fallback={
              <button
                type="button"
                onClick={() => setConfirming(true)}
                class="font-mono text-mini uppercase tracking-wider text-text-muted transition-colors hover:text-accent"
              >
                Account löschen
              </button>
            }
          >
            <span class="inline-flex items-center gap-2">
              <span class="font-mono text-mini uppercase tracking-wider text-text-muted">
                Endgültig löschen?
              </span>
              <button
                type="button"
                aria-label="Ja, Account löschen"
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
        }
      >
        <p class="text-mini text-text-muted">
          Du bist noch Ersteller von {blocking().length} geteilten{" "}
          {blocking().length === 1 ? "Liste" : "Listen"}. Übergib oder lösche
          sie zuerst:
        </p>
        <ul class="mt-2 space-y-1">
          <For each={blocking()}>
            {(l) => (
              <li>
                <A
                  href={`/lists/${l.shortCode}`}
                  class="font-mono text-mini text-text transition-colors hover:text-accent"
                >
                  · {l.name}
                </A>
              </li>
            )}
          </For>
        </ul>
        <button
          type="button"
          disabled
          class="mt-4 cursor-not-allowed font-mono text-mini uppercase tracking-wider text-text-muted opacity-50"
        >
          Account löschen
        </button>
      </Show>
    </div>
  );
}
