import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { X } from "lucide-solid";
import { InstallGuide } from "@/components/InstallGuide";

/**
 * Modal wrapper around InstallGuide for the profile "Als App installieren"
 * entry (the setup wizard uses InstallGuide inline instead). Same scaffold as
 * ConfirmDialog / ReleaseNotesDialog so every modal reads as one gesture:
 * two-signal mount/visible, double-rAF on open, Escape + backdrop close,
 * body-scroll lock through the close animation.
 */
const ANIM_MS = 500;

export function InstallDialog(props: { open: boolean; onClose: () => void }) {
  const [mounted, setMounted] = createSignal(false);
  const [visible, setVisible] = createSignal(false);
  let closeTimer: number | null = null;

  createEffect(() => {
    if (props.open) {
      if (closeTimer !== null) {
        window.clearTimeout(closeTimer);
        closeTimer = null;
      }
      setMounted(true);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => setVisible(true)),
      );
    } else {
      setVisible(false);
      if (closeTimer !== null) window.clearTimeout(closeTimer);
      closeTimer = window.setTimeout(() => {
        setMounted(false);
        closeTimer = null;
      }, ANIM_MS);
    }
  });

  onCleanup(() => {
    if (closeTimer !== null) window.clearTimeout(closeTimer);
  });

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

  return (
    <Show when={mounted()}>
      <Portal>
        <div
          role="dialog"
          aria-modal="true"
          class="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <button
            type="button"
            aria-label="Schließen"
            onClick={props.onClose}
            class={`absolute inset-0 transition-all duration-500 [transition-timing-function:var(--ease-quart)] ${
              visible()
                ? "bg-black/50 backdrop-blur-sm"
                : "bg-black/0 backdrop-blur-none"
            }`}
          />
          <div
            class={`relative w-full max-w-sm overflow-hidden rounded-sm bg-bg dark:bg-surface shadow-floating transition-opacity duration-500 [transition-timing-function:var(--ease-quart)] ${
              visible() ? "opacity-100" : "opacity-0"
            }`}
          >
            <button
              type="button"
              onClick={props.onClose}
              aria-label="Schließen"
              class="absolute right-3 top-3 inline-flex size-7 items-center justify-center rounded-xs text-text-muted transition-colors hover:bg-surface dark:hover:bg-white/[0.07] hover:text-text"
            >
              <X class="size-4" strokeWidth={1.75} aria-hidden />
            </button>
            <div class="px-6 py-8">
              <InstallGuide />
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  );
}
