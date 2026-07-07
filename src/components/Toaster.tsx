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
 * Each card slides in from the right and falls out (liquid), and can be
 * swiped away horizontally (Apple-style). The `leaving` set — not a flag on
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

/** Drag past this (px, either direction) to dismiss; below it, snap back. */
const SWIPE_DISMISS_PX = 80;
/** Opacity reaches 0 at this drag distance — gives the swipe visible feedback. */
const SWIPE_FADE_PX = 200;

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

  // Swipe-to-dismiss state. dragX follows the finger; dragging disables the
  // transition so the follow is 1:1.
  const [dragX, setDragX] = createSignal(0);
  const [dragging, setDragging] = createSignal(false);
  let startX = 0;
  let pointerId: number | null = null;
  // Whether the last pointer interaction moved past the click threshold —
  // read by the card's click handler (which fires AFTER pointerup, when dragX
  // has already snapped back to 0) to tell a genuine tap from a swipe.
  let wasDrag = false;

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

  // One inline transform/opacity source so the enter/exit base and the live
  // drag offset compose cleanly (a classList toggle would fight the inline
  // drag transform). baseX 12px ≈ the old translate-x-3 enter offset.
  const cardStyle = () => {
    const baseX = shown() ? 0 : 12;
    const baseOpacity = shown() ? 1 : 0;
    const fade = Math.max(0, 1 - Math.abs(dragX()) / SWIPE_FADE_PX);
    return {
      transform: `translateX(${baseX + dragX()}px)`,
      opacity: `${baseOpacity * fade}`,
      transition: dragging()
        ? "none"
        : "transform 300ms var(--ease-quart), opacity 300ms var(--ease-quart)",
    };
  };

  const onPointerDown = (e: PointerEvent) => {
    // Let taps on the action / dismiss buttons through — only the card body
    // starts a swipe.
    if ((e.target as HTMLElement).closest("button")) return;
    if (e.button !== 0 && e.pointerType === "mouse") return;
    setDragging(true);
    wasDrag = false;
    startX = e.clientX;
    pointerId = e.pointerId;
    e.currentTarget instanceof HTMLElement &&
      e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!dragging()) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 5) wasDrag = true;
    setDragX(dx);
  };
  const onPointerEnd = (e: PointerEvent) => {
    if (!dragging()) return;
    setDragging(false);
    if (pointerId !== null && e.currentTarget instanceof HTMLElement) {
      e.currentTarget.releasePointerCapture?.(pointerId);
    }
    pointerId = null;
    const dx = dragX();
    if (Math.abs(dx) > SWIPE_DISMISS_PX) {
      // Fly the rest of the way out in the drag direction, then let the
      // provider remove it (transition is back on now that dragging is false).
      setDragX(Math.sign(dx) * window.innerWidth);
      props.onDismiss();
    } else {
      setDragX(0); // snap back
    }
  };

  // With an action the WHOLE card is tappable (the mono label below the text
  // stays as the visible affordance + keyboard path). Fires only for genuine
  // taps: not after a swipe (wasDrag) and not for the buttons themselves
  // (their own handlers run; this would double-fire via bubbling).
  const onCardClick = (e: MouseEvent) => {
    if (!props.toast.action || wasDrag) return;
    if ((e.target as HTMLElement).closest("button")) return;
    props.toast.action.onClick();
    props.onDismiss();
  };

  return (
    <div
      role="status"
      style={cardStyle()}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onClick={onCardClick}
      class="pointer-events-auto relative flex w-full touch-pan-y items-center gap-3 overflow-hidden rounded-sm border border-border bg-surface px-4 py-3 shadow-floating"
      classList={{ "cursor-pointer": !!props.toast.action }}
    >
      <Show when={props.toast.icon}>
        <Dynamic
          component={props.toast.icon!}
          class="size-4 shrink-0 text-accent"
          strokeWidth={1.75}
          aria-hidden="true"
        />
      </Show>
      <div class="min-w-0 flex-1">
        <p class="select-none text-body text-text">{props.toast.message}</p>
        {/* Action label as a subline under the message — the row layout
            cramped next to long messages. Follows the mono action idiom. */}
        <Show when={props.toast.action}>
          <button
            type="button"
            onClick={() => {
              props.toast.action!.onClick();
              props.onDismiss();
            }}
            class="-ml-2 mt-0.5 inline-flex items-center rounded-xs px-2 py-1 font-mono text-mini uppercase tracking-wider text-text-muted transition-colors hover:bg-border hover:text-accent"
          >
            {props.toast.action!.label}
          </button>
        </Show>
      </div>
      <button
        type="button"
        onClick={props.onDismiss}
        aria-label="Schließen"
        class="-mr-1 inline-flex size-6 shrink-0 items-center justify-center rounded-xs text-text-muted transition-colors hover:bg-border hover:text-text"
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
