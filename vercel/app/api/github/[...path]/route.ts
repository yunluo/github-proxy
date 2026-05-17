import { NextRequest, NextResponse } from "next/server";

const CLOUDFLARE_WORKER_URL = process.env.CLOUDFLARE_WORKER_URL;
const PROXY_DOMAIN = process.env.PROXY_DOMAIN || "";

export const runtime = "edge";

// 支持所有HTTP方法
export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } },
) {
  return handleRequest(request, params, "github");
}

export async function POST(
  request: NextRequest,
  { params }: { params: { path: string[] } },
) {
  return handleRequest(request, params, "github");
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { path: string[] } },
) {
  return handleRequest(request, params, "github");
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { path: string[] } },
) {
  return handleRequest(request, params, "github");
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { path: string[] } },
) {
  return handleRequest(request, params, "github");
}

export async function HEAD(
  request: NextRequest,
  { params }: { params: { path: string[] } },
) {
  return handleRequest(request, params, "github");
}

export async function OPTIONS(
  request: NextRequest,
  { params }: { params: { path: string[] } },
) {
  return handleRequest(request, params, "github");
}

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

  try {
    // 转发必要的请求头，过滤敏感信息
    const forwardHeaders = new Headers();
    const sensitiveHeaders = ["host", "cookie", "set-cookie", "authorization"];
    request.headers.forEach((value, key) => {
      if (!sensitiveHeaders.includes(key.toLowerCase())) {
        forwardHeaders.append(key, value);
      }
    });

    const response = await fetch(forwardUrl, {
      method: request.method,
      headers: forwardHeaders,
      body:
        request.method !== "GET" && request.method !== "HEAD"
          ? request.body
          : undefined,
      redirect: "manual", // 手动处理重定向
    });

    // 构建响应头
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
      }
    }

    // 添加自定义头
    responseHeaders.set("X-Proxy", "Vercel-Edge");

    // 设置缓存策略
    const contentType = responseHeaders.get("Content-Type") || "";
    if (type === "raw") {
      responseHeaders.set("Cache-Control", "public, max-age=604800");
    } else {
      responseHeaders.set(
        "Cache-Control",
        contentType.includes("text/html")
          ? "public, max-age=300"
          : "public, max-age=604800",
      );
    }

    return new NextResponse(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: `Failed to fetch from ${type === "github" ? "GitHub" : "Raw Content"}: ${(error as Error).message}`,
      },
      { status: 502 },
    );
  }
}
