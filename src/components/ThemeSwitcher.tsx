import { createSignal, onMount, For } from "solid-js";
import {
  THEMES,
  type ThemeId,
  type ThemeModePref,
  applyTheme,
  readTheme,
  readModePref,
} from "@/lib/themes";

/**
 * The shared theme + mode picker. Used in the Profile page and demoed in the
 * Styleguide. Persists via applyTheme() (writes localStorage + the no-FOUC
 * script reads it on the next page load).
 *
 * Theme grid: 4-column responsive grid of swatch buttons; the swatch shows
 * the theme's light-mode bg + accent so the user gets a glance at the palette.
 * Mode toggle: 3-way segment control (Hell / Dunkel / System). "System"
 * tracks the OS color-scheme media query.
 */
export function ThemeSwitcher() {
  const [theme, setTheme] = createSignal<ThemeId>("default");
  const [mode, setMode] = createSignal<ThemeModePref>("system");

  onMount(() => {
    setTheme(readTheme());
    setMode(readModePref());
  });

  const pickTheme = (id: ThemeId) => {
    setTheme(id);
    applyTheme(id, mode());
  };
  const pickMode = (m: ThemeModePref) => {
    setMode(m);
    applyTheme(theme(), m);
  };

  return (
    <div class="space-y-6">
      <div>
        <p class="mb-3 font-mono text-mini uppercase tracking-wider text-text-muted">
          Theme
        </p>
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <For each={THEMES}>
            {(t) => (
              <button
                type="button"
                onClick={() => pickTheme(t.id)}
                aria-pressed={theme() === t.id}
                class="flex items-center gap-2 rounded-sm border border-border px-2 py-2 text-left transition-colors hover:bg-surface aria-pressed:border-accent"
              >
                <span class="flex h-5 w-5 shrink-0 overflow-hidden rounded-xs border border-border">
                  <span
                    class="block h-full w-1/2"
                    style={{ background: t.swatch.light.bg }}
                  />
                  <span
                    class="block h-full w-1/2"
                    style={{ background: t.swatch.light.accent }}
                  />
                </span>
                <span class="truncate text-mini font-medium">{t.name}</span>
              </button>
            )}
          </For>
        </div>
      </div>

      <div>
        <p class="mb-3 font-mono text-mini uppercase tracking-wider text-text-muted">
          Modus
        </p>
        <div class="inline-flex rounded-sm border border-border p-0.5">
          <For each={["light", "dark", "system"] as ThemeModePref[]}>
            {(m) => (
              <button
                type="button"
                onClick={() => pickMode(m)}
                aria-pressed={mode() === m}
                class="rounded-xs px-3 py-1.5 font-mono text-mini uppercase tracking-wider text-text-muted transition-colors aria-pressed:bg-text aria-pressed:text-bg"
              >
                {m === "light"
                  ? "Hell"
                  : m === "dark"
                    ? "Dunkel"
                    : "System"}
              </button>
            )}
          </For>
        </div>
      </div>
    </div>
  );
}
