import { createEffect, onCleanup, onMount } from "solid-js";
import { coverFor } from "@/lib/cover";
import { coverTopLuminance, themeBgLuminance } from "@/lib/cover-tone";
import { fadeOnLoad } from "@/lib/image-fade";
import { safeAreaInset } from "@/lib/media";
import { onScrollFrame } from "@/lib/scroll";

/**
 * Mobile cover hero (< md only) — the item cover fills the full viewport
 * width at the top of the page. As you scroll, the cover drifts up at a
 * FRACTION of scroll speed (parallax), so the content edge wipes it away
 * hard while the picture itself recedes with depth. Under the content, the
 * boosted CoverBackdrop wash (position: fixed, viewport-stable) shows the
 * same cover frosted — the glass read comes from that fixed wash, exactly
 * as it does on desktop.
 *
 * ARCHITECTURE (v7 — in-flow parallax stage): the stage is an ordinary
 * IN-FLOW div pulled up under the sticky PageHeader by a negative margin,
 * `overflow: clip`, its bottom edge IS where content starts — a hard,
 * compositor-exact wipe line by construction. Inside, the image translates
 * down by scrollY × PARALLAX on its own composited layer, driven by
 * rAF-throttled JS. Nothing behind the content ever needs to be occluded,
 * because the sharp cover is normal document content ABOVE the content,
 * not a pinned layer behind it.
 *
 * Why parallax is the shape that finally holds on iOS, after six pinned
 * attempts (JS clip = edge gap · counter-translate = jitter · scroll-driven
 * animation = range zicken · sticky-in-clip = discarded raster tiles ·
 * opaque sheet wash = painted-on backdrop read · backdrop-filter glass =
 * not rendered at negative z): every pinned variant demanded PIXEL
 * EXACTNESS — the image must not move at all, so a single lagged frame
 * reads as jitter, a mis-clip as a seam. Parallax inverts the tolerance:
 * the image is SUPPOSED to move, so main-thread lag during compositor
 * scrolls only wobbles its speed imperceptibly. Demand stillness and every
 * error is visible; allow motion and errors vanish into it.
 *
 * Heights use svh, never vh (iOS toolbar-safe); nothing reads
 * visualViewport (handshake §iOS/Mobile).
 */

// ── Tuning knobs ────────────────────────────────────────────────────────
/** Fraction of scroll speed the image drifts down (0 = pinned, 1 = scrolls
 *  with the page). The depth read lives around 0.3–0.45. */
const PARALLAX = 0.35;
/** ≈ single-line sticky PageHeader height (pt-6 + kicker + h1 + pb-3 ≈
 *  82px; titles truncate, so it no longer wraps taller). The stage pulls
 *  itself up by this + the safe-area inset so the cover starts at the
 *  viewport top, under the glass header. */
const HEADER_OFFSET = 80;
/** Stage heights per source shape: portrait posters are 2:3 (150vw at full
 *  width — far too tall), so a viewport cap crops them; Steam headers
 *  (460×215) resolve to their natural banner height; square list covers
 *  (uploads are square-cropped, generated covers are square) show whole
 *  until the cap binds. */
const HERO_HEIGHTS = {
  portrait: "min(150vw, 58svh)",
  wide: "min(46.8vw, 58svh)",
  square: "min(100vw, 58svh)",
} as const;

