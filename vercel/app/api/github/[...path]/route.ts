import { NextRequest, NextResponse } from 'next/server';

const CLOUDFLARE_WORKER_URL = process.env.CLOUDFLARE_WORKER_URL;

export const runtime = 'edge';

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const { path } = params;
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