import { createSignal, For, onMount, Show } from "solid-js";
import { Dynamic } from "solid-js/web";
import { X } from "lucide-solid";
import type { ToastItem } from "@/lib/toast";

/**
 * Toast stack — top-right corner. z-30 keeps toasts above page content but
 * below the AddSheet backdrop (z-40), so opening the add-sheet cleanly covers
 * them. The container is width-capped (max-w-sm) and responsive: full width
 * minus gutters on mobile, anchored to the right on desktop.
 *
 * Each card slides in from the right and falls out (liquid). The `leaving` set
 * — not a flag on the toast object — drives the exit so the array stays
 * referentially stable for <For> (a new object reference would remount the row
 * and skip the animation; see AGENTS.md <For>-remount gotcha).
 */
export function Toaster(props: {
  toasts: ToastItem[];
  leaving: number[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div
      aria-live="polite"
      class="pointer-events-none fixed right-4 top-4 z-30 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2"
    >
      <For each={props.toasts}>
        {(t) => (
          <ToastCard
            toast={t}
            leaving={props.leaving.includes(t.id)}
            onDismiss={() => props.onDismiss(t.id)}
          />
        )}
      </For>
    </div>
  );
}

function ToastCard(props: {
  toast: ToastItem;
  leaving: boolean;
  onDismiss: () => void;
}) {
  const [entered, setEntered] = createSignal(false);
  // Bar starts full and drains over the toast's lifetime. Separate signal from
  // `entered` only so its long transition can't smear the card's enter motion.
  const [draining, setDraining] = createSignal(false);
  const duration = () => props.toast.durationMs ?? 0;

  onMount(() => {
    // Double-rAF so the browser paints the initial (offset + transparent, bar
    // full) state before the transitions flip — single rAF can collapse mount +
    // flip into one frame and skip the animation (AppShell openAdd comment).
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        setEntered(true);
        setDraining(true);
      }),
    );
  });
  const shown = () => entered() && !props.leaving;

  return (
    <div
      role="status"
      class="pointer-events-auto relative flex w-full items-center gap-3 overflow-hidden rounded-sm border border-border bg-surface px-4 py-3 shadow-floating transition-all duration-300 [transition-timing-function:var(--ease-quart)]"
      classList={{
        "translate-x-3 opacity-0": !shown(),
        "translate-x-0 opacity-100": shown(),
      }}
    >
      <Show when={props.toast.icon}>
        <Dynamic
          component={props.toast.icon!}
          class="size-4 shrink-0 text-accent"
          strokeWidth={1.75}
          aria-hidden="true"
        />
      </Show>
      <p class="min-w-0 flex-1 text-body text-text">{props.toast.message}</p>
      <Show when={props.toast.action}>
        <button
          type="button"
          onClick={() => {
            props.toast.action!.onClick();
            props.onDismiss();
          }}
          class="shrink-0 rounded-xs px-2 py-1 font-mono text-mini uppercase tracking-wider text-accent transition-colors hover:bg-accent/10"
        >
          {props.toast.action!.label}
        </button>
      </Show>
      <button
        type="button"
        onClick={props.onDismiss}
        aria-label="Schließen"
        class="-mr-1 shrink-0 rounded-xs p-1 text-text-muted transition-colors hover:text-text"
      >
        <X class="size-3.5" strokeWidth={2} aria-hidden />
      </button>

      {/* Auto-dismiss countdown — drains left-to-right over the toast's
          lifetime. scaleX (origin-left) is GPU-cheap; linear matches the
          plain setTimeout. Hidden for sticky toasts (durationMs = 0). */}
      <Show when={duration() > 0}>
        <span
          aria-hidden
          class="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-accent"
          style={{
            transform: draining() ? "scaleX(0)" : "scaleX(1)",
            transition: `transform ${duration()}ms linear`,
          }}
        />
      </Show>
    </div>
  );
}
