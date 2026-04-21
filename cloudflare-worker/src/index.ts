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