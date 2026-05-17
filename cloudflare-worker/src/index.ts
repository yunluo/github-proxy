export interface Env {
  GITHUB_TOKEN?: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      const url = new URL(request.url);
      const targetUrl = url.searchParams.get('url');

      if (!targetUrl) {
        return new Response('Missing url parameter. This service is only used as a proxy backend, not for direct access.', { status: 400 });
      }

      // 域名白名单校验，防止SSRF攻击
      const allowedDomains = ['github.com', 'raw.githubusercontent.com', 'gist.githubusercontent.com'];
      const targetUrlObj = new URL(targetUrl);
      if (!allowedDomains.includes(targetUrlObj.hostname)) {
        return new Response('Invalid target domain', { status: 403 });
      }

      // 缓存key包含Accept头，避免返回错误的内容类型
      const acceptHeader = request.headers.get('Accept') || '';
      // 构造合法URL作为缓存Key
      const cacheUrl = new URL(targetUrl);
      cacheUrl.searchParams.set('accept', acceptHeader);
      const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' });
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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      };

      // 复制原请求的所有头，除了敏感信息
      request.headers.forEach((value, key) => {
        if (!['host', 'cookie', 'authorization'].includes(key.toLowerCase())) {
          headers[key] = value;
        }
      });

      // 仅当原请求没有Authorization头时才添加全局令牌，避免覆盖用户自己的令牌
      if (env.GITHUB_TOKEN && !request.headers.get('Authorization')) {
        headers['Authorization'] = `token ${env.GITHUB_TOKEN}`;
      }

      // 转发请求到GitHub
      const githubResponse = await fetch(targetUrl, {
        headers: headers,
        method: request.method,
        body: request.body,
        redirect: 'follow',
      });

      const contentType = githubResponse.headers.get('Content-Type') || 'application/octet-stream';

      // 仅当原响应没有Cache-Control时才设置默认缓存策略
      const respHeaders = new Headers(githubResponse.headers);
      if (!respHeaders.get('Cache-Control')) {
        const isStaticAsset = contentType.startsWith('image/') || contentType.startsWith('text/css') || contentType.startsWith('application/javascript') || contentType.startsWith('font/');
        respHeaders.set('Cache-Control', isStaticAsset
          ? 'public, max-age=604800'  // 7 days for static assets
          : 'public, max-age=3600',   // 1 hour for HTML/JSON
        );
      }
      respHeaders.set('X-Cache', 'MISS');
      respHeaders.set('X-Proxy', 'Cloudflare-Worker');

      // 移除安全限制头
      respHeaders.delete('x-frame-options');
      respHeaders.delete('content-security-policy');
      respHeaders.delete('content-security-policy-report-only');

      const resp = new Response(githubResponse.body, {
        status: githubResponse.status,
        headers: respHeaders,
      });

      // 缓存成功响应
      if (resp.status === 200) {
        ctx.waitUntil(cache.put(cacheKey, resp.clone()));
      }

      return resp;
    } catch (error) {
      // 全局错误捕获，返回友好提示
      return new Response(`Proxy Error: ${error instanceof Error ? error.message : String(error)}`, {
        status: 500,
        headers: {
          'Content-Type': 'text/plain',
        }
      });
    }
  }
} satisfies ExportedHandler<Env>;
