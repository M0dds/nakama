/* @refresh reload */
import { render } from "solid-js/web";
import { Router } from "@solidjs/router";
import { QueryClientProvider } from "@tanstack/solid-query";
import App from "./App";
import { routes } from "./routes";
import { queryClient } from "./lib/query-client";
import { AuthProvider } from "./lib/auth";
import { syncFavicon } from "./lib/themes";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root element not found");

// Paint the favicon to the active theme's accent (the no-FOUC script in
// index.html has already set data-theme + the dark class before this runs).
syncFavicon();

render(
  () => (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router root={App}>{routes}</Router>
      </AuthProvider>
    </QueryClientProvider>
  ),
  root,
);
