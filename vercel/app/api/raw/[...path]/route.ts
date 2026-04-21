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