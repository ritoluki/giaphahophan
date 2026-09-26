import { NextResponse } from "next/server";

export function GET() { return NextResponse.json({ data: { status: "ok" }, meta: { requestId: crypto.randomUUID() } }, { headers: { "Cache-Control": "no-store" } }); }
