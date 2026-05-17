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

    // 域名白名单校验，防止SSRF攻击
    const allowedDomains = ['github.com', 'raw.githubusercontent.com', 'gist.githubusercontent.com'];
    const targetUrlObj = new URL(targetUrl);
    if (!allowedDomains.includes(targetUrlObj.hostname)) {
      return new Response('Invalid target domain', { status: 403 });
    }

    // 缓存key包含Accept头，避免返回错误的内容类型
    const acceptHeader = request.headers.get('Accept') || '';
    const cacheKey = `github-proxy:${targetUrl}:${acceptHeader}`;
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

    // 仅当原请求没有Authorization头时才添加全局令牌，避免覆盖用户自己的令牌
    if (env.GITHUB_TOKEN && !request.headers.get('Authorization')) {
      headers['Authorization'] = `token ${env.GITHUB_TOKEN}`;
    }

    response = await fetch(targetUrl, { headers });

    const contentType = response.headers.get('Content-Type') || '';
    const isStaticAsset = /\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|map)$/i.test(targetUrl);

    const respHeaders = new Headers(response.headers);
    respHeaders.set('Content-Type', contentType);
    // 仅当原响应没有Cache-Control时才设置默认缓存策略
    if (!respHeaders.get('Cache-Control')) {
      respHeaders.set('Cache-Control', isStaticAsset
        ? 'public, max-age=604800'  // 7 days for static assets
        : 'public, max-age=3600',   // 1 hour for HTML/JSON
      );
    }
    respHeaders.set('X-Cache', 'MISS');

    const resp = new Response(response.body, {
      status: response.status,
      headers: respHeaders,
    });

    if (response.ok) {
      await cache.put(cacheKey, resp.clone());
    }

    return resp;
  },
};