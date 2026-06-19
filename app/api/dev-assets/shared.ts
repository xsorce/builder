import path from "node:path";
import type { AssetKind } from "@/types/canvas";

export const assetConfig = {
  images: {
    folder: "images",
    publicPath: "/images",
    kind: "image",
    extensions: new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg", ".avif"]),
  },
  shapes: {
    folder: "shapes",
    publicPath: "/shapes",
    kind: "image",
    extensions: new Set([".png"]),
  },
  videos: {
    folder: "videos",
    publicPath: "/videos",
    kind: "video",
    extensions: new Set([".mp4", ".webm", ".ogg", ".ogv", ".mov", ".avi"]),
  },
  audio: {
    folder: "audio",
    publicPath: "/audio",
    kind: "audio",
    extensions: new Set([".mp3", ".wav", ".ogg", ".m4a"]),
  },
} as const;

export function isAssetKind(value: unknown): value is AssetKind {
  return value === "images" || value === "videos" || value === "audio" || value === "shapes";
}

export function isLocalHost(host: string | null) {
  const hostname = host?.split(":")[0];
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function getAssetDirectory(kind: AssetKind) {
  const config = assetConfig[kind];
  return path.join(process.cwd(), "public", config.folder);
}

export function sanitizeFilename(name: string) {
  const parsed = path.parse(name);
  const safeBase = parsed.name
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  const safeExt = parsed.ext.toLowerCase();
  return `${safeBase || "asset"}${safeExt}`;
}
