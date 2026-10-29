/**
 * GitHub Proxy — standalone Cloudflare Worker.
 *
 * Routes (legacy route shape):
 *   /{owner}/{repo}/...          -> github.com
 *   /raw/{owner}/{repo}/...      -> raw.githubusercontent.com
 *   /gist/...                    -> gist.githubusercontent.com
 *   /assets/...                  -> github.githubassets.com
 *   /avatars/...                 -> avatars.githubusercontent.com
 *   /camo/...                    -> camo.githubusercontent.com
 *   /user-images/...             -> user-images.githubusercontent.com
 *   /private-user-images/...     -> private-user-images.githubusercontent.com
 *   /media/...                   -> media.githubusercontent.com
 *   /api/github/...              -> api.github.com
 *
 * Dedicated mirror hosts serve their upstream root-for-root, so paths match
 * the official host exactly:
 *   api.gh.gitcafe.ink/...       -> api.github.com
 *   ghassets.gitcafe.ink/...     -> github.githubassets.com
 *
 * The legacy worker contract is still accepted:
 *   /?url=https%3A%2F%2Fgithub.com%2Fowner%2Frepo
 *
 * HTML links and redirects are rewritten to the worker's own origin, so the
 * worker can be used as a GitHub mirror without a separate front end.
 */
export interface Env {
  GITHUB_TOKEN?: string;
}

type Upstream =
  | "github"
  | "raw"
  | "gist"
  | "assets"
  | "api"
  | "avatars"
  | "camo"
  | "userImages"
  | "privateUserImages"
  | "media";

interface UpstreamConfig {
  origin: string;
  /** Canonical worker path prefix for this upstream. */
  route: string;
  /** Browser cache TTL for successful responses. */
  cacheSeconds: number;
  /** Static, content-addressed assets can be marked immutable. */
  immutable?: boolean;
}

const UPSTREAMS: Record<Upstream, UpstreamConfig> = {
  github: { origin: "https://github.com", route: "/", cacheSeconds: 300 },
  raw: { origin: "https://raw.githubusercontent.com", route: "/raw/", cacheSeconds: 604800 },
  gist: { origin: "https://gist.githubusercontent.com", route: "/gist/", cacheSeconds: 604800 },
  assets: {
    origin: "https://github.githubassets.com",
    route: "/assets/",
    cacheSeconds: 2592000,
    immutable: true,
  },
  api: { origin: "https://api.github.com", route: "/api/github/", cacheSeconds: 60 },
  avatars: {
    origin: "https://avatars.githubusercontent.com",
    route: "/avatars/",
    cacheSeconds: 604800,
  },
  camo: { origin: "https://camo.githubusercontent.com", route: "/camo/", cacheSeconds: 604800 },
  userImages: {
    origin: "https://user-images.githubusercontent.com",
    route: "/user-images/",
    cacheSeconds: 604800,
  },
  privateUserImages: {
    origin: "https://private-user-images.githubusercontent.com",
    route: "/private-user-images/",
    cacheSeconds: 604800,
  },
  media: { origin: "https://media.githubusercontent.com", route: "/media/", cacheSeconds: 2592000 },
};

const HOST_TO_UPSTREAM: Record<string, Upstream> = {
  "github.com": "github",
  "www.github.com": "github",
  "raw.githubusercontent.com": "raw",
  "gist.githubusercontent.com": "gist",
  "github.githubassets.com": "assets",
  "api.github.com": "api",
  "avatars.githubusercontent.com": "avatars",
  "camo.githubusercontent.com": "camo",
  "user-images.githubusercontent.com": "userImages",
  "private-user-images.githubusercontent.com": "privateUserImages",
  "media.githubusercontent.com": "media",
};

const ALLOWED_HOSTS = new Set(Object.keys(HOST_TO_UPSTREAM));

/**
 * Dedicated mirror hosts serve their upstream root-for-root, so paths are
 * identical to the official host. For example:
 *   https://api.gh.gitcafe.ink/repos/vercel/next.js
 *   https://ghassets.gitcafe.ink/assets/chunk-app.js
 * The main host keeps the path-based routes (/api/github/..., /assets/...)
 * for compatibility.
 */
const DEDICATED_HOSTS: Record<string, Upstream> = {
  "api.gh.gitcafe.ink": "api",
  "ghassets.gitcafe.ink": "assets",
};

