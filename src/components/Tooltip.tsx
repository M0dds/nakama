import { createSignal, createEffect, onCleanup, Show } from "solid-js";
import type { JSX } from "solid-js";

/**
 * Dependency-free tooltip — in-house replacement for the native `title`
 * attribute so hints match the site instead of the OS. Inverted chip
 * (bg-text / text-bg) in the mono instrument voice, matching the nav
 * inversion + section labels.
 *
 * Why JS-positioned instead of a pure-CSS centered absolute:
 * the centered tooltip would clip off the viewport edge whenever the
 * trigger sat near a screen border (kick / crown icons on narrow member
 * rows hit this in the old Logbook). We measure the tooltip after mount
 * and clamp its left edge into the viewport. position: fixed escapes
 * any parent overflow-hidden along the way.
 *
 * The trigger should still carry its own aria-label; the tooltip is the
 * visual affordance:
 *
 *   <Tooltip label="Schließen">
 *     <button aria-label="Schließen">×</button>
 *   </Tooltip>
 */
const EDGE_PADDING = 8;
const TOOLTIP_GAP = 8;

interface Pos {
  left: number;
  top: number;
}

export function Tooltip(props: {
  label: string;
  children: JSX.Element;
  side?: "top" | "bottom";
  /** Merged into the wrapper — e.g. flex positioning when the trigger was a
   *  flex child (shrink-0 / self-center). */
  class?: string;
}) {
  let triggerEl: HTMLSpanElement | undefined;
  let tooltipEl: HTMLSpanElement | undefined;
  const [open, setOpen] = createSignal(false);
  const [pos, setPos] = createSignal<Pos | null>(null);

  const reposition = () => {
    if (!triggerEl || !tooltipEl) return;
    const tr = triggerEl.getBoundingClientRect();
    const tw = tooltipEl.offsetWidth;
    const th = tooltipEl.offsetHeight;
    const idealLeft = tr.left + tr.width / 2 - tw / 2;
    const maxLeft = Math.max(
      EDGE_PADDING,
      window.innerWidth - tw - EDGE_PADDING,
    );
    const left = Math.max(EDGE_PADDING, Math.min(idealLeft, maxLeft));
    const top =
      (props.side ?? "top") === "bottom"
        ? tr.bottom + TOOLTIP_GAP
        : tr.top - th - TOOLTIP_GAP;
    setPos({ left, top });
  };

  createEffect(() => {
    if (!open()) {
      setPos(null);
      return;
    }
    // Tooltip is now in the DOM thanks to <Show when={open()}>. Solid
    // patches DOM before effects run, so refs are populated by now.
    reposition();
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    onCleanup(() => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    });
  });

  return (
    <span
      ref={triggerEl!}
      class={`relative inline-flex ${props.class ?? ""}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocusIn={() => setOpen(true)}
      onFocusOut={() => setOpen(false)}
    >
      {props.children}
      <Show when={open()}>
        <span
          ref={tooltipEl!}
          role="tooltip"
          style={{
            // pos null on the first effect tick (before measurement); park
            // off-screen so the measurement frame is invisible.
            left: `${pos()?.left ?? -9999}px`,
            top: `${pos()?.top ?? -9999}px`,
          }}
          class="pointer-events-none fixed z-50 whitespace-nowrap rounded-xs bg-text px-2 py-1 font-mono text-mini uppercase tracking-wider text-bg shadow-floating"
        >
          {props.label}
        </span>
      </Show>
    </span>
  );
}
