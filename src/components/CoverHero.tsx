import { onCleanup, onMount } from "solid-js";
import { coverFor } from "@/lib/cover";
import { fadeOnLoad } from "@/lib/image-fade";
import { onScrollFrame } from "@/lib/scroll";

/**
 * Mobile cover hero (< md only) — the item cover fills the full viewport
 * width and lies FIXED behind the page. Content scrolls up from below and
 * slides over it; as it does, the sharp cover fades out with scroll progress.
 *
 * The trick: this is NOT a crossfade we run. The blurred CoverBackdrop wash
 * (fixed, z -10) already sits permanently underneath everything on the item
 * page — the hero is just a sharp layer above it (z -8, still behind all
 * content) that gets out of the way. What remains when it's gone IS the wash.
 * No second bake, no filter changes; opacity + transform only (iOS-safe).
 *
 * Renders the fixed layer PLUS the in-flow spacer that pushes the content
 * start to the hero's bottom edge — mount it in flow, right before the
 * content row. The sticky glass PageHeader (z 20) is in flow above the
 * spacer, so content top at scroll 0 lands at ~headerH + spacerH ≈ heroH.
 * Header height varies (long titles wrap) — the bottom feather absorbs the
 * imprecision; if 2-line titles ever look sloppy, measure --header-h via a
 * ResizeObserver instead of HEADER_OFFSET.
 *
 * Heights use svh, never vh (iOS toolbar-safe, smallest viewport → no jump
 * when Safari chrome collapses) and nothing reads visualViewport (iOS-26 bug,
 * see handshake §iOS/Mobile).
 */

// ── Tuning knobs ────────────────────────────────────────────────────────
/** Fraction of the content travel over which the hero fully fades. Front-
 *  loaded on purpose: the fade must be spent before text climbs out of the
 *  bottom feather onto (would-be) raw pixels. */
const FADE_TRAVEL = 0.55;
/** Upward image drift per scrolled px (recede-into-depth read). The <img>
 *  is 115% tall so the drift never exposes a gap at the hero's bottom. */
const PARALLAX = 0.25;
/** ≈ single-line sticky PageHeader height (pt-6 + kicker + h1 + pb-3). */
const HEADER_OFFSET = 84;
/** Cropped-stage height: portrait posters are 2:3 (150vw at full width —
 *  far too tall), so a viewport cap crops them to a stage; Steam headers
 *  (460×215) resolve to their natural banner height instead. */
const HERO_H_PORTRAIT = "min(150vw, 58svh)";
const HERO_H_WIDE = "min(46.8vw, 58svh)";

export function CoverHero(props: { coverUrl: string; wide?: boolean }) {
  let rootEl!: HTMLDivElement;
  let imgEl!: HTMLImageElement;

  const heroH = () => (props.wide ? HERO_H_WIDE : HERO_H_PORTRAIT);

  onMount(() => {
    const md = window.matchMedia("(min-width: 768px)");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let dispose: (() => void) | null = null;

    const apply = () => {
      // Travel ≈ spacer height: how far content scrolls before it has fully
      // covered the hero. Math.max(0, scrollY) pins the resting state through
      // iOS rubber-banding (overscroll at top just shows the full hero).
      const travel = Math.max(1, rootEl.offsetHeight - HEADER_OFFSET);
      const s = Math.max(0, window.scrollY);
      const p = Math.min(1, s / (FADE_TRAVEL * travel));
      rootEl.style.opacity = String(1 - p);
      // Fully spent → stop compositing the full-width layer entirely.
      rootEl.style.visibility = p >= 1 ? "hidden" : "";
      // Reduced motion: keep the 1:1 scroll-linked fade (positional, not
      // autonomous motion — same rationale as the fixed wash itself), drop
      // only the parallax drift.
      if (!reduce.matches) {
        imgEl.style.transform = `translateY(${(-PARALLAX * s).toFixed(1)}px)`;
      }
    };

    // The listener only lives below md; the layer itself is md:hidden, but an
    // orphaned per-frame style writer would keep working invisibly. Re-arms
    // on breakpoint crossings and clears any stranded inline styles.
    const arm = () => {
      if (md.matches) {
        dispose?.();
        dispose = null;
        rootEl.style.opacity = "";
        rootEl.style.visibility = "";
        imgEl.style.transform = "";
      } else if (!dispose) {
        dispose = onScrollFrame(apply);
      }
    };
    arm();
    md.addEventListener("change", arm);
    onCleanup(() => {
      md.removeEventListener("change", arm);
      dispose?.();
    });
  });

  return (
    <>
      {/* Fixed hero layer. z -8 slots between the CoverBackdrop wash (-10)
          and the ContentFrame hairlines (-5, zero-width on mobile anyway) —
          behind ALL content. Relies on <main> not being a stacking context
          (same invariant as CoverBackdrop). Decorative: aria-hidden, no
          pointer events. */}
      <div
        ref={rootEl}
        aria-hidden
        class="pointer-events-none fixed inset-x-0 top-0 -z-[8] overflow-hidden md:hidden"
        style={{ height: heroH() }}
      >
        {/* coverFor sharpens per source (AniList medium→large, Steam
            header→capsule); it's the mobile LCP, so fetch it eagerly. */}
        <img
          ref={(el) => {
            imgEl = el;
            fadeOnLoad(el);
          }}
          src={coverFor(props.coverUrl)!}
          alt=""
          class="absolute inset-x-0 top-0 h-[115%] w-full object-cover object-[50%_25%]"
          fetchpriority="high"
        />
        {/* Top scrim: legibility for the glass PageHeader at scroll 0 —
            mirrors the wash's own from-bg/45 top grade so the header band
            reads consistently before and after the fade. */}
        <div class="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-bg/55 to-transparent" />
        {/* Bottom feather: grades the sharp cover into (approximately) the
            wash at that height — the content's leading edge always enters
            over this zone, never over raw pixels. */}
        <div class="absolute inset-x-0 bottom-0 h-[38%] bg-gradient-to-b from-transparent to-bg/95" />
      </div>
      {/* In-flow spacer — pushes the content start to the hero's bottom
          edge (header is sticky but in flow, hence the offset). */}
      <div
        aria-hidden
        class="md:hidden"
        style={{ height: `calc(${heroH()} - ${HEADER_OFFSET}px)` }}
      />
    </>
  );
}
