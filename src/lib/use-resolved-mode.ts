import { createSignal, onCleanup, onMount } from "solid-js";
import type { ThemeMode } from "@/lib/themes";

/**
 * Reactive accessor for the mode currently applied to <html> (the `.dark`
 * class that `applyTheme` toggles). Watches the class attribute for switches
 * AND the OS preference (for mode='system').
 *
 * Most of the app reacts to mode purely via Tailwind `dark:` utilities — no JS
 * needed. This exists for the rare case that needs the resolved mode in JS:
 * `GeneratedCover` colours a FIXED (seed-picked) theme's palette, so it can't
 * lean on the active theme's CSS vars and must pick light/dark itself.
 */
export function useResolvedMode(): () => ThemeMode {
  const read = (): ThemeMode =>
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark")
      ? "dark"
      : "light";

  const [mode, setMode] = createSignal<ThemeMode>(read());

  onMount(() => {
    const update = () => setMode(read());
    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", update);
    onCleanup(() => {
      obs.disconnect();
      mq.removeEventListener("change", update);
    });
  });

  return mode;
}
