import { createSignal, createEffect, on } from "solid-js";
import { useLocation, useNavigate } from "@solidjs/router";

type Navigate = ReturnType<typeof useNavigate>;

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
// A back-action fallback redirect changes the pathname too, but it must NOT
// count — otherwise it would flip canGoBack() true, and the NEXT back would
// history.back() into the entry we just left (bouncing item↔list, then out of
// the app). goBack() sets this before its fallback navigate; the effect skips
// exactly one tick.
let suppressNextCount = false;

/** True once the user has navigated at least once WITHIN the app this session
 *  → `history.back()` is guaranteed to land on an in-app page. False on a fresh
 *  load / deep-link, where back() would leave the app → use a fallback href. */
export const canGoBack = () => appNavCount() > 0;

/**
 * Context-aware back. With real in-app history, return to the actual origin via
 * `history.back()`. Otherwise (deep-link / fresh load) REPLACE-navigate to the
 * fallback href: replace keeps history tidy (no bouncy synthetic entries) and
 * `suppressNextCount` stops the redirect from flipping `canGoBack()`, so a
 * second back keeps following the route fallback chain (item → list → /lists)
 * instead of walking the browser history back out of the app.
 */
export function goBack(navigate: Navigate, fallbackHref?: string) {
  if (canGoBack()) {
    window.history.back();
    return;
  }
  if (fallbackHref) {
    suppressNextCount = true;
    navigate(fallbackHref, { replace: true });
  }
}

/** Mount once at the app root (inside the Router, e.g. App.tsx). Counts every
 *  in-app pathname change; `defer: true` skips the first run (arrival), and a
 *  back-action fallback redirect is skipped via suppressNextCount. */
export function useTrackNavigation() {
  const location = useLocation();
  createEffect(
    on(
      () => location.pathname,
      () => {
        if (suppressNextCount) {
          suppressNextCount = false;
          return;
        }
        setAppNavCount((c) => c + 1);
      },
      { defer: true },
    ),
  );
}
