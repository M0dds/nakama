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

/** "27. Mai 2025" — dateLabel with the year appended. For a release date shown
 *  on its own (the movie/game seen/played toggle row), where a bare "27. Mai"
 *  is ambiguous across years. Keeps the fixed-width 3-letter month. */
export function dateLabelYear(iso: string): string {
  return `${dateLabel(iso)} ${new Date(iso).getFullYear()}`;
}

/** "27. Mai 25" — dateLabel plus the 2-digit year. The episode list uses this
 *  so a finished anime's air dates aren't ambiguous across years (a bare
 *  "27. Mai" silently reads as the current year). Fixed-width: DD. Mmm YY. */
export function dateLabelShortYear(iso: string): string {
  return `${dateLabel(iso)} ${String(new Date(iso).getFullYear()).slice(-2)}`;
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

// App-wide rule: air dates are DATE-ONLY, no release clock times. AniList's
// precise airingAt is truncated to the local day at ingest (anilist.ts), TMDB
// and Steam never had times, and existing anime rows were normalized by
// migration 20260706120000. An episode counts as released from the DAY it
// airs (dayOffset <= 0 client-side; UTC-midnight <= now() server-side) —
// which keeps release checks aligned with the display-weekday snapping.
// The former timeLabel/hasAirTime/airDateHasClock helpers died with this.

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

/** Monday-first weekday picker options — label → Date.getDay() value
 *  (0=Sun..6=Sat), the convention stored in the display-weekday override. */
export const WEEKDAY_OPTIONS = [
  { label: "Mo", value: 1 },
  { label: "Di", value: 2 },
  { label: "Mi", value: 3 },
  { label: "Do", value: 4 },
  { label: "Fr", value: 5 },
  { label: "Sa", value: 6 },
  { label: "So", value: 0 },
] as const;

/** Snap an ISO timestamp FORWARD to the next occurrence of `weekday`
 *  (0=Sun..6=Sat, Date.getDay()) on or after its own day — the per-lane
 *  display-weekday override. `weekday == null` → unchanged. Shifts by 0–6 whole
 *  days. Day math is local, like dayOffset, so a German viewer's day is
 *  correct (the app's accepted convention). */
export function snapToWeekday(iso: string, weekday: number | null): string {
  if (weekday == null) return iso;
  const d = new Date(iso);
  const delta = (weekday - d.getDay() + 7) % 7;
  if (delta === 0) return iso;
  d.setDate(d.getDate() + delta);
  return d.toISOString();
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

/** "Mai 2026" with the fixed-width 3-letter month (reads "MAI 2026" once the
 *  caller uppercases it). Every month renders to the same character width, so a
 *  label sitting between prev/next chevrons doesn't shift when the month changes
 *  — the long formatMonth ("September 2026" vs "Mai 2026") made the next-arrow
 *  jump. */
export function formatMonthAbbr(d: Date): string {
  return `${MONTH_ABBR_3[d.getMonth()]} ${d.getFullYear()}`;
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
