import { NextResponse } from "next/server";
import { readCanvasPageRegistry } from "@/content/canvas/pages";

function isLocalHost(host: string | null) {
  const hostname = host?.split(":")[0];
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export async function GET(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Page listing is disabled in production." }, { status: 403 });
  }

  if (!isLocalHost(request.headers.get("host"))) {
    return NextResponse.json({ error: "Page listing is local-only." }, { status: 403 });
  }

  const pages = await readCanvasPageRegistry();
  return NextResponse.json({ pages });
}
