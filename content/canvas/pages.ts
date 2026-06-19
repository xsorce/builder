import { readFile } from "node:fs/promises";
import path from "node:path";
import type { CanvasDocument, CanvasPageRegistryEntry } from "@/types/canvas";

export const canvasPagesDir = path.join(process.cwd(), "content", "canvas", "pages");
export const canvasPageIndexPath = path.join(canvasPagesDir, "index.json");

export function normalizeCanvasSlug(slug: string) {
  return slug === "home" ? "" : slug.replace(/^\/+|\/+$/g, "");
}

export function pageUrl(slug: string, edit = false) {
  const normalized = normalizeCanvasSlug(slug);
  return `${normalized ? `/${normalized}` : "/"}${edit ? "?edit=1" : ""}`;
}

export function isValidPageSlug(slug: string) {
  return slug === "" || /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

export async function readCanvasPageRegistry() {
  const text = await readFile(canvasPageIndexPath, "utf8");
  const registry = JSON.parse(text) as CanvasPageRegistryEntry[];
  return registry;
}

export async function readCanvasPage(slug: string) {
  const normalized = normalizeCanvasSlug(slug);
  const registry = await readCanvasPageRegistry();
  const entry = registry.find((page) => page.slug === normalized);

  if (!entry || entry.file.includes("..") || path.isAbsolute(entry.file)) {
    return null;
  }

  const text = await readFile(path.join(canvasPagesDir, entry.file), "utf8");
  return JSON.parse(text) as CanvasDocument;
}
