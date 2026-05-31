import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import { X } from "lucide-solid";
import { Button } from "@/components/Button";

/**
 * Confirm dialog for flipping an item's sync state. The SyncToggle owns the
 * pending direction; flipping the Segmented opens this modal, which explains
 * the consequence with room to breathe and commits on the primary button.
 * Cancel / backdrop / Escape close it (the toggle snaps back).
 *
 * Mirrors MoveItemDialog's mechanics so both modals read as the same gesture:
 *   - Two-signal mount/visible (DOM lifetime vs. opacity), double-rAF on open.
 *   - `snap` keeps a copy of the direction + list name for the close cycle, so
 *     the content doesn't collapse the instant the parent nulls `pending`.
 *   - Backdrop dim+blur and card opacity ramp together on the 500 ms curve.
 */
interface Props {
  open: boolean;
  /** true = turning sync ON (fresh shared run), false = turning it OFF. */
  enabling: boolean;
  listName: string;
  /** Mutation in flight — disables both actions. */
  pending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

const ANIM_MS = 500;

export function SyncConfirmDialog(props: Props) {
  const [mounted, setMounted] = createSignal(false);
  const [visible, setVisible] = createSignal(false);
  const [snap, setSnap] = createSignal<{
    enabling: boolean;
    listName: string;
  } | null>(null);
  let closeTimer: number | null = null;

  createEffect(() => {
    if (props.open) {
      if (closeTimer !== null) {
        window.clearTimeout(closeTimer);
        closeTimer = null;
      }
      setSnap({ enabling: props.enabling, listName: props.listName });
      setMounted(true);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => setVisible(true)),
      );
    } else {
      setVisible(false);
      if (closeTimer !== null) window.clearTimeout(closeTimer);
      closeTimer = window.setTimeout(() => {
        setMounted(false);
        setSnap(null);
        closeTimer = null;
      }, ANIM_MS);
    }
  });

  onCleanup(() => {
    if (closeTimer !== null) window.clearTimeout(closeTimer);
  });

  // Body-scroll lock + Escape-to-close, gated on `mounted` so the page stays
  // locked through the close animation.
  createEffect(() => {
    if (!mounted()) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    onCleanup(() => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    });
  });

  const enabling = () => snap()?.enabling ?? props.enabling;

  return (
    <Show when={mounted()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sync-confirm-title"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <button
          type="button"
          aria-label="Abbrechen"
          onClick={props.onClose}
          class={`absolute inset-0 transition-all duration-500 [transition-timing-function:var(--ease-quart)] ${
            visible()
              ? "bg-black/50 backdrop-blur-sm"
              : "bg-black/0 backdrop-blur-none"
          }`}
        />
        <div
          class={`relative flex w-full max-w-sm flex-col overflow-hidden rounded-sm bg-bg shadow-floating transition-opacity duration-500 [transition-timing-function:var(--ease-quart)] ${
            visible() ? "opacity-100" : "opacity-0"
          }`}
        >
          <header class="flex items-start justify-between gap-3 border-b border-rule px-6 pb-4 pt-5">
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <span
                  aria-hidden
                  class="size-2 shrink-0 rounded-full bg-accent"
                />
                <span class="font-mono text-mini uppercase tracking-[0.25em] text-text-muted">
                  {enabling() ? "Synchronisieren" : "Sync beenden"}
                </span>
              </div>
              <h2
                id="sync-confirm-title"
                class="mt-1 truncate text-heading font-medium tracking-tight text-text"
              >
                {snap()?.listName ?? ""}
              </h2>
            </div>
            <button
              type="button"
              onClick={props.onClose}
              aria-label="Schließen"
              class="-mr-1 inline-flex size-7 shrink-0 items-center justify-center rounded-xs text-text-muted transition-colors hover:bg-surface hover:text-text"
            >
              <X class="size-4" strokeWidth={1.75} aria-hidden />
            </button>
          </header>

          <p class="px-6 pt-4 text-body text-text-muted">
            {enabling()
              ? "Ihr seht diesen Titel von vorne gemeinsam — eine frische, geteilte Spur ab null. Häkchen gelten ab jetzt für alle Mitglieder; dein bisheriger eigener Stand bleibt davon unberührt."
              : "Der gemeinsame Fortschritt fließt in den Einzelstand jedes Mitglieds zurück — nichts geht verloren — und die geteilte Spur wird aufgelöst."}
          </p>

          <div class="flex justify-end gap-2 px-6 pb-5 pt-5">
            <Button
              variant="secondary"
              onClick={props.onClose}
              disabled={props.pending}
            >
              Abbrechen
            </Button>
            <Button
              variant="primary"
              onClick={props.onConfirm}
              disabled={props.pending}
            >
              {enabling() ? "Synchronisieren" : "Beenden"}
            </Button>
          </div>
        </div>
      </div>
    </Show>
  );
}
