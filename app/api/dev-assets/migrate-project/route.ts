import { copyFile, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { isLocalHost } from "../shared";

const mediaFolders = ["images", "videos", "audio"] as const;
const mediaByRoot = new Map(mediaFolders.map((folder) => [`/${folder}/`, folder]));
const oldProjectsPrefix = `/${"projects"}/`;
const generatedStarterFiles = new Map([
  ["images", new Set(["background1.jpg", "default-image.png", "typing.gif", "xsorce.png"])],
  ["videos", new Set(["hi.mp4"])],
  ["audio", new Set(["enough.mp3"])],
]);

function sanitizeFolderName(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "project"
  );
}

async function exists(filePath: string) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function uniqueFilename(directory: string, filename: string) {
  const parsed = path.parse(filename);
  let candidate = filename;
  let index = 2;

  while (await exists(path.join(directory, candidate))) {
    candidate = `${parsed.name}-${index}${parsed.ext}`;
    index += 1;
  }

  return candidate;
}

function collectAssetUrls(value: unknown, urls = new Set<string>()) {
  if (typeof value === "string") {
    if ([...mediaByRoot.keys()].some((prefix) => value.startsWith(prefix)) || value.startsWith(oldProjectsPrefix)) {
      urls.add(value);
    }
    return urls;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectAssetUrls(item, urls));
    return urls;
  }

  if (value && typeof value === "object") {
    Object.values(value).forEach((item) => collectAssetUrls(item, urls));
  }

  return urls;
}

function rewriteUrls(value: unknown, replacements: Map<string, string>): unknown {
  if (typeof value === "string") {
    return replacements.get(value) ?? value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => rewriteUrls(item, replacements));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewriteUrls(item, replacements)]));
  }

  return value;
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Project asset migration is disabled in production." }, { status: 403 });
  }

  if (!isLocalHost(request.headers.get("host"))) {
    return NextResponse.json({ error: "Project asset migration is local-only." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { assetFolder?: unknown; cleanGeneratedFiles?: unknown; project?: unknown } | null;
  const assetFolder = typeof body?.assetFolder === "string" ? sanitizeFolderName(body.assetFolder) : "";

  if (!assetFolder || !body?.project) {
    return NextResponse.json({ error: "Missing project asset migration data." }, { status: 400 });
  }

  const publicDir = path.join(process.cwd(), "public");
  const replacements = new Map<string, string>();

  await Promise.all(mediaFolders.map((folder) => mkdir(path.join(publicDir, assetFolder, folder), { recursive: true })));
  if (body.cleanGeneratedFiles === true) {
    await Promise.all(
      mediaFolders.flatMap((folder) =>
        Array.from(generatedStarterFiles.get(folder) ?? []).map((filename) => rm(path.join(publicDir, assetFolder, folder, filename), { force: true })),
      ),
    );
  }

  for (const src of collectAssetUrls(body.project)) {
    const rootPrefix = [...mediaByRoot.keys()].find((prefix) => src.startsWith(prefix));
    const projectParts = src.startsWith(oldProjectsPrefix) ? src.slice(1).split("/") : [];
    const projectFolder = mediaFolders.find((folder) => projectParts[2] === folder);
    const folder = rootPrefix ? mediaByRoot.get(rootPrefix) : projectFolder;
    const relativeName = rootPrefix ? src.slice(rootPrefix.length) : projectFolder ? projectParts.slice(3).join("/") : "";

    if (!folder || !relativeName) {
      continue;
    }

    const sourcePath = rootPrefix ? path.join(publicDir, folder, relativeName) : path.join(publicDir, "projects", ...projectParts.slice(1));
    if (!(await exists(sourcePath))) {
      continue;
    }

    const targetDirectory = path.join(publicDir, assetFolder, folder);
    await mkdir(targetDirectory, { recursive: true });
    const finalName = (await exists(path.join(targetDirectory, path.basename(relativeName)))) ? await uniqueFilename(targetDirectory, path.basename(relativeName)) : path.basename(relativeName);
    await copyFile(sourcePath, path.join(targetDirectory, finalName));
    replacements.set(src, `/${assetFolder}/${folder}/${finalName}`);
  }

  return NextResponse.json({
    assetBasePath: `/${assetFolder}`,
    project: rewriteUrls(body.project, replacements),
  });
}
