/**
 * Cover luminance sampling — feeds the mobile hero's adaptive header text
 * (CoverHero): grey-on-anything doesn't survive sitting on top of arbitrary
 * cover art, so the header flips its text tokens light/dark based on how
 * bright the cover's TOP band (the region under the glass header) actually
 * is.
 *
 * Same CORS constraint as the CoverBackdrop bake: needs clean pixels (prod
 * covers ride the same-origin media proxy / Supabase ACAO:*; SVG data URIs
 * are same-origin by nature). A tainted canvas (dev direct-provider loads)
 * returns null → caller keeps the theme's default tokens.
 */

const cache = new Map<string, number | null>();

/** Mean rec709 luminance (0..1) of the top ~40% of the image, or null when
 *  the pixels can't be read. Cached per URL (module-level, survives routes). */
export async function coverTopLuminance(url: string): Promise<number | null> {
  const hit = cache.get(url);
  if (hit !== undefined) return hit;
  let lum: number | null = null;
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.src = url;
    await img.decode();
    const W = 16;
    const H = 16;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (ctx) {
      ctx.drawImage(img, 0, 0, W, H);
      const rows = Math.max(1, Math.round(H * 0.4));
      const d = ctx.getImageData(0, 0, W, rows).data; // throws when tainted
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) {
        sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      }
      lum = sum / (d.length / 4) / 255;
    }
  } catch {
    lum = null;
  }
  cache.set(url, lum);
  return lum;
}

/** Luminance (0..1) of the current theme's page background — the other half
 *  of the header-contrast decision (the glass tint + top scrim mix bg INTO
 *  whatever sits behind the header, so the effective surface is a blend). */
export function themeBgLuminance(): number {
  const raw = getComputedStyle(document.body).backgroundColor;
  const m = raw.match(/(\d+(?:\.\d+)?)/g);
  if (!m || m.length < 3) return 0.5;
  const [r, g, b] = m.map(Number);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}
