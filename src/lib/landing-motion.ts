/**
 * Motion spine for the marketing landing (`/` signed-out) — and ONLY there.
 *
 * Nakama's in-app rule is "motion is functional, never decorative"; a landing
 * is the sanctioned exception. The page rides on a small, repeated vocabulary
 * (one vocabulary repeated is what makes a scroll page read as composed, not
 * random):
 *
 *   GROW    (scrubbed) — an app-window scales/parallaxes as you scroll into it.
 *   PIN+GROW (scrubbed) — the hero window grows dramatically while pinned, as
 *            you scroll THROUGH a tall track (the Mistral "section from the
 *            header grows" move).
 *   FALL    (one-shot) — content blocks drop in top-to-bottom with a squash-
 *            and-stretch landing, staggered by --i (keyframe in index.css).
 *   PAN     (scrubbed) — a horizontal cover wall drifts as you scroll past it.
 *
 * Everything is gated on `prefers-reduced-motion` (static end state) and Lenis
 * is additionally gated off on touch (coarse pointer).
 */

export const EASE_QUART = "cubic-bezier(0.16, 1, 0.3, 1)";

export const reduceMotion = () =>
  typeof window !== "undefined" &&
  !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export const coarsePointer = () =>
  typeof window !== "undefined" &&
  !!window.matchMedia?.("(pointer: coarse)").matches;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => {
  const c = clamp01(x);
  return c * c * (3 - 2 * c);
};

/** rAF-throttled passive scroll+resize subscription. `apply` runs at most once
 *  per frame. Returns a disposer. Fires once immediately so resting state is
 *  correct before the first scroll. */
function onScrollFrame(apply: () => void): () => void {
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

/** Fire `run` once when `el` first scrolls into view, then disconnect. */
export function revealOnce(
  el: Element,
  run: () => void,
  threshold = 0.25,
): () => void {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          run();
          io.disconnect();
        }
      }
    },
    { threshold },
  );
  io.observe(el);
  return () => io.disconnect();
}

/**
 * Arm + reveal the FALL cascade on a section. `.fall-block` children are hidden
 * only while `.armed` is set; adding `.in-view` runs the staggered drop. On
 * reduced-motion / no-JS we never arm, so content is visible by default.
 */
export function armReveal(section: HTMLElement, threshold = 0.18): () => void {
  if (reduceMotion()) {
    section.classList.add("in-view");
    return () => {};
  }
  section.classList.add("armed");
  return revealOnce(section, () => section.classList.add("in-view"), threshold);
}

/**
 * Scrubbed GROW + PARALLAX for an in-flow window. Writes two vars on `target`:
 *   --p   0→1 as the element rises from the viewport bottom to ~mid (grow)
 *   --par −1..+1 by viewport-centre offset (a small parallax drift)
 * index.css turns them into transform. Reduced-motion → resting (--p:1,--par:0).
 */
export function growOnScroll(
  el: HTMLElement,
  target: HTMLElement = el,
): () => void {
  if (reduceMotion()) {
    target.style.setProperty("--p", "1");
    target.style.setProperty("--par", "0");
    return () => {};
  }
  return onScrollFrame(() => {
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight || 1;
    const p = smooth((vh - r.top) / (vh * 0.55));
    const center = r.top + r.height / 2;
    const par = Math.max(-1, Math.min(1, ((vh / 2 - center) / vh) * 1.7));
    target.style.setProperty("--p", p.toFixed(4));
    target.style.setProperty("--par", par.toFixed(4));
  });
}

/**
 * Scrubbed progress (0→1) across a TALL `track` whose sticky child stays pinned
 * while you scroll through it — drives the hero's dramatic grow. p=0 at the top
 * of the track, 1 once you've scrolled one viewport past. Reduced-motion → 1.
 */
export function pinnedProgress(
  track: HTMLElement,
  set: (p: number) => void,
): () => void {
  if (reduceMotion()) {
    set(1);
    return () => {};
  }
  return onScrollFrame(() => {
    const r = track.getBoundingClientRect();
    const vh = window.innerHeight || 1;
    const total = r.height - vh;
    set(total > 0 ? smooth(Math.min(1, Math.max(0, -r.top / total))) : 1);
  });
}

/**
 * Scrubbed 0→1 progress as `el` makes a full pass through the viewport (0 = just
 * entering from the bottom, 1 = just left past the top). Drives the horizontal
 * cover-wall pan. Reduced-motion → resting mid (0.5).
 */
export function trackInView(
  el: HTMLElement,
  set: (p: number) => void,
): () => void {
  if (reduceMotion()) {
    set(0.5);
    return () => {};
  }
  return onScrollFrame(() => {
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight || 1;
    set(clamp01((vh - r.top) / (vh + r.height)));
  });
}

/**
 * Lenis smooth-scroll — the substrate the scrubbed effects ride on. Tuned
 * RESPONSIVE (a tight lerp, not a long duration) so it tracks the wheel closely
 * instead of feeling floaty. Lazily imported (own chunk), disabled on touch +
 * reduced-motion. Returns a destroy fn — MUST be torn down on route-away since
 * Lenis hijacks the global scroll.
 */
export function setupLenis(): () => void {
  if (reduceMotion() || coarsePointer()) return () => {};
  let lenis: { raf: (t: number) => void; destroy: () => void } | undefined;
  let raf = 0;
  let killed = false;
  void import("lenis").then(({ default: Lenis }) => {
    if (killed) return;
    lenis = new Lenis({
      lerp: 0.13, // higher = snappier / closer to the wheel
      wheelMultiplier: 1.05,
      touchMultiplier: 1.6,
    });
    const loop = (time: number) => {
      lenis?.raf(time);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  });
  return () => {
    killed = true;
    if (raf) cancelAnimationFrame(raf);
    lenis?.destroy();
  };
}
