/**
 * Nakama edge worker — static-asset host + media-data caching proxy.
 *
 * Two jobs in one Worker:
 *   1. /api/media/<source>/<upstream-path>  → forward a third-party READ API,
 *      inject any server-side token, and cache the response at Cloudflare's
 *      edge (caches.default).
 *   2. everything else                       → env.ASSETS (the built SPA, incl.
 *      the single-page-application fallback for deep links).
 *
 * WHY a proxy (the whole point):
 *   - Hide the TMDB token: it lives in this Worker's env, never in the client
 *     bundle (closes SEC-TMDB).
 *   - One SHARED edge cache across all users: e.g. a One Piece episode-title
 *     backfill hits Jikan once, then every other user is served from cache —
 *     fewer provider calls, and provider rate limits stay off each user's IP.
 *     (AniList is NOT proxied: it 403-blocks Worker egress IPs and needs no
 *     token + allows CORS, so the browser calls it directly — see proxy.ts.)
 *   - Same-origin (usenakama.app/api/media/*): no CORS, lower latency (the SPA
 *     already comes from this same edge).
 *
 * ABUSE GUARD (Option A — "comes from my own page"):
 *   We only answer same-origin requests. `Sec-Fetch-Site: same-origin` is set
 *   by the browser and CANNOT be forged by another site's JavaScript; a Referer
 *   host match is the fallback for browsers that omit it. This blocks other
 *   websites from calling our proxy out of a visitor's browser. It does NOT
 *   stop a hand-crafted script (server-to-server ignores browser rules) — the
 *   edge cache absorbs repeat floods, and a stricter Supabase-JWT check can be
 *   bolted on in `passesAbuseGuard` later without touching any caller.
 *
 * The Worker is intentionally dependency-free (only Workers runtime APIs) so
 * `wrangler deploy` bundles it with zero install risk in the git-auto-deploy.
 */

interface Env {
  /** Static-assets binding (the built ./dist SPA). */
  ASSETS: Fetcher;
  /** TMDB v4 read token — set as a Worker secret in prod, .dev.vars locally. */
  TMDB_TOKEN?: string;
}

// ──────────────────────────────────────────────────────────────────────────
// Source registry — one entry per provider. Host is pinned, the upstream path
// is allow-listed by regex, query params are filtered, an optional token is
// injected, and a per-source cache TTL is applied. Adding a source = one entry.
// ──────────────────────────────────────────────────────────────────────────

interface SourceConfig {
  /** Pinned upstream origin + base path (no trailing slash). */
  base: string;
  /** Upstream paths permitted for this source (matched against the path AFTER
   *  /api/media/<source>). All sources are GET-only. */
  paths: RegExp[];
  /** Query-param keys forwarded upstream; everything else is dropped. */
  params?: Set<string>;
  /** Extra request headers (e.g. the TMDB bearer). Built per-request from env. */
  inject?: (env: Env) => Record<string, string>;
  /** Edge-cache lifetime in seconds. */
  cacheTtl: number;
}

const HOUR = 60 * 60;
const DAY = 24 * HOUR;

// Descriptive User-Agent for all upstream calls. In the browser the UA is set
// automatically (and is a forbidden header to override); from the Worker we set
// our own — MangaDex hard-rejects requests without one ("You must set an
// appropriate User-Agent header"), and it's good API hygiene everywhere else.
const USER_AGENT = "Nakama/1.0 (+https://usenakama.app)";

const SOURCES: Record<string, SourceConfig> = {
  // TMDB — series + movie search, series/season + movie detail. The token is
  // injected here (never shipped to the browser). Short TTL for search, but we
  // keep one TTL per source for simplicity; detail data barely changes anyway.
  tmdb: {
    base: "https://api.themoviedb.org/3",
    paths: [
      /^\/search\/(tv|movie)$/,
      /^\/movie\/\d+$/,
      /^\/tv\/\d+$/,
      /^\/tv\/\d+\/season\/\d+$/,
    ],
    params: new Set([
      "query",
      "include_adult",
      "page",
      "language",
      "append_to_response",
    ]),
    inject: (env) => {
      const h: Record<string, string> = {};
      if (env.TMDB_TOKEN) h.Authorization = `Bearer ${env.TMDB_TOKEN}`;
      return h;
    },
    cacheTtl: HOUR,
  },

  // Steam — store search + app details. CORS-blocked upstream, so this is the
  // only source that MUST be proxied (the others could go direct). Client sends
  // a trailing slash (Steam 301s without it), mirrored in the path regex.
  steam: {
    base: "https://store.steampowered.com/api",
    paths: [/^\/(storesearch|appdetails)\/?$/],
    params: new Set(["term", "appids", "l", "cc"]),
    cacheTtl: HOUR,
  },

  // Jikan (MyAnimeList) — episode-title fallback for long anime. Proxy-caching
  // here is the big rate-limit win: a One Piece backfill pages ~12 requests at
  // 3 req/s; cached, it hits the provider once for everyone.
  jikan: {
    base: "https://api.jikan.moe/v4",
    paths: [/^\/anime\/\d+\/episodes$/],
    params: new Set(["page"]),
    cacheTtl: DAY,
  },

  // MangaDex — chapter counts + titles, matched on the AniList id.
  mangadex: {
    base: "https://api.mangadex.org",
    paths: [
      /^\/manga$/,
      /^\/manga\/[0-9a-f-]+\/aggregate$/,
      /^\/manga\/[0-9a-f-]+\/feed$/,
    ],
    params: new Set([
      "title",
      "limit",
      "offset",
      "order[relevance]",
      "order[chapter]",
      "translatedLanguage[]",
    ]),
    cacheTtl: DAY,
  },
};

