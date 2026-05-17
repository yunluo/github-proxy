# GitHub Proxy Design

## Overview

A GitHub proxy service using Vercel and Cloudflare to accelerate access to public GitHub repositories for users in regions with slow GitHub access.

## Architecture

```
User Request
    ↓
Your Domain → Vercel Edge Functions
    ↓
Cloudflare (Cache Layer) → GitHub
    ↓
Response
```

## Routing

| Route | Purpose |
|-------|---------|
| `/:owner/:repo/*` | GitHub Web Pages (github.com/*) |
| `raw/:owner/:repo/*` | Raw Files (raw.githubusercontent.com/*) |

## Caching Strategy

- **Cloudflare**: Cache static assets (JS/CSS/images), TTL = 7 days
- **Vercel**: Forward request headers, no server-side caching

## Technical Stack

- **Vercel**: Next.js + Edge Functions
- **Cloudflare**: Free Worker + Cache API
- **Deployment**: Vercel CLI

## Constraints

- **Vercel Free Tier**: 100GB bandwidth/month
- **Cloudflare Workers**: 100K requests/day, CPU ≤10ms/request
- Higher cache hit rate = less bandwidth consumption

## Scope

- Public repositories only
- No GitHub authentication required
- No private repository support

## Implementation Steps

1. Create Next.js project with Vercel
2. Configure Cloudflare Worker for caching
3. Implement Edge Functions for routing
4. Configure domain DNS
5. Deploy and test
