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
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "Nakama",
        short_name: "Nakama",
        description:
          "Media-Tracker für Anime, Manga, Serien, Filme, Spiele — gemeinsam schauen.",
        theme_color: "#dc2626",
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
