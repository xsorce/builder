import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
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

function isLocalHost(host: string | null) {
  const hostname = host?.split(":")[0];
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Page duplication is disabled in production." }, { status: 403 });
  }

  if (!isLocalHost(request.headers.get("host"))) {
    return NextResponse.json({ error: "Page duplication is local-only." }, { status: 403 });
  }

  const payload = (await request.json()) as { fromSlug?: unknown; title?: unknown; slug?: unknown };
  const fromSlug = normalizeCanvasSlug(typeof payload.fromSlug === "string" ? payload.fromSlug : "");

  const registry = await readCanvasPageRegistry();
  const source = registry.find((page) => page.slug === fromSlug);

  if (!source) {
    return NextResponse.json({ error: "Source page not found." }, { status: 404 });
  }

  const sourceTitle = source.title || (source.slug ? source.slug : "Home");
  const requestedTitle = typeof payload.title === "string" ? payload.title.trim() : "";
  const requestedSlug = typeof payload.slug === "string" ? payload.slug.trim() : "";
  const title = requestedTitle || `${sourceTitle} Copy`;
  const baseSlug = requestedSlug || `${source.slug || "home"}-copy`;
  const slug = uniqueSlug(baseSlug, registry.map((page) => page.slug));

  if (!title || slug.startsWith("/") || slug.includes("..") || !isValidPageSlug(slug)) {
    return NextResponse.json({ error: "Use a lowercase URL-safe title and slug." }, { status: 400 });
  }

  if (registry.some((page) => page.slug === slug)) {
    return NextResponse.json({ error: "A page with this slug already exists." }, { status: 409 });
  }

  const file = `${slug}.json`;
  const targetPath = path.join(canvasPagesDir, file);

  if (existsSync(targetPath)) {
    return NextResponse.json({ error: "A page file with this slug already exists." }, { status: 409 });
  }

  const sourceText = await readFile(path.join(canvasPagesDir, source.file), "utf8");
  const canvas = { ...JSON.parse(sourceText), slug, title };
  const nextRegistry = [...registry, { slug, title, file }];

  await writeFile(targetPath, `${JSON.stringify(canvas, null, 2)}\n`, "utf8");
  await writeFile(canvasPageIndexPath, `${JSON.stringify(nextRegistry, null, 2)}\n`, "utf8");

  return NextResponse.json({ ok: true, url: pageUrl(slug, true) });
}

function uniqueSlug(baseSlug: string, existingSlugs: string[]) {
  const sanitized = baseSlug
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  let candidate = sanitized || "page-copy";
  let index = 2;

  while (existingSlugs.includes(candidate) || existsSync(path.join(canvasPagesDir, `${candidate}.json`))) {
    candidate = `${sanitized || "page-copy"}-${index}`;
    index += 1;
  }

  return candidate;
}
