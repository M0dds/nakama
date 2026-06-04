// Single source for the app version + build stamps. The values come from
// Vite `define` at build time (vite.config.ts) — `package.json` version, the
// build date, and a best-effort short git SHA. Keeping the reads behind this
// module means consumers don't touch the raw `__GLOBALS__`.

export const APP_VERSION = __APP_VERSION__;
export const BUILD_DATE = __BUILD_DATE__;
export const GIT_SHA = __GIT_SHA__;

/** `v0.1.0 · 2026-06-04` — the compact label for the profile footer. */
export const VERSION_LABEL = `v${APP_VERSION} · ${BUILD_DATE}`;
