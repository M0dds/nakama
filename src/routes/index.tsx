import { lazy } from "solid-js";
import type { RouteDefinition, RouteSectionProps } from "@solidjs/router";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppShell } from "@/components/AppShell";

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

/** Long-lived layout for the authed app. ProtectedRoute gates entry; AppShell
 *  provides the BottomNav + bottom spacing. `props.children` is the matched
 *  child route — only THAT subtree re-mounts on navigation. */
function AppLayout(props: RouteSectionProps) {
  return (
    <ProtectedRoute>
      <AppShell>{props.children}</AppShell>
    </ProtectedRoute>
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
        path: "/lists/:id",
        component: lazy(() => import("./ListDetail")),
      },
      {
        path: "/item/:id",
        component: lazy(() => import("./ItemDetail")),
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
