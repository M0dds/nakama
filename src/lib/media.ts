import { createSignal, onCleanup } from "solid-js";

/**
 * Reactive matchMedia signal. The app's layout breakpoint is `md` (768px) and
 * touch affordances key on `(pointer: coarse)` — this helper is the one place
 * that turns either into a live signal (there was no shared isMobile until
 * now; ad-hoc matchMedia reads stay fine for one-shot checks).
 *
 * Must be called under a component owner (uses onCleanup).
 */
/** Numeric safe-area inset in px (0 everywhere except notched iOS with the
 *  edge-to-edge viewport). Reads the --safe-top/--safe-bottom vars from
 *  index.css — env() resolves at computed-value time, so the JS-positioned
 *  chrome (AddSheet) shares the exact value the CSS paddings use. */
export function safeAreaInset(side: "top" | "bottom"): number {
  const v = getComputedStyle(document.documentElement).getPropertyValue(
    side === "top" ? "--safe-top" : "--safe-bottom",
  );
  return parseFloat(v) || 0;
}

export function useMediaQuery(query: string) {
  const mq = window.matchMedia(query);
  const [match, setMatch] = createSignal(mq.matches);
  const on = () => setMatch(mq.matches);
  mq.addEventListener("change", on);
  onCleanup(() => mq.removeEventListener("change", on));
  return match;
}
