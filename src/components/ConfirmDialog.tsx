import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import { Portal } from "solid-js/web";
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
 *
 * Rendered through a <Portal> so the fixed-position overlay always covers the
 * viewport. Without it, a dialog opened from inside a transformed ancestor
 * (e.g. a solid-dnd sortable row, which carries a `transform`) gets its
 * `position: fixed` contained to that ancestor's box instead of the screen —
 * the "reset dialog opens cramped inside the row" bug.
 *
 * For irreversible actions (account deletion), pass `confirmPhrase`: a text
 * field appears and the primary stays disabled until the user types it back
 * (GitHub-style). Matching is @-stripped + case-insensitive.
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
  /** When set, the user must type this phrase (e.g. their @handle) to enable
   *  the primary button. Matching strips a leading @ and ignores case. */
  confirmPhrase?: string;
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
  const [typed, setTyped] = createSignal("");
  let closeTimer: number | null = null;

  const normalize = (s: string) => s.trim().replace(/^@/, "").toLowerCase();
  // No phrase required → always satisfied; otherwise the typed value must match.
  const phraseSatisfied = () => {
    const phrase = content().confirmPhrase;
    return !phrase || normalize(typed()) === normalize(phrase);
  };

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
        confirmPhrase: props.confirmPhrase,
      });
      setTyped("");
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
      <Portal>
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
          class={`relative flex w-full max-w-sm flex-col overflow-hidden rounded-sm bg-bg dark:bg-surface shadow-floating transition-opacity duration-500 [transition-timing-function:var(--ease-quart)] ${
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
              class="-mr-1 inline-flex size-7 shrink-0 items-center justify-center rounded-xs text-text-muted transition-colors hover:bg-surface dark:hover:bg-white/[0.07] hover:text-text"
            >
              <X class="size-4" strokeWidth={1.75} aria-hidden />
            </button>
          </header>

          <Show when={content().body}>
            {(body) => (
              <p class="px-6 pt-4 text-body text-text-muted">{body()}</p>
            )}
          </Show>

          <Show when={content().confirmPhrase}>
            {(phrase) => (
              <div class="px-6 pt-4">
                <label
                  for="confirm-dialog-phrase"
                  class="font-mono text-mini text-text-muted"
                >
                  Tippe{" "}
                  <span class="text-text">@{normalize(phrase())}</span> zum
                  Bestätigen
                </label>
                <input
                  id="confirm-dialog-phrase"
                  type="text"
                  autocomplete="off"
                  autocapitalize="off"
                  spellcheck={false}
                  value={typed()}
                  onInput={(e) => setTyped(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      phraseSatisfied() &&
                      !props.pending
                    )
                      props.onConfirm();
                  }}
                  class="mt-2 w-full rounded-xs border border-border bg-surface px-3 py-2 font-mono text-body text-text outline-none transition-colors focus:border-accent"
                />
              </div>
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
              disabled={props.pending || !phraseSatisfied()}
            >
              {content().confirmLabel}
            </Button>
          </div>
        </div>
      </div>
      </Portal>
    </Show>
  );
}
