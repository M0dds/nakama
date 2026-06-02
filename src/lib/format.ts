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

/** "Neue Folge(n)" / "Neue(s) Kapitel" — null for non-episodic types. Singular
 *  vs plural by `count` (> 1 → plural), no count number. Used by the Fortsetzen
 *  badge; the /lists + list-detail badges have their own count-aware copies. */
export function newReleaseLabel(type: string, count = 1): string | null {
  const plural = count > 1;
  if (type === "manga") return plural ? "Neue Kapitel" : "Neues Kapitel";
  if (type === "anime" || type === "series")
    return plural ? "Neue Folgen" : "Neue Folge";
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

/** Like nextLabel, but prefixes the season for multi-season works → "S2 · E03".
 *  Season 1 (anime, manga, single-season series) stays bare so the common case
 *  reads unchanged. */
export function seasonEpisodeLabel(
  type: string,
  season: number,
  n: number,
): string {
  const base = nextLabel(type, n);
  return season > 1 ? `S${season} · ${base}` : base;
}

/** Single value or range, type-aware. "E07" / "E37–E1163" / "Kap. 9–40". */
export function rangeLabel(type: string, min: number, max: number): string {
  if (min === max) return nextLabel(type, min);
  if (type === "manga") return `Kap. ${min}–${max}`;
  return `E${String(min).padStart(2, "0")}–E${String(max).padStart(2, "0")}`;
}

/** Like rangeLabel, but prefixes the season for multi-season works →
 *  "S2 · E03–E08". Season 1 (anime, manga, single-season series) stays bare so
 *  the common case reads unchanged — mirrors seasonEpisodeLabel. */
export function seasonRangeLabel(
  type: string,
  season: number,
  min: number,
  max: number,
): string {
  const base = rangeLabel(type, min, max);
  return season > 1 ? `S${season} · ${base}` : base;
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

/** "DI · 02. Jun" — weekday + day + 3-letter month (no trailing dot). Mono
 *  mini-caps in the UI, so it reads "DI · 02. JUN". Same day/month form as
 *  dateLabel, just with the weekday prefix. */
export function formatDate(d: Date): string {
  const wd = d
    .toLocaleDateString("de-DE", { weekday: "short" })
    .replace(".", "")
    .toUpperCase();
  return `${wd} · ${String(d.getDate()).padStart(2, "0")}. ${MONTH_ABBR_3[d.getMonth()]}`;
}

/** "17:00" — 24h local time-of-day. */
export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** True when the timestamp carries a real time-of-day (not local midnight).
 *  AniList stores a precise airingAt, so scheduled episodes are always true;
 *  the guard just keeps a stray date-only entry from rendering a bogus
 *  "00:00". */
export function hasAirTime(iso: string): boolean {
  const d = new Date(iso);
  return d.getHours() !== 0 || d.getMinutes() !== 0;
}

/** Whether this media type's air dates carry a real clock time. AniList anime
 *  store a precise airingAt (→ "Heute · 17:00" is meaningful). TMDB series
 *  air_dates are DATE-ONLY: we store the date as UTC-midnight, which a local
 *  +TZ then renders as a fabricated "02:00" — so we suppress the time for them
 *  and show the day alone. (Manga have no air dates at all.) Combine with
 *  hasAirTime: `hasAirTime(iso) && airDateHasClock(type)`. */
export function airDateHasClock(type: string): boolean {
  return type === "anime";
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
// Calendar grid math
// ──────────────────────────────────────────────────────────────────────
//
// Week starts Monday (de-DE convention). All math runs on LOCAL date parts
// so an episode that aired at 08:00 stays on its calendar day regardless of
// the viewer's timezone — same principle as dayOffset() above.

/** Monday-first weekday abbreviations, fixed two-letter. */
export const WEEKDAYS_MON = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const;

/** `Date` → "YYYY-MM-DD" from local parts (no UTC shift). The grid-bucket key. */
export function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** "YYYY-MM-DD" → local-midnight `Date`. Avoids `new Date(iso)`'s UTC parse,
 *  which would shift the day backwards in negative-offset zones. */
export function fromIsoDay(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** A new `Date` n days from d (n may be negative). */
export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** A new `Date` n months from d (n may be negative). */
export function addMonths(d: Date, n: number): Date {
  const r = new Date(d);
  r.setMonth(r.getMonth() + n);
  return r;
}

/** First day of d's month, at local midnight. */
export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** The Monday of the week containing d. Sunday (getDay 0) folds back six days. */
export function mondayOf(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = r.getDay(); // 0 = Sun … 6 = Sat
  r.setDate(r.getDate() + (dow === 0 ? -6 : 1 - dow));
  return r;
}

/** "Mai 2026" — long month + year, de-DE. */
export function formatMonth(d: Date): string {
  return d.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
}

/** "26.05. – 01.06." — Monday→Sunday of d's week, compact. */
export function formatWeekRange(d: Date): string {
  const mon = mondayOf(d);
  const sun = addDays(mon, 6);
  const fmt = (x: Date) =>
    x.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
  return `${fmt(mon)} – ${fmt(sun)}`;
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
