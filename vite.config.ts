import { defineConfig } from "vite";
import path from "node:path";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
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
