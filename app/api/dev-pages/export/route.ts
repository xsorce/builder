import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { canvasPagesDir, readCanvasPageRegistry } from "@/content/canvas/pages";
import type { CanvasDocument } from "@/content/canvas";

function isLocalHost(host: string | null) {
  const hostname = host?.split(":")[0];
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export async function GET(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Project export is disabled in production." }, { status: 403 });
  }

  if (!isLocalHost(request.headers.get("host"))) {
    return NextResponse.json({ error: "Project export is local-only." }, { status: 403 });
  }

  const registry = await readCanvasPageRegistry();
  const pages = await Promise.all(
    registry.map(async (page) => {
      if (page.file.includes("..") || path.isAbsolute(page.file)) {
        throw new Error("Invalid page file.");
      }

      const canvas = JSON.parse(await readFile(path.join(canvasPagesDir, page.file), "utf8")) as CanvasDocument;
      return { ...page, canvas };
    }),
  );

  return NextResponse.json({
    type: "web-builder-project",
    version: 1,
    exportedAt: new Date().toISOString(),
    currentSlug: "",
    pages,
  });
}
