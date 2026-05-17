# GitHub Proxy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy a GitHub proxy service using Vercel and Cloudflare to accelerate access to public GitHub repositories.

**Architecture:** Vercel Edge Functions receive user requests and forward to Cloudflare Worker, which caches responses from GitHub. Cloudflare CDN serves cached content on subsequent requests.

**Tech Stack:** Next.js, Vercel Edge Functions, Cloudflare Workers (free tier)

---

## File Structure

```
github-proxy/
├── vercel/
│   ├── app/
│   │   ├── api/
│   │   │   ├── github/[...path]/route.ts    # GitHub web pages proxy
│   │   │   └── raw/[...path]/route.ts       # Raw files proxy
│   │   ├── layout.ts
│   │   └── page.ts
│   ├── next.config.js
│   └── package.json
├── cloudflare-worker/
│   ├── src/
│   │   └── index.ts                          # Cloudflare Worker
│   ├── wrangler.toml
│   └── package.json
└── README.md
```

---

## Task 1: Initialize Next.js Project for Vercel

**Files:**
- Create: `vercel/package.json`
- Create: `vercel/next.config.js`
- Create: `vercel/tsconfig.json`
- Create: `vercel/app/layout.tsx`
- Create: `vercel/app/page.tsx`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "github-proxy",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "next": "15.0.0",
    "react": "19.0.0",
    "react-dom": "19.0.0"
  },
  "devDependencies": {
    "@types/node": "22.0.0",
    "@types/react": "19.0.0",
    "@types/react-dom": "19.0.0",
    "typescript": "5.6.0"
  }
}
```

- [ ] **Step 2: Create next.config.js**

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable default image optimization for proxy
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Create app/layout.tsx**

```tsx
export const metadata = {
  title: 'GitHub Proxy',
  description: 'Accelerate GitHub access via Vercel and Cloudflare',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 5: Create app/page.tsx**

```tsx
export default function Home() {
  return (
    <main>
      <h1>GitHub Proxy</h1>
      <p>Access GitHub repositories through our proxy.</p>
      <ul>
        <li><a href="/owner/repo">/owner/repo</a> - GitHub pages</li>
        <li><a href="/raw/owner/repo/main/file.txt">/raw/owner/repo/main/file.txt</a> - Raw files</li>
      </ul>
    </main>
  );
}
```

---

## Task 2: Create GitHub Web Pages Proxy API

**Files:**
- Create: `vercel/app/api/github/[...path]/route.ts`

- [ ] **Step 1: Create the route handler**

```typescript
import { NextRequest, NextResponse } from 'next/server';

const CLOUDFLARE_WORKER_URL = process.env.CLOUDFLARE_WORKER_URL;

export const runtime = 'edge';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const pathStr = path.join('/');
  
  if (!CLOUDFLARE_WORKER_URL) {
    return NextResponse.json(
      { error: 'Cloudflare Worker URL not configured' },
      { status: 500 }
    );
  }

  const targetUrl = `https://github.com/${pathStr}`;
  const forwardUrl = `${CLOUDFLARE_WORKER_URL}?url=${encodeURIComponent(targetUrl)}`;

  try {
    const response = await fetch(forwardUrl, {
      headers: {
        'User-Agent': request.headers.get('User-Agent') || 'GitHub-Proxy/1.0',
        'Accept': request.headers.get('Accept') || '*/*',
      },
    });

    const contentType = response.headers.get('Content-Type') || '';
    const body = await response.text();

    const resp = new NextResponse(body, {
      status: response.status,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': contentType.includes('text/html') 
          ? 'public, max-age=300'  // Short cache for HTML
          : 'public, max-age=604800',  // 7 days for static assets
        'X-Proxy': 'Vercel-Edge',
      },
    });

    return resp;
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch from GitHub' },
      { status: 502 }
    );
  }
}
```

---

## Task 3: Create Raw Files Proxy API

**Files:**
- Create: `vercel/app/api/raw/[...path]/route.ts`

- [ ] **Step 1: Create the route handler**

```typescript
import { NextRequest, NextResponse } from 'next/server';

const CLOUDFLARE_WORKER_URL = process.env.CLOUDFLARE_WORKER_URL;

