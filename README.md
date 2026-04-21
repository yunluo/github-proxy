# GitHub Proxy

Accelerate access to public GitHub repositories using Vercel and Cloudflare.

## Usage

### Web Pages
Visit `https://your-domain.com/{owner}/{repo}` to access GitHub pages.

Example: `https://gh.yourdomain.com/vercel/next.js`

### Raw Files
Access raw file content via `/raw/` prefix.

Example: `https://gh.yourdomain.com/raw/vercel/next.js/main/package.json`

## Setup

1. Deploy Cloudflare Worker: `cd cloudflare-worker && npm install && npm run deploy`
2. Note the Worker URL after deployment
3. Update `vercel/.env.local` with the actual Worker URL
4. Deploy Vercel: `cd vercel && npm install && npx vercel`
5. Set up custom domain in Vercel dashboard
6. Update DNS CNAME record

## Architecture

```
User → Vercel Edge → Cloudflare Worker (Cache) → GitHub
```

## Limits

- Vercel Free: 100GB/month bandwidth
- Cloudflare Workers Free: 100K requests/day
