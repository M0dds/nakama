import {
  createEffect,
  createSignal,
  For,
  onCleanup,
  onMount,
} from "solid-js";

/**
 * Liquid segmented control — shares the BottomNav accent-indicator's MOTION so
 * a switch reads as mercury rather than a teleport. The bubble keeps hard
 * corners (rounded-xs): only the floating nav is a capsule, the liquid lives
 * in the motion, not the shape.
 *
 * How it moves (mirrors BottomNav.place()): the resting geometry snaps to the
 * active option's box; the SLIDE is a one-shot WAAPI transform overlay
 * (translateX + scaleX) from the previous box → a stretched midpoint (leading
 * edge ahead of the trailing one) → identity. One continuous timeline with
 * snappy bell-velocity easings, so the bubble stretches toward the destination
 * and contracts without the old two-phase settle pause. CSS owns only the
 * opacity fade. Transitions/animation only AFTER the first render so the
 * initial measurement snaps in place.
 *
 * Used by ListTrackingToggle (Tracken / Archiv), ThemeSwitcher's mode picker
 * (Hell / Dunkel / System), SyncToggle, and the Styleguide's mode-demo.
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
  /** Stretch to the container width with every option sharing the space
   *  equally (flex-1), instead of the default content-width inline pill.
   *  Used by the AddSheet media-type filter, which spans the panel. */
  fill?: boolean;
}

export function Segmented<T extends string>(props: SegmentedProps<T>) {
  let containerEl: HTMLDivElement | undefined;
  let bubbleEl: HTMLSpanElement | undefined;
  // prevRest persists across reactive runs without triggering them; slideAnim
  // is the in-flight slide so a rapid re-fire can cancel it.
  let prevRest: Box | null = null;
  let slideAnim: Animation | undefined;

  const [bubble, setBubble] = createSignal<Box | null>(null);
  const [animated, setAnimated] = createSignal(false);

  const place = () => {
    if (!containerEl) return;
    const el = containerEl.querySelector<HTMLElement>('[data-active="true"]');
    if (!el) return;

    const target: Box = {
      left: el.offsetLeft,
      top: el.offsetTop,
      width: el.offsetWidth,
      height: el.offsetHeight,
    };
    const prev = prevRest;
    // Resting geometry is always the target box; the slide is a WAAPI overlay.
    setBubble(target);

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (animated() && prev && prev.left !== target.left && bubbleEl && !reduce) {
      // Continuous mercury morph — same recipe as BottomNav. Both edges move
      // from the first frame (leading edge ahead, trailing behind → stretch),
      // peak velocity through a front-loaded midpoint (0.42), quick settle.
      const cx = target.left + target.width / 2;
      const pL = prev.left;
      const pR = prev.left + prev.width;
      const tL = target.left;
      const tR = target.left + target.width;
      const goingRight = tL > pL;
      const LEAD = 0.85;
      const TRAIL = 0.3;
      const midL = pL + (tL - pL) * (goingRight ? TRAIL : LEAD);
      const midR = pR + (tR - pR) * (goingRight ? LEAD : TRAIL);
      const tf = (l: number, r: number) =>
        `translateX(${(l + r) / 2 - cx}px) scaleX(${(r - l) / target.width})`;
      slideAnim?.cancel();
      slideAnim = bubbleEl.animate(
        [
          { transform: tf(pL, pR), easing: "cubic-bezier(0.25, 0.5, 0.9, 0.7)" },
          { transform: tf(midL, midR), offset: 0.42, easing: "cubic-bezier(0.1, 0.45, 0.6, 0.9)" },
          { transform: "translateX(0) scaleX(1)", offset: 1 },
        ],
        { duration: 240, composite: "add" },
      );
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
      slideAnim?.cancel();
    });
  });

  return (
    <div
      ref={containerEl!}
      role="tablist"
      aria-label={props.ariaLabel}
      class={`relative ${props.fill ? "flex w-full" : "inline-flex"} rounded-sm border border-border p-0.5`}
    >
      {/* Sliding bubble. Always rendered so the element persists across
          value changes; geometry patches via inline style. */}
      <span
        ref={bubbleEl!}
        aria-hidden
        class="pointer-events-none absolute rounded-xs bg-text"
        style={{
          left: `${bubble()?.left ?? 0}px`,
          top: `${bubble()?.top ?? 0}px`,
          width: `${bubble()?.width ?? 0}px`,
          height: `${bubble()?.height ?? 0}px`,
          opacity: bubble() ? 1 : 0,
          // Slide is a WAAPI transform overlay on this resting geometry; CSS
          // owns only the opacity fade (no left/width transition to race it).
          transition: "opacity 200ms ease-out",
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
              class={`relative z-10 rounded-xs py-1.5 font-mono text-mini uppercase tracking-wider transition-colors ${
                props.fill ? "flex-1 px-2 text-center" : "px-3"
              } ${
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
