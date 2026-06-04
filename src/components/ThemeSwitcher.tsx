import { createSignal, onMount, For } from "solid-js";
import {
  THEMES,
  type ThemeId,
  type ThemeModePref,
  applyTheme,
  readTheme,
  readModePref,
} from "@/lib/themes";
import { Segmented } from "@/components/Segmented";

/**
 * The shared theme + mode picker. Used in the Profile page and demoed in the
 * Styleguide. Persists via applyTheme() (writes localStorage + the no-FOUC
 * script reads it on the next page load).
 *
 * Theme grid: 3-column responsive grid of swatch buttons (2 on narrow phones);
 * 3-up keeps the theme name from truncating and lays the 9 themes out as a
 * clean 3×3. The swatch shows the theme's light-mode bg + accent so the user
 * gets a glance at the palette.
 * Mode toggle: 3-way segment control (Hell / Dunkel / System). "System"
 * tracks the OS color-scheme media query.
 */
export function ThemeSwitcher(props: {
  /** Stretch the mode toggle to the full section width (Hell/Dunkel/System
   *  share the space equally). Used by the first-login Setup; the Profile +
   *  Styleguide keep the default content-width pill. */
  fillMode?: boolean;
} = {}) {
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
          Modus
        </p>
        <Segmented<ThemeModePref>
          ariaLabel="Modus"
          fill={props.fillMode}
          value={mode()}
          onChange={pickMode}
          options={[
            { value: "light", label: "Hell" },
            { value: "dark", label: "Dunkel" },
            { value: "system", label: "System" },
          ]}
        />
      </div>

      <div>
        <p class="mb-3 font-mono text-mini uppercase tracking-wider text-text-muted">
          Theme
        </p>
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
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
    </div>
  );
}
