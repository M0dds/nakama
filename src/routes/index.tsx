import { lazy, Show, type ParentProps } from "solid-js";
import {
  Navigate,
  useLocation,
  type RouteDefinition,
  type RouteSectionProps,
} from "@solidjs/router";
import { createQuery } from "@tanstack/solid-query";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { myProfileOptions } from "@/lib/queries/profile";

const SetupRoute = lazy(() => import("./Setup"));
const Landing = lazy(() => import("./Landing"));

/**
 * Programmatic route map. Solid Router doesn't ship file-based routing
 * out of the box — we declare routes here once and feed them into <Router>
 * in src/index.tsx. lazy() splits each route into its own chunk so the
 * initial bundle stays slim.
 *
 * The four authed surfaces (Home / Lists / ListDetail / Profile) share a
 * single layout parent — AppLayout — so the AppShell + BottomNav mount
 * ONCE on first protected-route entry and stay mounted across navigation
 * between them. Without this nesting the shell tears down on every route
 * change, which (a) flashes the nav off-screen on first visit and (b) wipes
 * the indicator's `prevRest` so the stretch-and-contract animation never
 * has an "old position" to stretch from — explains the previous session's
 * "nav animation never runs" puzzle.
 *
 * Public surfaces — /login, /auth/callback, /styleguide — sit outside the
 * shell (no nav).
 */

/** Routes a not-yet-onboarded user to /setup before any app surface renders.
 *  Sits inside ProtectedRoute (so auth.user() is guaranteed) and outside the
 *  shell. While the profile loads, render nothing (quick; no skeleton). A null
 *  profile (lookup failed) falls through to the app rather than trapping the
 *  user in a redirect. /setup itself lives outside this gate, so no loop. */
function OnboardingGate(props: ParentProps) {
  const auth = useAuth();
  const profile = createQuery(() => ({
    ...myProfileOptions(auth.user()!),
    enabled: !!auth.user(),
  }));
  return (
    <Show when={!profile.isLoading} fallback={null}>
      <Show
        when={!(profile.data && profile.data.onboardedAt === null)}
        fallback={<Navigate href="/setup" />}
      >
        {props.children}
      </Show>
    </Show>
  );
}

/** Long-lived layout for the authed app + the public landing at `/`.
 *
 *  Auth branches here instead of via ProtectedRoute so the root URL can serve
 *  BOTH faces without a separate /home or /app path:
 *    - signed in  → OnboardingGate + AppShell + the matched child (app)
 *    - signed out at `/` → the marketing Landing (standalone, no AppShell)
 *    - signed out elsewhere (deep link to /lists etc.) → /login
 *  The inner Show keys on location.pathname so it stays correct if a signed-out
 *  visitor deep-links a protected child. AppShell still mounts ONCE and persists
 *  across navigation for signed-in users. */
function AppLayout(props: RouteSectionProps) {
  const auth = useAuth();
  const location = useLocation();
  return (
    <Show when={!auth.loading()} fallback={null}>
      <Show
        when={auth.user()}
        fallback={
          <Show
            when={location.pathname === "/"}
            fallback={<Navigate href="/login" />}
          >
            <Landing />
          </Show>
        }
      >
        <OnboardingGate>
          <AppShell>{props.children}</AppShell>
        </OnboardingGate>
      </Show>
    </Show>
  );
}

export const routes: RouteDefinition[] = [
  // ─ Public surfaces ─────────────────────────────────────────
  {
    path: "/login",
    component: lazy(() => import("./Login")),
  },
  {
    // OAuth + magic-link callback. Supabase JS picks up the code from the
    // URL automatically (detectSessionInUrl); this route just waits for the
    // resulting session and routes onward.
    path: "/auth/callback",
    component: lazy(() => import("./AuthCallback")),
  },
  {
    path: "/styleguide",
    component: lazy(() => import("./Styleguide")),
  },
  {
    // Public feature/landing page — shareable, no auth, standalone (no shell).
    path: "/features",
    component: lazy(() => import("./Features")),
  },
  {
    // Datenschutz — public, standalone (no shell). Reachable both publicly
    // (Login/Features footer) and in-app (Profile "Über"). The Impressum
    // (./Imprint) is a deferred draft and intentionally NOT routed yet —
    // pending a ladungsfähige-Anschrift decision (see that file's header).
    path: "/privacy",
    component: lazy(() => import("./Privacy")),
  },
  {
    // First-login setup wizard — authed but OUTSIDE the AppLayout gate (so it
    // can't redirect-loop) and outside the shell (focal screen). Setup itself
    // redirects already-onboarded users back to /.
    path: "/setup",
    component: () => (
      <ProtectedRoute>
        <SetupRoute />
      </ProtectedRoute>
    ),
  },

  // ─ Protected app surfaces (share AppLayout so the shell persists) ─
  {
    path: "/",
    component: AppLayout,
    children: [
      {
        path: "/",
        component: lazy(() => import("./Home")),
      },
      {
        path: "/lists",
        component: lazy(() => import("./Lists")),
      },
      {
        // Natural-key route: `/lists/blue-ostrich-lover` instead of an
        // opaque UUID. lists.short_code is a unique adjektiv-adjektiv-noun
        // string generated by the DB trigger at insert time.
        path: "/lists/:shortCode",
        component: lazy(() => import("./ListDetail")),
      },
      {
        // Natural-key route: `/item/anime/one-piece` instead of an opaque
        // UUID. (type, slug) is unique in items (DB-enforced via the
        // items_set_slug_trigger + UNIQUE(type, slug) constraint).
        // Context-free GLOBAL progress — opened from Home / Calendar / search.
        path: "/item/:type/:slug",
        component: lazy(() => import("./ItemDetail")),
      },
      {
        // List-scoped item page (sync-instances model). Reload-stable: the
        // shortCode in the URL lets ItemDetail recover the list_item context,
        // so a synced INSTANCE survives a refresh. Shows the instance progress
        // when sync is on, else the global progress, plus the sync toggle.
        // Same ItemDetail component — it branches on params.shortCode.
        path: "/lists/:shortCode/item/:type/:slug",
        component: lazy(() => import("./ItemDetail")),
      },
      {
        path: "/calendar",
        component: lazy(() => import("./Calendar")),
      },
      {
        path: "/profile",
        component: lazy(() => import("./Profile")),
      },
    ],
  },

  // ─ Catch-all ───────────────────────────────────────────────
  {
    path: "*",
    component: lazy(() => import("./NotFound")),
  },
];
