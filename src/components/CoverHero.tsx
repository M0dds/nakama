import { createEffect, onCleanup, onMount } from "solid-js";
import { coverFor } from "@/lib/cover";
import { coverTopLuminance, themeBgLuminance } from "@/lib/cover-tone";
import { fadeOnLoad } from "@/lib/image-fade";
import { safeAreaInset } from "@/lib/media";
import { onScrollFrame } from "@/lib/scroll";

/**
 * Mobile cover hero (< md only) — the item cover fills the full viewport
 * width and lies pinned behind the page. Content scrolls up from below and
 * slides over it like a GLASS SHEET: at the content's top edge the sharp
 * cover is cut off HARD (no fade, no feather — matches the sharp-edge
 * design), and what shows underneath the transparent content is the blurred
 * CoverBackdrop wash (boosted below md via `boostBelowMd`) — i.e. the same
 * cover "behind frosted glass". The sheet edge IS the sharp→blur line.
 *
 * ARCHITECTURE (v2 — the lag fix): the clip stage is an IN-FLOW absolute
 * element that scrolls with the document, so its bottom edge is COMPOSITOR-
 * locked to the content edge — pixel-exact at any scroll speed. (v1 was a
 * fixed layer whose clip edge chased the content via JS transforms; iOS
 * scrolls on the compositor thread while JS runs on main, so fast scrolling
 * opened a visible gap of wash between content edge and image.) Only the
 * IMAGE inside is counter-translated by scrollY to stay viewport-pinned —
 * a lagged frame there shows as a tiny shift inside the picture, never as
 * a hole at the edge.
 *
 * Renders the stage PLUS the in-flow spacer that pushes the content start
 * to the hero's bottom edge — mount it in flow, right before the content
 * row, inside a `relative` <main> that is NOT a stacking context (the
 * stage's -z-8 must resolve against the root, between the CoverBackdrop
 * wash at -10 and the content). Heights use svh, never vh (iOS toolbar-
 * safe) and nothing reads visualViewport (handshake §iOS/Mobile).
 */

// ── Tuning knobs ────────────────────────────────────────────────────────
/** How hard the image is pinned to the viewport. 1 = fully fixed (user
 *  call, 2026-07-09 — no parallax), 0 = scrolls with the page like a plain
 *  hero, in between = parallax. Lower values also shrink the worst-case
 *  in-image jitter when iOS momentum outruns main-thread scroll events. */
const PIN = 1;
/** ≈ single-line sticky PageHeader height (pt-6 + kicker + h1 + pb-3 ≈
 *  82px; titles truncate, so it no longer wraps taller). Only seeds the
 *  resting layout — the stage height is MEASURED off the spacer, so the
 *  sheet edge is exact regardless. */
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
  let stageEl!: HTMLDivElement;
  let imgEl!: HTMLImageElement;
  let spacerEl!: HTMLDivElement;

  const heroH = () => HERO_HEIGHTS[props.aspect ?? "portrait"];

  // ── Adaptive header contrast ─────────────────────────────────────────
  // The theme's grey text tokens don't survive sitting on arbitrary cover
  // art. Sample the cover's top band, blend with the theme bg (the glass
  // tint + top scrim mix bg into the effective surface) and mark the page's
  // <main> with data-hero-tone="dark"|"light" — index.css flips the header's
  // --text/--text-muted below md accordingly. `heroUnderHeader` gates it per
  // scroll frame: once the content edge slides under the header, the glass
  // sits on wash/content again and the theme's own tokens are correct.
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

    // The stage must end EXACTLY where content starts (= the spacer's bottom,
    // in document space) — measured, not derived from the HEADER_OFFSET
    // estimate, so the sheet edge carries no sliver of mis-estimate. Static
    // between resizes (the header is single-line by construction).
    const size = () => {
      stageEl.style.height = `${
        spacerEl.getBoundingClientRect().bottom + window.scrollY
      }px`;
    };

    const apply = () => {
      // Counter-translate: the stage scrolls up with the page; pushing the
      // image down by PIN·scrollY keeps the picture viewport-pinned. The
      // 115%-tall image leaves slack so no edge ever runs dry. Clamp: iOS
      // rubber-banding at the top must not pull the image off its ceiling.
      const s = Math.max(0, window.scrollY);
      imgEl.style.transform = `translateY(${(PIN * s).toFixed(1)}px)`;
      // Header-contrast gate: the hero counts as "under the header" until
      // the content edge (spacer bottom) has slid beneath the header band.
      heroUnderHeader =
        spacerEl.getBoundingClientRect().bottom >
        HEADER_OFFSET + safeAreaInset("top");
      syncTone();
    };

    // Listener + measurement only live below md (the layer is md:hidden, but
    // an orphaned per-frame writer would keep working invisibly). Re-arms on
    // breakpoint crossings and clears stranded inline styles.
    const arm = () => {
      if (md.matches) {
        dispose?.();
        dispose = null;
        imgEl.style.transform = "";
        heroUnderHeader = false;
        syncTone();
      } else if (!dispose) {
        size();
        // onScrollFrame also fires on resize — re-measure the stage there
        // (cheap: one gBCR per resize-frame, constant during pure scrolls
        // is fine to re-read since the layout doesn't shift).
        dispose = onScrollFrame(() => {
          size();
          apply();
        });
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
    <>
      {/* In-flow clip stage. z -8 slots between the CoverBackdrop wash (-10)
          and the ContentFrame hairlines (-5, zero-width on mobile anyway) —
          behind ALL content; relies on <main> being `relative` but NOT a
          stacking context (same invariant as CoverBackdrop). Scrolls away
          with the document — that IS the wipe. Decorative: aria-hidden, no
          pointer events. */}
      <div
        ref={stageEl}
        aria-hidden
        class="pointer-events-none absolute inset-x-0 top-0 -z-[8] overflow-hidden md:hidden"
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
          edge doubles as the stage-height measurement (see size()), and its
          bottom border draws a crisp instrument rule ON the glass sheet's
          top edge (only exists when a hero exists — no stray rule under the
          header on cover-less items). --safe-top compensates the header
          growing by the status-bar inset in the edge-to-edge PWA. */}
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
