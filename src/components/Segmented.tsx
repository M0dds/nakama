import { For } from "solid-js";
import { createLiquidBubble } from "@/lib/liquid-bubble";

/**
 * Liquid segmented control — shares the BottomNav accent-indicator's MOTION so
 * a switch reads as mercury rather than a teleport. The bubble keeps hard
 * corners (rounded-xs): only the floating nav is a capsule, the liquid lives
 * in the motion, not the shape.
 *
 * The motion lives in the shared createLiquidBubble hook — the SAME recipe the
 * BottomNav and the Pager use (one source of truth for the mercury morph): the
 * resting geometry snaps to the active option's box, the slide is a one-shot
 * WAAPI transform overlay from the previous box → a stretched midpoint →
 * identity. The bubble keeps hard corners; only the floating nav is a capsule.
 *
 * Used by ListTrackingToggle (Tracken / Archiv), ThemeSwitcher's mode picker
 * (Hell / Dunkel / System), SyncToggle, and the Styleguide's mode-demo.
 */

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

  const { box: bubble } = createLiquidBubble({
    container: () => containerEl,
    bubble: () => bubbleEl,
    track: () => props.value,
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
