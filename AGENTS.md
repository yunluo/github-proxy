# GitHub Proxy — Agent Guide

Single-package project: **Cloudflare Worker only**.

## Structure

```
github-proxy/
├── cloudflare-worker/
│   ├── src/index.ts       # routing, caching, HTML/redirect rewriting
│   ├── wrangler.toml      # Worker name, compatibility date, observability
│   ├── package.json
│   └── tsconfig.json
├── docs/architecture.md
└── README.md
```

## Commands

Run from `cloudflare-worker/`:

| Command | Description |
|---------|-------------|
| `npm run dev` | `wrangler dev` local server (requires Node.js) |
| `npm run deploy` | `wrangler deploy` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run types` | regenerate Wrangler runtime types |

Wrangler must run on Node.js. `bunx wrangler dev` fails because Bun's `fetch()` ignores Miniflare's undici dispatcher; use `npx`/`npm` with a Node runtime.

No lint, test, or CI scripts exist. Verify manually with `curl` against `npm run dev`.

## Architecture

- One Worker handles every request.
- Path prefixes select the upstream: `/` → github.com, `/raw/` → raw.githubusercontent.com, `/gist/` → gist.githubusercontent.com, `/assets/` → github.githubassets.com, `/avatars/`, `/camo/`, `/user-images/`, `/private-user-images/`, `/media/`, `/collector/` → collector.github.com, `/api/github/` → api.github.com.
- Dedicated mirror hosts map root-for-root (`DEDICATED_HOSTS` in `src/index.ts`): `api.gh.gitcafe.ink` → api.github.com, `raw.gh.gitcafe.ink` → raw.githubusercontent.com, `gist.gh.gitcafe.ink` → gist.githubusercontent.com, `ghassets.gitcafe.ink` → github.githubassets.com and `ghcollector.gitcafe.ink` → collector.github.com, so official paths work unchanged. `raw.githubusercontent.com` / `gist.githubusercontent.com` / `github.githubassets.com` / `collector.github.com` URLs in HTML attributes and script payloads are rewritten onto their mirror hosts (root-for-root, `MIRROR_HOST_BY_UPSTREAM`); other upstreams stay path-based on the request origin.
- `/?url=` preserves the old backend contract (main host only).
- HTML is rewritten with `HTMLRewriter` (`href`, `src`, `srcset`, `data-*`, `action`, `poster`, meta `content`); redirect `Location` values are rewritten to the request origin.
- GitHub-hosted URLs inside `<script type="importmap">` and `<script type="application/json">` payloads (React import maps, hydration JSON) are rewritten textually via `SCRIPT_PAYLOAD_SELECTORS` / `rewriteEmbeddedUrls`; without this, GitHub's React apps (e.g. search) load their modules straight from `github.githubassets.com`. Analytics `data-hydro-*` payloads and the iTunes app-banner meta are intentionally left absolute.
- Release downloads, archive links, and uploaded attachments (issue/comment files) that redirect to `objects.githubusercontent.com`, `release-assets.githubusercontent.com`, `objects-origin.githubusercontent.com`, `github-cloud.s3.amazonaws.com`, `github-production-user-asset-6210df.s3.amazonaws.com`, `github-production-release-asset-2e65be.s3.amazonaws.com`, or `codeload.github.com` are followed inside the Worker.
- Cache API key includes target URL, request host, `Accept`, `Accept-Language`, and API version. Requests with `Authorization` or `Range` bypass the cache.
- SSRF protection: exact hostname allowlist, HTTPS only, no non-standard ports, no URL credentials.
- Cookies are never forwarded; `Set-Cookie` is stripped. CSP / `X-Frame-Options` / cross-origin isolation headers are removed so proxied pages render.
- API responses and the collector endpoint get permissive CORS headers; `OPTIONS` is answered locally.
- API `Link` pagination and `Location` values are rewritten to the proxy entry point.

## Environment Variables

| Variable | Where | Required | Notes |
|----------|-------|----------|-------|
| `CLOUDFLARE_API_TOKEN` | deploy shell / `.env` | For non-interactive deploy | Workers Scripts:Edit + Zone Workers Routes:Edit (custom domains) |
| `CLOUDFLARE_ACCOUNT_ID` | deploy shell / `.env` | If multiple accounts | |
| `GITHUB_TOKEN` | Worker secret | Strongly recommended | `wrangler secret put GITHUB_TOKEN`; anonymous API is 60 req/h per egress IP, token raises it to 5,000/h |

Never commit `.env`, `.dev.vars`, or tokens. `.gitignore` covers them.

## Routes

- `/{owner}/{repo}/...` — GitHub web pages
- `/raw/...` — raw.githubusercontent.com
- `/gist/...` — gist.githubusercontent.com
- `/assets/...` — github.githubassets.com
- `/avatars/`, `/camo/`, `/user-images/`, `/private-user-images/`, `/media/` — GitHub image/file CDNs
- `/api/github/...` — api.github.com
- `/collector/...` — collector.github.com
- `https://api.gh.gitcafe.ink/...` — api.github.com, paths identical to the official API
- `https://raw.gh.gitcafe.ink/...` — raw.githubusercontent.com, paths identical to the official host
- `https://gist.gh.gitcafe.ink/...` — gist.githubusercontent.com, paths identical to the official host
- `https://ghassets.gitcafe.ink/...` — github.githubassets.com, paths identical to the official host
- `https://ghcollector.gitcafe.ink/...` — collector.github.com, paths identical to the official host
- `/api/raw/...`, `/api/gist/...`, `/api/assets/...` — legacy aliases
- `/__health` — JSON health check

## Notes

- `[placement] mode = "smart"` lets Cloudflare move execution closer to the GitHub origin automatically; region/city selection is not possible (plain Workers have no region pinning, and Durable Object locationHint was declined). Removing the block reverts to anycast edge execution.
- `wrangler.toml` deploys the Worker as `github-proxy` (existing production Worker at `github-proxy.yunluo.workers.dev`). All six custom domains — `gh.gitcafe.ink`, `api.gh.gitcafe.ink`, `raw.gh.gitcafe.ink`, `gist.gh.gitcafe.ink`, `ghassets.gitcafe.ink`, `ghcollector.gitcafe.ink` — are declared in `routes`; Wrangler replaces dashboard routes with them, so keep all of them listed.
- HTML rewriting only runs for `github.com` HTML; raw HTML files and API JSON are not rewritten.
- GitHub login/private-repo flows are unsupported (cookies stripped).
- The Worker is an open proxy; add Cloudflare WAF/rate limiting for public deployments.
