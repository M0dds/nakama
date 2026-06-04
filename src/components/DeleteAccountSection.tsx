import { createSignal, createMemo, For, Show } from "solid-js";
import { A, useNavigate } from "@solidjs/router";
import { createMutation, createQuery } from "@tanstack/solid-query";
import { Trash2 } from "lucide-solid";
import { useAuth } from "@/lib/auth";
import { signOut } from "@/lib/auth-actions";
import { useToast } from "@/lib/toast";
import { listsQueryOptions, type ListSummary } from "@/lib/queries/lists";
import { deleteAccount, myProfileOptions } from "@/lib/queries/profile";
import { ConfirmDialog } from "@/components/ConfirmDialog";

/**
 * Danger zone — bottom section of the Konto module. Per the chosen policy,
 * deletion is BLOCKED while the user still owns any list shared with other
 * members: those lists are listed (as links to where transfer/delete live) and
 * the button is disabled. Otherwise the button opens the app-wide ConfirmDialog
 * → delete_account RPC → sign out → /login.
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

  // The @handle the user must type back to confirm deletion. If it hasn't
  // loaded yet (or is somehow null), we omit the gate rather than block on a
  // phrase we can't show.
  const profile = createQuery(() => ({
    ...myProfileOptions(auth.user()!),
    enabled: !!auth.user(),
  }));
  const handle = () => profile.data?.username ?? undefined;

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
      {/* Context: why deletion is blocked. Pushes the button down only when
          present (mb-4), so the unblocked state sits flush under the divider. */}
      <Show when={blocking().length > 0}>
        <div class="mb-4">
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
        </div>
      </Show>

      {/* Subtle text link, same affordance as the "Abmelden" aside — the
          confirm dialog (type your @handle) is the real safety, so a quiet
          link is enough. */}
      <button
        type="button"
        disabled={blocking().length > 0}
        onClick={() => setConfirming(true)}
        class="font-mono text-mini uppercase tracking-wider text-text-muted transition-colors hover:text-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-text-muted"
      >
        Account löschen
      </button>
      <ConfirmDialog
        open={confirming()}
        kicker="Account löschen"
        title="Dein Account"
        body="Dein Profil, deine Listen und dein gesamter Fortschritt werden dauerhaft gelöscht. Das lässt sich nicht rückgängig machen."
        confirmPhrase={handle()}
        confirmLabel="Account löschen"
        pending={mutation.isPending}
        onConfirm={() => mutation.mutate()}
        onClose={() => setConfirming(false)}
      />
    </div>
  );
}