export const runtime = 'edge';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const pathStr = path.join('/');
  
  if (!CLOUDFLARE_WORKER_URL) {
    return NextResponse.json(
      { error: 'Cloudflare Worker URL not configured' },
      { status: 500 }
    );
  }

  const targetUrl = `https://raw.githubusercontent.com/${pathStr}`;
  const forwardUrl = `${CLOUDFLARE_WORKER_URL}?url=${encodeURIComponent(targetUrl)}`;

  try {
    const response = await fetch(forwardUrl, {
      headers: {
        'User-Agent': request.headers.get('User-Agent') || 'GitHub-Proxy/1.0',
        'Accept': request.headers.get('Accept') || '*/*',
      },
    });

    const contentType = response.headers.get('Content-Type') || 'application/octet-stream';
    const body = await response.arrayBuffer();

    return new NextResponse(body, {
      status: response.status,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=604800',  // 7 days for raw files
        'X-Proxy': 'Vercel-Edge',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch from GitHub' },
      { status: 502 }
    );
  }
}
```

---

## Task 4: Create Cloudflare Worker

**Files:**
- Create: `cloudflare-worker/package.json`
- Create: `cloudflare-worker/wrangler.toml`
- Create: `cloudflare-worker/src/index.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "github-proxy-worker",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy"
  },
  "devDependencies": {
    "wrangler": "^3.0.0",
    "typescript": "^5.0.0"
  }
}
```

- [ ] **Step 2: Create wrangler.toml**

```toml
name = "github-proxy-worker"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[observability]
enabled = false
```

- [ ] **Step 3: Create Worker source**

```typescript
interface Env {
  GITHUB_TOKEN?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');

    if (!targetUrl) {
      return new Response('Missing url parameter', { status: 400 });
    }

    const cacheKey = `github-proxy:${targetUrl}`;
    const cache = caches.default;

    let response = await cache.match(cacheKey);
    if (response) {
      return new Response(response.body, {
        status: response.status,
        headers: {
          ...Object.fromEntries(response.headers.entries()),
          'X-Cache': 'HIT',
        },
      });
    }

    const headers: HeadersInit = {
      'User-Agent': 'GitHub-Proxy/1.0',
    };

    if (env.GITHUB_TOKEN) {
      headers['Authorization'] = `token ${env.GITHUB_TOKEN}`;
    }

    response = await fetch(targetUrl, { headers });

    const contentType = response.headers.get('Content-Type') || '';
    const isStaticAsset = /\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|map)$/i.test(targetUrl);

    const resp = new Response(response.body, {
      status: response.status,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': isStaticAsset 
          ? 'public, max-age=604800'  // 7 days for static assets
          : 'public, max-age=3600',   // 1 hour for HTML/JSON
        'X-Cache': 'MISS',
      },
    });

    if (response.ok) {
      await cache.put(cacheKey, resp.clone());
    }

    return resp;
  },
};
```

- [ ] **Step 4: Initialize Cloudflare Worker project**

```bash
cd cloudflare-worker
npm install
npm run deploy
```

Record the Worker URL after deployment (e.g., `https://github-proxy-worker.yuki.workers.dev`)

---

## Task 5: Configure Vercel Environment and Deploy

**Files:**
- Modify: `vercel/.env.local` (create)

- [ ] **Step 1: Create .env.local with Cloudflare Worker URL**

```
CLOUDFLARE_WORKER_URL=https://github-proxy-worker.yuki.workers.dev
```

Replace with actual Worker URL from Task 4.

- [ ] **Step 2: Deploy to Vercel**

```bash
cd vercel
npm install
npx vercel login
npx vercel
```

Follow prompts to deploy. Note the Vercel deployment URL.

---

## Task 6: Configure Custom Domain DNS

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Get Vercel deployment URL**

After deployment, note the Vercel URL (e.g., `github-proxy.vercel.app`)

- [ ] **Step 2: Add CNAME record in your DNS provider**

Add a CNAME record:
- Host: `gh` (or subdomain of your choice)
- Value: `cname.vercel-dns.com` (or the custom domain Vercel provides)
- TTL: 600 (10 minutes)

- [ ] **Step 3: Add domain in Vercel dashboard**

1. Go to Vercel Dashboard → Your Project → Settings → Domains
2. Add your custom domain (e.g., `gh.yourdomain.com`)
3. Vercel will provide verification instructions
4. Complete DNS verification

---

## Task 7: Update README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README**

```markdown
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

1. Deploy Cloudflare Worker: `cd cloudflare-worker && npm run deploy`
2. Deploy Vercel: `cd vercel && npx vercel`
3. Configure environment variable `CLOUDFLARE_WORKER_URL`
4. Set up custom domain in Vercel
5. Update DNS CNAME record

## Architecture

```
User → Vercel Edge → Cloudflare Worker (Cache) → GitHub
```

## Limits

- Vercel Free: 100GB/month bandwidth
- Cloudflare Workers Free: 100K requests/day
```

---

## Verification

- [ ] **Test GitHub pages proxy**: Visit `https://your-domain.com/vercel/next.js`
- [ ] **Test raw files proxy**: Visit `https://your-domain.com/raw/vercel/next.js/main/package.json`
- [ ] **Verify caching**: Check response headers for `X-Cache: HIT` on second request
