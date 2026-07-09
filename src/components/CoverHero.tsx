import { Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { bakeAmbient } from "@/components/CoverBackdrop";
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
 * design), and under the sheet the same cover shows blurred (= "behind
 * frosted glass"). The sheet edge IS the sharp→blur line.
 *
 * ARCHITECTURE (v5 — fixed image + occluding sheet backing): the sharp
 * cover is a plain `position: fixed` layer (z -8) — the exact construct the
 * CoverBackdrop wash uses, which iOS has composited glitch-free for months.
 * It is NEVER clipped and NEVER repositioned. The wipe comes from the other
 * side: the page's content wrapper carries a `CoverSheetBacking` — an
 * opaque, in-flow-anchored backing (bg + blurred cover wash) that occludes
 * the fixed cover as the content slides over it. The sheet edge is the
 * wrapper's own top border — pixel-exact by construction, nothing measured,
 * nothing synchronized.
 *
 * Graveyard (all four tried, all torn apart by iOS): v1 JS-chased a clip on
 * the fixed image (edge gap at speed — iOS scrolls on the compositor, JS on
 * main), v2 counter-translated per scroll event (jitter), v3 CSS
 * scroll-driven animation (range/var() misbehaved), v4 sticky-in-
 * overflow-clip at negative z (WebKit discarded the image's raster tiles
 * mid-scroll — chunks vanished and repainted lazily). The durable lesson:
 * any construct that repositions or re-clips the SHARP image per scroll
 * frame shows its seams; v5 has none — the only scroll-coupled surface is
 * the opaque sheet itself, which is ordinary in-flow content.
 *
 * Renders the fixed cover PLUS the in-flow spacer that pushes the content
 * start to the hero's bottom edge. The counterpart `CoverSheetBacking` must
 * be mounted as first child of the page's `relative` content wrapper.
 * Relies on <main> and the wrapper NOT being stacking contexts (the fixed
 * layers must resolve against the root, same invariant as CoverBackdrop).
 * Heights use svh, never vh (iOS toolbar-safe) and nothing reads
 * visualViewport (handshake §iOS/Mobile).
 */

// ── Tuning knobs ────────────────────────────────────────────────────────
/** ≈ single-line sticky PageHeader height (pt-6 + kicker + h1 + pb-3 ≈
 *  82px; titles truncate, so it no longer wraps taller). Seeds the spacer
 *  height; the sheet edge itself is the content wrapper's top edge, so a
 *  small mis-estimate here only shifts WHERE content starts, never opens a
 *  seam. */
const HEADER_OFFSET = 80;
/** Hero heights per source shape: portrait posters are 2:3 (150vw at full
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
  let spacerEl!: HTMLDivElement;

  const heroH = () => HERO_HEIGHTS[props.aspect ?? "portrait"];

  // ── Adaptive header contrast ─────────────────────────────────────────
  // The theme's grey text tokens don't survive sitting on arbitrary cover
  // art. Sample the cover's top band, blend with the theme bg (the glass
  // tint + top scrim mix bg into the effective surface) and mark the page's
  // <main> with data-hero-tone="dark"|"light" — index.css flips the header's
  // --text/--text-muted below md accordingly. `heroUnderHeader` gates it per
  // scroll frame: once the content edge slides under the header, the glass
  // sits on the sheet backing again and the theme's own tokens are correct.
  let tone: "dark" | "light" | null = null;
  let heroUnderHeader = true;
  let appliedTone: string | null = null;
  const syncTone = () => {
    const next = heroUnderHeader ? tone : null;
    if (next === appliedTone) return;
    appliedTone = next;
    const main = spacerEl.closest("main");
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
      // Header-contrast gate: the hero counts as "under the header" until
      // the content edge (spacer bottom) has slid beneath the header band.
      // (The pin itself is pure CSS — nothing per-frame here but this
      // cheap read, no style writes.)
      heroUnderHeader =
        spacerEl.getBoundingClientRect().bottom >
        HEADER_OFFSET + safeAreaInset("top");
      syncTone();
    };

    // Listener only lives below md (the layer is md:hidden, but an orphaned
    // per-frame reader would keep working invisibly). Re-arms on breakpoint
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
    <>
      {/* The sharp cover — plain fixed layer, z -8, between the CoverBackdrop
          wash (-10) and the sheet backing (-2). It never moves; the sheet
          backing slides over it. coverFor sharpens per source (AniList
          medium→large, Steam header→capsule); it's the mobile LCP, so fetch
          it eagerly. Decorative: aria-hidden, no pointer events. */}
      <img
        ref={fadeOnLoad}
        src={coverFor(props.coverUrl)!}
        alt=""
        aria-hidden
        class="pointer-events-none fixed inset-x-0 top-0 -z-[8] w-full object-cover object-[50%_25%] md:hidden"
        style={{ height: heroH() }}
        fetchpriority="high"
      />
      {/* Top scrim — legibility for the glass PageHeader. Its OWN fixed
          layer at z -1, ABOVE the sheet backing (-2), so it stays pinned to
          the viewport top for the whole scroll: first over the sharp cover,
          then over the backing, where it simply deepens the wash's top
          grade. */}
      <div
        aria-hidden
        class="pointer-events-none fixed inset-x-0 top-0 -z-[1] h-28 bg-gradient-to-b from-bg/55 to-transparent md:hidden"
      />
      {/* In-flow spacer — pushes the content start to the hero's bottom
          edge (header is sticky but in flow, hence the offset). Its bottom
          border draws a crisp instrument rule ON the glass sheet's top edge
          (only exists when a hero exists — no stray rule under the header
          on cover-less items). --safe-top compensates the header growing by
          the status-bar inset in the edge-to-edge PWA. */}
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

