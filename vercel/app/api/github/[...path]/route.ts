import { NextRequest } from "next/server";
import { handleRequest } from "../../../lib/proxy";

export const runtime = "edge";

// 支持所有HTTP方法
export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } },
) {
  return handleRequest(request, { params }, "github");
}

export async function POST(
  request: NextRequest,
  { params }: { params: { path: string[] } },
) {
  return handleRequest(request, { params }, "github");
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { path: string[] } },
) {
  return handleRequest(request, { params }, "github");
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { path: string[] } },
) {
  return handleRequest(request, { params }, "github");
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { path: string[] } },
) {
  return handleRequest(request, { params }, "github");
}

export async function HEAD(
  request: NextRequest,
  { params }: { params: { path: string[] } },
) {
  return handleRequest(request, { params }, "github");
}

export async function OPTIONS(
  request: NextRequest,
  { params }: { params: { path: string[] } },
) {
  return handleRequest(request, { params }, "github");
}