/** Redirect targets used by release downloads and source archives. */
const ASSET_REDIRECT_HOSTS = new Set([
  "objects.githubusercontent.com",
  "release-assets.githubusercontent.com",
  "github-cloud.s3.amazonaws.com",
  "codeload.github.com",
]);

const ROUTES: Array<{ prefix: string; upstream: Upstream }> = [
  { prefix: "/api/github/", upstream: "api" },
  { prefix: "/api/raw/", upstream: "raw" },
  { prefix: "/api/gist/", upstream: "gist" },
  { prefix: "/api/assets/", upstream: "assets" },
  ...(Object.keys(UPSTREAMS) as Upstream[])
    .filter((upstream) => upstream !== "github")
    .map((upstream) => ({ prefix: UPSTREAMS[upstream].route, upstream })),
];

const CACHE_VERSION = "v3";
const CACHE_HOST = "https://github-proxy-cache.internal";
const MAX_CACHE_BYTES = 50 * 1024 * 1024;
const MAX_REDIRECTS = 3;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const API_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS",
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, Accept, X-GitHub-Api-Version, If-None-Match",
  "Access-Control-Expose-Headers":
    "ETag, Link, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, X-RateLimit-Used, X-RateLimit-Resource",
  "Access-Control-Max-Age": "86400",
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const requestUrl = new URL(request.url);

    if (requestUrl.pathname === "/__health") {
      return jsonResponse({
        ok: true,
        service: "github-proxy",
        version: CACHE_VERSION,
        time: new Date().toISOString(),
      });
    }

    const resolved = resolveTarget(requestUrl);
    if ("error" in resolved) {
      return resolved.error;
    }

    const { target, upstream } = resolved;
    const isApi = upstream === "api";

    if (isApi && request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: API_CORS_HEADERS });
    }

    try {
      return await proxyRequest(request, requestUrl, target, upstream, env, ctx);
    } catch (error) {
      console.error("github-proxy request failed", {
        target: target.toString(),
        upstream,
        error: error instanceof Error ? error.message : String(error),
      });

      return new Response("Bad gateway: upstream request failed.", {
        status: 502,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Proxy": "Cloudflare-Worker",
          ...(isApi ? API_CORS_HEADERS : {}),
        },
      });
    }
  },
} satisfies ExportedHandler<Env>;

function resolveTarget(
  requestUrl: URL,
): { target: URL; upstream: Upstream } | { error: Response } {
  const dedicatedUpstream = DEDICATED_HOSTS[requestUrl.hostname];

  // Legacy backend contract: /?url=https://github.com/... (main host only).
  if (!dedicatedUpstream && requestUrl.pathname === "/" && requestUrl.searchParams.has("url")) {
    const rawTarget = requestUrl.searchParams.get("url") || "";

    let target: URL;
    try {
      target = new URL(rawTarget);
    } catch {
      return { error: textResponse("Invalid url parameter.", 400) };
    }

    if (target.protocol !== "https:") {
      return { error: textResponse("Only https targets are allowed.", 403) };
    }
    if (target.username || target.password) {
      return { error: textResponse("Target URL must not contain credentials.", 403) };
    }
    if (target.port && target.port !== "443") {
      return { error: textResponse("Non-standard target ports are not allowed.", 403) };
    }

    const upstream = HOST_TO_UPSTREAM[target.hostname];
    if (!upstream || !ALLOWED_HOSTS.has(target.hostname)) {
      return { error: textResponse("Invalid target domain.", 403) };
    }

    return { target, upstream };
  }

  // Dedicated mirror hosts map root-for-root, so /repos/... and /assets/...
  // stay unchanged instead of getting the /api/github/ or /assets/ prefix.
  if (dedicatedUpstream) {
    const target = new URL(`${UPSTREAMS[dedicatedUpstream].origin}${requestUrl.pathname}`);
    target.search = requestUrl.search;
    return { target, upstream: dedicatedUpstream };
  }

  let upstream: Upstream = "github";
  let rest = requestUrl.pathname;

  for (const route of ROUTES) {
    if (requestUrl.pathname === route.prefix.slice(0, -1) || requestUrl.pathname.startsWith(route.prefix)) {
      upstream = route.upstream;
      rest = requestUrl.pathname.slice(route.prefix.length - 1);
      break;
    }
  }

  const pathPart = rest.startsWith("/") ? rest : `/${rest}`;
  const target = new URL(`${UPSTREAMS[upstream].origin}${pathPart}`);
  // Preserve the raw query string exactly (URLSearchParams would re-encode it).
  target.search = requestUrl.search;

  return { target, upstream };
}

