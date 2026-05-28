/* @refresh reload */
import { render } from "solid-js/web";
import { Router } from "@solidjs/router";
import { QueryClientProvider } from "@tanstack/solid-query";
import App from "./App";
import { routes } from "./routes";
import { queryClient } from "./lib/query-client";
import { AuthProvider } from "./lib/auth";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root element not found");

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