/**
 * The glass sheet's opaque backing (< md) — mount as FIRST child of the
 * page's content wrapper (which must be `relative` and must NOT be a
 * stacking context). Spans the wrapper exactly (`inset-0`), so its top edge
 * IS the content edge: as the content scrolls over the fixed cover, this
 * backing occludes it — that hard line is the wipe.
 *
 * The wash inside is GLUED to the sheet: plain absolute at the backing top,
 * one viewport tall, dissolving to full bg at its bottom — the frosted
 * cover lives at the sheet edge (where the blur continues the sharp cover
 * it cuts off) and deeper content rests on calm bg. Deliberately NOT
 * viewport-pinned: a sticky version shipped first and real iOS left it
 * unpinned mid-scroll (hard wash-bottom seam walking through the page) —
 * device WebKit's async scrolling mistreats ANY pinned layer under the
 * content, sticky included, even where desktop/Playwright WebKit complies.
 * Below the content, only `position: fixed` may pin; everything else must
 * scroll with the document. Height caps at the wrapper (`min(100svh,
 * 100%)`) so short pages never grow phantom scroll range.
 */
export function CoverSheetBacking(props: { coverUrl: string }) {
  const [baked, setBaked] = createSignal<string | null>(null);

  createEffect(() => {
    // Bake the RAW url — same cache key as the page's CoverBackdrop, so
    // this is a cache hit, never a second bake.
    const url = props.coverUrl;
    setBaked(null);
    let alive = true;
    void bakeAmbient(url).then((b) => {
      if (alive) setBaked(b);
    });
    onCleanup(() => {
      alive = false;
    });
  });

  return (
    <div
      aria-hidden
      class="pointer-events-none absolute inset-0 -z-[2] bg-bg md:hidden"
    >
      <div class="absolute inset-x-0 top-0 h-[min(100svh,100%)] overflow-hidden">
        <Show when={baked() !== null}>
          {/* Same recipe as the boosted CoverBackdrop layer: baked-tiny
              cover stretched (the stretching IS the blur), CSS-blur
              fallback for CORS-tainted dev covers. */}
          <img
            ref={fadeOnLoad}
            src={baked() || props.coverUrl}
            alt=""
            class="absolute inset-0 size-full scale-125 object-cover opacity-70 dark:opacity-55"
            classList={{ "blur-[80px] saturate-[1.25]": baked() === "" }}
          />
          {/* Veil grade: bg floor at the sheet edge (section labels land on
              the wash directly — dark covers need it), dissolving to FULL
              bg at the wash bottom so it melts seamlessly into the backing
              base — any translucent endpoint here draws a visible seam
              where the wash box ends. */}
          <div class="absolute inset-0 bg-gradient-to-b from-bg/55 via-bg/70 to-bg" />
        </Show>
      </div>
    </div>
  );
}
