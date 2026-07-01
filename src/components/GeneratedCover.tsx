import { createMemo, Show } from "solid-js";
import { Pin } from "lucide-solid";
import { type ThemeMode } from "@/lib/themes";
import { useResolvedMode } from "@/lib/use-resolved-mode";
import { fadeOnLoad } from "@/lib/image-fade";

/**
 * GeneratedCover — the default list cover when no image is uploaded.
 *
 * A list stores only a `cover_seed` (a random integer). From it we
 * deterministically derive a soft, Apple-Music-ish cover: a base gradient +
 * blurred colour "orbs" + a faint motif pattern + grain. Rendered as inline SVG
 * or a data-URI (no storage). Covers are mode-independent — a list's cover
 * looks the same in light and dark (see the palette note below).
 *
 * The generator is a small self-contained SYSTEM, independent of the app's
 * named themes: a cover's identity is a continuous (hue, scheme, motif) triple
 * derived from the seed, so the colour space is effectively unbounded — no two
 * covers look alike — and adding/removing app themes never affects covers. Each
 * dimension comes from its OWN hash of the seed, so they vary independently and
 * small/sequential seeds don't correlate. To retune the look, adjust the SL
 * (saturation/lightness) tables below; everything else follows.
 */

// ── Seed → a well-spread deterministic stream ───────────────────────────────
// fmix32 the seed first (so small/sequential seeds avalanche instead of
// clustering), then mulberry32 for a stable stream of [0,1) draws. Every cover
// dimension (hue, scheme, motif, jitter, positions) is drawn in a fixed order,
// so the cover is identical across reloads/devices yet neighbouring seeds land
// far apart.
function rng(seed: number) {
  let a = Math.abs(Math.trunc(seed)) >>> 0;
  a ^= a >>> 16;
  a = Math.imul(a, 0x45d9f3b);
  a ^= a >>> 16;
  a = Math.imul(a, 0x45d9f3b);
  a ^= a >>> 16;
  a = (a >>> 0) || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MOTIFS = ["mesh", "aurora", "lines", "bloom", "dunes", "spotlight"] as const;
type Motif = (typeof MOTIFS)[number];

// c2's hue offset relative to the base hue — the "scheme" (analogous → near-
// complementary). Seed-picked so the two-colour relationship varies too.
const SCHEMES = [24, 40, 68, 152, 192, -34] as const;

export interface CoverSpec {
  /** Base hue 0..360 (continuous) — the cover's colour identity. */
  hue: number;
  /** c2 hue offset from the base (the palette scheme). */
  scheme: number;
  motif: Motif;
}

/** Deterministic seed → cover recipe (hue + scheme + motif). Stable across
 *  reloads/devices; each dimension from an independent hash so they don't
 *  correlate and neighbouring seeds look nothing alike. */
/** frac(x) = x − ⌊x⌋. */
const frac = (x: number) => x - Math.floor(x);

/** fmix32 (murmur3 finalizer) — a strong integer avalanche hash. */
function fmix(n: number): number {
  let a = n >>> 0;
  a ^= a >>> 16;
  a = Math.imul(a, 0x45d9f3b);
  a ^= a >>> 16;
  a = Math.imul(a, 0x45d9f3b);
  a ^= a >>> 16;
  return a >>> 0;
}

/** Deterministic seed → cover recipe.
 *  hue + motif are the two axes of an R2 low-discrepancy sequence (Roberts'
 *  1/plastic constants), which spreads the (hue, motif) PAIR evenly in 2D — so
 *  no two covers share a motif at a similar hue. (A single golden ratio per
 *  axis instead builds a visible lattice where seed s and s+8 collide; the R2
 *  pair doesn't.) Scheme — the subtler c2 hue offset — comes from a hash,
 *  decorrelated from the pair. Independent of the app themes; stable per seed. */
export function coverSpecFromSeed(seed: number): CoverSpec {
  const n = Math.abs(Math.trunc(seed));
  return {
    hue: 360 * frac(0.5 + n * 0.7548776662),
    motif: MOTIFS[Math.floor(MOTIFS.length * frac(0.5 + n * 0.5698402910))],
    scheme: SCHEMES[fmix(n ^ 0xc2b2ae35) % SCHEMES.length],
  };
}

const f = (n: number) => n.toFixed(3);
const hx = (c: number) =>
  Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0");

/** HSL (h any°, s/l 0..1) → #rrggbb, clamped. The only colour source now — the
 *  whole palette is generated, not sampled from theme swatches. */
function hsl(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g] = [c, x];
  else if (h < 120) [r, g] = [x, c];
  else if (h < 180) [g, b] = [c, x];
  else if (h < 240) [g, b] = [x, c];
  else if (h < 300) [r, b] = [x, c];
  else [r, b] = [c, x];
  return `#${hx((r + m) * 255)}${hx((g + m) * 255)}${hx((b + m) * 255)}`;
}

