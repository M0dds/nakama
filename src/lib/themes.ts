/**
 * Nakama Theme Registry
 *
 * Single source of truth for which themes exist + what they look like.
 * Hex values mirror the palette blocks in src/index.css.
 *
 * Adding a theme:
 *   1. Add a [data-theme="..."] block to src/index.css (light + dark)
 *   2. Add an entry below
 *   3. The Settings picker reads from THEMES to render options
 */

export type ThemeId =
  | "default"
  | "teenaged"
  | "sakura"
  | "totoro"
  | "biotech"
  | "maritime"
  | "onsen"
  | "vesper"
  | "pond";

/** The resolved mode actually applied to <html> (.dark or not). */
export type ThemeMode = "light" | "dark";

/** The user's mode *preference*. "system" follows the OS color scheme and is
 *  resolved to a ThemeMode at apply-time. */
export type ThemeModePref = ThemeMode | "system";

export interface ThemeMeta {
  id: ThemeId;
  name: string;
  description: string;
  /** Which mode the theme was designed around — used to pick a sensible
   *  default mode when the user picks this theme. */
  primaryMode: ThemeMode;
  swatch: {
    light: { bg: string; accent: string };
    dark: { bg: string; accent: string };
  };
}

export const THEMES: ThemeMeta[] = [
  {
    id: "default",
    name: "Standard",
    description: "Japanisch minimalistisch — warm bone, off-black, Vermillion-Rot",
    primaryMode: "light",
    swatch: {
      light: { bg: "#f7f6f3", accent: "#dc2626" },
      dark: { bg: "#0c0c0c", accent: "#ef4444" },
    },
  },
  {
    id: "teenaged",
    name: "Teenaged",
    description: "Teenage Engineering — cool grey, knalliges Orange",
    primaryMode: "light",
    swatch: {
      light: { bg: "#e0d9d9", accent: "#fa480f" },
      dark: { bg: "#171518", accent: "#fa480f" },
    },
  },
  {
    id: "sakura",
    name: "Sakura",
    description: "Japanische Kirschblüte, weiches Rosé",
    primaryMode: "light",
    swatch: {
      light: { bg: "#f0d5dd", accent: "#e85d8f" },
      dark: { bg: "#15090e", accent: "#f582ad" },
    },
  },
  {
    // id stays "totoro" (the persisted localStorage value + the index.css
    // [data-theme] selector) so renaming the label doesn't reset anyone who
    // already picked it; only the display name changed (was "Totoro" — the
    // Ghibli forest-green is gone, it's a warm cream + mango now).
    id: "totoro",
    name: "Komorebi",
    description: "Sonnenlicht durch Blätter — warmes Cream mit reifer Mango",
    primaryMode: "light",
    swatch: {
      light: { bg: "#d8d1b3", accent: "#d07c1a" },
      dark: { bg: "#1d2620", accent: "#f0b53e" },
    },
  },
  {
    id: "biotech",
    name: "BioTech",
    description: "Lab-clean Hellgrau mit Terminal-Grün",
    primaryMode: "light",
    swatch: {
      light: { bg: "#e0e6e1", accent: "#00b87a" },
      dark: { bg: "#0a1410", accent: "#00ff9e" },
    },
  },
  {
    id: "maritime",
    name: "Maritime",
    description: "Tiefes Navy mit Messing",
    primaryMode: "dark",
    swatch: {
      light: { bg: "#c8d0dc", accent: "#a8842f" },
      dark: { bg: "#081320", accent: "#c9a567" },
    },
  },
  {
    id: "onsen",
    name: "Onsen",
    description: "Mineralisches Teal-Wasser mit warmer Koralle — komplementär",
    primaryMode: "light",
    swatch: {
      light: { bg: "#d9e6e3", accent: "#f5644a" },
      dark: { bg: "#07211e", accent: "#ff7559" },
    },
  },
  {
    id: "vesper",
    name: "Vesper",
    description: "Dämmerungs-Violett mit glühendem Amber — komplementär",
    primaryMode: "dark",
    swatch: {
      light: { bg: "#e3dcea", accent: "#cf7a1d" },
      dark: { bg: "#15102a", accent: "#f0a52e" },
    },
  },
  {
    id: "pond",
    name: "Teich",
    description: "Stiller Teich — Wasserblau mit Seerosen-Grün",
    primaryMode: "light",
    swatch: {
      light: { bg: "#d7e6ea", accent: "#1c8f5e" },
      dark: { bg: "#0a2025", accent: "#46cf8c" },
    },
  },
];

