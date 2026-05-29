/**
 * Shared formatting helpers — display labels, date strings, PostgREST shape
 * utilities. One canonical implementation per concern; previously each
 * surface (Home, ItemDetail, ListDetail) shipped its own copy.
 *
 * Functions accept plain `string` for media types (rather than the
 * MediaType union from queries/home.ts) so this module stays a leaf in
 * the dep graph — consumers do their own type narrowing at the boundary.
 * Unknown types fall back to the raw value or null, defensively.
 */

// ──────────────────────────────────────────────────────────────────────
// Media types
// ──────────────────────────────────────────────────────────────────────

/** "Anime", "Manga", "Serie", "Film", "Spiel". Raw value for unknown. */
export function typeLabel(type: string): string {
  switch (type) {
    case "anime":
      return "Anime";
    case "manga":
      return "Manga";
    case "series":
      return "Serie";
    case "movie":
      return "Film";
    case "game":
      return "Spiel";
    default:
      return type;
  }
}

/** Single-letter initial for placeholder covers. */
export function typeInitial(type: string): string {
  switch (type) {
    case "anime":
      return "A";
    case "manga":
      return "M";
    case "series":
      return "S";
    case "movie":
      return "F";
    case "game":
      return "G";
    default:
      return "?";
  }
}

/** "Neue Folge" / "Neues Kapitel" — null for non-episodic types. Used by
 *  the /lists badge + Fortsetzen badge + Home upcoming module so the
 *  wording stays consistent. */
export function newReleaseLabel(type: string): string | null {
  if (type === "manga") return "Neues Kapitel";
  if (type === "anime" || type === "series") return "Neue Folge";
  return null;
}

/** Zero-padded episode shorthand: "E07". Type-agnostic — for the manga
 *  flavor use nextLabel(). */
export function episodeCode(n: number): string {
  return `E${String(n).padStart(2, "0")}`;
}

/** Type-aware "next-up" label: "E07" for episode types, "Kap. 7" for manga. */
export function nextLabel(type: string, n: number): string {
  return type === "manga" ? `Kap. ${n}` : episodeCode(n);
}

/** Single value or range, type-aware. "E07" / "E37–E1163" / "Kap. 9–40". */
export function rangeLabel(type: string, min: number, max: number): string {
  if (min === max) return nextLabel(type, min);
  if (type === "manga") return `Kap. ${min}–${max}`;
  return `E${String(min).padStart(2, "0")}–E${String(max).padStart(2, "0")}`;
}

// ──────────────────────────────────────────────────────────────────────
// Dates
// ──────────────────────────────────────────────────────────────────────

/** Fixed-width 3-letter month abbreviations. de-DE's built-in
 *  `month: "short"` returns mixed-length names — "Sept.", "März", "Juni",
 *  "Juli" all break the 3-letter rhythm — so we ship our own table. */
export const MONTH_ABBR_3 = [
  "Jan", "Feb", "Mär", "Apr", "Mai", "Jun",
  "Jul", "Aug", "Sep", "Okt", "Nov", "Dez",
] as const;

/** "27. Mai" — fixed-width date column. Zero-padded day + MONTH_ABBR_3
 *  keep every label the same character width. */
export function dateLabel(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}. ${MONTH_ABBR_3[d.getMonth()]}`;
}

/** "DI · 02.06." — weekday + numeric date. Mono mini-caps in the UI. */
export function formatDate(d: Date): string {
  const wd = d
    .toLocaleDateString("de-DE", { weekday: "short" })
    .replace(".", "")
    .toUpperCase();
  const dm = d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
  });
  return `${wd} · ${dm}`;
}

/** Calendar-day offset (0 = today, 1 = tomorrow). Uses local midnight on
 *  both ends, so an 8am-airing today stays "today" all day regardless of
 *  the current clock time. */
export function dayOffset(iso: string): number {
  const d = new Date(iso);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((dDay.getTime() - startToday.getTime()) / 86_400_000);
}

/** German relative time for a past timestamp. "gerade eben", "vor 12 Min.",
 *  "vor 3 Std.", "gestern", "vor 4 Tagen", then back to dd.mm. */
export function relTime(iso: string): string {
  const now = new Date();
  const diffMin = Math.round((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (diffMin < 1) return "gerade eben";
  if (diffMin < 60) return `vor ${diffMin} Min.`;
  const diffHrs = Math.round(diffMin / 60);
  if (diffHrs < 24) return `vor ${diffHrs} Std.`;
  const d = new Date(iso);
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((startToday.getTime() - dDay.getTime()) / 86_400_000);
  if (days === 1) return "gestern";
  if (days >= 2 && days <= 6) return `vor ${days} Tagen`;
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

// ──────────────────────────────────────────────────────────────────────
// PostgREST shape helpers
// ──────────────────────────────────────────────────────────────────────

/** Unwrap PostgREST's `<embed>(count)` shape — `[{ count: N }] | null` — to
 *  a plain number, with 0 as the empty default. */
export function embedCount(
  embed: { count: number }[] | null | undefined,
): number {
  return embed?.[0]?.count ?? 0;
}

/** De-duplicate an array — `[...new Set(arr)]` with a name. */
export function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}
