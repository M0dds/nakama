import { createMemo, Show } from "solid-js";
import { Pin } from "lucide-solid";
import { THEMES, getThemeMeta, type ThemeId, type ThemeMode } from "@/lib/themes";
import { useResolvedMode } from "@/lib/use-resolved-mode";
import { fadeOnLoad } from "@/lib/image-fade";

/**
 * GeneratedCover — the default list cover when no custom image is uploaded.
 *
 * A list stores only a `cover_seed` (a random integer assigned at creation).
 * From the seed we deterministically derive a theme (random across the 8), a
 * Japanese-geometric pattern, and a scale. The cover is rendered as an inline
 * SVG coloured from that theme's palette — NOT stored as an image. Benefits:
 * zero storage, always crisp, and it re-colours with light/dark automatically
 * (we resolve the active mode and read swatch[mode]).
 *
 * Patterns are two-tone (field = bg, motif = accent), drawn from the theme
 * registry so a new theme works for free.
 */

const PATTERNS = ["seigaiha", "shippo"] as const;
type Pattern = (typeof PATTERNS)[number];

export interface CoverSpec {
  themeId: ThemeId;
  pattern: Pattern;
  /** 0 = large motif, 2 = fine motif. */
  sizeStep: number;
}

/** Deterministic seed → cover recipe. Stable across reloads + devices. */
export function coverSpecFromSeed(seed: number): CoverSpec {
  const s = Math.abs(Math.trunc(seed)) || 0;
  const theme = THEMES[s % THEMES.length];
  const pattern = PATTERNS[Math.floor(s / THEMES.length) % PATTERNS.length];
  const sizeStep = Math.floor(s / (THEMES.length * PATTERNS.length)) % 3;
  return { themeId: theme.id, pattern, sizeStep };
}

const f = (n: number) => n.toFixed(2);

// ── Contrast control ──────────────────────────────────────────────────────
// Covers read calmer when field + motif stay in one tonal family. We mute the
// motif toward the bg and tint the field slightly toward the accent, instead
// of pure accent-on-bg. Both knobs are 0..1; bump them to soften further.
const MOTIF_MUTE = 0.6; // motif = accent blended this far toward bg
const FIELD_TINT = 0.05; // field = bg blended this far toward accent

function hx(c: number): string {
  return Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0");
}
/** Linear blend a→b by t (0..1). Both must be #rrggbb. */
function mix(a: string, b: string, t: number): string {
  const ar = parseInt(a.slice(1, 3), 16);
  const ag = parseInt(a.slice(3, 5), 16);
  const ab = parseInt(a.slice(5, 7), 16);
  const br = parseInt(b.slice(1, 3), 16);
  const bg = parseInt(b.slice(3, 5), 16);
  const bb = parseInt(b.slice(5, 7), 16);
  return `#${hx(ar + (br - ar) * t)}${hx(ag + (bg - ag) * t)}${hx(ab + (bb - ab) * t)}`;
}

/** Seigaiha (青海波) — overlapping fan/wave scales. Concentric filled circles
 *  on an offset grid, drawn top→bottom so lower rows occlude upper ones into
 *  fish-scale arcs. */
function seigaihaSvg(bg: string, fg: string, sizeStep: number): string {
  const D = [36, 27, 21][sizeStep]; // scale diameter
  const r = D / 2;
  const rings = [1, 0.7, 0.44, 0.2]; // radius fractions, alternating fg/bg
  const rowH = r * 0.6;
  let els = `<rect width="100" height="100" fill="${bg}"/>`;
  let row = 0;
  for (let y = 0; y <= 100 + r; y += rowH, row++) {
    const off = row % 2 ? r : 0;
    for (let x = -r + off; x <= 100 + r; x += D) {
      rings.forEach((frac, i) => {
        els += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r * frac)}" fill="${
          i % 2 ? bg : fg
        }"/>`;
      });
    }
  }
  return els;
}

/** Shippō (七宝, "seven treasures") — equal circles whose centres sit a radius
 *  apart, so each passes through its neighbours' centres, forming a petal
 *  lattice. Stroked, not filled. */
function shippoSvg(bg: string, fg: string, sizeStep: number): string {
  const R = [17, 13, 10][sizeStep];
  const sw = [1.4, 1.1, 0.9][sizeStep];
  let els = `<rect width="100" height="100" fill="${bg}"/>`;
  els += `<g fill="none" stroke="${fg}" stroke-width="${sw}">`;
  for (let y = -R; y <= 100 + R; y += R) {
    for (let x = -R; x <= 100 + R; x += R) {
      els += `<circle cx="${f(x)}" cy="${f(y)}" r="${R}"/>`;
    }
  }
  els += `</g>`;
  return els;
}

function buildSvg(seed: number, mode: ThemeMode): string {
  const spec = coverSpecFromSeed(seed);
  const { bg, accent } = getThemeMeta(spec.themeId).swatch[mode];
  const field = mix(bg, accent, FIELD_TINT); // bg, faintly accent-tinted
  const motif = mix(accent, bg, MOTIF_MUTE); // accent, muted toward bg
  const inner =
    spec.pattern === "seigaiha"
      ? seigaihaSvg(field, motif, spec.sizeStep)
      : shippoSvg(field, motif, spec.sizeStep);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%" preserveAspectRatio="xMidYMid slice">${inner}</svg>`;
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
 * generated themed cover from the seed. `class` sizes the box (e.g.
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