export function CoverHero(props: {
  coverUrl: string;
  aspect?: keyof typeof HERO_HEIGHTS;
}) {
  let stageEl!: HTMLDivElement;
  let imgEl!: HTMLImageElement;

  const heroH = () => HERO_HEIGHTS[props.aspect ?? "portrait"];

  // ── Adaptive header contrast ─────────────────────────────────────────
  // The theme's grey text tokens don't survive sitting on arbitrary cover
  // art. Sample the cover's top band, blend with the theme bg (the glass
  // tint mixes bg into the effective surface) and mark the page's <main>
  // with data-hero-tone="dark"|"light" — index.css flips the header's
  // --text/--text-muted below md accordingly. `heroUnderHeader` gates it
  // per scroll frame: once the stage's bottom edge slides under the header,
  // the glass sits on wash/content again and the theme's own tokens are
  // correct.
  let tone: "dark" | "light" | null = null;
  let heroUnderHeader = true;
  let appliedTone: string | null = null;
  const syncTone = () => {
    const next = heroUnderHeader ? tone : null;
    if (next === appliedTone) return;
    appliedTone = next;
    const main = stageEl.closest("main");
    if (!main) return;
    if (next) main.setAttribute("data-hero-tone", next);
    else main.removeAttribute("data-hero-tone");
  };

  createEffect(() => {
    const url = coverFor(props.coverUrl)!;
    let alive = true;
    void coverTopLuminance(url).then((lum) => {
      if (!alive || lum === null) return;
      // Effective surface under the header ≈ cover shimmering through the
      // glass tint + scrim — weight the cover at ~60%. Above mid-luminance
      // the cover reads bright → dark text; below → light text.
      const effective = 0.4 * themeBgLuminance() + 0.6 * lum;
      tone = effective > 0.5 ? "light" : "dark";
      syncTone();
    });
    onCleanup(() => {
      alive = false;
    });
  });

  onMount(() => {
    const md = window.matchMedia("(min-width: 768px)");
    let dispose: (() => void) | null = null;

    const apply = () => {
      const r = stageEl.getBoundingClientRect();
      // Parallax drive. Clamped at 0 so the top rubber-band never opens a
      // gap at the stage bottom (the image stays glued while bouncing);
      // skipped once the stage has left the viewport (nothing to move).
      if (r.bottom > 0) {
        const s = Math.max(0, window.scrollY);
        imgEl.style.transform = `translate3d(0, ${(s * PARALLAX).toFixed(1)}px, 0)`;
      }
      // Header-contrast gate: the hero counts as "under the header" until
      // its bottom edge has slid beneath the header band.
      heroUnderHeader = r.bottom > HEADER_OFFSET + safeAreaInset("top");
      syncTone();
    };

    // Driver only lives below md (the stage is md:hidden, but an orphaned
    // per-frame writer would keep working invisibly). Re-arms on breakpoint
    // crossings.
    const arm = () => {
      if (md.matches) {
        dispose?.();
        dispose = null;
        heroUnderHeader = false;
        syncTone();
      } else if (!dispose) {
        dispose = onScrollFrame(apply);
      }
    };
    arm();
    md.addEventListener("change", arm);
    onCleanup(() => {
      md.removeEventListener("change", arm);
      dispose?.();
      // Never strand the tone override on the page's <main>.
      heroUnderHeader = false;
      syncTone();
    });
  });

  return (
    // In-flow parallax stage. The negative top margin pulls it up under the
    // sticky PageHeader so the cover starts at the viewport top (the header
    // is glass); its bottom border draws the crisp instrument rule ON the
    // wipe edge. overflow: clip crops the image as it drifts below the
    // content line. Plain z-auto document content — no pinned layers, no
    // negative-z subtree. Decorative: aria-hidden, no pointer events.
    <div
      ref={stageEl}
      aria-hidden
      class="pointer-events-none relative overflow-clip border-b border-rule md:hidden"
      style={{
        height: heroH(),
        "margin-top": `calc(-${HEADER_OFFSET}px - var(--safe-top))`,
      }}
    >
      {/* coverFor sharpens per source (AniList medium→large, Steam
          header→capsule); it's the mobile LCP, so fetch it eagerly.
          will-change: the transform is re-written every scroll frame —
          keep the image on its own composited layer. */}
      <img
        ref={(el) => {
          imgEl = el;
          fadeOnLoad(el);
        }}
        src={coverFor(props.coverUrl)!}
        alt=""
        class="absolute inset-x-0 top-0 h-full w-full object-cover object-[50%_25%] will-change-transform"
        fetchpriority="high"
      />
      {/* Top scrim — legibility for the glass PageHeader while the cover
          sits under it. Lives INSIDE the stage (scrolls away with it):
          once the hero has passed, the header glass sits on the boosted
          wash, whose own top grade carries the job. */}
      <div class="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-bg/55 to-transparent" />
    </div>
  );
}
