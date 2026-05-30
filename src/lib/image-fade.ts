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
 * - Cached images (already complete) still get the fade: a quick, pleasant
 *   settle instead of an instant snap. Deferred one frame so the opacity-0
 *   paint lands first and the fade actually runs.
 * - `error` reveals the element too, so a broken src never stays invisible.
 * - Reduced motion: show immediately, no fade.
 */
export function fadeOnLoad(img: HTMLImageElement) {
  if (reduceMotion()) return;

  img.style.opacity = "0";
  let done = false;
  const reveal = () => {
    if (done) return;
    done = true;
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
}
