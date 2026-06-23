/**
 * Client boundary for the media-data proxy (worker/index.ts).
 *
 * In PROD every third-party read API goes through our same-origin Cloudflare
 * Worker at `/api/media/<source>/<path>` — so the browser never holds a
 * provider token, all users share one edge cache, and there's no CORS.
 *
 * In DEV we skip the Worker and hit providers directly (TMDB token from
 * .env.local; Steam still via the Vite proxy since its CORS is blocked), so the
 * normal `npm run dev` workflow needs no Worker running. To exercise the exact
 * PROD path locally, build then serve through the Worker:
 *     npm run build && wrangler dev
 * which serves the built bundle same-origin with the proxy live.
 *
 * Each source module composes its own upstream paths/params as before; this
 * module only decides direct-vs-proxied and hands back the right base.
 */

export type ProxySource = "anilist" | "tmdb" | "steam" | "jikan" | "mangadex";

/** True in production builds (Vite statically replaces import.meta.env.DEV, so
 *  the direct-path branches — and the inlined TMDB token — dead-code-eliminate
 *  out of the prod bundle). */
export const PROXY_ENABLED = !import.meta.env.DEV;

/** Same-origin base for a proxied source, e.g. "/api/media/tmdb". Append the
 *  upstream path + query exactly as you would for the direct provider. */
export function proxyBase(source: ProxySource): string {
  return `/api/media/${source}`;
}
