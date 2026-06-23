import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import type { AssetFile } from "@/types/canvas";
import { assetConfig, getProjectAssetDirectory, isAssetKind } from "../shared";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const kind = searchParams.get("kind");
  const projectFolder = searchParams.get("projectFolder");

  if (!isAssetKind(kind)) {
    return NextResponse.json({ error: "Invalid asset kind." }, { status: 400 });
  }

  const config = assetConfig[kind];
  const target = getProjectAssetDirectory(kind, projectFolder);
  if (!target) {
    return NextResponse.json({ error: "Invalid project asset folder." }, { status: 400 });
  }

  const { directory, publicPath } = target;
  await mkdir(directory, { recursive: true });

  const entries = await readdir(directory, { withFileTypes: true });
  const files: AssetFile[] = entries
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const ext = path.extname(entry.name).toLowerCase();
      return {
        name: entry.name,
        src: `${publicPath}/${entry.name}`,
        ext,
        kind: config.kind,
        warning: ext === ".avi" ? "AVI may not preview in all browsers. Convert to MP4/WebM for reliable playback." : undefined,
      };
    })
    .filter((file) => config.extensions.has(file.ext))
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json(files);
}
