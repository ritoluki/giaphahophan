import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json(
    { data: { status: "degraded" }, meta: { requestId: crypto.randomUUID() } },
    { status: 503, headers: { "Cache-Control": "no-store" } }
  );
}