async function proxyRequest(
  request: Request,
  requestUrl: URL,
  initialTarget: URL,
  upstream: Upstream,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const isApi = upstream === "api";
  const hasUserAuth = request.headers.has("Authorization");
  const hasRange = request.headers.has("Range");
  const canUseCache = request.method === "GET" && !hasUserAuth && !hasRange;

  const cache = caches.default;
  const cacheKey = canUseCache ? makeCacheKey(initialTarget, requestUrl, request) : null;

  if (cacheKey) {
    const cached = await cache.match(cacheKey);
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set("X-Cache", "HIT");
      headers.set("X-Proxy", "Cloudflare-Worker");
      if (isApi) applyHeaders(headers, API_CORS_HEADERS);
      return new Response(cached.body, {
        status: cached.status,
        statusText: cached.statusText,
        headers,
      });
    }
  }

  let target = initialTarget;
  let upstreamResponse = await fetchUpstream(request, target, upstream, env);

  const redirected = await followAssetRedirects(request, upstreamResponse, target);
  upstreamResponse = redirected.response;
  target = redirected.target;

  const contentType = upstreamResponse.headers.get("Content-Type") || "";
  const respHeaders = new Headers(upstreamResponse.headers);

  // Never expose GitHub cookies through the proxy.
  respHeaders.delete("Set-Cookie");
  respHeaders.delete("Set-Cookie2");
  respHeaders.delete("Vary");

  // GitHub's security headers would block the mirror (iframes, proxied assets).
  respHeaders.delete("Content-Security-Policy");
  respHeaders.delete("Content-Security-Policy-Report-Only");
  respHeaders.delete("X-Frame-Options");
  respHeaders.delete("Cross-Origin-Opener-Policy");
  respHeaders.delete("Cross-Origin-Embedder-Policy");
  respHeaders.delete("Cross-Origin-Resource-Policy");

  respHeaders.set("X-Proxy", "Cloudflare-Worker");
  respHeaders.set("X-Cache", "MISS");
  respHeaders.set("X-Proxy-Upstream", upstream);

  const location = respHeaders.get("Location");
  if (location) {
    respHeaders.set("Location", rewriteLocation(location, requestUrl, target));
  }

  if (isApi) {
    applyHeaders(respHeaders, API_CORS_HEADERS);

    // Pagination links point at api.github.com; keep them on the entry the
    // caller used so following them stays proxied.
    const link = respHeaders.get("Link");
    if (link) respHeaders.set("Link", rewriteLinkHeader(link, requestUrl));
  }

  const status = upstreamResponse.status;
  const contentLength = Number(respHeaders.get("Content-Length") || "0");

  if (status === 200) {
    respHeaders.set(
      "Cache-Control",
      hasUserAuth ? "private, no-store" : cacheControlFor(upstream, contentType),
    );
  } else if (status >= 400 || hasUserAuth) {
    respHeaders.set("Cache-Control", "no-store");
  }

  // Requests with cookies never reach this point (cookies are stripped), so
  // Set-Cookie cannot make an otherwise public response user-specific. Cache
  // anonymous 200s even when GitHub sets a session cookie; the header itself
  // has already been removed above.
  const canCacheResponse =
    !!cacheKey &&
    status === 200 &&
    !(contentLength > MAX_CACHE_BYTES);

  const isHtml = upstream === "github" && contentType.toLowerCase().includes("text/html");

  if (isHtml && request.method !== "HEAD" && upstreamResponse.body) {
    // HTMLRewriter decodes the body itself; length/encoding no longer apply.
    respHeaders.delete("Content-Length");
    respHeaders.delete("Content-Encoding");

    const transformed = buildHtmlRewriter(requestUrl).transform(
      new Response(upstreamResponse.body, {
        status,
        statusText: upstreamResponse.statusText,
        headers: respHeaders,
      }),
    );

    if (canCacheResponse) {
      ctx.waitUntil(cache.put(cacheKey!, transformed.clone()).catch(() => undefined));
    }

    return transformed;
  }

  const response = new Response(upstreamResponse.body, {
    status,
    statusText: upstreamResponse.statusText,
    headers: respHeaders,
  });

  if (canCacheResponse) {
    ctx.waitUntil(cache.put(cacheKey!, response.clone()).catch(() => undefined));
  }

  return response;
}

