import { createSignal, onCleanup } from "solid-js";

/**
 * Reactive matchMedia signal. The app's layout breakpoint is `md` (768px) and
 * touch affordances key on `(pointer: coarse)` — this helper is the one place
 * that turns either into a live signal (there was no shared isMobile until
 * now; ad-hoc matchMedia reads stay fine for one-shot checks).
 *
 * Must be called under a component owner (uses onCleanup).
 */
export function useMediaQuery(query: string) {
  const mq = window.matchMedia(query);
  const [match, setMatch] = createSignal(mq.matches);
  const on = () => setMatch(mq.matches);
  mq.addEventListener("change", on);
  onCleanup(() => mq.removeEventListener("change", on));
  return match;
}
