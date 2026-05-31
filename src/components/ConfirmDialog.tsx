import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import { X } from "lucide-solid";
import { Button } from "@/components/Button";

/**
 * The app-wide confirm dialog. Every destructive/consequential action routes
 * through this instead of an inline two-step "Wirklich? · ✓ / ✗" cluster — the
 * inline form cramped tight slots (a wrapping title next to it in the
 * PageHeader aside, a row edge), so we lift the question into a modal with room
 * to breathe.
 *
 * Mechanics mirror MoveItemDialog / the old SyncConfirmDialog so all modals
 * read as one gesture:
 *   - Two-signal mount/visible (DOM lifetime vs. opacity), double-rAF on open.
 *   - `snap` keeps a COPY of the textual content for the close cycle, so the
 *     card doesn't collapse the instant the parent clears the source signal.
 *   - Backdrop dim+blur and card opacity ramp together on the 500 ms curve.
 *   - Backdrop click / Escape / Cancel all call onClose; primary commits.
 *
 * The primary button stays the accent (same as the inline confirms it
 * replaces) — destructive intent is carried by the copy, not a red button.
 */
interface ConfirmContent {
  /** Mono mini-caps kicker above the title, e.g. "Liste löschen". */
  kicker: string;
  /** Heading — usually the subject (list/item/member name). */
  title: string;
  /** One short consequence sentence. Optional. */
  body?: string;
  /** Primary button label, e.g. "Löschen". */
  confirmLabel: string;
}

interface Props extends ConfirmContent {
  open: boolean;
  /** Mutation in flight — disables both actions. */
  pending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

const ANIM_MS = 500;

export function ConfirmDialog(props: Props) {
  const [mounted, setMounted] = createSignal(false);
  const [visible, setVisible] = createSignal(false);
  const [snap, setSnap] = createSignal<ConfirmContent | null>(null);
  let closeTimer: number | null = null;

  createEffect(() => {
    if (props.open) {
      if (closeTimer !== null) {
        window.clearTimeout(closeTimer);
        closeTimer = null;
      }
      setSnap({
        kicker: props.kicker,
        title: props.title,
        body: props.body,
        confirmLabel: props.confirmLabel,
      });
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

  // Read from the snap so content survives the close animation; fall back to
  // live props for the very first frame before the snap effect runs.
  const content = (): ConfirmContent => snap() ?? props;

  return (
    <Show when={mounted()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
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
                  {content().kicker}
                </span>
              </div>
              <h2
                id="confirm-dialog-title"
                class="mt-1 truncate text-heading font-medium tracking-tight text-text"
              >
                {content().title}
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

          <Show when={content().body}>
            {(body) => (
              <p class="px-6 pt-4 text-body text-text-muted">{body()}</p>
            )}
          </Show>

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
              {content().confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </Show>
  );
}
