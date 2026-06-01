import { createSignal, createEffect, onCleanup, onMount } from "solid-js";
import type { Accessor } from "solid-js";

/**
 * The liquid accent-bubble MOTION, extracted from Segmented so any control can
 * share it verbatim — the mercury morph is the thing that makes a switch read
 * as "like the nav", not the pill shape (hard corners stay; the liquid lives in
 * the movement). Same recipe as BottomNav.place() / Segmented: the resting
 * geometry snaps to the active element's box, and the SLIDE is a one-shot WAAPI
 * transform overlay (translateX + scaleX) from the previous box → a stretched,
 * front-loaded midpoint (leading edge ahead of the trailing one) → identity,
 * with `composite: "add"` so it layers on the resting geometry. CSS owns only
 * the opacity fade. Nothing animates before the first measurement, so the
 * bubble snaps into place on initial render; `prefers-reduced-motion` skips the
 * slide entirely.
 *
 * Wiring: give it getters for the positioned container and the persistent
 * bubble <span>, plus a `track` accessor (read inside it so a change re-measures
 * — e.g. the active value). It returns the resting `box` signal to style the
 * bubble with. The active element must carry `[data-active="true"]` (override
 * via `selector`). The container must be `position: relative` (offsetParent).
 */

export interface BubbleBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function createLiquidBubble(opts: {
  container: () => HTMLElement | undefined;
  bubble: () => HTMLElement | undefined;
  track: () => unknown;
  selector?: string;
}): { box: Accessor<BubbleBox | null> } {
  const selector = opts.selector ?? '[data-active="true"]';
  let prevRest: BubbleBox | null = null;
  let slideAnim: Animation | undefined;

  const [box, setBox] = createSignal<BubbleBox | null>(null);
  const [animated, setAnimated] = createSignal(false);

  const place = () => {
    const containerEl = opts.container();
    const bubbleEl = opts.bubble();
    if (!containerEl) return;
    const el = containerEl.querySelector<HTMLElement>(selector);
    if (!el) return;

    const target: BubbleBox = {
      left: el.offsetLeft,
      top: el.offsetTop,
      width: el.offsetWidth,
      height: el.offsetHeight,
    };
    const prev = prevRest;
    // Resting geometry is always the target box; the slide is a WAAPI overlay.
    setBox(target);

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

  // Plain createEffect fires on initial setup AND on track() change. rAF defers
  // measurement to after Solid has patched data-active onto the DOM.
  createEffect(() => {
    void opts.track();
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

  return { box };
}
