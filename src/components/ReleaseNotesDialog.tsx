import { createEffect, createSignal, For, onCleanup, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { ChevronDown, X } from "lucide-solid";
import { latestNote, RELEASE_NOTES } from "@/lib/release-notes";

/**
 * "Release Notes" — the changelog modal. One surface, used both for the
 * auto-open after a version bump (AppShell) and the manual open from the
 * profile version label.
 *
 * The full history is an accordion: each entry is a clickable header (version +
 * date) over a collapsible body, separated by hairlines, scrollable when it
 * outgrows the modal. Exactly one entry is open — the newest by default;
 * opening an older one collapses the current (clicking the open one collapses
 * it to none). The body height animates via the grid-rows 0fr→1fr trick (pure
 * CSS, no measuring), matching the app's liquid motion.
 *
 * Mechanics mirror ConfirmDialog so every modal reads as one gesture:
 * two-signal mount/visible, double-rAF on open, backdrop dim+blur, Escape +
 * backdrop-click close, body-scroll lock through the close animation. The
 * accent dot in the header is the app's hanko mark (same as PageHeader /
 * ConfirmDialog), not a feature icon.
 */
const ANIM_MS = 500;

export function ReleaseNotesDialog(props: {
  open: boolean;
  onClose: () => void;
}) {
  const [mounted, setMounted] = createSignal(false);
  const [visible, setVisible] = createSignal(false);
  // Which entry is expanded. Default to the newest; reset on each open so a
  // re-open always lands on the latest.
  const [openVersion, setOpenVersion] = createSignal<string | null>(null);
  let closeTimer: number | null = null;

  createEffect(() => {
    if (props.open) {
      if (closeTimer !== null) {
        window.clearTimeout(closeTimer);
        closeTimer = null;
      }
      setOpenVersion(latestNote()?.version ?? null);
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

  const toggle = (version: string) =>
    setOpenVersion((cur) => (cur === version ? null : version));

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
            <header class="flex shrink-0 items-center justify-between gap-3 border-b border-rule px-6 pb-4 pt-5">
              <div class="flex items-center gap-2">
                <span aria-hidden class="size-2 shrink-0 rounded-full bg-accent" />
                <h2
                  id="release-notes-title"
                  class="font-mono text-mini uppercase tracking-[0.25em] text-text-muted"
                >
                  Release Notes
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

            <div class="flex-1 overflow-y-auto">
              <For each={RELEASE_NOTES}>
                {(note, i) => {
                  const isOpen = () => openVersion() === note.version;
                  return (
                    <div classList={{ "border-t border-rule": i() > 0 }}>
                      <button
                        type="button"
                        onClick={() => toggle(note.version)}
                        aria-expanded={isOpen()}
                        class="flex w-full items-center justify-between gap-3 px-6 py-4 text-left transition-colors hover:bg-surface dark:hover:bg-white/[0.04]"
                      >
                        <span class="flex items-baseline gap-2">
                          <span class="font-mono text-label font-medium text-text">
                            v{note.version}
                          </span>
                          <span class="font-mono text-mini text-text-muted">
                            {note.date}
                          </span>
                        </span>
                        <ChevronDown
                          class="size-4 shrink-0 text-text-muted transition-transform duration-300 [transition-timing-function:var(--ease-quart)]"
                          classList={{ "rotate-180": isOpen() }}
                          strokeWidth={1.75}
                          aria-hidden
                        />
                      </button>
                      {/* grid-rows 0fr→1fr = pure-CSS height animation */}
                      <div
                        class="grid transition-[grid-template-rows] duration-300 [transition-timing-function:var(--ease-quart)]"
                        style={{
                          "grid-template-rows": isOpen() ? "1fr" : "0fr",
                        }}
                      >
                        <div class="overflow-hidden">
                          <div class="px-6 pb-5">
                            <Show when={note.title}>
                              {(t) => (
                                <p class="text-body-lg text-text">{t()}</p>
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
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }}
              </For>
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  );
}
