import { NextRequest, NextResponse } from "next/server";

const CLOUDFLARE_WORKER_URL = process.env.CLOUDFLARE_WORKER_URL;

export const runtime = "edge";

// 处理/assets/**路径，代理到github.githubassets.com
async function handleAssetRequest(
  request: NextRequest,
  { params }: { params: { path: string[] } },
) {
  if (!CLOUDFLARE_WORKER_URL) {
    return NextResponse.json(
      { error: "Cloudflare Worker URL not configured" },
      { status: 500 },
    );
  }

  const { path } = params;
  const pathStr = path.join("/");
  const searchParams = request.nextUrl.searchParams.toString();
  const fullPath = searchParams ? `${pathStr}?${searchParams}` : pathStr;

  // 构造目标GitHub静态资源地址
  const targetUrl = `https://github.githubassets.com/${fullPath}`;
  const forwardUrl = `${CLOUDFLARE_WORKER_URL}?url=${encodeURIComponent(targetUrl)}`;

  // 转发请求头
  const forwardHeaders = new Headers();
  request.headers.forEach((value, key) => {
    if (!["host", "cookie", "authorization"].includes(key.toLowerCase())) {
      forwardHeaders.append(key, value);
    }
  });

  try {
    const response = await fetch(forwardUrl, {
      method: request.method,
      headers: forwardHeaders,
      cache: "force-cache",
    });

    const responseHeaders = new Headers(response.headers);
    // 静态资源设置超长缓存
    responseHeaders.set("Cache-Control", "public, max-age=2592000, immutable"); // 30天
    responseHeaders.set("X-Proxy-Asset", "GitHub-Assets");
    responseHeaders.delete("content-security-policy");

    return new NextResponse(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch asset", details: error instanceof Error ? error.message : String(error) },
      { status: 502 },
    );
  }
}

// 支持所有HTTP方法
export async function GET(request: NextRequest, { params }: { params: { path: string[] } }) {
  return handleAssetRequest(request, { params });
}

export async function HEAD(request: NextRequest, { params }: { params: { path: string[] } }) {
  return handleAssetRequest(request, { params });
}
