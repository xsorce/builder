import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";

export const projectMediaFolders = ["images", "videos", "audio"] as const;

export function sanitizeProjectFolder(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "project"
  );
}

export function publicDirectory() {
  return path.join(process.cwd(), "public");
}

export function safeProjectDirectory(folder: string) {
  const publicDir = path.resolve(publicDirectory());
  const safeFolder = sanitizeProjectFolder(folder);
  const directory = path.resolve(publicDir, safeFolder);

  if (!directory.startsWith(publicDir + path.sep)) {
    return null;
  }

  return { publicDir, folder: safeFolder, directory };
}

export async function exists(filePath: string) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

export function isGeneratedProjectFolder(folder: string) {
  const safe = sanitizeProjectFolder(folder);
  return safe === folder && folder !== "shapes" && !folder.startsWith(".");
}

export async function removeProjectFolder(folder: string) {
  const target = safeProjectDirectory(folder);
  if (!target || !isGeneratedProjectFolder(target.folder) || !(await exists(target.directory))) {
    return false;
  }

  await rm(target.directory, { recursive: true, force: true });
  return true;
}

export async function cleanupOrphanProjectFolders(activeFolders: string[]) {
  const publicDir = path.resolve(publicDirectory());
  const active = new Set(activeFolders.map(sanitizeProjectFolder));
  const removed: string[] = [];
  const entries = await readdir(publicDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory() || !isGeneratedProjectFolder(entry.name) || active.has(entry.name)) {
      continue;
    }

    const folderPath = path.join(publicDir, entry.name);
    const hasMediaFolder = await Promise.all(projectMediaFolders.map((mediaFolder) => exists(path.join(folderPath, mediaFolder))));
    if (!hasMediaFolder.some(Boolean)) {
      continue;
    }

    await rm(folderPath, { recursive: true, force: true });
    removed.push(entry.name);
  }

  return removed;
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

export async function mergeProjectFolders(oldFolder: string, nextFolder: string) {
  const oldTarget = safeProjectDirectory(oldFolder);
  const nextTarget = safeProjectDirectory(nextFolder);
  if (!oldTarget || !nextTarget || !isGeneratedProjectFolder(oldTarget.folder) || !isGeneratedProjectFolder(nextTarget.folder)) {
    throw new Error("Invalid project folder.");
  }

  if (oldTarget.folder === nextTarget.folder || !(await exists(oldTarget.directory))) {
    return { folder: nextTarget.folder, replacements: new Map<string, string>() };
  }

  if (!(await exists(nextTarget.directory))) {
    await rename(oldTarget.directory, nextTarget.directory);
    return { folder: nextTarget.folder, replacements: new Map<string, string>() };
  }

  const replacements = new Map<string, string>();
  for (const mediaFolder of projectMediaFolders) {
    const sourceDir = path.join(oldTarget.directory, mediaFolder);
    if (!(await exists(sourceDir))) {
      continue;
    }

    const targetDir = path.join(nextTarget.directory, mediaFolder);
    await mkdir(targetDir, { recursive: true });
    const entries = await readdir(sourceDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }

      const sourceFile = path.join(sourceDir, entry.name);
      const finalName = (await exists(path.join(targetDir, entry.name))) ? await uniqueFilename(targetDir, entry.name) : entry.name;
      await rename(sourceFile, path.join(targetDir, finalName));
      replacements.set(`/${oldTarget.folder}/${mediaFolder}/${entry.name}`, `/${nextTarget.folder}/${mediaFolder}/${finalName}`);
    }
  }

  await rm(oldTarget.directory, { recursive: true, force: true });
  return { folder: nextTarget.folder, replacements };
}
