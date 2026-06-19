import { existsSync } from "node:fs";
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import {
  canvasPageIndexPath,
  canvasPagesDir,
  isValidPageSlug,
  normalizeCanvasSlug,
  pageUrl,
  readCanvasPageRegistry,
} from "@/content/canvas/pages";
import type { CanvasDocument, CanvasItem } from "@/content/canvas";

const protectedSlugs = new Set([""]);

function isLocalHost(host: string | null) {
  const hostname = host?.split(":")[0];
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function filePath(file: string) {
  return path.join(canvasPagesDir, file);
}

function updateHref(href: string | undefined, oldSlug: string, newSlug: string) {
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || /^[a-z][a-z0-9+.-]*:\/\//i.test(href)) {
    return href;
  }

  const oldPath = oldSlug ? `/${oldSlug}` : "/";
  const newPath = newSlug ? `/${newSlug}` : "/";
  const match = href.match(/^\/?([^?#]*)([?#].*)?$/);

  if (!match) {
    return href;
  }

  const pathPart = match[1] ? `/${match[1].replace(/^\/+|\/+$/g, "")}` : "/";
  if (pathPart !== oldPath) {
    return href;
  }

  return `${newPath}${match[2] ?? ""}`;
}

function updateCanvasLinks(canvas: CanvasDocument, oldSlug: string, newSlug: string) {
  let changed = false;
  const items = canvas.items.map((item: CanvasItem) => {
    const href = updateHref(item.href, oldSlug, newSlug);
    if (href === item.href) {
      return item;
    }

    changed = true;
    return { ...item, href };
  });

  return changed ? { ...canvas, items } : canvas;
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Page updates are disabled in production." }, { status: 403 });
  }

  if (!isLocalHost(request.headers.get("host"))) {
    return NextResponse.json({ error: "Page updates are local-only." }, { status: 403 });
  }

  const payload = (await request.json()) as { oldSlug?: unknown; title?: unknown; slug?: unknown };
  const oldSlug = normalizeCanvasSlug(typeof payload.oldSlug === "string" ? payload.oldSlug : "");
  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  const newSlug = normalizeCanvasSlug(typeof payload.slug === "string" ? payload.slug.trim() : "");

  if (!title || newSlug.startsWith("/") || newSlug.includes("..") || !isValidPageSlug(newSlug)) {
    return NextResponse.json({ error: "Use a lowercase URL-safe title and slug." }, { status: 400 });
  }

  if (protectedSlugs.has(oldSlug) && newSlug !== oldSlug) {
    return NextResponse.json({ error: "Protected slugs can't be changed." }, { status: 400 });
  }

  const registry = await readCanvasPageRegistry();
  const entry = registry.find((page) => page.slug === oldSlug);

  if (!entry || entry.file.includes("..") || path.isAbsolute(entry.file)) {
    return NextResponse.json({ error: "Page not found." }, { status: 404 });
  }

  if (registry.some((page) => page.slug === newSlug && page.slug !== oldSlug)) {
    return NextResponse.json({ error: "A page with this slug already exists." }, { status: 409 });
  }

  const oldPath = filePath(entry.file);
  const nextFile = newSlug === oldSlug ? entry.file : `${newSlug}.json`;
  const nextPath = filePath(nextFile);

  if (newSlug !== oldSlug && existsSync(nextPath)) {
    return NextResponse.json({ error: "A page file with this slug already exists." }, { status: 409 });
  }

  const canvas = { ...(JSON.parse(await readFile(oldPath, "utf8")) as CanvasDocument), slug: newSlug, title };
  const nextRegistry = registry.map((page) => (page.slug === oldSlug ? { slug: newSlug, title, file: nextFile } : page));

  if (newSlug !== oldSlug) {
    await rename(oldPath, nextPath);
  }

  for (const page of nextRegistry) {
    const targetPath = filePath(page.file);
    const pageCanvas = page.slug === newSlug ? canvas : (JSON.parse(await readFile(targetPath, "utf8")) as CanvasDocument);
    const nextCanvas = newSlug === oldSlug ? pageCanvas : updateCanvasLinks(pageCanvas, oldSlug, newSlug);

    if (page.slug === newSlug || nextCanvas !== pageCanvas) {
      await writeFile(targetPath, `${JSON.stringify(nextCanvas, null, 2)}\n`, "utf8");
    }
  }

  await writeFile(canvasPageIndexPath, `${JSON.stringify(nextRegistry, null, 2)}\n`, "utf8");

  return NextResponse.json({ ok: true, url: pageUrl(newSlug, true) });
}