async function fetchUpstream(
  request: Request,
  target: URL,
  upstream: Upstream,
  env: Env,
): Promise<Response> {
  const headers = new Headers();
  headers.set("User-Agent", USER_AGENT);
  headers.set("Accept", request.headers.get("Accept") || "*/*");

  for (const name of [
    "Accept-Language",
    "Content-Type",
    "Range",
    "If-None-Match",
    "If-Modified-Since",
    "X-GitHub-Api-Version",
    "Git-Protocol",
    // GitHub's <include-fragment> and Turbo frames return a full HTML page
    // unless these headers are forwarded, which makes the profile page embed
    // itself recursively.
    "X-Requested-With",
    "Turbo-Frame",
  ]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  // Forward a caller-supplied token to GitHub-owned content hosts, but never
  // to the static CDN or signed asset URLs. The deployment-wide GITHUB_TOKEN
  // is only used for api.github.com, so it cannot unlock private web pages or
  // raw files for anonymous visitors.
  const authorization = request.headers.get("Authorization");
  if (authorization && ["github", "api", "raw", "gist"].includes(upstream)) {
    headers.set("Authorization", authorization);
  } else if (upstream === "api" && env.GITHUB_TOKEN) {
    headers.set("Authorization", `token ${env.GITHUB_TOKEN}`);
  }

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
  }

  return fetch(target.toString(), init);
}

/**
 * Release downloads and archive links redirect to signed CDN hosts. Follow
 * those hops inside the worker so the download is proxied too, but never
 * follow redirects back into the site (login, trailing-slash, etc.).
 */
async function followAssetRedirects(
  request: Request,
  initialResponse: Response,
  initialTarget: URL,
): Promise<{ response: Response; target: URL }> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return { response: initialResponse, target: initialTarget };
  }

  let response = initialResponse;
  let target = initialTarget;

  for (let hop = 0; hop < MAX_REDIRECTS; hop += 1) {
    if (response.status < 300 || response.status >= 400) break;

    const location = response.headers.get("Location");
    if (!location) break;

    let next: URL;
    try {
      next = new URL(location, target);
    } catch {
      break;
    }

    if (next.protocol !== "https:" || !ASSET_REDIRECT_HOSTS.has(next.hostname)) {
      break;
    }

    const assetHeaders = new Headers();
    assetHeaders.set("User-Agent", USER_AGENT);
    assetHeaders.set("Accept", "*/*");
    const range = request.headers.get("Range");
    if (range) assetHeaders.set("Range", range);

    let nextResponse: Response;
    try {
      nextResponse = await fetch(next.toString(), {
        method: request.method,
        headers: assetHeaders,
        redirect: "manual",
      });
    } catch {
      // If the signed CDN is unreachable, keep the redirect so the browser can
      // try to fetch it directly.
      break;
    }

    // Cancel the small redirect body before replacing it.
    await response.body?.cancel().catch(() => undefined);

    response = nextResponse;
    target = next;
  }

  return { response, target };
}

function makeCacheKey(target: URL, requestUrl: URL, request: Request): Request {
  const keyUrl = new URL(CACHE_HOST);
  keyUrl.pathname = `/${CACHE_VERSION}/${encodeURIComponent(target.toString())}`;
  keyUrl.searchParams.set("host", requestUrl.host);
  keyUrl.searchParams.set("accept", request.headers.get("Accept") || "");
  keyUrl.searchParams.set("lang", request.headers.get("Accept-Language") || "");

  const apiVersion = request.headers.get("X-GitHub-Api-Version");
  if (apiVersion) keyUrl.searchParams.set("api", apiVersion);

  // The same URL returns a fragment for include-fragment requests and a full
  // page for direct navigation, so they must not share a cache entry.
  const requestedWith = request.headers.get("X-Requested-With");
  if (requestedWith) keyUrl.searchParams.set("xhr", requestedWith);

  return new Request(keyUrl.toString(), { method: "GET" });
}

