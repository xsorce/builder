import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { assetConfig, getAssetDirectory, isAssetKind, isLocalHost, sanitizeFilename } from "../shared";

const maxSizeLabelByKind = {
  images: "image size is 10 MB",
  shapes: "shape size is 2 MB",
  audio: "audio size is 50 MB",
  videos: "video size is 150 MB",
} as const;

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
  let index = 1;

  while (await exists(path.join(directory, candidate))) {
    candidate = `${parsed.name}-${index}${parsed.ext}`;
    index += 1;
  }

  return candidate;
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Asset upload is disabled in production." }, { status: 403 });
  }

  if (!isLocalHost(request.headers.get("host"))) {
    return NextResponse.json({ error: "Asset upload is local-only." }, { status: 403 });
  }

  const formData = await request.formData();
  const kind = formData.get("kind");
  const file = formData.get("file");

  if (!isAssetKind(kind) || !(file instanceof File)) {
    return NextResponse.json({ error: "Missing file or invalid asset kind." }, { status: 400 });
  }

  const config = assetConfig[kind];
  const safeName = sanitizeFilename(file.name);
  const ext = path.extname(safeName).toLowerCase();

  if (!config.extensions.has(ext)) {
    return NextResponse.json({ error: `Unsupported ${kind} extension.` }, { status: 400 });
  }

  if (file.size > config.maxBytes) {
    return NextResponse.json({ error: `File too large. Max ${maxSizeLabelByKind[kind]}.` }, { status: 413 });
  }

  const directory = getAssetDirectory(kind);
  await mkdir(directory, { recursive: true });

  const finalName = await uniqueFilename(directory, safeName);
  const targetPath = path.join(directory, finalName);
  const resolvedDirectory = path.resolve(directory);
  const resolvedTarget = path.resolve(targetPath);

  if (!resolvedTarget.startsWith(resolvedDirectory + path.sep)) {
    return NextResponse.json({ error: "Invalid upload path." }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(resolvedTarget, bytes);

  return NextResponse.json({
    src: `${config.publicPath}/${finalName}`,
    name: finalName,
    ext,
    kind: config.kind,
    warning: ext === ".avi" ? "AVI may not preview in all browsers. Convert to MP4/WebM for reliable playback." : undefined,
  });
}
