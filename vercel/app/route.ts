import { NextRequest } from "next/server";
import { handleRequest } from "./lib/proxy";

export const runtime = "edge";

// 处理根路径请求，直接代理GitHub首页
export async function GET(request: NextRequest) {
  return handleRequest(request, { params: { path: [] } }, "github");
}

export async function POST(request: NextRequest) {
  return handleRequest(request, { params: { path: [] } }, "github");
}

export async function PUT(request: NextRequest) {
  return handleRequest(request, { params: { path: [] } }, "github");
}

export async function DELETE(request: NextRequest) {
  return handleRequest(request, { params: { path: [] } }, "github");
}

export async function PATCH(request: NextRequest) {
  return handleRequest(request, { params: { path: [] } }, "github");
}

export async function HEAD(request: NextRequest) {
  return handleRequest(request, { params: { path: [] } }, "github");
}

export async function OPTIONS(request: NextRequest) {
  return handleRequest(request, { params: { path: [] } }, "github");
}
