# Architecture

```
Client
  │
  ▼
Cloudflare Worker
  ├─ route resolution (host + path prefix → GitHub host)
  ├─ SSRF host allowlist
  ├─ Cache API (Accept-aware key)
  ├─ fetch GitHub (optional GITHUB_TOKEN)
  ├─ HTMLRewriter for HTML links
  ├─ Location / API Link rewriting
  └─ follow signed asset-CDN redirects
  │
  ▼
GitHub
```

## Request flow

1. `GET /{owner}/{repo}` maps to `https://github.com/{owner}/{repo}`.
2. `/raw/...`, `/gist/...`, `/assets/...`, `/avatars/...`, `/camo/...`, `/user-images/...`, `/media/...`, and `/api/github/...` map to their GitHub hosts.
3. `api.gh.gitcafe.ink/...` maps root-for-root to `https://api.github.com/...`, so `/repos/vercel/next.js` keeps its official API path.
4. `/?url=...` is accepted for backwards compatibility with the legacy backend contract on the main host.
5. Requests with `Authorization` or `Range` bypass the Worker cache and are marked `private, no-store` / returned as-is.
6. Successful `200` responses are stored in the Cache API; the key includes the target URL, request host, `Accept`, `Accept-Language`, and `X-GitHub-Api-Version`.
7. HTML from `github.com` is streamed through `HTMLRewriter`; links to GitHub hosts are rewritten to the Worker origin.
8. Redirects to GitHub hosts are rewritten to the Worker origin. Redirects to signed asset CDNs are followed inside the Worker so downloads stay proxied.
9. API `Link` pagination headers are rewritten to the entry point that served the request (`api.gh.gitcafe.ink` or `gh.gitcafe.ink/api/github/`).
10. Cookies are dropped in both directions; CSP and frame/cross-origin isolation headers are removed so proxied pages render.

## Failure modes

- Non-allowlisted or non-HTTPS target: `400`/`403`.
- Upstream `fetch` failure: `502` with a generic message; details go to `console.error`.
- GitHub rate limit: passed through as `403`/`429`; configure `GITHUB_TOKEN` to raise limits.
- Large responses (> 50 MB) are streamed but not cached.

## Deployment

Single Worker, configured by `cloudflare-worker/wrangler.toml`. No Vercel, database, KV, or Durable Objects are required.

Two custom domains are declared in `routes` and created by `wrangler deploy`:

- `gh.gitcafe.ink` — web pages, raw files, assets
- `api.gh.gitcafe.ink` — GitHub API with official paths

Keep both entries: Wrangler replaces dashboard-managed routes with the configuration, so a missing entry detaches that domain. Deploying route changes requires Zone → Workers Routes write permission in addition to Workers Scripts edit.