/** A soft colour orb — a full-canvas rect painted by a positioned radial
 *  gradient (colour centre → transparent). Layered orbs make the mesh glow.
 *  `cx/cy/rad` are fractions of the 100×100 canvas. */
function orb(
  id: string,
  cx: number,
  cy: number,
  rad: number,
  color: string,
  alpha: number,
) {
  return {
    def: `<radialGradient id="${id}" cx="${f(cx)}" cy="${f(cy)}" r="${f(
      rad,
    )}"><stop offset="0" stop-color="${color}" stop-opacity="${f(
      alpha,
    )}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`,
    use: `<rect width="100" height="100" fill="url(#${id})"/>`,
  };
}

// Saturation/lightness per role — the one knob for the overall look:
// [c1, c2, glow, deep(base ground), light(base top), pattern].
//
// Covers are intentionally mode-INDEPENDENT: they keep this richer "dark" look
// in light mode too. A light base washed the motif patterns out (they'd sit
// dark on a light field, barely visible), so a list's cover reads the SAME in
// light and dark. Both modes map to the one palette; `mode` stays in the
// signatures for API symmetry.
const PALETTE = {
  c1: [0.5, 0.48],
  c2: [0.46, 0.42],
  glow: [0.5, 0.45],
  deep: [0.42, 0.14],
  light: [0.34, 0.28],
  pat: [0.3, 0.6],
} as const;
const SL = { light: PALETTE, dark: PALETTE };

