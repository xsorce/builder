import { NextResponse } from "next/server";
import { isLocalHost } from "../shared";
import { mergeProjectFolders, sanitizeProjectFolder } from "../project-folders";

const oldProjectsPrefix = `/${"projects"}`;

function sanitizeFolderName(name: string) {
  return sanitizeProjectFolder(name);
}

function rewriteAssetPaths(value: unknown, oldFolder: string, nextFolder: string, replacements: Map<string, string>): unknown {
  if (typeof value === "string") {
    return replacements.get(value) ?? value.replaceAll(`${oldProjectsPrefix}/${oldFolder}/`, `/${nextFolder}/`).replaceAll(`/${oldFolder}/`, `/${nextFolder}/`);
  }

  if (Array.isArray(value)) {
    return value.map((item) => rewriteAssetPaths(item, oldFolder, nextFolder, replacements));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewriteAssetPaths(item, oldFolder, nextFolder, replacements)]));
  }

  return value;
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Project asset rename is disabled in production." }, { status: 403 });
  }

  if (!isLocalHost(request.headers.get("host"))) {
    return NextResponse.json({ error: "Project asset rename is local-only." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { oldFolder?: unknown; nextName?: unknown; project?: unknown } | null;
  const oldFolder = typeof body?.oldFolder === "string" ? sanitizeFolderName(body.oldFolder) : "";
  const nextName = typeof body?.nextName === "string" ? body.nextName : "";

  if (!oldFolder || !nextName) {
    return NextResponse.json({ error: "Missing project folder rename data." }, { status: 400 });
  }

  const merged = await mergeProjectFolders(oldFolder, nextName);
  const nextFolder = merged.folder;

  return NextResponse.json({
    assetFolder: nextFolder,
    assetBasePath: `/${nextFolder}`,
    project: rewriteAssetPaths(body?.project, oldFolder, nextFolder, merged.replacements),
  });
}
