import { createSignal, For, onMount, Show } from "solid-js";
import { Dynamic } from "solid-js/web";
import { X } from "lucide-solid";
import type { ToastItem } from "@/lib/toast";

/**
 * Toast stack — bottom-centered, floating above the BottomNav (which sits at
 * bottom-[26px]). z-30 keeps toasts above page content but below the AddSheet
 * backdrop (z-40), so opening the add-sheet cleanly covers them.
 *
 * Each card rises in and falls out (liquid). The `leaving` set — not a flag on
 * the toast object — drives the exit so the array stays referentially stable
 * for <For> (a new object reference would remount the row and skip the
 * animation; see AGENTS.md <For>-remount gotcha).
 */
export function Toaster(props: {
  toasts: ToastItem[];
  leaving: number[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div
      aria-live="polite"
      class="pointer-events-none fixed inset-x-0 bottom-[104px] z-30 flex flex-col items-center gap-2 px-4"
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
  onMount(() => {
    // Double-rAF so the browser paints the initial (offset + transparent)
    // state before the transition flips — single rAF can collapse mount +
    // flip into one frame and skip the animation (AppShell openAdd comment).
    requestAnimationFrame(() =>
      requestAnimationFrame(() => setEntered(true)),
    );
  });
  const shown = () => entered() && !props.leaving;

  return (
    <div
      role="status"
      class="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-sm border border-border bg-surface px-4 py-3 shadow-floating transition-all duration-300 [transition-timing-function:var(--ease-quart)]"
      classList={{
        "translate-y-2 scale-95 opacity-0": !shown(),
        "translate-y-0 scale-100 opacity-100": shown(),
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
    </div>
  );
}
