import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import {
  canvasPageIndexPath,
  canvasPagesDir,
  isValidPageSlug,
  pageUrl,
  readCanvasPageRegistry,
} from "@/content/canvas/pages";
import type { CanvasDocument, CanvasItem } from "@/content/canvas";

const DEFAULT_DESKTOP_PAGE_HEIGHT = 810;

function isLocalHost(host: string | null) {
  const hostname = host?.split(":")[0];
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function getIndexLabel(registry: { slug: string; title: string }[]) {
  return (registry.find((page) => page.slug === "")?.title || "home").trim().toLowerCase() || "home";
}

function hasBackIndexLink(items: CanvasItem[]) {
  return items.some((item) => item.href === "/" && typeof item.text === "string" && item.text.toLowerCase().startsWith("back /"));
}

function withBackIndexLink(canvas: CanvasDocument, indexLabel: string): CanvasDocument {
  if (!canvas.slug || hasBackIndexLink(canvas.items)) {
    return canvas;
  }

  return {
    ...canvas,
    items: [
      {
        id: `back-index-${Date.now()}`,
        type: "link",
        text: `back / ${indexLabel}`,
        href: "/",
        x: 1188,
        y: 40,
        width: 200,
        height: 32,
        rotate: 0,
        zIndex: 100,
        opacity: 1,
        fontSize: 16,
        fontWeight: 500,
        fontFamily: "body",
        color: "#111111",
      },
      ...canvas.items,
    ],
  };
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Page creation is disabled in production." }, { status: 403 });
  }

  if (!isLocalHost(request.headers.get("host"))) {
    return NextResponse.json({ error: "Page creation is local-only." }, { status: 403 });
  }

  const payload = (await request.json()) as { title?: unknown; slug?: unknown; height?: unknown };
  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  const slug = typeof payload.slug === "string" ? payload.slug.trim() : "";
  const height = typeof payload.height === "number" && Number.isFinite(payload.height) ? Math.max(400, Math.min(10000, Math.round(payload.height))) : DEFAULT_DESKTOP_PAGE_HEIGHT;

  if (!title || !slug || slug.startsWith("/") || slug.includes("..") || !isValidPageSlug(slug)) {
    return NextResponse.json({ error: "Use a lowercase URL-safe title and slug." }, { status: 400 });
  }

  const registry = await readCanvasPageRegistry();

  if (registry.some((page) => page.slug === slug)) {
    return NextResponse.json({ error: "A page with this slug already exists." }, { status: 409 });
  }

  const file = `${slug}.json`;
  const targetPath = path.join(canvasPagesDir, file);

  if (existsSync(targetPath)) {
    return NextResponse.json({ error: "A page file with this slug already exists." }, { status: 409 });
  }

  const canvas = withBackIndexLink({ slug, title, height, items: [] }, getIndexLabel(registry));
  const nextRegistry = [...registry, { slug, title, file }];

  await writeFile(targetPath, `${JSON.stringify(canvas, null, 2)}\n`, "utf8");
  await writeFile(canvasPageIndexPath, `${JSON.stringify(nextRegistry, null, 2)}\n`, "utf8");

  return NextResponse.json({ ok: true, url: pageUrl(slug, true) });
}