function cacheControlFor(upstream: Upstream, contentType: string): string {
  const config = UPSTREAMS[upstream];

  if (upstream === "github") {
    if (isStaticContentType(contentType)) {
      return "public, max-age=604800";
    }
    if (contentType.toLowerCase().includes("text/html")) {
      return "public, max-age=300";
    }
    return "public, max-age=3600";
  }

  return config.immutable
    ? `public, max-age=${config.cacheSeconds}, immutable`
    : `public, max-age=${config.cacheSeconds}`;
}

function isStaticContentType(contentType: string): boolean {
  const value = contentType.toLowerCase();
  return (
    value.startsWith("image/") ||
    value.startsWith("font/") ||
    value.startsWith("text/css") ||
    value.startsWith("application/javascript") ||
    value.startsWith("text/javascript") ||
    value.startsWith("application/wasm")
  );
}

function buildHtmlRewriter(requestUrl: URL): HTMLRewriter {
  const rewriter = new HTMLRewriter();

  for (const attribute of [
    "href",
    "src",
    "data-href",
    "data-src",
    "data-url",
    "action",
    "formaction",
    "poster",
  ]) {
    rewriter.on(`[${attribute}]`, {
      element(element) {
        const value = element.getAttribute(attribute);
        if (!value) return;
        const rewritten = rewriteAbsoluteUrl(value, requestUrl);
        if (rewritten) element.setAttribute(attribute, rewritten);
      },
    });
  }

  rewriter.on("[srcset]", {
    element(element) {
      const value = element.getAttribute("srcset");
      if (!value || value.includes("data:")) return;

      const rewritten = value
        .split(",")
        .map((candidate) => {
          const parts = candidate.trim().split(/\s+/);
          const [url, ...descriptor] = parts;
          const mapped = rewriteAbsoluteUrl(url, requestUrl);
          return [mapped || url, ...descriptor].join(" ");
        })
        .join(", ");

      if (rewritten !== value) element.setAttribute("srcset", rewritten);
    },
  });

  rewriter.on("meta[content]", {
    element(element) {
      const value = element.getAttribute("content");
      if (!value || /\s/.test(value)) return;
      const rewritten = rewriteAbsoluteUrl(value, requestUrl);
      if (rewritten) element.setAttribute("content", rewritten);
    },
  });

  return rewriter;
}

function rewriteAbsoluteUrl(value: string, requestUrl: URL): string | null {
  const match = /^(https?:)?\/\/([^/?#]+)(.*)$/i.exec(value);
  if (!match) return null;

  const scheme = (match[1] || "https:").toLowerCase();
  if (scheme !== "https:" && scheme !== "http:") return null;

  const hostname = match[2].toLowerCase().replace(/:443$/, "");
  const upstream = HOST_TO_UPSTREAM[hostname];
  if (!upstream) return null;

  const rest = match[3].replace(/^\/+/, "");

  // Dedicated mirror hosts serve their upstream at the root, so links to that
  // same upstream map back onto the mirror host. Links to other GitHub hosts
  // are left absolute instead of being mapped onto the mirror host.
  const dedicatedUpstream = DEDICATED_HOSTS[requestUrl.hostname];
  if (dedicatedUpstream) {
    return upstream === dedicatedUpstream ? `${requestUrl.origin}/${rest}` : null;
  }

  return `${requestUrl.origin}${UPSTREAMS[upstream].route}${rest}`;
}

function rewriteLocation(location: string, requestUrl: URL, target: URL): string {
  try {
    const absolute = new URL(location, target).toString();
    return rewriteAbsoluteUrl(absolute, requestUrl) || absolute;
  } catch {
    return location;
  }
}

/** Keep RFC 8288 pagination links on the same proxy entry point. */
function rewriteLinkHeader(value: string, requestUrl: URL): string {
  return value.replace(/<([^>]+)>/g, (match, url: string) => {
    const rewritten = rewriteAbsoluteUrl(url, requestUrl);
    return rewritten ? `<${rewritten}>` : match;
  });
}

function applyHeaders(headers: Headers, values: Record<string, string>): void {
  for (const [name, value] of Object.entries(values)) {
    headers.set(name, value);
  }
}

function textResponse(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Proxy": "Cloudflare-Worker",
    },
  });
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