export const DEFAULT_THEME: ThemeId = "default";
export const DEFAULT_MODE: ThemeMode = "light";
/** Default when nothing is stored — follow the OS. */
export const DEFAULT_MODE_PREF: ThemeModePref = "system";

export const STORAGE_KEY_THEME = "nakama:theme";
export const STORAGE_KEY_MODE = "nakama:mode";

export function getThemeMeta(id: ThemeId): ThemeMeta {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

/** Resolve a mode *preference* to the concrete mode applied to <html>. */
function resolveMode(pref: ThemeModePref): ThemeMode {
  if (pref === "system") {
    return typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return pref;
}

/**
 * Favicon — the Nakama brand mark is a simple filled circle. A static file
 * can't track the active theme (SVG favicons don't read page CSS), so we
 * repaint the <link rel="icon"> with the resolved accent: once on mount and
 * after every applyTheme. The colour comes straight from the THEMES registry
 * (not getComputedStyle) so it's exact and immune to the crossfade window.
 */
function paintFavicon(accent: string): void {
  if (typeof document === "undefined") return;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
    `<circle cx="16" cy="16" r="13" fill="${accent}"/></svg>`;
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.type = "image/svg+xml";
  link.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * Browser/PWA chrome colour — the iOS standalone status bar + Android address
 * bar read <meta name="theme-color">. The manifest ships a static theme_color
 * that can't track the live theme, which left every non-default theme with a
 * mismatched (red) bar. We override the meta at runtime with the resolved
 * background so the chrome blends into the app surface. Same lifecycle as the
 * favicon: once on mount + after every applyTheme. Colour from the THEMES
 * registry (not getComputedStyle) so it's exact and immune to the crossfade.
 */
function paintThemeColor(bg: string): void {
  if (typeof document === "undefined") return;
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = bg;
}

/** Repaint the favicon + PWA theme-color from the currently persisted theme +
 *  mode. Call once on mount — applyTheme handles every later switch. */
export function syncFavicon(): void {
  const sw = getThemeMeta(readTheme()).swatch[resolveMode(readModePref())];
  paintFavicon(sw.accent);
  paintThemeColor(sw.bg);
}

/**
 * Apply a theme + mode preference to <html>. Persists to localStorage so the
 * choice survives reloads (the no-FOUC script in index.html re-reads it before
 * Solid mounts). Pass mode='system' to track the OS.
 */
let themeTransitionTimer: ReturnType<typeof setTimeout> | undefined;

export function applyTheme(id: ThemeId, modePref: ThemeModePref): void {
  const root = document.documentElement;

  // Crossfade the palette swap instead of hard-cutting. Attach a transition to
  // all colour-bearing properties for the switch window only (see the
  // `html.theme-transition` rule in index.css), then strip it so hover/
  // interaction transitions stay snappy. Skipped under reduced motion. Only
  // user actions call applyTheme (never the initial mount), so every call is a
  // deliberate switch worth animating.
  const crossfade =
    typeof window !== "undefined" &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (crossfade) {
    root.classList.add("theme-transition");
    // Force the transition rule to take effect BEFORE the colours change, so
    // the swap animates from the current palette instead of snapping.
    void root.offsetHeight;
    if (themeTransitionTimer) clearTimeout(themeTransitionTimer);
    themeTransitionTimer = setTimeout(() => {
      root.classList.remove("theme-transition");
      themeTransitionTimer = undefined;
    }, 300);
  }

  root.setAttribute("data-theme", id);
  localStorage.setItem(STORAGE_KEY_THEME, id);
  localStorage.setItem(STORAGE_KEY_MODE, modePref);

  const resolved = resolveMode(modePref);
  root.classList.toggle("dark", resolved === "dark");
  const sw = getThemeMeta(id).swatch[resolved];
  paintFavicon(sw.accent);
  paintThemeColor(sw.bg);
}

/** Read the current persisted theme (falls back to default). */
export function readTheme(): ThemeId {
  if (typeof window === "undefined") return DEFAULT_THEME;
  const stored = localStorage.getItem(STORAGE_KEY_THEME);
  if (!stored) return DEFAULT_THEME;
  return (THEMES.find((t) => t.id === stored)?.id as ThemeId) ?? DEFAULT_THEME;
}

/** Read the current persisted mode preference (falls back to 'system'). */
export function readModePref(): ThemeModePref {
  if (typeof window === "undefined") return DEFAULT_MODE_PREF;
  const stored = localStorage.getItem(STORAGE_KEY_MODE);
  if (stored === "light" || stored === "dark" || stored === "system") {
    return stored;
  }
  return DEFAULT_MODE_PREF;
}
