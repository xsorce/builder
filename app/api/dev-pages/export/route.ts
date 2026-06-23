import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { canvasPagesDir, readCanvasPageRegistry } from "@/content/canvas/pages";
import type { CanvasDocument } from "@/content/canvas";

export async function GET() {
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
