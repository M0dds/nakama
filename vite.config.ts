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
        // our SKIP_WAITING message in pwa-update.ts). WITHOUT this, after
        // skipWaiting the page stays bound to the OLD worker until a navigation,
        // so `controllerchange` never fires — applyUpdate then falls back to a
        // delayed reload INTO that old controller, whose precache
        // cleanupOutdatedCaches has just wiped → a failed navigation
        // ("Page can't be reached") that only a hard reload clears. clientsClaim
        // makes the new SW claim immediately → controllerchange fires → we
        // reload under the new, intact precache. (skipWaiting stays false: this
        // is prompt mode, the user still chooses when to update.)
        clientsClaim: true,
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
