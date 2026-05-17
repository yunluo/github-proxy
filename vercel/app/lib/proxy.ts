import { NextRequest, NextResponse } from "next/server";

const CLOUDFLARE_WORKER_URL = process.env.CLOUDFLARE_WORKER_URL;
const PROXY_DOMAIN = process.env.PROXY_DOMAIN;

export async function handleRequest(
  request: NextRequest,
  { params }: { params: { path: string[] } },
  type: "github" | "raw" | "gist",
) {
  const { path } = params;
  const pathStr = path.join("/");
  const searchParams = request.nextUrl.searchParams.toString();
  const fullPath = searchParams ? `${pathStr}?${searchParams}` : pathStr;

  if (!CLOUDFLARE_WORKER_URL) {
    return NextResponse.json(
      { error: "Cloudflare Worker URL not configured" },
      { status: 500 },
    );
  }

  let targetUrl: string;
  if (type === "github") {
    targetUrl = `https://github.com/${fullPath}`;
  } else if (type === "raw") {
    targetUrl = `https://raw.githubusercontent.com/${fullPath}`;
  } else { // gist
    targetUrl = `https://gist.githubusercontent.com/${fullPath}`;
  }
  const forwardUrl = `${CLOUDFLARE_WORKER_URL}?url=${encodeURIComponent(targetUrl)}`;

  // 转发必要的请求头，过滤敏感信息
  const forwardHeaders = new Headers();
  const sensitiveHeaders = ["host", "cookie", "set-cookie", "authorization"];
  request.headers.forEach((value, key) => {
    if (!sensitiveHeaders.includes(key.toLowerCase())) {
      forwardHeaders.append(key, value);
    }
  });

  try {
    const response = await fetch(forwardUrl, {
      method: request.method,
      headers: forwardHeaders,
      body: (request.method !== 'GET' && request.method !== 'HEAD') ? request.body : undefined,
      cache: "default",
    });

    const responseHeaders = new Headers(response.headers);

    // 替换重定向地址为代理域名
    const location = responseHeaders.get("location");
    if (location && PROXY_DOMAIN) {
      if (location.startsWith("https://github.com/")) {
        const newLocation = location.replace(
          "https://github.com/",
          `https://${PROXY_DOMAIN}/`,
        );
        responseHeaders.set("location", newLocation);
      } else if (location.startsWith("https://raw.githubusercontent.com/")) {
        const newLocation = location.replace(
          "https://raw.githubusercontent.com/",
          `https://${PROXY_DOMAIN}/api/raw/`,
        );
        responseHeaders.set("location", newLocation);
      } else if (location.startsWith("https://gist.githubusercontent.com/")) {
        const newLocation = location.replace(
          "https://gist.githubusercontent.com/",
          `https://${PROXY_DOMAIN}/api/gist/`,
        );
        responseHeaders.set("location", newLocation);
      } else if (location.startsWith("https://github.githubassets.com/")) {
        // 静态资源直接走Worker代理
        const forwardUrl = `${CLOUDFLARE_WORKER_URL}?url=${encodeURIComponent(location)}`;
        responseHeaders.set("location", forwardUrl);
      } else if (location.startsWith("https://api.github.com/")) {
        // API请求直接走Worker代理
        const forwardUrl = `${CLOUDFLARE_WORKER_URL}?url=${encodeURIComponent(location)}`;
        responseHeaders.set("location", forwardUrl);
      }
    }

    // 安全头设置
    responseHeaders.set("X-Proxy", "Vercel-Edge");
    responseHeaders.delete("x-frame-options"); // 允许嵌入iframe
    responseHeaders.delete("content-security-policy"); // 移除GitHub的CSP限制
    responseHeaders.delete("content-security-policy-report-only");

    // 缓存控制
    const contentType = responseHeaders.get("Content-Type") || "";
    if (type === "raw" || contentType.startsWith("image/") || contentType.startsWith("text/css") || contentType.startsWith("application/javascript")) {
      responseHeaders.set("Cache-Control", "public, max-age=604800"); // 7 days
    } else if (contentType.startsWith("text/html")) {
      responseHeaders.set("Cache-Control", "public, max-age=300"); // 5 minutes for HTML
    }

    // 重写HTML内容中的GitHub域名，替换为代理地址
    if (contentType.includes("text/html") && response.body && PROXY_DOMAIN && CLOUDFLARE_WORKER_URL) {
      const text = await response.text();
      // 替换所有github.com链接
      let modified = text.replace(/https:\/\/github\.com\//g, `https://${PROXY_DOMAIN}/`);
      // 替换raw.githubusercontent.com链接
      modified = modified.replace(/https:\/\/raw\.githubusercontent\.com\//g, `https://${PROXY_DOMAIN}/api/raw/`);
      // 替换gist.githubusercontent.com链接
      modified = modified.replace(/https:\/\/gist\.githubusercontent\.com\//g, `https://${PROXY_DOMAIN}/api/gist/`);
      // 替换github.githubassets.com静态资源链接，直接走Worker代理
      modified = modified.replace(/https:\/\/github\.githubassets\.com\//g, `${CLOUDFLARE_WORKER_URL}?url=https://github.githubassets.com/`);
      // 替换api.github.com接口链接，直接走Worker代理
      modified = modified.replace(/https:\/\/api\.github\.com\//g, `${CLOUDFLARE_WORKER_URL}?url=https://api.github.com/`);

      // 更新Content-Length头
      responseHeaders.set("Content-Length", Buffer.byteLength(modified).toString());

      return new NextResponse(modified, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    }

    return new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch from GitHub", details: error instanceof Error ? error.message : String(error) },
      { status: 502 },
    );
  }
}
