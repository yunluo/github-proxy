# Architecture

```
Client
  │
  ▼
Cloudflare Worker
  ├─ route resolution (path prefix → GitHub host)
  ├─ SSRF host allowlist
  ├─ Cache API (Accept-aware key)
  ├─ fetch GitHub (optional GITHUB_TOKEN)
  ├─ HTMLRewriter for HTML links
  ├─ Location rewriting
  └─ follow signed asset-CDN redirects
  │
  ▼
GitHub
```

## Request flow

1. `GET /{owner}/{repo}` maps to `https://github.com/{owner}/{repo}`.
2. `/raw/...`, `/gist/...`, `/assets/...`, `/avatars/...`, `/camo/...`, `/user-images/...`, `/media/...`, and `/api/github/...` map to their GitHub hosts.
3. `/?url=...` is accepted for backwards compatibility with the legacy backend contract.
4. Requests with `Authorization` or `Range` bypass the Worker cache and are marked `private, no-store` / returned as-is.
5. Successful `200` responses are stored in the Cache API; the key includes the target URL, request host, `Accept`, `Accept-Language`, and `X-GitHub-Api-Version`.
6. HTML from `github.com` is streamed through `HTMLRewriter`; links to GitHub hosts are rewritten to the Worker origin.
7. Redirects to GitHub hosts are rewritten to the Worker origin. Redirects to signed asset CDNs are followed inside the Worker so downloads stay proxied.
8. Cookies are dropped in both directions; CSP and frame/cross-origin isolation headers are removed so proxied pages render.

## Failure modes

- Non-allowlisted or non-HTTPS target: `400`/`403`.
- Upstream `fetch` failure: `502` with a generic message; details go to `console.error`.
- GitHub rate limit: passed through as `403`/`429`; configure `GITHUB_TOKEN` to raise limits.
- Large responses (> 50 MB) are streamed but not cached.

## Deployment

Single Worker, configured by `cloudflare-worker/wrangler.toml`. No Vercel, database, KV, or Durable Objects are required.