// ──────────────────────────────────────────────────────────────────────────
// Abuse guard (Option A)
// ──────────────────────────────────────────────────────────────────────────

/** True only when the request demonstrably came from our own page. Prefers the
 *  unforgeable `Sec-Fetch-Site: same-origin`; falls back to a Referer-origin
 *  match (= the Worker's own origin, since the proxy is same-origin to the SPA)
 *  for the rare browser that omits Fetch-Metadata. No signal at all → reject. */
function passesAbuseGuard(req: Request): boolean {
  const site = req.headers.get("Sec-Fetch-Site");
  if (site) return site === "same-origin";
  const referer = req.headers.get("Referer");
  if (referer) {
    try {
      return new URL(referer).origin === new URL(req.url).origin;
    } catch {
      return false;
    }
  }
  return false;
}

// ──────────────────────────────────────────────────────────────────────────
// Caching helpers
// ──────────────────────────────────────────────────────────────────────────

/** Serve `cacheKey` from the edge cache, or run `fetchUpstream`, store a copy
 *  with our TTL, and return it. Only 200s are cached. Adds X-Proxy-Cache so the
 *  localhost test can see HIT/MISS. `ctx.waitUntil` lets the put outlive the
 *  response (cache write doesn't delay the user). */
async function cached(
  cacheKey: Request,
  ttl: number,
  ctx: ExecutionContext,
  fetchUpstream: () => Promise<Response>,
): Promise<Response> {
  const cache = caches.default;
  const hit = await cache.match(cacheKey);
  if (hit) {
    const res = new Response(hit.body, hit);
    res.headers.set("X-Proxy-Cache", "HIT");
    return res;
  }

  const upstream = await fetchUpstream();
  // Rebuild with a clean header set so we control caching and never relay a
  // stray Set-Cookie (which would also make cache.put throw).
  const headers = new Headers();
  const ct = upstream.headers.get("content-type");
  if (ct) headers.set("content-type", ct);
  const res = new Response(upstream.body, { status: upstream.status, headers });

  if (upstream.ok) {
    res.headers.set("Cache-Control", `public, max-age=${ttl}`);
    res.headers.set("X-Proxy-Cache", "MISS");
    ctx.waitUntil(cache.put(cacheKey, res.clone()));
  } else {
    // Don't cache errors — let the next call retry the provider.
    res.headers.set("Cache-Control", "no-store");
    res.headers.set("X-Proxy-Cache", "BYPASS");
  }
  return res;
}

// ──────────────────────────────────────────────────────────────────────────
// Proxy handlers
// ──────────────────────────────────────────────────────────────────────────

function bad(status: number, msg: string): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { "content-type": "application/json", "Cache-Control": "no-store" },
  });
}

async function proxyGet(
  cfg: SourceConfig,
  upstreamPath: string,
  url: URL,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  if (!cfg.paths.some((re) => re.test(upstreamPath))) {
    return bad(404, "path not allowed");
  }

  // Rebuild the query from only allow-listed params.
  const out = new URLSearchParams();
  for (const [k, v] of url.searchParams) {
    if (cfg.params?.has(k)) out.append(k, v);
  }
  const qs = out.toString();
  const target = `${cfg.base}${upstreamPath}${qs ? `?${qs}` : ""}`;

  // The canonical upstream URL is the cache key — two client URLs mapping to
  // the same upstream share one cache entry.
  const cacheKey = new Request(target, { method: "GET" });
  return cached(cacheKey, cfg.cacheTtl, ctx, () =>
    fetch(target, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": USER_AGENT,
        ...cfg.inject?.(env),
      },
    }),
  );
}

async function handleProxy(
  req: Request,
  env: Env,
  ctx: ExecutionContext,
  url: URL,
): Promise<Response> {
  if (!passesAbuseGuard(req)) return bad(403, "forbidden");

  // /api/media/<source>/<upstream-path...>
  const rest = url.pathname.slice("/api/media/".length);
  const slash = rest.indexOf("/");
  const source = slash === -1 ? rest : rest.slice(0, slash);
  const upstreamPath = slash === -1 ? "" : rest.slice(slash); // leading "/"

  const cfg = SOURCES[source];
  if (!cfg) return bad(404, "unknown source");
  if (req.method !== "GET") return bad(405, "method not allowed");

  return proxyGet(cfg, upstreamPath, url, env, ctx);
}

export default {
  async fetch(req, env, ctx): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/media/")) {
      return handleProxy(req, env, ctx, url);
    }
    // Non-API paths (deep links etc.) → static assets + SPA fallback. Hashed
    // asset requests are served directly by the platform and never reach here.
    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;
