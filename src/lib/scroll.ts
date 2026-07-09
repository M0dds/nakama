/**
 * rAF-throttled passive scroll+resize subscription. `apply` runs at most once
 * per frame. Returns a disposer. Fires once immediately so resting state is
 * correct before the first scroll.
 *
 * Extracted from the landing's motion spine (landing-motion.ts keeps its own
 * copy — the landing is a sealed-off motion exception; in-app consumers use
 * this one). First in-app consumer: CoverHero's scroll-linked fade.
 */
export function onScrollFrame(apply: () => void): () => void {
  let raf = 0;
  const run = () => {
    raf = 0;
    apply();
  };
  const onScroll = () => {
    if (!raf) raf = requestAnimationFrame(run);
  };
  apply();
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  return () => {
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onScroll);
    if (raf) cancelAnimationFrame(raf);
  };
}
