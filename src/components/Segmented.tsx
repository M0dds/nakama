import {
  createEffect,
  createSignal,
  For,
  onCleanup,
  onMount,
} from "solid-js";

/**
 * Liquid segmented control — mirrors the BottomNav accent-indicator's
 * stretch-and-contract bubble so a switch from "Tracken" to "Archiv"
 * (or any other 2/3-way segment) reads as mercury rather than a teleport.
 *
 * How it moves:
 *   1. Measure the currently active option's offsetLeft / offsetWidth.
 *   2. If we have a previous position AND it's different from the new one,
 *      first set the bubble to a capsule spanning OLD → NEW (Phase 1 —
 *      stretch). Then, after SETTLE_MS, contract it down to the destination
 *      (Phase 2). Same two-phase choreography as the BottomNav.
 *   3. transition-all is enabled only AFTER the first render, so the
 *      initial measurement snaps in place instead of animating from 0/0.
 *
 * Used by ListTrackingToggle (Tracken / Archiv), ThemeSwitcher's mode
 * picker (Hell / Dunkel / System), and the Styleguide's mode-demo.
 */

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

interface SegmentedProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  ariaLabel?: string;
  /** Disables every option (used while a related mutation is pending so
   *  the user can't double-click their way into a race). */
  disabled?: boolean;
}

const SETTLE_MS = 100;

export function Segmented<T extends string>(props: SegmentedProps<T>) {
  let containerEl: HTMLDivElement | undefined;
  // prevRest + settleTimer are intentionally plain `let`s — they persist
  // across reactive runs without triggering them.
  let prevRest: Box | null = null;
  let settleTimer: number | null = null;

  const [bubble, setBubble] = createSignal<Box | null>(null);
  const [animated, setAnimated] = createSignal(false);

  const place = () => {
    if (settleTimer !== null) {
      window.clearTimeout(settleTimer);
      settleTimer = null;
    }
    if (!containerEl) return;
    const el = containerEl.querySelector<HTMLElement>(
      '[data-active="true"]',
    );
    if (!el) return;

    const target: Box = {
      left: el.offsetLeft,
      top: el.offsetTop,
      width: el.offsetWidth,
      height: el.offsetHeight,
    };
    const prev = prevRest;

    if (prev && prev.left !== target.left) {
      // Phase 1 — stretch into a capsule covering OLD + NEW.
      const leftEdge = Math.min(prev.left, target.left);
      const rightEdge = Math.max(
        prev.left + prev.width,
        target.left + target.width,
      );
      setBubble({
        left: leftEdge,
        top: target.top,
        width: rightEdge - leftEdge,
        height: target.height,
      });
      // Phase 2 — contract to the destination.
      settleTimer = window.setTimeout(() => setBubble(target), SETTLE_MS);
    } else {
      // First render, same-position re-fire, or resize — snap.
      setBubble(target);
    }
    prevRest = target;

    if (!animated()) {
      requestAnimationFrame(() => setAnimated(true));
    }
  };

  // Plain createEffect fires on initial setup AND on value change. The
  // explicit read of props.value is what makes it reactive; rAF defers
  // measurement to after Solid has patched data-active onto the DOM.
  createEffect(() => {
    void props.value;
    requestAnimationFrame(place);
  });

  onMount(() => {
    const onResize = () => place();
    window.addEventListener("resize", onResize);
    onCleanup(() => {
      window.removeEventListener("resize", onResize);
      if (settleTimer !== null) window.clearTimeout(settleTimer);
    });
  });

  return (
    <div
      ref={containerEl!}
      role="tablist"
      aria-label={props.ariaLabel}
      class="relative inline-flex rounded-sm border border-border p-0.5"
    >
      {/* Sliding bubble. Always rendered so the element persists across
          value changes; geometry patches via inline style. */}
      <span
        aria-hidden
        class={`pointer-events-none absolute rounded-xs bg-text ${
          animated() ? "transition-all duration-200 ease-out" : ""
        }`}
        style={{
          left: `${bubble()?.left ?? 0}px`,
          top: `${bubble()?.top ?? 0}px`,
          width: `${bubble()?.width ?? 0}px`,
          height: `${bubble()?.height ?? 0}px`,
          opacity: bubble() ? 1 : 0,
        }}
      />
      <For each={props.options}>
        {(opt) => {
          const isActive = () => opt.value === props.value;
          const isDisabled = () => props.disabled || opt.disabled;
          return (
            <button
              type="button"
              role="tab"
              aria-selected={isActive()}
              data-active={isActive() ? "true" : "false"}
              disabled={isDisabled()}
              onClick={() => {
                if (isDisabled() || isActive()) return;
                props.onChange(opt.value);
              }}
              class={`relative z-10 rounded-xs px-3 py-1.5 font-mono text-mini uppercase tracking-wider transition-colors ${
                isActive()
                  ? "text-bg"
                  : "text-text-muted hover:text-text"
              } ${isDisabled() ? "cursor-not-allowed opacity-50" : ""}`}
            >
              {opt.label}
            </button>
          );
        }}
      </For>
    </div>
  );
}