function buildSvg(seed: number, mode: ThemeMode): string {
  const { hue, scheme, motif } = coverSpecFromSeed(seed);
  const t = SL[mode];
  // Incidental variation (jitter/angle/orb positions) off a warmed stream — two
  // discards so its first real draw decorrelates from neighbouring seeds.
  const r = rng(seed);
  r();
  r();
  const lj = (r() * 2 - 1) * 0.06; // per-seed lightness jitter

  const c1 = hsl(hue, t.c1[0], t.c1[1] + lj);
  const c2 = hsl(hue + scheme, t.c2[0], t.c2[1] - lj);
  const glow = hsl(hue + scheme / 2, t.glow[0], t.glow[1]);
  const deep = hsl(hue, t.deep[0], t.deep[1]);
  const light = hsl(hue + scheme * 0.3, t.light[0], t.light[1]);
  const pat = hsl(hue, t.pat[0], t.pat[1]);
  const angle = Math.floor(r() * 360);

  const uid = `c${Math.abs(Math.trunc(seed)) >>> 0}`;
  const defs: string[] = [];
  const uses: string[] = [];

  // Base gradient (deep → light), rotated per seed.
  defs.push(
    `<linearGradient id="${uid}b" gradientTransform="rotate(${angle} .5 .5)"><stop offset="0" stop-color="${deep}"/><stop offset="1" stop-color="${light}"/></linearGradient>`,
  );
  uses.push(`<rect width="100" height="100" fill="url(#${uid}b)"/>`);

  let i = 0;
  const orbUses: string[] = [];
  const add = (
    cx: number,
    cy: number,
    rad: number,
    color: string,
    alpha: number,
  ) => {
    const o = orb(`${uid}o${i++}`, cx, cy, rad, color, alpha);
    defs.push(o.def);
    orbUses.push(o.use);
  };

  // Each motif carries its OWN faint pattern (texture, not decoration): the
  // muted `pat` tone at low opacity so it never competes with the wash. `grid`
  // returns a centred grid (symmetric margins) for the given step.
  const sw = 0.5;
  const grid = (step: number) => {
    const n = Math.floor(100 / step);
    return { n, start: (100 - (n - 1) * step) / 2 };
  };
  let pattern = "";

  if (motif === "mesh") {
    add(r() * 0.5 + 0.1, r() * 0.4 + 0.1, 0.6, c1, 0.9);
    add(r() * 0.4 + 0.5, r() * 0.4 + 0.5, 0.55, c2, 0.85);
    add(r() * 0.6 + 0.2, r() * 0.5 + 0.3, 0.45, glow, 0.5);
    for (let o = -100; o < 100; o += 14) {
      pattern += `<line x1="${f(o)}" y1="0" x2="${f(o + 100)}" y2="100" stroke="${pat}" stroke-width="${sw}"/>`;
    }
  } else if (motif === "aurora") {
    add(0.2, 0.22, 0.85, c1, 0.85);
    add(0.82, 0.8, 0.85, c2, 0.8);
    add(0.5, 0.5, 0.5, glow, 0.3);
    const g = grid(11);
    for (let gy = 0; gy < g.n; gy++) {
      for (let gx = 0; gx < g.n; gx++) {
        pattern += `<circle cx="${f(g.start + gx * 11)}" cy="${f(g.start + gy * 11)}" r="0.85" fill="${pat}"/>`;
      }
    }
  } else if (motif === "lines") {
    add(r() * 0.5 + 0.25, r() * 0.35 + 0.1, 0.85, c1, 0.7);
    const g = grid(11);
    for (let c = 0; c < g.n; c++) {
      const x = g.start + c * 11;
      pattern += `<line x1="${f(x)}" y1="0" x2="${f(x)}" y2="100" stroke="${pat}" stroke-width="${sw}"/>`;
    }
  } else if (motif === "bloom") {
    const cx = r() * 0.5 + 0.25;
    const cy = r() * 0.5 + 0.25;
    add(cx, cy, 0.95, c1, 0.9);
    add(cx, cy, 0.34, c2, 0.85);
    for (let rr = 10; rr <= 84; rr += 12) {
      pattern += `<circle cx="${f(cx * 100)}" cy="${f(cy * 100)}" r="${rr}" fill="none" stroke="${pat}" stroke-width="${sw}"/>`;
    }
  } else if (motif === "dunes") {
    add(0.5, 0.14 + r() * 0.1, 0.9, c1, 0.7);
    add(0.5, 0.58 + r() * 0.1, 0.9, c2, 0.7);
    add(0.5, 0.95, 0.7, deep, 0.6);
    const g = grid(11);
    for (let c = 0; c < g.n; c++) {
      const y = g.start + c * 11;
      pattern += `<line x1="0" y1="${f(y)}" x2="100" y2="${f(y)}" stroke="${pat}" stroke-width="${sw}"/>`;
    }
  } else {
    // spotlight — a corner glow + a soft counter-glow + a fine plus-mark grid.
    const corner = Math.floor(r() * 4);
    const cx = corner % 2 ? 0.85 : 0.15;
    const cy = corner < 2 ? 0.15 : 0.85;
    add(cx, cy, 0.95, c1, 0.95);
    add(1 - cx, 1 - cy, 0.55, c2, 0.5);
    const g = grid(14);
    for (let gy = 0; gy < g.n; gy++) {
      for (let gx = 0; gx < g.n; gx++) {
        const px = g.start + gx * 14;
        const py = g.start + gy * 14;
        pattern += `<line x1="${f(px - 1.6)}" y1="${f(py)}" x2="${f(px + 1.6)}" y2="${f(py)}" stroke="${pat}" stroke-width="${sw}"/><line x1="${f(px)}" y1="${f(py - 1.6)}" x2="${f(px)}" y2="${f(py + 1.6)}" stroke="${pat}" stroke-width="${sw}"/>`;
      }
    }
  }

  // Orbs (mesh blurred hard into a wash); then the faint pattern on top.
  if (motif === "mesh") {
    defs.push(
      `<filter id="${uid}bl" x="-25%" y="-25%" width="150%" height="150%"><feGaussianBlur stdDeviation="8"/></filter>`,
    );
    uses.push(`<g filter="url(#${uid}bl)">${orbUses.join("")}</g>`);
  } else {
    uses.push(orbUses.join(""));
  }
  uses.push(`<g opacity="0.5">${pattern}</g>`);

  // Faint grain — greyscale fractal noise, overlay-blended (matches the app's
  // grain layer).
  defs.push(
    `<filter id="${uid}g" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter>`,
  );
  uses.push(
    `<rect width="100" height="100" filter="url(#${uid}g)" opacity="0.12" style="mix-blend-mode:overlay"/>`,
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%" preserveAspectRatio="xMidYMid slice"><defs>${defs.join(
    "",
  )}</defs>${uses.join("")}</svg>`;
}

/** Data-URI of the seed's generated cover, for use anywhere an image SOURCE is
 *  expected (not just the inline component) — e.g. feeding the ambient
 *  CoverBackdrop, where a heavy blur dissolves the motif into a soft field of
 *  the seed's colours. */
export function coverSeedDataUri(seed: number, mode: ThemeMode): string {
  return `data:image/svg+xml,${encodeURIComponent(buildSvg(seed, mode))}`;
}

export function GeneratedCover(props: { seed: number; class?: string }) {
  const mode = useResolvedMode();
  const svg = createMemo(() => buildSvg(props.seed, mode()));
  return (
    <div
      class={props.class}
      aria-hidden
      // eslint-disable-next-line solid/no-innerhtml
      innerHTML={svg()}
    />
  );
}

/** Pin marker for a cover's top-left corner — an accent tab with a filled pin.
 *  The at-rest "this is pinned" indicator (the row's pin icon is hover-only). */
export function PinBadge() {
  return (
    <div
      aria-hidden
      class="pointer-events-none absolute left-0 top-0 flex size-5 items-center justify-center bg-accent text-accent-on shadow-resting"
    >
      <Pin class="size-3" strokeWidth={2} fill="currentColor" />
    </div>
  );
}

/**
 * A list's cover: the owner-uploaded custom image if present, else the
 * generated cover from the seed. `class` sizes the box (e.g.
 * `aspect-square w-full overflow-hidden`); the image/pattern fills it, so
 * swapping a custom cover in/out doesn't shift layout. `pinned` overlays a
 * PinBadge in the corner.
 */
export function ListCover(props: {
  coverUrl: string | null;
  seed: number;
  class?: string;
  alt?: string;
  pinned?: boolean;
}) {
  return (
    <div class={`relative ${props.class ?? ""}`}>
      <Show
        when={props.coverUrl}
        fallback={<GeneratedCover seed={props.seed} class="size-full" />}
      >
        {(url) => (
          <img
            ref={fadeOnLoad}
            src={url()}
            alt={props.alt ?? ""}
            loading="lazy"
            class="size-full object-cover"
          />
        )}
      </Show>
      <Show when={props.pinned}>
        <PinBadge />
      </Show>
    </div>
  );
}
