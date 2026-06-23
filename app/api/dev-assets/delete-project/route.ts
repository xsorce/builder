import { NextResponse } from "next/server";
import { isLocalHost } from "../shared";
import { cleanupOrphanProjectFolders, removeProjectFolder, sanitizeProjectFolder } from "../project-folders";

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Project asset deletion is disabled in production." }, { status: 403 });
  }

  if (!isLocalHost(request.headers.get("host"))) {
    return NextResponse.json({ error: "Project asset deletion is local-only." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { assetFolder?: unknown; activeFolders?: unknown } | null;
  const assetFolder = typeof body?.assetFolder === "string" ? sanitizeProjectFolder(body.assetFolder) : "";
  const activeFolders = Array.isArray(body?.activeFolders) ? body.activeFolders.filter((folder): folder is string => typeof folder === "string") : [];

  if (!assetFolder) {
    return NextResponse.json({ error: "Missing project folder deletion data." }, { status: 400 });
  }

  try {
    const deleted = await removeProjectFolder(assetFolder);
    const cleaned = activeFolders.length ? await cleanupOrphanProjectFolders(activeFolders) : [];
    return NextResponse.json({ deleted, cleaned });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Project folder cleanup failed." }, { status: 500 });
  }
}
