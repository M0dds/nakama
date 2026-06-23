import { highResCover } from "@/lib/anilist";
import { steamHiResCover } from "@/lib/steam";

/** Render-time cover sharpening, one source of truth for every surface.
 *  Routes a stored cover URL through both source-specific upgraders —
 *  AniList `/cover/medium/` → `/cover/large/` and Steam `/header.jpg` →
 *  capsule. Each is a no-op on URLs that don't match its pattern, so the
 *  chain is safe regardless of the item's source — no type branching needed.
 *  Returns null only when the input is null. */
export function coverFor(url: string | null): string | null {
  return steamHiResCover(highResCover(url));
}
