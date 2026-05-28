import { lazy } from "solid-js";
import type { RouteDefinition } from "@solidjs/router";

/**
 * Programmatic route map. Solid Router doesn't ship file-based routing
 * out of the box — we declare routes here once and feed them into <Router>
 * in src/index.tsx. Lazy() splits each route into its own chunk so the
 * initial bundle stays slim.
 *
 * Add a new route:
 *   1. Create src/routes/<Name>.tsx (default export the page component)
 *   2. Add a `{ path, component: lazy(...) }` entry below
 */
export const routes: RouteDefinition[] = [
  {
    path: "/",
    component: lazy(() => import("./Home")),
  },
  {
    path: "/login",
    component: lazy(() => import("./Login")),
  },
  {
    path: "/styleguide",
    component: lazy(() => import("./Styleguide")),
  },
  {
    path: "*",
    component: lazy(() => import("./NotFound")),
  },
];
