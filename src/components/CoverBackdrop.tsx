import { Show, createEffect, createSignal, onCleanup, untrack } from "solid-js";

/**
 * Ambient cover-art backdrop — the depth layer that gives the glass header and
 * the whole page something real to refract. A cover image is blown up, heavily
 * softened and PINNED (position: fixed) across the entire viewport, then graded
 * into the page bg so text stays legible. Because it's fixed, content scrolls
 * OVER a static image — a parallax-like depth read across the full page, not a
 * band that scrolls away. Deliberately restrained — a hint of depth, not a
 * dominant field. Decorative (aria-hidden, no pointer events); renders nothing
 * when there's no cover — glass over a flat bg is pointless, which is the whole
 * reason this layer exists.
 *
 * PERFORMANCE (the 2026-07 standalone-PWA lag): the softening is baked ONCE
 * per cover into a tiny offscreen canvas (~48px wide, cached per URL) and the
 * result is simply upscaled full-screen — bilinear stretching from 48px IS the
 * blur. The previous implementation used CSS `blur(80px)` on a full-viewport
 * layer, which iOS re-rasterizes on every mount — i.e. on every route change,
 * since each page mounts its own backdrop — and that single filter dominated
 * the 1–2s tab-switch freeze in the installed PWA (standalone WebKit is
 * already slower than Safari, forums.thread/714477). The canvas path needs
 * CORS-clean pixels: prod covers ride the same-origin media proxy, Supabase
 * storage sends ACAO:* — dev hits providers directly and may taint, so a
 * failed bake falls back to the old CSS-blur rendering (dev-only cost).
 *
 * `coverUrl` is reactive: when it changes (e.g. hovering a different card on
 * Home) the two-buffer crossfade fades the new cover in over the old, so the
 * atmosphere drifts rather than hard-cutting (the app's "liquid" motion read).
 * Under prefers-reduced-motion the global dampener collapses the transition.
 *
 * `position: fixed` establishes its OWN stacking context; with -z-10 that
 * context sits at root level BELOW the ContentFrame + ColumnGuide hairlines
 * (z=-5, also fixed) so those stay crisp, and below all content (z≥0); the
 * sticky .glass HeadBar (z=20) refracts it. This relies on the page's <main>
 * NOT being a stacking context — otherwise this fixed layer's context would
 * nest inside it and paint above the root-level frame lines.
 */

/** Bake width — small enough that the fullscreen upscale reads as a heavy
 *  blur, big enough to keep the color fields of a cover recognizable. */
const BAKE_W = 48;

/** url → baked tiny data-URL ("" = bake failed, use the CSS-blur fallback).
 *  Module-level: survives route changes, so revisiting a page (or crossfading
 *  back to a recently hovered cover) never re-decodes or re-draws. */
const bakeCache = new Map<string, string>();

async function bakeAmbient(url: string): Promise<string> {
  const cached = bakeCache.get(url);
  if (cached !== undefined) return cached;
  let baked = "";
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.src = url;
    await img.decode();
    const aspect = img.naturalHeight / Math.max(1, img.naturalWidth);
    // Two-pass resample: crush to ~12px first (kills detail the way a huge
    // blur would), then upscale to the bake size — the second smoothing
    // pass turns the 12px blocks into soft gradients. A single 48px pass
    // kept too much structure: fullscreen it read as "upscaled image", not
    // as the old blur(80px) atmosphere.
    const tinyW = Math.max(4, Math.round(BAKE_W / 4));
    const tinyH = Math.max(4, Math.round(tinyW * aspect));
    const tiny = document.createElement("canvas");
    tiny.width = tinyW;
    tiny.height = tinyH;
    const tctx = tiny.getContext("2d");
    const canvas = document.createElement("canvas");
    canvas.width = BAKE_W;
    canvas.height = Math.max(1, Math.round(BAKE_W * aspect));
    const ctx = canvas.getContext("2d");
    if (tctx && ctx) {
      tctx.imageSmoothingEnabled = true;
      tctx.imageSmoothingQuality = "high";
      tctx.drawImage(img, 0, 0, tinyW, tinyH);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      // In-bake blur + the saturation lift the CSS filter used to apply.
      // blur(4px) at 48px bake width ≈ blur(~35px) at phone width, on top
      // of the double-resample softening. Safari versions without canvas
      // filters ignore this — the two-pass resample still carries it.
      ctx.filter = "saturate(1.25) blur(4px)";
      ctx.drawImage(tiny, 0, 0, canvas.width, canvas.height);
      baked = canvas.toDataURL("image/png"); // throws on tainted canvas
    }
  } catch {
    baked = ""; // CORS-tainted or undecodable → CSS-blur fallback
  }
  bakeCache.set(url, baked);
  return baked;
}

export function CoverBackdrop(props: { coverUrl: string | null }) {
  // Two ping-pong buffers. `top` names the buffer currently shown at full
  // opacity; on a cover change we write the new url into the OTHER buffer and
  // flip `top` to it — the incoming layer fades in (opacity→1) while the
  // outgoing fades out (opacity→0). Bounded to exactly two <img> elements, so
  // rapid hover changes just re-flip; in-flight opacity transitions interrupt
  // gracefully.
  const [slotA, setSlotA] = createSignal<string | null>(props.coverUrl ?? null);
  const [slotB, setSlotB] = createSignal<string | null>(null);
  const [top, setTop] = createSignal<"a" | "b">("a");

  createEffect(() => {
    const next = props.coverUrl ?? null;
    const cur = untrack(() => (untrack(top) === "a" ? slotA() : slotB()));
    if (next === cur) return;
    if (untrack(top) === "a") {
      setSlotB(next);
      setTop("b");
    } else {
      setSlotA(next);
      setTop("a");
    }
  });

  return (
    <Show when={slotA() || slotB()}>
      <div
        aria-hidden
        class="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      >
        {/* Overall wash intensity lives on this wrapper; the two buffers
            crossfade 1↔0 within it. Kept gentle (and gentler in dark). */}
        <div class="absolute inset-0 opacity-45 dark:opacity-30">
          <CoverLayer url={slotA()} visible={top() === "a"} />
          <CoverLayer url={slotB()} visible={top() === "b"} />
        </div>
        {/* Grade into the page so content stays legible over the whole height:
            a faint atmosphere at the top of the viewport, settling to near-bg
            toward the bottom. Viewport-relative (the layer is fixed). */}
        <div class="absolute inset-0 bg-gradient-to-b from-bg/45 via-bg/80 to-bg/96" />
      </div>
    </Show>
  );
}

/** One crossfade buffer: the baked-tiny cover stretched over the viewport
 *  (see bakeAmbient), fading its opacity between 1 (live) and 0 (parked) on
 *  the canonical ease-quart curve. Falls back to the original CSS-blur
 *  rendering when the bake failed (CORS-tainted dev images). */
function CoverLayer(props: { url: string | null; visible: boolean }) {
  const [baked, setBaked] = createSignal<string | null>(null);

  createEffect(() => {
    const url = props.url;
    setBaked(null);
    if (!url) return;
    let alive = true;
    void bakeAmbient(url).then((b) => {
      if (alive) setBaked(b);
    });
    onCleanup(() => {
      alive = false;
    });
  });

  return (
    <Show when={props.url && baked() !== null}>
      <img
        src={baked() || props.url!}
        alt=""
        class="absolute inset-0 size-full scale-125 object-cover transition-opacity duration-500 [transition-timing-function:var(--ease-quart)]"
        classList={{ "blur-[80px] saturate-[1.25]": baked() === "" }}
        style={{ opacity: props.visible ? 1 : 0 }}
      />
    </Show>
  );
}
