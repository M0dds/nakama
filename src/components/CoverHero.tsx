import { onCleanup, onMount } from "solid-js";
import { coverFor } from "@/lib/cover";
import { fadeOnLoad } from "@/lib/image-fade";
import { onScrollFrame } from "@/lib/scroll";

/**
 * Mobile cover hero (< md only) — the item cover fills the full viewport
 * width and lies FIXED behind the page. Content scrolls up from below and
 * slides over it like a GLASS SHEET: at the content's top edge the sharp
 * cover is cut off HARD (no fade, no feather — matches the sharp-edge
 * design), and what shows underneath the transparent content is the blurred
 * CoverBackdrop wash (boosted below md via `boostBelowMd`) — i.e. the same
 * cover "behind frosted glass". The sheet edge IS the sharp→blur line.
 *
 * The wipe is compositor-only — no clip-path/height writes per frame:
 * an overflow-hidden OUTER translates up so its bottom edge tracks the
 * content's top edge, while an INNER wrapper counter-translates so the
 * image itself stays put in the viewport. Both are plain transforms.
 * The edge is measured off the in-flow spacer (its bottom == content top),
 * so it stays exact regardless of the sticky header's real height
 * (wrapping 2-line titles included).
 *
 * Renders the fixed layer PLUS that spacer — mount it in flow, right before
 * the content row. Heights use svh, never vh (iOS toolbar-safe) and nothing
 * reads visualViewport (iOS-26 bug, see handshake §iOS/Mobile).
 */

// ── Tuning knobs ────────────────────────────────────────────────────────
/** Upward image drift per scrolled px (recede-into-depth read; reduced-
 *  motion drops it). The <img> is 115% tall so the drift never exposes a
 *  gap; the slight shear against the static wash at the wipe edge is
 *  invisible in the 48px-bake smear. */
const PARALLAX = 0.25;
/** ≈ single-line sticky PageHeader height (pt-6 + kicker + h1 + pb-3 ≈
 *  82px). Deliberately a hair UNDER so the hero never starts pre-wiped —
 *  a 1-2px sliver of wash under the sheet edge is invisible, a pre-wiped
 *  strip on the cover is not. Only sets the resting content offset; the
 *  wipe itself is measured, not derived from this. */
const HEADER_OFFSET = 80;
/** Cropped-stage heights per source shape: portrait posters are 2:3 (150vw
 *  at full width — far too tall), so a viewport cap crops them to a stage;
 *  Steam headers (460×215) resolve to their natural banner height; square
 *  list covers (uploads are square-cropped, generated covers are square)
 *  show whole until the cap binds. */
const HERO_HEIGHTS = {
  portrait: "min(150vw, 58svh)",
  wide: "min(46.8vw, 58svh)",
  square: "min(100vw, 58svh)",
} as const;

export function CoverHero(props: {
  coverUrl: string;
  aspect?: keyof typeof HERO_HEIGHTS;
}) {
  let outerEl!: HTMLDivElement;
  let innerEl!: HTMLDivElement;
  let spacerEl!: HTMLDivElement;

  const heroH = () => HERO_HEIGHTS[props.aspect ?? "portrait"];

  onMount(() => {
    const md = window.matchMedia("(min-width: 768px)");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let dispose: (() => void) | null = null;

    const apply = () => {
      const h = outerEl.offsetHeight;
      // Content top edge in viewport coords == spacer bottom (the spacer sits
      // in flow directly above the content row). Clamped to the hero height
      // so iOS rubber-banding / a taller-than-estimated header never pushes
      // the outer DOWN off the viewport top.
      const edge = Math.min(h, spacerEl.getBoundingClientRect().bottom);
      if (edge <= 0) {
        // Content has fully covered the hero — stop compositing it.
        outerEl.style.visibility = "hidden";
        return;
      }
      outerEl.style.visibility = "";
      const ty = edge - h; // ≤ 0: outer's bottom edge rides the content edge
      const s = Math.max(0, window.scrollY);
      const drift = reduce.matches ? 0 : PARALLAX * s;
      outerEl.style.transform = `translateY(${ty}px)`;
      // Counter-translate: image stays viewport-static (minus the drift)
      // while the outer's clip box slides up over it.
      innerEl.style.transform = `translateY(${(-ty - drift).toFixed(1)}px)`;
    };

    // The listener only lives below md; the layer itself is md:hidden, but an
    // orphaned per-frame style writer would keep working invisibly. Re-arms
    // on breakpoint crossings and clears any stranded inline styles.
    const arm = () => {
      if (md.matches) {
        dispose?.();
        dispose = null;
        outerEl.style.visibility = "";
        outerEl.style.transform = "";
        innerEl.style.transform = "";
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
        ref={outerEl}
        aria-hidden
        class="pointer-events-none fixed inset-x-0 top-0 -z-[8] overflow-hidden md:hidden"
        style={{ height: heroH() }}
      >
        <div ref={innerEl} class="absolute inset-0">
          {/* coverFor sharpens per source (AniList medium→large, Steam
              header→capsule); it's the mobile LCP, so fetch it eagerly. */}
          <img
            ref={(el) => {
              fadeOnLoad(el);
            }}
            src={coverFor(props.coverUrl)!}
            alt=""
            class="absolute inset-x-0 top-0 h-[115%] w-full object-cover object-[50%_25%]"
            fetchpriority="high"
          />
        </div>
      </div>
      {/* Top scrim — legibility for the glass PageHeader. Its OWN fixed
          layer (z -7, above the hero) so it stays pinned to the viewport top
          for the whole scroll: first over the sharp cover, then over the
          wash, where it simply deepens the wash's existing top grade. */}
      <div
        aria-hidden
        class="pointer-events-none fixed inset-x-0 top-0 -z-[7] h-28 bg-gradient-to-b from-bg/55 to-transparent md:hidden"
      />
      {/* In-flow spacer — pushes the content start to the hero's bottom
          edge (header is sticky but in flow, hence the offset). Its bottom
          edge doubles as the wipe measurement (see apply()), and its bottom
          border draws a crisp instrument rule ON the glass sheet's top edge
          (only exists when a hero exists — no stray rule under the header
          on cover-less items). --safe-top compensates the header growing by
          the status-bar inset in the edge-to-edge PWA (PageHeader pt). */}
      <div
        ref={spacerEl}
        aria-hidden
        class="border-b border-rule md:hidden"
        style={{
          height: `calc(${heroH()} - ${HEADER_OFFSET}px - var(--safe-top))`,
        }}
      />
    </>
  );
}
