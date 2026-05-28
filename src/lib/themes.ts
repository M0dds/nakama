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
  | "budapest"
  | "totoro"
  | "medieval"
  | "biotech"
  | "maritime";

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
    id: "budapest",
    name: "Budapest",
    description: "Grand Budapest Hotel — Mendl-Pink + Burgundy",
    primaryMode: "light",
    swatch: {
      light: { bg: "#efc5cc", accent: "#8b2941" },
      dark: { bg: "#2a141a", accent: "#f0a8b4" },
    },
  },
  {
    id: "totoro",
    name: "Totoro",
    description: "Ghibli — warmes Cream mit Waldgrün",
    primaryMode: "light",
    swatch: {
      light: { bg: "#d8d1b3", accent: "#6b8a5a" },
      dark: { bg: "#1d2620", accent: "#8da776" },
    },
  },
  {
    id: "medieval",
    name: "Medieval",
    description: "Pergament + Wachs-Siegel-Burgundy + Manuskript-Gold",
    primaryMode: "light",
    swatch: {
      light: { bg: "#d8c7a8", accent: "#7a1f2e" },
      dark: { bg: "#1f1812", accent: "#c44a5e" },
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

/**
 * Apply a theme + mode preference to <html>. Persists to localStorage so the
 * choice survives reloads (the no-FOUC script in index.html re-reads it before
 * Solid mounts). Pass mode='system' to track the OS.
 */
export function applyTheme(id: ThemeId, modePref: ThemeModePref): void {
  const root = document.documentElement;
  root.setAttribute("data-theme", id);
  localStorage.setItem(STORAGE_KEY_THEME, id);
  localStorage.setItem(STORAGE_KEY_MODE, modePref);

  const resolved =
    modePref === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : modePref;

  root.classList.toggle("dark", resolved === "dark");
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
