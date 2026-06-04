import { defineConfig } from "vite";
import path from "node:path";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

const require = createRequire(import.meta.url);
const pkg = require("./package.json") as { version: string };

// Build-time stamps inlined into the bundle (see src/env.d.ts for the globals
// + src/lib/version.ts for the consumer). Build date is the day we compile;
// the short git SHA is best-effort (empty on a shallow/no-git build, e.g. some
// CI checkouts — never let it fail the build).
const buildDate = new Date().toISOString().slice(0, 10);
let gitSha = "";
try {
  gitSha = execSync("git rev-parse --short HEAD").toString().trim();
} catch {
  gitSha = "";
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(buildDate),
    __GIT_SHA__: JSON.stringify(gitSha),
  },
  plugins: [
    solid(),
    tailwindcss(),
    VitePWA({
      // "prompt" (not autoUpdate): a new SW waits instead of silently taking
      // over, so the app can surface a quiet "Update verfügbar" badge and let
      // the user choose when to refresh. Registration + the update flow live in
      // src/lib/pwa-update.ts (registerSW + applyUpdate); injectRegister:false
      // because we register ourselves there.
      registerType: "prompt",
      injectRegister: false,
      workbox: {
        // Pull the Web-Push handlers (push / notificationclick) into the
        // generated SW — keeps generateSW (precaching) without an injectManifest
        // rewrite. self.importScripts("push-sw.js") resolves to /push-sw.js.
        importScripts: ["push-sw.js"],
        // Take control of open clients the moment the waiting SW activates (via
        // our SKIP_WAITING message in pwa-update.ts), so `controllerchange`
        // fires deterministically and applyUpdate's reload runs under the new
        // worker. (skipWaiting stays false: prompt mode, the user chooses when.)
        clientsClaim: true,
        // Keep the SW OUT of the navigation path. By default vite-plugin-pwa
        // registers a NavigationRoute that answers every document request from
        // the precached index.html (cache-first). During a version swap that
        // handler can reject — the update reload fires right as the controller
        // changes — and the browser then shows "This site can't be reached" /
        // ERR_FAILED for that one navigation, cleared only by a second (hard)
        // reload. That's the once-per-update glitch friends hit. Setting
        // navigateFallback to undefined removes that route, so document requests
        // go straight to the network (Cloudflare serves index.html via its SPA
        // fallback) and never hinge on SW state. Hashed assets stay precached
        // (instant + revisioned) — only the HTML document is network-served. The
        // app needs the network to be useful anyway, so the dropped offline
        // shell costs nothing. (Object.assign merge in vite-plugin-pwa lets this
        // explicit undefined override the plugin's "index.html" default.)
        navigateFallback: undefined,
      },
      includeAssets: [
        "favicon.svg",
        "pwa-icon-180.png",
        "pwa-icon-192.png",
        "pwa-icon-512.png",
      ],
      manifest: {
        name: "Nakama",
        short_name: "Nakama",
        description:
          "Media-Tracker für Anime, Manga, Serien, Filme, Spiele — gemeinsam schauen.",
        // Neutral baseline (= default theme background, matches background_color)
        // so the install splash / pre-JS chrome isn't a stray red. At runtime
        // the <meta name="theme-color"> in index.html overrides this per the
        // live theme (themes.ts paintThemeColor).
        theme_color: "#f7f6f3",
        background_color: "#f7f6f3",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/favicon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
          {
            src: "/pwa-icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any maskable",
          },
          {
            src: "/pwa-icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    // Steam's store endpoints block CORS, so the browser can't call them
    // directly. In dev we proxy through Vite (no deploy needed); in prod a
    // Supabase Edge Function forwards the same path (see supabase/functions/
    // steam-proxy + src/lib/steam.ts). changeOrigin rewrites the Host header
    // so Steam serves the request as if it came from its own origin.
    proxy: {
      "/steam-store": {
        target: "https://store.steampowered.com",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/steam-store/, ""),
      },
    },
  },
});
