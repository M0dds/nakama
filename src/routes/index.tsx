import { lazy, type Component } from "solid-js";
import type { RouteDefinition } from "@solidjs/router";
import { ProtectedRoute } from "@/components/ProtectedRoute";

/**
 * Programmatic route map. Solid Router doesn't ship file-based routing
 * out of the box — we declare routes here once and feed them into <Router>
 * in src/index.tsx. lazy() splits each route into its own chunk so the
 * initial bundle stays slim.
 *
 * App routes (everything the user reaches after login) wrap their component
 * with <ProtectedRoute /> so unauth visits bounce to /login. Public surfaces
 * — /login, /auth/callback, /styleguide — skip the guard.
 */

/** Helper that takes a lazy-loaded page and wraps it in <ProtectedRoute>. */
function protect(Page: Component): Component {
  return () => (
    <ProtectedRoute>
      <Page />
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

  // ─ Protected app surfaces ──────────────────────────────────
  {
    path: "/",
    component: protect(lazy(() => import("./Home"))),
  },
  {
    path: "/profile",
    component: protect(lazy(() => import("./Profile"))),
  },

  // ─ Catch-all ───────────────────────────────────────────────
  {
    path: "*",
    component: lazy(() => import("./NotFound")),
  },
];
