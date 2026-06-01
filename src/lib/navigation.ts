import { createSignal, createEffect, on } from "solid-js";
import { useLocation } from "@solidjs/router";

/**
 * In-app navigation tracker for the "back" affordances (PageHeader chevron,
 * BottomNav back-satellite). They want to return the user to where they
 * actually came from — but `history.back()` must only run when it's guaranteed
 * to land on an IN-APP page.
 *
 * The old `window.history.length > 1` heuristic failed for a deep-link reached
 * from an external site: length is > 1, but back() walks OUT of the app. So we
 * count real in-app navigations instead — `useTrackNavigation()` (mounted once
 * at the app root) increments on every pathname CHANGE, deferred so the initial
 * load / deep-link arrival itself isn't counted. After ≥1 in-app navigation,
 * back() is guaranteed to stay in the app; before that, fall back to an href.
 */
const [appNavCount, setAppNavCount] = createSignal(0);

/** True once the user has navigated at least once WITHIN the app this session
 *  → `history.back()` is guaranteed to land on an in-app page. False on a fresh
 *  load / deep-link, where back() would leave the app → use a fallback href. */
export const canGoBack = () => appNavCount() > 0;

/** Mount once at the app root (inside the Router, e.g. App.tsx). Counts every
 *  in-app pathname change; `defer: true` skips the first run (arrival). */
export function useTrackNavigation() {
  const location = useLocation();
  createEffect(
    on(
      () => location.pathname,
      () => setAppNavCount((c) => c + 1),
      { defer: true },
    ),
  );
}
