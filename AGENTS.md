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
- Path prefixes select the upstream: `/` → github.com, `/raw/` → raw.githubusercontent.com, `/gist/` → gist.githubusercontent.com, `/assets/` → github.githubassets.com, `/avatars/`, `/camo/`, `/user-images/`, `/private-user-images/`, `/media/`, `/api/github/` → api.github.com.
- `/?url=` preserves the old backend contract.
- HTML is rewritten with `HTMLRewriter` (`href`, `src`, `srcset`, `data-*`, `action`, `poster`, meta `content`); redirect `Location` values are rewritten to the request origin.
- Release downloads and archive links that redirect to `objects.githubusercontent.com`, `release-assets.githubusercontent.com`, `github-cloud.s3.amazonaws.com`, or `codeload.github.com` are followed inside the Worker.
- Cache API key includes target URL, request host, `Accept`, `Accept-Language`, and API version. Requests with `Authorization` or `Range` bypass the cache.
- SSRF protection: exact hostname allowlist, HTTPS only, no non-standard ports, no URL credentials.
- Cookies are never forwarded; `Set-Cookie` is stripped. CSP / `X-Frame-Options` / cross-origin isolation headers are removed so proxied pages render.
- API responses get permissive CORS headers; `OPTIONS` is answered locally.

## Environment Variables

| Variable | Where | Required | Notes |
|----------|-------|----------|-------|
| `CLOUDFLARE_API_TOKEN` | deploy shell / `.env` | For non-interactive deploy | Workers Scripts:Edit |
| `CLOUDFLARE_ACCOUNT_ID` | deploy shell / `.env` | If multiple accounts | |
| `GITHUB_TOKEN` | Worker secret | No | `wrangler secret put GITHUB_TOKEN`; higher API limits |

Never commit `.env`, `.dev.vars`, or tokens. `.gitignore` covers them.

## Routes

- `/{owner}/{repo}/...` — GitHub web pages
- `/raw/...` — raw.githubusercontent.com
- `/gist/...` — gist.githubusercontent.com
- `/assets/...` — github.githubassets.com
- `/avatars/`, `/camo/`, `/user-images/`, `/private-user-images/`, `/media/` — GitHub image/file CDNs
- `/api/github/...` — api.github.com
- `/api/raw/...`, `/api/gist/...`, `/api/assets/...` — legacy aliases
- `/__health` — JSON health check

## Notes

- `wrangler.toml` deploys the Worker as `github-proxy` (existing production Worker at `github-proxy.yunluo.workers.dev`).
- HTML rewriting only runs for `github.com` HTML; raw HTML files and API JSON are not rewritten.
- GitHub login/private-repo flows are unsupported (cookies stripped).
- The Worker is an open proxy; add Cloudflare WAF/rate limiting for public deployments.
