import { NextResponse } from "next/server";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { CanvasDocument, CanvasItem } from "@/content/canvas";
import { canvasPagesDir, normalizeCanvasSlug, readCanvasPageRegistry } from "@/content/canvas/pages";

function isLocalHost(host: string | null) {
  const hostname = host?.split(":")[0];
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function validNumber(value: unknown, min: number, max: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function isMobileOverride(value: unknown) {
  if (!value || typeof value !== "object") {
    return false;
  }

  const mobile = value as CanvasItem["mobile"];

  return (
    (mobile?.x === undefined || validNumber(mobile.x, -5000, 5000)) &&
    (mobile?.y === undefined || validNumber(mobile.y, -5000, 10000)) &&
    (mobile?.width === undefined || validNumber(mobile.width, 1, 5000)) &&
    (mobile?.height === undefined || validNumber(mobile.height, 1, 5000)) &&
    (mobile?.fontSize === undefined || validNumber(mobile.fontSize, 1, 5000))
  );
}

function isCanvasItem(value: unknown): value is CanvasItem {
  if (!value || typeof value !== "object") {
    return false;
  }

  const item = value as CanvasItem;
  const validType = ["text", "image", "video", "audio", "link", "symbol"].includes(item.type);

  return (
    typeof item.id === "string" &&
    validType &&
    validNumber(item.x, -5000, 5000) &&
    validNumber(item.y, -5000, 10000) &&
    validNumber(item.width, 1, 5000) &&
    (item.height === undefined || validNumber(item.height, 1, 5000)) &&
    validNumber(item.rotate, -360, 360) &&
    validNumber(item.zIndex, -10000, 10000) &&
    (item.opacity === undefined || validNumber(item.opacity, 0, 1)) &&
    (item.hidden === undefined || typeof item.hidden === "boolean") &&
    (item.locked === undefined || typeof item.locked === "boolean") &&
    (item.showTitle === undefined || typeof item.showTitle === "boolean") &&
    (item.showCaption === undefined || typeof item.showCaption === "boolean") &&
    (item.controls === undefined || typeof item.controls === "boolean") &&
    (item.muted === undefined || typeof item.muted === "boolean") &&
    (item.loop === undefined || typeof item.loop === "boolean") &&
    (item.autoPlay === undefined || typeof item.autoPlay === "boolean") &&
    (item.audioBackground === undefined || typeof item.audioBackground === "boolean") &&
    (item.autoFitText === undefined || typeof item.autoFitText === "boolean") &&
    (item.recolorColor === undefined || typeof item.recolorColor === "string") &&
    (item.recolorIntensity === undefined || validNumber(item.recolorIntensity, 0, 100)) &&
    (item.cropLeft === undefined || validNumber(item.cropLeft, 0, 80)) &&
    (item.cropTop === undefined || validNumber(item.cropTop, 0, 80)) &&
    (item.cropRight === undefined || validNumber(item.cropRight, 0, 80)) &&
    (item.cropBottom === undefined || validNumber(item.cropBottom, 0, 80)) &&
    (item.parallaxSpeed === undefined || validNumber(item.parallaxSpeed, -1, 1)) &&
    (item.fadeDelay === undefined || validNumber(item.fadeDelay, 0, 10)) &&
    (item.hoverEffect === undefined || ["none", "color", "lift", "drift", "glow", "focus", "float", "shock", "tilt"].includes(item.hoverEffect)) &&
    (item.idleEffect === undefined || ["none", "float", "breathe", "drift", "sway", "pulse"].includes(item.idleEffect)) &&
    (item.hoverStrength === undefined || validNumber(item.hoverStrength, 0, 12)) &&
    (item.idleStrength === undefined || validNumber(item.idleStrength, 0, 12)) &&
    (item.hoverColor === undefined || typeof item.hoverColor === "string") &&
    (item.mobile === undefined || isMobileOverride(item.mobile))
  );
}

function isCanvasDocument(value: unknown): value is CanvasDocument {
  if (!value || typeof value !== "object") {
    return false;
  }

  const document = value as CanvasDocument;

  return (
    typeof document.slug === "string" &&
    typeof document.title === "string" &&
    validNumber(document.height, 400, 10000) &&
    (document.mobileHeight === undefined || validNumber(document.mobileHeight, 400, 10000)) &&
    (document.backgroundColor === undefined || typeof document.backgroundColor === "string") &&
    (document.backgroundImage === undefined || typeof document.backgroundImage === "string") &&
    (document.backgroundImageOpacity === undefined || validNumber(document.backgroundImageOpacity, 0, 1)) &&
    (document.backgroundImageFit === undefined || ["cover", "contain", "tile", "stretch"].includes(document.backgroundImageFit)) &&
    (document.backgroundImageRecolorColor === undefined || typeof document.backgroundImageRecolorColor === "string") &&
    (document.backgroundImageRecolorIntensity === undefined || validNumber(document.backgroundImageRecolorIntensity, 0, 100)) &&
    (document.password === undefined || typeof document.password === "string") &&
    Array.isArray(document.items) &&
    document.items.every(isCanvasItem)
  );
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Canvas saving is disabled in production." }, { status: 403 });
  }

  if (!isLocalHost(request.headers.get("host"))) {
    return NextResponse.json({ error: "Canvas saving is local-only." }, { status: 403 });
  }

  const payload = (await request.json()) as unknown;
  const canvas = isCanvasDocument(payload) ? payload : (payload as { canvas?: unknown }).canvas;
  const slug = normalizeCanvasSlug((payload as { slug?: string }).slug ?? (canvas as CanvasDocument | undefined)?.slug ?? "");

  if (!isCanvasDocument(canvas)) {
    return NextResponse.json({ error: "Invalid canvas payload." }, { status: 400 });
  }

  const registry = await readCanvasPageRegistry();
  const entry = registry.find((page) => page.slug === slug);

  if (!entry || entry.file.includes("..") || path.isAbsolute(entry.file)) {
    return NextResponse.json({ error: "Unknown page slug." }, { status: 404 });
  }

  const nextCanvas = { ...canvas, slug };
  await writeFile(path.join(canvasPagesDir, entry.file), `${JSON.stringify(nextCanvas, null, 2)}\n`, "utf8");

  return NextResponse.json({ ok: true });
}
