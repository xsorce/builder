import { unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { canvasPageIndexPath, canvasPagesDir, normalizeCanvasSlug, readCanvasPageRegistry } from "@/content/canvas/pages";

const protectedSlugs = new Set([""]);

function isLocalHost(host: string | null) {
  const hostname = host?.split(":")[0];
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Page deletion is disabled in production." }, { status: 403 });
  }

  if (!isLocalHost(request.headers.get("host"))) {
    return NextResponse.json({ error: "Page deletion is local-only." }, { status: 403 });
  }

  const payload = (await request.json()) as { slug?: unknown };
  const slug = normalizeCanvasSlug(typeof payload.slug === "string" ? payload.slug : "");

  if (protectedSlugs.has(slug)) {
    return NextResponse.json({ error: "Protected page cannot be deleted." }, { status: 403 });
  }

  const registry = await readCanvasPageRegistry();
  const entry = registry.find((page) => page.slug === slug);

  if (!entry) {
    return NextResponse.json({ error: "Page not found." }, { status: 404 });
  }

  if (entry.file.includes("..") || path.isAbsolute(entry.file)) {
    return NextResponse.json({ error: "Invalid page file." }, { status: 400 });
  }

  const nextRegistry = registry.filter((page) => page.slug !== slug);

  await unlink(path.join(canvasPagesDir, entry.file));
  await writeFile(canvasPageIndexPath, `${JSON.stringify(nextRegistry, null, 2)}\n`, "utf8");

  return NextResponse.json({ ok: true, url: "/?edit=1" });
}
