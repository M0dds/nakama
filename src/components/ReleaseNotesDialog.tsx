import { createEffect, createSignal, For, onCleanup, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { Sparkles, X } from "lucide-solid";
import { RELEASE_NOTES } from "@/lib/release-notes";

/**
 * "Was ist neu" — the changelog modal. Two modes, same surface:
 *   - mode "latest": shows only the newest entry (the auto-open after an
 *     update — one focused "here's what changed").
 *   - mode "all": the full scrollable history (manual open from the profile
 *     version label).
 *
 * Mechanics mirror ConfirmDialog so every modal reads as one gesture:
 * two-signal mount/visible, double-rAF on open, backdrop dim+blur, Escape +
 * backdrop-click close, body-scroll lock through the close animation. No `snap`
 * copy needed — the content is static (read straight from RELEASE_NOTES), it
 * doesn't get cleared by a parent on close.
 */
const ANIM_MS = 500;

interface Props {
  open: boolean;
  /** "latest" = newest entry only (auto-open); "all" = full history. */
  mode: "latest" | "all";
  onClose: () => void;
}

export function ReleaseNotesDialog(props: Props) {
  const [mounted, setMounted] = createSignal(false);
  const [visible, setVisible] = createSignal(false);
  let closeTimer: number | null = null;

  const notes = () =>
    props.mode === "latest" ? RELEASE_NOTES.slice(0, 1) : RELEASE_NOTES;

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
          aria-labelledby="release-notes-title"
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
            class={`relative flex max-h-[80svh] w-full max-w-md flex-col overflow-hidden rounded-sm bg-bg dark:bg-surface shadow-floating transition-opacity duration-500 [transition-timing-function:var(--ease-quart)] ${
              visible() ? "opacity-100" : "opacity-0"
            }`}
          >
            <header class="flex items-start justify-between gap-3 border-b border-rule px-6 pb-4 pt-5">
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <Sparkles
                    class="size-3.5 shrink-0 text-accent"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                  <span class="font-mono text-mini uppercase tracking-[0.25em] text-text-muted">
                    {props.mode === "latest" ? "Was ist neu" : "Verlauf"}
                  </span>
                </div>
                <h2
                  id="release-notes-title"
                  class="mt-1 text-heading font-medium tracking-tight text-text"
                >
                  {props.mode === "latest"
                    ? "Frisch aktualisiert"
                    : "Was ist neu"}
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

            <div class="flex-1 overflow-y-auto px-6 py-5">
              <div class="space-y-7">
                <For each={notes()}>
                  {(note) => (
                    <section>
                      <div class="flex items-baseline gap-2">
                        <span class="font-mono text-label font-medium text-text">
                          v{note.version}
                        </span>
                        <span class="font-mono text-mini text-text-muted">
                          {note.date}
                        </span>
                      </div>
                      <Show when={note.title}>
                        {(t) => (
                          <p class="mt-1 text-body-lg text-text">{t()}</p>
                        )}
                      </Show>
                      <ul class="mt-3 space-y-1.5">
                        <For each={note.changes}>
                          {(change) => (
                            <li class="flex gap-2.5 text-body text-text-muted">
                              <span
                                aria-hidden
                                class="mt-2 size-1 shrink-0 rounded-full bg-accent"
                              />
                              <span>{change}</span>
                            </li>
                          )}
                        </For>
                      </ul>
                    </section>
                  )}
                </For>
              </div>
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  );
}
