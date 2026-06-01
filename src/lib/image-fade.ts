const EASE_QUART = "cubic-bezier(0.16, 1, 0.3, 1)"; // mirrors --ease-quart
const FADE_MS = 400;

const reduceMotion = () =>
  typeof window !== "undefined" &&
  !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Ref helper that fades an <img> in once it has decoded, hiding the load
 * "pop" — Apple's one universal, FUNCTIONAL entrance (it masks decode jank, it
 * isn't decorative). Attach to any cover/avatar: `<img ref={fadeOnLoad} … />`.
 *
 * The fade runs on the Web Animations API, deliberately NOT via a CSS
 * `transition`/opacity class: an inline `transition` would clobber an img's
 * existing `transition-transform` (e.g. the hover-scale on Was-kommt covers),
 * and WAAPI also self-cleans (no lingering inline state). The element starts at
 * inline opacity 0 — set synchronously in the ref, before the first paint, so
 * the pre-decode frame is hidden — then animates to full on load.
 *
 * - A src that already faded in once this session shows INSTANTLY on re-mount
 *   (no re-fade). Without this, a `<For>` list that swaps object refs — e.g. a
 *   pin reorder replaces every row's ListSummary, so Solid disposes + re-mounts
 *   every row and recreates its <img> — would re-run the fade on all cached
 *   covers at once: a visible flicker, twice (optimistic patch + settle
 *   refetch). The fade is a one-time decode-mask, not a recurring settle.
 * - `error` reveals the element too, so a broken src never stays invisible.
 * - Reduced motion: show immediately, no fade.
 */
const fadedSrcs = new Set<string>();

export function fadeOnLoad(img: HTMLImageElement) {
  if (reduceMotion()) return;

  // Solid applies the dynamic `src` in a render effect that fires JUST AFTER
  // the ref runs, so img.src is still empty here. Defer one microtask to read
  // the resolved src — otherwise the dedup below always misses and every
  // <For> re-mount (e.g. a pin reorder swapping every row's object ref)
  // re-runs the fade on all cached covers at once.
  queueMicrotask(() => {
    // Faded once already → leave at natural opacity (1), no re-fade flicker.
    if (img.src && fadedSrcs.has(img.src)) return;

    img.style.opacity = "0";
    let done = false;
    const reveal = () => {
      if (done) return;
      done = true;
      if (img.src) fadedSrcs.add(img.src);
      img.style.opacity = "1";
      img.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: FADE_MS,
        easing: EASE_QUART,
      });
    };

    if (img.complete && img.naturalWidth > 0) {
      requestAnimationFrame(() => requestAnimationFrame(reveal));
      return;
    }
    img.addEventListener("load", reveal, { once: true });
    img.addEventListener("error", reveal, { once: true });
  });
}
