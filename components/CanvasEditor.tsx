"use client";

import JSZip from "jszip";
import Moveable from "react-moveable";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties } from "react";
import type { AssetFile, AssetKind, CanvasDocument, CanvasItem, CanvasItemMobileOverride, CanvasItemType } from "@/content/canvas";
import { AssetPicker } from "@/components/AssetPicker";
import { CanvasInspector } from "@/components/CanvasInspector";
import { CanvasItem as RenderCanvasItem } from "@/components/CanvasItem";
import { CanvasToolbar } from "@/components/CanvasToolbar";
import { PageBuilderPanel } from "@/components/PageBuilderPanel";

const ARTBOARD_WIDTH = 1440;
const MOBILE_ARTBOARD_WIDTH = 390;
const MOBILE_ARTBOARD_HEIGHT = 844;
const EDITOR_VIEW_MODE_KEY = "web-builder-editor-view-mode";
const HISTORY_LIMIT = 50;
const canSave = process.env.NODE_ENV === "development";
const MIN_ITEM_SIZE = 1;
const MAX_ITEM_SIZE = 5000;
const MIN_POSITION = -5000;
const MAX_POSITION = 10000;
const MIN_FONT_SIZE = 6;
const MAX_FONT_SIZE = 300;
const AUTOSAVE_DELAY = 850;
const QUICK_TOOLS_ICON = "\u274a";
const DRAFT_STORAGE_PREFIX = "web-builder-draft:";
const DRAFT_SAVE_DELAY = 600;
const BETA_SPLASH_STORAGE_KEY = "xsorce-webrooms-splash-seen";
const SPLASH_FADE_OUT_MS = 1200;
const SPACES_STORAGE_KEY = "pagebuilder-spaces-v1";
const SPACES_CLOSE_MS = 420;
const EXPORT_SUCCESS_FADE_MS = 220;

type CanvasEditorProps = {
  initialCanvas: CanvasDocument;
  scale: number;
};

type CanvasItemStyle = CSSProperties & {
  "--canvas-x"?: string;
  "--canvas-y"?: string;
  "--canvas-rotate"?: string;
  "--parallax-y"?: string;
  "--fade-delay"?: string;
  "--hover-color"?: string;
  "--hover-lift-y"?: string;
  "--hover-scale"?: string;
  "--hover-tilt"?: string;
  "--hover-float-x"?: string;
  "--hover-float-y"?: string;
  "--hover-glow"?: string;
  "--hover-focus"?: string;
  "--hover-focus-blur"?: string;
  "--idle-strength"?: string;
  "--idle-float-y"?: string;
  "--idle-breathe-scale"?: string;
  "--idle-drift-x"?: string;
  "--idle-drift-y"?: string;
  "--idle-drift-rotate"?: string;
  "--idle-sway-rotate"?: string;
  "--idle-float-duration"?: string;
  "--idle-breathe-duration"?: string;
  "--idle-drift-duration"?: string;
  "--idle-sway-duration"?: string;
};

type ResizeStart = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  cropLeft?: number;
  cropTop?: number;
  cropRight?: number;
  cropBottom?: number;
};

type DragStart = {
  id: string;
  x: number;
  y: number;
};

type GroupTransformStart = Array<{
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  type: CanvasItemType;
  cropLeft?: number;
  cropTop?: number;
  cropRight?: number;
  cropBottom?: number;
}>;

function round(value: number) {
  return Number(value.toFixed(2));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function clampPosition(value: number) {
  return round(clamp(value, MIN_POSITION, MAX_POSITION));
}

function clampSize(value: number) {
  return round(clamp(value, MIN_ITEM_SIZE, MAX_ITEM_SIZE));
}

function clampFontSize(value: number) {
  return round(clamp(value, MIN_FONT_SIZE, MAX_FONT_SIZE));
}

function getCornerRatioResize(start: ResizeStart, direction: number[] | undefined, rawX: number, rawY: number, rawWidth: number, rawHeight: number) {
  const dirX = direction?.[0] ?? 0;
  const dirY = direction?.[1] ?? 0;

  if (!dirX || !dirY || !start.width || !start.height) {
    return {
      x: rawX,
      y: rawY,
      width: clampSize(rawWidth),
      height: clampSize(rawHeight),
      scale: start.width ? rawWidth / start.width : 1,
    };
  }

  const anchorX = dirX === -1 ? start.x + start.width : start.x;
  const anchorY = dirY === -1 ? start.y + start.height : start.y;
  const rawCornerX = dirX === -1 ? rawX : rawX + rawWidth;
  const rawCornerY = dirY === -1 ? rawY : rawY + rawHeight;
  const axisX = dirX * start.width;
  const axisY = dirY * start.height;
  const pointerX = rawCornerX - anchorX;
  const pointerY = rawCornerY - anchorY;
  const denominator = axisX * axisX + axisY * axisY || 1;
  const rawScale = (pointerX * axisX + pointerY * axisY) / denominator;
  const minScale = Math.max(MIN_ITEM_SIZE / start.width, MIN_ITEM_SIZE / start.height);
  const maxScale = Math.min(MAX_ITEM_SIZE / start.width, MAX_ITEM_SIZE / start.height);
  const scale = clamp(rawScale, minScale, maxScale);
  const nextWidth = clampSize(start.width * scale);
  const nextHeight = clampSize(start.height * scale);

  return {
    x: dirX === -1 ? clampPosition(anchorX - nextWidth) : clampPosition(anchorX),
    y: dirY === -1 ? clampPosition(anchorY - nextHeight) : clampPosition(anchorY),
    width: nextWidth,
    height: nextHeight,
    scale,
  };
}

function getDirectSideResize(start: ResizeStart, direction: number[] | undefined, rawWidth: number, rawHeight: number) {
  const dirX = direction?.[0] ?? 0;
  const dirY = direction?.[1] ?? 0;
  let nextX = start.x;
  let nextY = start.y;
  let nextWidth = start.width;
  let nextHeight = start.height;

  if (dirX) {
    nextWidth = clampSize(rawWidth);
    nextX = dirX === -1 ? clampPosition(start.x + start.width - nextWidth) : start.x;
  }

  if (dirY) {
    nextHeight = clampSize(rawHeight);
    nextY = dirY === -1 ? clampPosition(start.y + start.height - nextHeight) : start.y;
  }

  return { x: nextX, y: nextY, width: nextWidth, height: nextHeight };
}

function itemTransform(item: Pick<CanvasItem, "x" | "y" | "rotate">) {
  return `translate3d(${item.x}px, ${item.y}px, 0) rotate(${item.rotate}deg)`;
}

function getEffectiveItem(item: CanvasItem, mobileView: boolean): CanvasItem {
  if (!mobileView || !item.mobile) {
    return item;
  }

  const effective = {
    ...item,
    x: item.mobile.x ?? item.x,
    y: item.mobile.y ?? item.y,
    width: item.mobile.width ?? item.width,
    height: item.mobile.height ?? item.height,
    fontSize: item.mobile.fontSize ?? item.fontSize,
  };

  return isBackIndexLink(item) ? { ...effective, x: 275, y: 54, fontSize: 13 } : effective;
}

function toMobileOverride(item: CanvasItem): CanvasItemMobileOverride {
  const sizeScale = 0.55;
  const yScale = 0.55;
  const centerRatio = ((item.x + item.width / 2) / ARTBOARD_WIDTH - 0.5) * 2;
  const baseWidth = Math.max(1, Math.round(item.width * sizeScale));
  const baseHeight = item.height === undefined ? undefined : Math.max(1, Math.round(item.height * sizeScale));
  const width = baseWidth;
  const height = baseHeight;
  const compressedCenter = MOBILE_ARTBOARD_WIDTH / 2 + centerRatio * MOBILE_ARTBOARD_WIDTH * 0.38;
  const x = Math.round(clamp(compressedCenter - baseWidth / 2, -baseWidth * 0.45, MOBILE_ARTBOARD_WIDTH - baseWidth * 0.55));

  return {
    x: isBackIndexLink(item) ? 275 : x,
    y: isBackIndexLink(item) ? 54 : Math.round(item.y * yScale),
    width,
    height,
    fontSize: isBackIndexLink(item) ? 13 : isDeviceFontItem(item) && item.fontSize !== undefined ? clampFontSize(Math.round(item.fontSize * 0.7)) : undefined,
  };
}

const mobileOverrideFields = new Set<keyof CanvasItem>(["x", "y", "width", "height"]);

function mergeItemUpdates(item: CanvasItem, updates: Partial<CanvasItem>, mobileView: boolean, mobileResizeFont = false) {
  if (item.type === "audio" && typeof updates.fontSize === "number") {
    const currentWidth = updates.width ?? (mobileView ? item.mobile?.width ?? item.width : item.width);
    const currentHeight = updates.height ?? (mobileView ? item.mobile?.height ?? item.height : item.height);
    const minWidth = updates.fontSize * 22;
    const minHeight = updates.fontSize * 4.2;

    updates = {
      ...updates,
      width: clampSize(Math.max(currentWidth ?? 0, minWidth)),
      height: clampSize(Math.max(currentHeight ?? 0, minHeight)),
    };
  }

  if (!mobileView) {
    return { ...item, ...updates };
  }

  const sharedUpdates: Partial<CanvasItem> = {};
  const mobileUpdates: CanvasItemMobileOverride = {};

  for (const [key, value] of Object.entries(updates) as [keyof CanvasItem, CanvasItem[keyof CanvasItem]][]) {
    const fontSizeIsMobile = key === "fontSize" && (mobileResizeFont || isDeviceFontItem(item));
    if (!mobileOverrideFields.has(key) && !fontSizeIsMobile) {
      (sharedUpdates as Record<string, unknown>)[key] = value;
      continue;
    }

    if (key === "x") {
      mobileUpdates.x = value as number | undefined;
    } else if (key === "y") {
      mobileUpdates.y = value as number | undefined;
    } else if (key === "width") {
      mobileUpdates.width = value as number | undefined;
    } else if (key === "height") {
      mobileUpdates.height = value as number | undefined;
    } else if (key === "fontSize") {
      mobileUpdates.fontSize = value as number | undefined;
    }
  }

  return { ...item, ...sharedUpdates, mobile: { ...item.mobile, ...mobileUpdates } };
}

function isTextLike(item: Pick<CanvasItem, "type">) {
  return item.type === "text" || item.type === "link" || item.type === "symbol";
}

function isDeviceFontItem(item: Pick<CanvasItem, "type">) {
  return isTextLike(item) || item.type === "audio";
}

function isBackIndexLink(item: Pick<CanvasItem, "href" | "text">) {
  return item.href === "/" && typeof item.text === "string" && item.text.toLowerCase().startsWith("back /");
}

function getHoverEffectClass(item: CanvasItem) {
  const effect = item.hoverEffect === "shock" || item.hoverEffect === "float" || item.hoverEffect === "tilt" || item.hoverEffect === "drift" ? "lift" : item.hoverEffect ?? "none";

  if (effect === "color" || effect === "lift" || effect === "glow" || effect === "focus") {
    return `canvas-item-hover-${effect}`;
  }

  return "";
}

function getHoverStyleVars(_item: CanvasItem): CanvasItemStyle {
  return {
    "--hover-lift-y": "-5.6px",
    "--hover-scale": "1.018",
    "--hover-tilt": "1.8deg",
    "--hover-float-x": "2.4px",
    "--hover-float-y": "-3.6px",
    "--hover-glow": "8px",
    "--hover-focus": "1.05",
    "--hover-focus-blur": "5px",
  };
}

function getIdleEffectClass(item: CanvasItem) {
  const effect = item.idleEffect === "pulse" ? "breathe" : item.idleEffect ?? "none";

  if (effect === "float" || effect === "breathe" || effect === "drift" || effect === "sway") {
    return `canvas-item-idle-${effect}`;
  }

  return "";
}

function getIdleStyleVars(item: CanvasItem): CanvasItemStyle {
  const strength = Math.min(Math.max(item.idleStrength ?? 3, 0), 12);

  return {
    "--idle-strength": `${strength}`,
    "--idle-float-y": "-15px",
    "--idle-breathe-scale": "1.08",
    "--idle-drift-x": "13px",
    "--idle-drift-y": "-10px",
    "--idle-drift-rotate": "1.35deg",
    "--idle-sway-rotate": "3deg",
    "--idle-float-duration": `${5.5 * 3 / Math.max(strength, 0.25)}s`,
    "--idle-breathe-duration": `${4.8 * 3 / Math.max(strength, 0.25)}s`,
    "--idle-drift-duration": `${10 * 3 / Math.max(strength, 0.25)}s`,
    "--idle-sway-duration": `${5.8 * 3 / Math.max(strength, 0.25)}s`,
  };
}

function getCropUpdates(start: ResizeStart, width: number, height: number, dist: number[], scale: number, direction?: number[]) {
  const distX = (dist[0] ?? 0) / scale;
  const distY = (dist[1] ?? 0) / scale;
  const left = start.cropLeft ?? 0;
  const top = start.cropTop ?? 0;
  const right = start.cropRight ?? 0;
  const bottom = start.cropBottom ?? 0;
  const sourceWidth = start.width / Math.max((100 - left - right) / 100, 0.01);
  const sourceHeight = start.height / Math.max((100 - top - bottom) / 100, 0.01);
  let nextX = start.x;
  let nextY = start.y;
  let nextWidth = start.width;
  let nextHeight = start.height;
  let cropLeftPx = (sourceWidth * left) / 100;
  let cropRightPx = (sourceWidth * right) / 100;
  let cropTopPx = (sourceHeight * top) / 100;
  let cropBottomPx = (sourceHeight * bottom) / 100;

  if (direction?.[0] === -1) {
    const delta = clamp(distX, -cropLeftPx, start.width - MIN_ITEM_SIZE);
    nextX = start.x + delta;
    nextWidth = start.width - delta;
    cropLeftPx += delta;
  } else if (direction?.[0] === 1) {
    const delta = clamp(start.width - clampSize(width), -cropRightPx, start.width - MIN_ITEM_SIZE);
    nextWidth = start.width - delta;
    cropRightPx += delta;
  }

  if (direction?.[1] === -1) {
    const delta = clamp(distY, -cropTopPx, start.height - MIN_ITEM_SIZE);
    nextY = start.y + delta;
    nextHeight = start.height - delta;
    cropTopPx += delta;
  } else if (direction?.[1] === 1) {
    const delta = clamp(start.height - clampSize(height), -cropBottomPx, start.height - MIN_ITEM_SIZE);
    nextHeight = start.height - delta;
    cropBottomPx += delta;
  }

  return {
    x: clampPosition(nextX),
    y: clampPosition(nextY),
    width: clampSize(nextWidth),
    height: clampSize(nextHeight),
    cropLeft: clampCrop((cropLeftPx / sourceWidth) * 100, (cropRightPx / sourceWidth) * 100),
    cropRight: clampCrop((cropRightPx / sourceWidth) * 100, (cropLeftPx / sourceWidth) * 100),
    cropTop: clampCrop((cropTopPx / sourceHeight) * 100, (cropBottomPx / sourceHeight) * 100),
    cropBottom: clampCrop((cropBottomPx / sourceHeight) * 100, (cropTopPx / sourceHeight) * 100),
  };
}

function clampCrop(value: number, opposite = 0) {
  return Math.min(Math.max(round(value), 0), Math.min(80, 90 - opposite));
}

function applyImageCropStyle(target: HTMLElement | SVGElement, updates: ReturnType<typeof getCropUpdates>) {
  const cropTarget = target.querySelector(".canvas-image-crop-layer");

  if (!(cropTarget instanceof HTMLElement)) {
    return;
  }

  const width = Math.max(1, 100 - (updates.cropLeft ?? 0) - (updates.cropRight ?? 0));
  const height = Math.max(1, 100 - (updates.cropTop ?? 0) - (updates.cropBottom ?? 0));
  cropTarget.style.width = `${10000 / width}%`;
  cropTarget.style.height = `${10000 / height}%`;
  cropTarget.style.transform = `translate(${-(updates.cropLeft ?? 0)}%, ${-(updates.cropTop ?? 0)}%)`;
}

function needsMobileOverride(item: CanvasItem) {
  return (
    !item.mobile ||
    (isDeviceFontItem(item) && item.fontSize !== undefined && item.mobile.fontSize === undefined) ||
    (item.type === "audio" && (item.mobile.width === undefined || (item.height !== undefined && item.mobile.height === undefined)))
  );
}

function withMissingMobileOverride(item: CanvasItem) {
  const mobile = toMobileOverride(item);
  return { ...item, mobile: { ...mobile, ...item.mobile } };
}

function isSafeEmbedText(text?: string) {
  const value = text?.trim();
  const iframeMatch = value?.match(/<iframe[^>]+src=["']([^"']+)["']/i);
  const rawSrc = iframeMatch?.[1] ?? value;

  if (!rawSrc) {
    return false;
  }

  try {
    const url = new URL(rawSrc);
    return (
      url.hostname === "youtu.be" ||
      url.hostname.endsWith("youtube.com") ||
      url.hostname.endsWith("vimeo.com") ||
      (url.hostname.endsWith("spotify.com") && url.pathname.startsWith("/embed/")) ||
      (url.hostname.endsWith("soundcloud.com") && url.pathname.includes("/player/"))
    );
  } catch {
    return false;
  }
}

function estimateTextBoxSize(text: string, fontSize: number) {
  return {
    width: clampSize(Math.ceil(text.length * fontSize * 0.58 + 8)),
    height: clampSize(Math.ceil(fontSize * 1.08 + 6)),
  };
}

function measureNaturalText(textNode: HTMLElement) {
  const clone = textNode.cloneNode(true) as HTMLElement;
  clone.removeAttribute("contenteditable");
  clone.style.position = "absolute";
  clone.style.visibility = "hidden";
  clone.style.pointerEvents = "none";
  clone.style.left = "-10000px";
  clone.style.top = "-10000px";
  clone.style.width = "max-content";
  clone.style.maxWidth = "none";
  clone.style.height = "auto";
  document.body.appendChild(clone);
  const rect = clone.getBoundingClientRect();
  clone.remove();
  return rect;
}

function isTypingTarget(event: KeyboardEvent) {
  const target = event.target;

  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(target.closest("input, textarea, select, [contenteditable='true'], [contenteditable='']"));
}

function defaultLayer(type: CanvasItemType, id: string) {
  if (id === "title") {
    return 3;
  }

  if (type === "audio") {
    return 2;
  }

  if (type === "image" || type === "video") {
    return 1;
  }

  return 2;
}

function defaultItem(type: CanvasItemType, count: number): CanvasItem {
  const id = `${type}-${Date.now()}-${count}`;
  const defaultText = type === "link" ? "new link" : type === "symbol" ? "*" : "new text";
  const fontSize = type === "symbol" ? 32 : type === "audio" ? 16 : 24;
  const textSize = isTextLike({ type }) ? estimateTextBoxSize(defaultText, fontSize) : undefined;
  const base = {
    id,
    type,
    x: 180 + count * 18,
    y: 180 + count * 18,
    width: textSize?.width ?? (type === "video" ? 320 : type === "audio" ? 340 : 260),
    height: textSize?.height ?? (type === "image" || type === "video" ? 180 : type === "audio" ? 72 : undefined),
    rotate: 0,
    zIndex: defaultLayer(type, id),
    opacity: 1,
    locked: false,
    fontSize,
    fontWeight: 600,
    fontFamily: type === "symbol" || type === "link" || type === "audio" ? "mono" : "body",
    color: "#111111",
    autoFitText: textSize ? true : undefined,
  } satisfies CanvasItem;

  if (type === "image") {
    return { ...base, src: "" };
  }

  if (type === "video") {
    return { ...base, src: "" };
  }

  if (type === "audio") {
    return { ...base, src: "", title: "untitled audio" };
  }

  if (type === "link") {
    return { ...base, text: defaultText, href: "/" };
  }

  if (type === "symbol") {
    return { ...base, text: defaultText };
  }

  return { ...base, text: defaultText };
}

function isShapeAsset(asset: AssetFile) {
  return asset.kind === "image" && asset.src.startsWith("/shapes/");
}

function getImageNaturalSize(src: string) {
  return new Promise<{ width: number; height: number } | null>((resolve) => {
    if (typeof window === "undefined") {
      resolve(null);
      return;
    }

    const image = new Image();
    image.onload = () => {
      if (image.naturalWidth && image.naturalHeight) {
        resolve({ width: image.naturalWidth, height: image.naturalHeight });
      } else {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function fitShapeDefaultSize(size: { width: number; height: number } | null) {
  const max = 180;

  if (!size || !size.width || !size.height) {
    return { width: max, height: max };
  }

  const ratio = size.width / size.height;

  if (ratio >= 1) {
    return {
      width: max,
      height: Math.max(1, Math.round(max / ratio)),
    };
  }

  return {
    width: Math.max(1, Math.round(max * ratio)),
    height: max,
  };
}

function shouldOpenBackgroundOnLoad() {
  return typeof window !== "undefined" && new URLSearchParams(window.location.search).get("background") === "1";
}

function isCanvasImport(value: unknown): value is CanvasDocument {
  return Boolean(value && typeof value === "object" && Array.isArray((value as CanvasDocument).items) && typeof (value as CanvasDocument).title === "string");
}

type ProjectJsonImport = {
  type: "web-builder-project";
  currentSlug?: string;
  pages: Array<{ slug: string; title: string; file: string; canvas: CanvasDocument }>;
};

type PageBuilderSpace = {
  id: string;
  name: string;
  assetFolder: string;
  assetBasePath: string;
  createdAt: string;
  updatedAt: string;
  project: ProjectJsonImport;
};

type WebRoomPackageImport = {
  type: "webroom-package";
  project: ProjectJsonImport;
};

function isProjectJsonImport(value: unknown): value is ProjectJsonImport {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as ProjectJsonImport).type === "web-builder-project" &&
      Array.isArray((value as ProjectJsonImport).pages) &&
      (value as ProjectJsonImport).pages.every((page) => page && typeof page === "object" && isCanvasImport((page as ProjectJsonImport["pages"][number]).canvas)),
  );
}

function isWebRoomPackageImport(value: unknown): value is WebRoomPackageImport {
  return Boolean(value && typeof value === "object" && (value as WebRoomPackageImport).type === "webroom-package" && isProjectJsonImport((value as WebRoomPackageImport).project));
}

function createFallbackProject(canvas: CanvasDocument): ProjectJsonImport {
  const slug = getCanvasRouteSlug(canvas);
  return {
    type: "web-builder-project",
    currentSlug: slug,
    pages: [{ slug, title: canvas.title, file: slug ? `${slug}.json` : "default.json", canvas }],
  };
}

function createDefaultSpace(canvas: CanvasDocument): PageBuilderSpace {
  const now = new Date().toISOString();
  return {
    id: `space-${Date.now()}`,
    name: "project1",
    assetFolder: "project1",
    assetBasePath: "/project1",
    createdAt: now,
    updatedAt: now,
    project: createFallbackProject(canvas),
  };
}

function getAssetFolderFromName(name: string) {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "project"
  );
}

function getSpaceAssetFolder(space: Pick<PageBuilderSpace, "name"> & Partial<Pick<PageBuilderSpace, "assetFolder">>, index = 0) {
  return space.assetFolder || getAssetFolderFromName(space.name) || `project${index + 1}`;
}

function withSpaceAssetMetadata(space: PageBuilderSpace, index: number): PageBuilderSpace {
  const assetFolder = getSpaceAssetFolder(space, index);
  return {
    ...space,
    assetFolder,
    assetBasePath: `/${assetFolder}`,
  };
}

function getSpaceSafeCanvasSlug(space: Pick<PageBuilderSpace, "id">, slug = "") {
  return `projects/${space.id}/pages/${slug || "default"}.json`;
}

function isStarterSpace(space: PageBuilderSpace, spaces: PageBuilderSpace[]) {
  return spaces[0]?.id === space.id || space.name.trim().toLowerCase() === "project1";
}

function isLocalOnlySpace(space: PageBuilderSpace, spaces: PageBuilderSpace[]) {
  return !isStarterSpace(space, spaces);
}

function createBlankProject(name: string, spaceId: string): ProjectJsonImport {
  const canvas: CanvasDocument = {
    slug: "",
    title: "Home",
    height: 810,
    mobileHeight: MOBILE_ARTBOARD_HEIGHT,
    backgroundColor: "#fafaf7",
    items: [],
  };

  return {
    type: "web-builder-project",
    currentSlug: "",
    pages: [{ slug: "", title: "Home", file: getSpaceSafeCanvasSlug({ id: spaceId }), canvas }],
  };
}

function updateProjectCanvas(project: ProjectJsonImport, canvas: CanvasDocument, space: PageBuilderSpace) {
  const currentSlug = getCanvasRouteSlug(canvas);
  const pageIndex = project.pages.findIndex((page) => page.slug === currentSlug);
  const nextPage = {
    slug: currentSlug,
    title: canvas.title || "Home",
    file: getSpaceSafeCanvasSlug(space, currentSlug),
    canvas,
  };

  if (pageIndex < 0) {
    return { ...project, currentSlug, pages: [nextPage] };
  }

  return {
    ...project,
    currentSlug,
    pages: project.pages.map((page, index) => (index === pageIndex ? nextPage : page)),
  };
}

function isObviousStarterClone(space: PageBuilderSpace, initialCanvas: CanvasDocument) {
  const hasStarterPage = space.project.pages.some((page) => {
    const values = [page.slug, page.title, page.file, page.canvas.slug, page.canvas.title].map((value) => value.toLowerCase());
    return values.some((value) => value.includes("starter"));
  });
  const projectJson = JSON.stringify(space.project);
  const hasCopiedProjectMedia = /"\/(projects\/)?project1\/(images|videos|audio)\//.test(projectJson);
  const starterMediaSources = collectReferencedAssetSources(createFallbackProject(initialCanvas));
  const hasCopiedStarterMedia = Array.from(starterMediaSources).some((src) => src && projectJson.includes(src));

  if (hasStarterPage || hasCopiedProjectMedia || hasCopiedStarterMedia) {
    return true;
  }

  const initialItemsJson = JSON.stringify(initialCanvas.items);
  return space.project.pages.some((page) => JSON.stringify(page.canvas.items ?? []) === initialItemsJson);
}

function repairSpaces(spaces: PageBuilderSpace[], initialCanvas: CanvasDocument) {
  const spacesWithMetadata = spaces.map(withSpaceAssetMetadata);
  return spacesWithMetadata.map((space) => (isLocalOnlySpace(space, spacesWithMetadata) && isObviousStarterClone(space, initialCanvas) ? { ...space, project: createBlankProject(space.name, space.id) } : space));
}

function getNextProjectName(spaces: PageBuilderSpace[]) {
  const names = new Set(spaces.map((space) => space.name.trim().toLowerCase()));
  let nextNumber = 2;
  while (names.has(`project${nextNumber}`)) {
    nextNumber += 1;
  }
  return `project${nextNumber}`;
}

function getProjectCanvas(project: ProjectJsonImport, currentCanvas: CanvasDocument) {
  const currentSlug = getCanvasRouteSlug(currentCanvas);
  return project.pages.find((page) => page.slug === project.currentSlug)?.canvas ?? project.pages.find((page) => page.slug === currentSlug)?.canvas ?? project.pages[0]?.canvas;
}

function getLocalAssetFolder(src: string) {
  if (src.startsWith("/shapes/")) {
    return "shapes";
  }
  const projectAssetMatch = src.match(/^\/(?:projects\/)?[^/]+\/(images|videos|audio)\//);
  if (projectAssetMatch) {
    return projectAssetMatch[1] as "images" | "videos" | "audio";
  }
  return null;
}

function getAssetFileName(src: string) {
  const pathname = src.split("?")[0]?.split("#")[0] ?? src;
  return decodeURIComponent(pathname.split("/").pop() || "asset");
}

function getZipAssetKind(pathname: string): AssetKind | null {
  const normalized = pathname.replace(/\\/g, "/").toLowerCase();
  const folder = normalized.match(/(?:^|\/)(images|videos|audio)\//)?.[1] as AssetKind | undefined;
  if (!folder) {
    return null;
  }
  return folder;
}

function getProjectFolderName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "project";
}

function getProjectPagePath(projectSlug: string, pageSlug: string) {
  return `/${projectSlug}/${pageSlug || "home"}`;
}

function collectReferencedAssetSources(project: ProjectJsonImport) {
  const sources = new Set<string>();

  project.pages.forEach((page) => {
    if (page.canvas.backgroundImage) {
      sources.add(page.canvas.backgroundImage);
    }

    page.canvas.items.forEach((item) => {
      if ((item.type === "image" || item.type === "video" || item.type === "audio") && item.src) {
        sources.add(item.src);
      }
    });
  });

  return sources;
}

function getCanvasRouteSlug(canvas: Pick<CanvasDocument, "slug">) {
  return canvas.slug === "home" || canvas.slug === "index" ? "" : canvas.slug;
}

function getDraftStorageKey(canvas: Pick<CanvasDocument, "slug" | "title">) {
  const id = canvas.slug || canvas.title || "untitled";
  return `${DRAFT_STORAGE_PREFIX}${id}`;
}

export function CanvasEditor({ initialCanvas, scale }: CanvasEditorProps) {
  const openBackgroundOnLoad = shouldOpenBackgroundOnLoad();
  const [canvas, setCanvas] = useState(initialCanvas);
  const [past, setPast] = useState<CanvasDocument[]>([]);
  const [future, setFuture] = useState<CanvasDocument[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>(() => (openBackgroundOnLoad ? undefined : initialCanvas.items[0]?.id));
  const [selectedIds, setSelectedIds] = useState<string[]>(() => (openBackgroundOnLoad || !initialCanvas.items[0]?.id ? [] : [initialCanvas.items[0].id]));
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [pickerKind, setPickerKind] = useState<AssetKind | null>(null);
  const [pickerTarget, setPickerTarget] = useState<"item" | "background">("item");
  const [editorWarning, setEditorWarning] = useState("");
  const [quickToolsOpen, setQuickToolsOpen] = useState(false);
  const [quickToolsToast, setQuickToolsToast] = useState("");
  const [exportSuccessOpen, setExportSuccessOpen] = useState(false);
  const [exportSuccessClosing, setExportSuccessClosing] = useState(false);
  const [draftStatus, setDraftStatus] = useState("");
  const [draftPrompt, setDraftPrompt] = useState<{ savedAt: number; canvas: CanvasDocument } | null>(null);
  const [showBetaSplash, setShowBetaSplash] = useState(false);
  const [spacesOpen, setSpacesOpen] = useState(false);
  const [spacesClosing, setSpacesClosing] = useState(false);
  const [spaces, setSpaces] = useState<PageBuilderSpace[]>([]);
  const [spaceNameDrafts, setSpaceNameDrafts] = useState<Record<string, string>>({});
  const [selectedSpaceId, setSelectedSpaceId] = useState("");
  const [activeSpaceId, setActiveSpaceId] = useState("");
  const [splashClosing, setSplashClosing] = useState(false);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [backgroundInspectorOpen, setBackgroundInspectorOpen] = useState(openBackgroundOnLoad);
  const [mobileView, setMobileView] = useState(() => (typeof window !== "undefined" ? window.localStorage.getItem(EDITOR_VIEW_MODE_KEY) === "mobile" : false));
  const [viewportSize, setViewportSize] = useState(() =>
    typeof window === "undefined" ? { width: 0, height: 0 } : { width: window.innerWidth, height: window.innerHeight },
  );
  const [editingTextId, setEditingTextId] = useState<string | undefined>();
  const [selectedTarget, setSelectedTarget] = useState<HTMLDivElement | null>(null);
  const [selectedTargets, setSelectedTargets] = useState<HTMLDivElement[]>([]);
  const refs = useRef<Record<string, HTMLDivElement | null>>({});
  const artboardRef = useRef<HTMLDivElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const quickToolsRef = useRef<HTMLDivElement | null>(null);
  const moveableRef = useRef<Moveable>(null);
  const canvasRef = useRef(canvas);
  const transformStartRef = useRef<CanvasDocument | null>(null);
  const transformDraftRef = useRef<Partial<CanvasItem> | null>(null);
  const groupDraftRef = useRef<Record<string, Partial<CanvasItem>> | null>(null);
  const groupTransformStartRef = useRef<GroupTransformStart | null>(null);
  const dragStartRef = useRef<DragStart | null>(null);
  const resizeStartRef = useRef<ResizeStart | null>(null);
  const hasMountedRef = useRef(false);
  const autosaveTimerRef = useRef<number | null>(null);
  const draftSaveTimerRef = useRef<number | null>(null);
  const quickToolsToastTimerRef = useRef<number | null>(null);
  const exportSuccessTimerRef = useRef<number | null>(null);
  const splashClosingTimerRef = useRef<number | null>(null);
  const spacesClosingTimerRef = useRef<number | null>(null);
  const draftPromptPendingRef = useRef(false);
  const migratedSpaceAssetsRef = useRef<Set<string>>(new Set());
  const lastSavedJsonRef = useRef(JSON.stringify(initialCanvas));
  const selectedIdRef = useRef(selectedId);
  const selectedIdsRef = useRef(selectedIds);
  const artboardWidth = mobileView ? MOBILE_ARTBOARD_WIDTH : ARTBOARD_WIDTH;
  const artboardHeight = mobileView ? canvas.mobileHeight ?? MOBILE_ARTBOARD_HEIGHT : canvas.height;
  const mobileFitScale =
    viewportSize.width && viewportSize.height
      ? Math.min(1, Math.max(0.2, Math.min((viewportSize.width - 24) / MOBILE_ARTBOARD_WIDTH, (viewportSize.height - 24) / MOBILE_ARTBOARD_HEIGHT)))
      : 1;
  const editorScale = mobileView ? mobileFitScale : scale;
  const effectiveItems = useMemo(() => canvas.items.map((item) => getEffectiveItem(item, mobileView)), [canvas.items, mobileView]);
  const selectedItem = useMemo(() => effectiveItems.find((item) => item.id === selectedId), [effectiveItems, selectedId]);
  const selectedItems = useMemo(() => effectiveItems.filter((item) => selectedIds.includes(item.id)), [effectiveItems, selectedIds]);
  const activeSpace = useMemo(() => spaces.find((space) => space.id === activeSpaceId), [activeSpaceId, spaces]);
  const useProjectScopedPages = Boolean(activeSpace && (isLocalOnlySpace(activeSpace, spaces) || activeSpace.project.pages.length > 1));
  const activeProjectPages = useMemo(() => (useProjectScopedPages ? activeSpace?.project.pages.map(({ slug, title, file }) => ({ slug, title, file })) : undefined), [activeSpace, useProjectScopedPages]);
  const selectedTextLike = Boolean(selectedItem && isTextLike(selectedItem));
  const renderDirections = selectedTextLike ? ["nw", "ne", "sw", "se", "w", "e"] : selectedItem?.type === "audio" ? ["nw", "ne", "sw", "se", "n", "s", "w", "e"] : undefined;
  const moveableTarget = selectedIds.length > 1 ? selectedTargets : selectedTarget;
  const groupSelected = Array.isArray(moveableTarget);
  const moveableKey = `${selectedItem?.id ?? "none"}-${selectedItem?.type ?? "none"}-${selectedIds.join("_")}-${renderDirections?.join("-") ?? "all"}`;

  useEffect(() => {
    canvasRef.current = canvas;
  }, [canvas]);

  useEffect(() => {
    if (!activeSpace || !new URLSearchParams(window.location.search).get("edit")) {
      return;
    }

    const path = `${getProjectPagePath(activeSpace.assetFolder, getCanvasRouteSlug(canvas))}?edit=1`;
    if (`${window.location.pathname}${window.location.search}` !== path) {
      window.history.replaceState(null, "", path);
    }
  }, [activeSpace, canvas]);

  useEffect(() => {
    try {
      const rawSpaces = window.localStorage.getItem(SPACES_STORAGE_KEY);
      const parsed = rawSpaces ? (JSON.parse(rawSpaces) as PageBuilderSpace[]) : [];
      const validSpaces = Array.isArray(parsed) && parsed.every((space) => space && typeof space.id === "string" && typeof space.name === "string" && isProjectJsonImport(space.project)) ? parsed : [];
      const nextSpaces = validSpaces.length ? repairSpaces(validSpaces, initialCanvas) : [createDefaultSpace(initialCanvas)];
      const [, routeProject, rawRoutePage] = window.location.pathname.split("/");
      const routePage = rawRoutePage === "home" ? "" : rawRoutePage ?? "";
      const routeSpace = nextSpaces.find((space) => space.assetFolder === routeProject);
      const routeCanvas = routeSpace
        ? (routeSpace.project.pages.find((page) => page.slug === routePage) ?? routeSpace.project.pages.find((page) => page.slug === "") ?? routeSpace.project.pages[0])?.canvas
        : undefined;
      setSpaces(nextSpaces);
      setSpaceNameDrafts(Object.fromEntries(nextSpaces.map((space) => [space.id, space.name])));
      setSelectedSpaceId(routeSpace?.id ?? nextSpaces[0]?.id ?? "");
      setActiveSpaceId(routeSpace?.id ?? nextSpaces[0]?.id ?? "");
      if (routeCanvas) {
        setCanvas(routeCanvas);
        canvasRef.current = routeCanvas;
      }
    } catch {
      const defaultSpaces = [createDefaultSpace(initialCanvas)];
      setSpaces(defaultSpaces);
      setSpaceNameDrafts(Object.fromEntries(defaultSpaces.map((space) => [space.id, space.name])));
      setSelectedSpaceId(defaultSpaces[0].id);
      setActiveSpaceId(defaultSpaces[0].id);
    }
  }, [initialCanvas]);

  useEffect(() => {
    if (!spaces.length) {
      return;
    }

    window.localStorage.setItem(SPACES_STORAGE_KEY, JSON.stringify(spaces));
  }, [spaces]);

  useEffect(() => {
    spaces.forEach((space) => {
      if (migratedSpaceAssetsRef.current.has(space.id)) {
        return;
      }
      migratedSpaceAssetsRef.current.add(space.id);
      void migrateProjectAssets(space);
    });
  }, [spaces]);

  useEffect(() => {
    try {
      const rawDraft = window.localStorage.getItem(getDraftStorageKey(initialCanvas));
      if (!rawDraft) {
        return;
      }

      const draft = JSON.parse(rawDraft) as { savedAt?: unknown; canvas?: unknown };
      if (typeof draft.savedAt === "number" && isCanvasImport(draft.canvas) && JSON.stringify(draft.canvas) !== JSON.stringify(initialCanvas)) {
        draftPromptPendingRef.current = true;
        setDraftPrompt({ savedAt: draft.savedAt, canvas: draft.canvas });
      }
    } catch {
      setDraftStatus("");
    }
  }, [initialCanvas]);

  useEffect(() => {
    window.localStorage.setItem(EDITOR_VIEW_MODE_KEY, mobileView ? "mobile" : "desktop");
  }, [mobileView]);

  useEffect(() => {
    function updateViewportSize() {
      setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    }

    updateViewportSize();
    window.addEventListener("resize", updateViewportSize);
    return () => window.removeEventListener("resize", updateViewportSize);
  }, []);

  useEffect(() => {
    if (!quickToolsOpen) {
      return;
    }

    function closeQuickToolsOnOutsidePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && quickToolsRef.current?.contains(target)) {
        return;
      }

      setQuickToolsOpen(false);
    }

    window.addEventListener("pointerdown", closeQuickToolsOnOutsidePointerDown, true);
    return () => window.removeEventListener("pointerdown", closeQuickToolsOnOutsidePointerDown, true);
  }, [quickToolsOpen]);

  useEffect(() => {
    if (!window.localStorage.getItem(BETA_SPLASH_STORAGE_KEY)) {
      setShowBetaSplash(true);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (quickToolsToastTimerRef.current) {
        window.clearTimeout(quickToolsToastTimerRef.current);
      }
      if (exportSuccessTimerRef.current) {
        window.clearTimeout(exportSuccessTimerRef.current);
      }
      if (splashClosingTimerRef.current) {
        window.clearTimeout(splashClosingTimerRef.current);
      }
      if (spacesClosingTimerRef.current) {
        window.clearTimeout(spacesClosingTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    selectedIdRef.current = selectedId;
    selectedIdsRef.current = selectedIds;
    setEditingTextId((current) => (current && current !== selectedId ? undefined : current));
    setSelectedTarget(selectedId && selectedIds.length === 1 && !selectedItem?.locked ? refs.current[selectedId] ?? null : null);
    setSelectedTargets(
      selectedIds.length > 1
        ? selectedIds
            .map((id) => ({ id, node: refs.current[id] }))
            .filter(({ id, node }) => Boolean(node && !canvasRef.current.items.find((item) => item.id === id)?.locked))
            .map(({ node }) => node as HTMLDivElement)
        : [],
    );
  }, [selectedId, selectedIds, selectedItem?.locked]);

  useEffect(() => {
    setSelectedTarget(selectedId && selectedIds.length === 1 && !selectedItem?.locked ? refs.current[selectedId] ?? null : null);
    setSelectedTargets(
      selectedIds.length > 1
        ? selectedIds
            .map((id) => ({ id, node: refs.current[id] }))
            .filter(({ id, node }) => Boolean(node && !canvas.items.find((item) => item.id === id)?.locked))
            .map(({ node }) => node as HTMLDivElement)
        : [],
    );
  }, [canvas.items, selectedId, selectedIds, selectedItem?.locked]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      moveableRef.current?.updateRect();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [selectedTarget, selectedTargets]);

  const markDirty = useCallback(() => {
    setSaveState("idle");
  }, []);

  function saveActiveSpaceSnapshot(nextCanvas: CanvasDocument) {
      if (!activeSpace || !isLocalOnlySpace(activeSpace, spaces)) {
        return;
      }

    updateSpaceSnapshot(activeSpace.id, updateProjectCanvas(activeSpace.project, nextCanvas, activeSpace));
  }

  const pushPast = useCallback((previous: CanvasDocument) => {
    setPast((current) => [...current.slice(-(HISTORY_LIMIT - 1)), previous]);
    setFuture([]);
  }, []);

  const commitCanvas = useCallback(
    (nextCanvas: CanvasDocument) => {
      pushPast(canvasRef.current);
      setCanvas(nextCanvas);
      saveActiveSpaceSnapshot(nextCanvas);
      markDirty();
    },
    [activeSpaceId, markDirty, pushPast, spaces],
  );

  useEffect(() => {
    if (!mobileView || !canvasRef.current.items.some(needsMobileOverride)) {
      return;
    }

    commitCanvas({
      ...canvasRef.current,
      mobileHeight: canvasRef.current.mobileHeight ?? MOBILE_ARTBOARD_HEIGHT,
      items: canvasRef.current.items.map((item) => (needsMobileOverride(item) ? withMissingMobileOverride(item) : item)),
    });
  }, [commitCanvas, mobileView]);

  const setCanvasLive = useCallback(
    (nextCanvas: CanvasDocument) => {
      canvasRef.current = nextCanvas;
      setCanvas(nextCanvas);
      saveActiveSpaceSnapshot(nextCanvas);
      markDirty();
    },
    [activeSpaceId, markDirty, spaces],
  );

  const updateItem = useCallback(
    (id: string, updates: Partial<CanvasItem>, commit = true) => {
      const nextCanvas = {
        ...canvasRef.current,
        items: canvasRef.current.items.map((item) => (item.id === id ? mergeItemUpdates(item, updates, mobileView) : item)),
      };

      if (commit) {
        commitCanvas(nextCanvas);
      } else {
        setCanvasLive(nextCanvas);
      }
    },
    [commitCanvas, mobileView, setCanvasLive],
  );

  const updateSelected = useCallback(
    (updates: Partial<CanvasItem>) => {
      const ids = selectedIdsRef.current.length ? selectedIdsRef.current : selectedIdRef.current ? [selectedIdRef.current] : [];

      if (!ids.length) {
        return;
      }

      commitCanvas({
        ...canvasRef.current,
        items: canvasRef.current.items.map((item) => (ids.includes(item.id) ? mergeItemUpdates(item, updates, mobileView) : item)),
      });
    },
    [commitCanvas, mobileView],
  );

  const undo = useCallback(() => {
    setPast((currentPast) => {
      const previous = currentPast.at(-1);

      if (!previous) {
        return currentPast;
      }

      setFuture((currentFuture) => [canvasRef.current, ...currentFuture].slice(0, HISTORY_LIMIT));
      canvasRef.current = previous;
      setCanvas(previous);
      saveActiveSpaceSnapshot(previous);
      setSaveState("idle");
      return currentPast.slice(0, -1);
    });
  }, [activeSpaceId, spaces]);

  const redo = useCallback(() => {
    setFuture((currentFuture) => {
      const next = currentFuture[0];

      if (!next) {
        return currentFuture;
      }

      setPast((currentPast) => [...currentPast.slice(-(HISTORY_LIMIT - 1)), canvasRef.current]);
      canvasRef.current = next;
      setCanvas(next);
      saveActiveSpaceSnapshot(next);
      setSaveState("idle");
      return currentFuture.slice(1);
    });
  }, [activeSpaceId, spaces]);

  const duplicateSelected = useCallback(() => {
    const ids = selectedIdsRef.current.length ? selectedIdsRef.current : selectedIdRef.current ? [selectedIdRef.current] : [];
    const selected = canvasRef.current.items.filter((item) => ids.includes(item.id));

    if (!selected.length) {
      return;
    }

    const stamp = Date.now();
    const duplicates = selected.map((item) => ({
      ...item,
      id: `${item.id}-copy-${stamp}`,
      x: item.x + 30,
      y: item.y + 30,
      zIndex: item.zIndex + 1,
    }));
    const nextCanvas = { ...canvasRef.current, items: [...canvasRef.current.items, ...duplicates] };

    commitCanvas(nextCanvas);
    setSelectedId(duplicates[0]?.id);
    setSelectedIds(duplicates.map((item) => item.id));
  }, [commitCanvas]);

  const deleteSelected = useCallback(() => {
    const ids = selectedIdsRef.current.length ? selectedIdsRef.current : selectedIdRef.current ? [selectedIdRef.current] : [];

    if (!ids.length) {
      return;
    }

    commitCanvas({ ...canvasRef.current, items: canvasRef.current.items.filter((item) => !ids.includes(item.id)) });
    setSelectedId(undefined);
    setSelectedIds([]);
  }, [commitCanvas]);

  const saveCanvas = useCallback(async (nextCanvas = canvasRef.current) => {
    setSaveState("saving");

    try {
      const nextJson = JSON.stringify(nextCanvas);
      const activeSpace = spaces.find((space) => space.id === activeSpaceId);
      if (activeSpace && isLocalOnlySpace(activeSpace, spaces)) {
        updateSpaceSnapshot(activeSpace.id, updateProjectCanvas(activeSpace.project, nextCanvas, activeSpace));
        lastSavedJsonRef.current = nextJson;
        setSaveState("saved");
        return;
      }

      const response = await fetch("/api/dev-save-canvas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: nextCanvas.slug, canvas: nextCanvas }),
      });

      if (!response.ok) {
        throw new Error("Save failed");
      }

      lastSavedJsonRef.current = nextJson;
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }, [activeSpaceId, spaces]);

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }

    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }

    if (!canSave) {
      return;
    }

    const nextJson = JSON.stringify(canvas);
    if (nextJson === lastSavedJsonRef.current) {
      return;
    }

    autosaveTimerRef.current = window.setTimeout(() => {
      autosaveTimerRef.current = null;
      if (JSON.stringify(canvas) === lastSavedJsonRef.current) {
        return;
      }
      void saveCanvas(canvas);
    }, AUTOSAVE_DELAY);

    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [canvas, saveCanvas]);

  useEffect(() => {
    if (draftPromptPendingRef.current) {
      return;
    }

    if (draftSaveTimerRef.current) {
      window.clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = null;
    }

    draftSaveTimerRef.current = window.setTimeout(() => {
      draftSaveTimerRef.current = null;
      try {
        window.localStorage.setItem(getDraftStorageKey(canvas), JSON.stringify({ savedAt: Date.now(), canvas }));
        setDraftStatus("local draft saved");
      } catch {
        setDraftStatus("draft not saved");
      }
    }, DRAFT_SAVE_DELAY);

    return () => {
      if (draftSaveTimerRef.current) {
        window.clearTimeout(draftSaveTimerRef.current);
        draftSaveTimerRef.current = null;
      }
    };
  }, [canvas]);

  useEffect(() => {
    if (!selectedItem || !isTextLike(selectedItem)) {
      return;
    }

    if (editingTextId === selectedItem.id) {
      return;
    }

    if (isSafeEmbedText(selectedItem.text) && editingTextId !== selectedItem.id) {
      return;
    }

    let frame = window.requestAnimationFrame(() => {
      frame = window.requestAnimationFrame(() => {
        const node = refs.current[selectedItem.id];
        const textNode = node?.querySelector(".canvas-text-content");

        if (!(textNode instanceof HTMLElement)) {
          return;
        }

        const fitNatural = selectedItem.autoFitText !== false;
        const rect = fitNatural ? measureNaturalText(textNode) : textNode.getBoundingClientRect();
        const nextWidth = fitNatural ? clampSize(Math.ceil(rect.width + 2)) : selectedItem.width;
        const measuredHeight = clampSize(Math.ceil((fitNatural ? rect.height : textNode.scrollHeight) + 2));
        const nextHeight = measuredHeight;

        if (Math.abs(nextWidth - selectedItem.width) <= 1 && Math.abs(nextHeight - (selectedItem.height ?? 0)) <= 1) {
          return;
        }

        updateItem(selectedItem.id, fitNatural ? { width: nextWidth, height: nextHeight } : { height: nextHeight }, false);
        window.requestAnimationFrame(() => {
          moveableRef.current?.updateRect();
        });
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [
    selectedItem?.id,
    selectedItem?.text,
    selectedItem?.width,
    selectedItem?.height,
    selectedItem?.fontSize,
    selectedItem?.fontWeight,
    selectedItem?.fontFamily,
    selectedItem?.autoFitText,
    editingTextId,
    updateItem,
  ]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const modifier = event.metaKey || event.ctrlKey;
      const typing = isTypingTarget(event);

      if (typing && !(modifier && event.key.toLowerCase() === "s")) {
        if (event.key === "Escape") {
          setEditingTextId(undefined);
        }
        return;
      }

      if (event.key === "Escape") {
        setEditingTextId(undefined);
        return;
      }

      if (event.key === "Enter") {
        const selectedRoot = canvasRef.current.items.find((item) => item.id === selectedIdRef.current);
        const selected = selectedRoot ? getEffectiveItem(selectedRoot, mobileView) : undefined;

        if (selected && isTextLike(selected)) {
          event.preventDefault();
          setEditingTextId(selected.id);
        }
        return;
      }

      if (modifier && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveCanvas();
        return;
      }

      if (modifier && event.key.toLowerCase() === "d") {
        event.preventDefault();
        duplicateSelected();
        return;
      }

      if (modifier && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }

      if (modifier && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteSelected();
        return;
      }

      const nudgeKeys: Record<string, [number, number]> = {
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
      };
      const nudge = nudgeKeys[event.key];

      if (nudge) {
        const selectedRoot = canvasRef.current.items.find((item) => item.id === selectedIdRef.current);
        const selected = selectedRoot ? getEffectiveItem(selectedRoot, mobileView) : undefined;

        if (!selected) {
          return;
        }

        event.preventDefault();
        const amount = event.shiftKey ? 10 : 1;
        updateItem(selected.id, { x: selected.x + nudge[0] * amount, y: selected.y + nudge[1] * amount });
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteSelected, duplicateSelected, mobileView, redo, saveCanvas, undo, updateItem]);

  function addItem(type: CanvasItemType) {
    if (type === "image" || type === "video" || type === "audio") {
      setPickerTarget("item");
      setPickerKind(type === "image" ? "images" : type === "video" ? "videos" : "audio");
      return;
    }

    const item = placeNewItem(defaultItem(type, canvasRef.current.items.length));
    commitCanvas({ ...canvasRef.current, items: [...canvasRef.current.items, item] });
    setSelectedId(item.id);
    setSelectedIds([item.id]);
    setBackgroundInspectorOpen(false);
    setInspectorCollapsed(false);
  }

  async function addMediaItem(asset: AssetFile) {
    const type = asset.kind;
    const shapeSize = isShapeAsset(asset) ? fitShapeDefaultSize(await getImageNaturalSize(asset.src)) : {};
    const baseItem = {
      ...defaultItem(type, canvasRef.current.items.length),
      ...shapeSize,
      src: asset.src,
      title: type === "audio" ? asset.name.replace(/\.[^.]+$/, "") : undefined,
      caption: asset.warning,
      recolorColor: type === "image" && asset.src.startsWith("/shapes/") ? "#111111" : undefined,
      recolorIntensity: type === "image" && asset.src.startsWith("/shapes/") ? 100 : undefined,
    };
    const item = placeNewItem(baseItem);

    commitCanvas({ ...canvasRef.current, items: [...canvasRef.current.items, item] });
    setSelectedId(item.id);
    setSelectedIds([item.id]);
    setBackgroundInspectorOpen(false);
    setInspectorCollapsed(false);
    setEditorWarning(asset.warning ?? "");
    setPickerKind(null);
  }

  function setBackgroundImageFromAsset(asset: AssetFile) {
    updateBackground({ backgroundImage: asset.src });
    setBackgroundInspectorOpen(true);
    setInspectorCollapsed(false);
    setPickerKind(null);
  }

  function onPickerSelect(asset: AssetFile) {
    if (pickerTarget === "background") {
      setBackgroundImageFromAsset(asset);
      return;
    }

    addMediaItem(asset);
  }

  function openBackgroundImagePicker() {
    setPickerTarget("background");
    setPickerKind("images");
  }

  function updateBackground(updates: Partial<Pick<CanvasDocument, "backgroundColor" | "height" | "mobileHeight" | "backgroundImage" | "backgroundImageOpacity" | "backgroundImageFit" | "backgroundImageRecolorColor" | "backgroundImageRecolorIntensity" | "password">>) {
    commitCanvas({ ...canvasRef.current, ...updates });
  }

  function openRealPage() {
    const baseUrl = activeSpace ? getProjectPagePath(activeSpace.assetFolder, getCanvasRouteSlug(canvasRef.current)) : canvasRef.current.slug === "home" || canvasRef.current.slug === "index" ? "/" : `/${canvasRef.current.slug}`;
    if (activeSpace) {
      const project = updateProjectCanvas(activeSpace.project, canvasRef.current, activeSpace);
      window.sessionStorage.setItem("pagebuilder-preview-canvas", JSON.stringify(getProjectCanvas(project, canvasRef.current) ?? canvasRef.current));
      const params = new URLSearchParams({ previewCanvas: "1" });
      if (mobileView) {
        params.set("view", "mobile");
      }
      window.open(`${baseUrl}?${params}`, "_blank", "noopener,noreferrer");
      return;
    }

    const url = mobileView ? `${baseUrl}?view=mobile` : baseUrl;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function toggleMobileView() {
    setMobileView((current) => !current);
  }

  async function exportProjectJson() {
    const currentCanvas = canvasRef.current;

    try {
      const exportData = await getProjectForExport();
      await downloadProjectZip(exportData, getExportProjectName(exportData));
      setQuickToolsOpen(false);
      showExportSuccessOverlay();
    } catch {
      const slug = (currentCanvas.slug || currentCanvas.title || "canvas").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "canvas";
      const url = URL.createObjectURL(new Blob([JSON.stringify(currentCanvas, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `${slug}-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setQuickToolsOpen(false);
      setEditorWarning("Project ZIP export failed. Exported current page only.");
    }
  }

  async function getProjectForExport() {
    if (spacesOpen && selectedSpaceId) {
      const selectedSpace = spaces.find((space) => space.id === selectedSpaceId);
      if (selectedSpace) {
        const project =
          selectedSpace.id === activeSpaceId && isLocalOnlySpace(selectedSpace, spaces)
            ? updateProjectCanvas(selectedSpace.project, canvasRef.current, selectedSpace)
            : selectedSpace.project;
        return { ...project, exportedAt: new Date().toISOString() } as ProjectJsonImport & { exportedAt: string };
      }
    }

    if (activeSpaceId) {
      const activeSpace = spaces.find((space) => space.id === activeSpaceId);
      if (activeSpace && isLocalOnlySpace(activeSpace, spaces)) {
        const projectForSpace = updateProjectCanvas(activeSpace.project, canvasRef.current, activeSpace);
        updateSpaceSnapshot(activeSpaceId, projectForSpace);
        return projectForSpace;
      }
    }

    const project = await getProjectExportData();
    if (activeSpaceId) {
      updateSpaceSnapshot(activeSpaceId, project);
    }
    return project;
  }

  function getExportProjectName(project: ProjectJsonImport) {
    if (spacesOpen && selectedSpaceId) {
      return spaces.find((space) => space.id === selectedSpaceId)?.name ?? "project";
    }

    if (activeSpaceId) {
      return spaces.find((space) => space.id === activeSpaceId)?.name ?? "project";
    }

    return project.pages.find((page) => page.slug === project.currentSlug)?.title ?? project.pages[0]?.title ?? "project";
  }

  async function getProjectExportData() {
    const currentCanvas = canvasRef.current;
    const currentSlug = getCanvasRouteSlug(currentCanvas);
    const response = await fetch("/api/dev-pages/export");

    if (!response.ok) {
      throw new Error("Project export failed.");
    }

    const project = (await response.json()) as ProjectJsonImport & { version: number; exportedAt: string };
    return {
      ...project,
      exportedAt: new Date().toISOString(),
      currentSlug,
      pages: project.pages.map((page) => (page.slug === currentSlug ? { ...page, title: currentCanvas.title, canvas: currentCanvas } : page)),
    };
  }

  function downloadJson(data: unknown, filename: string) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function downloadProjectZip(project: ProjectJsonImport & { exportedAt?: string }, projectName: string) {
    const zip = new JSZip();
    const skippedAssets: string[] = [];
    const exportedProject = { ...project, exportedAt: new Date().toISOString() };
    const registry = exportedProject.pages.map(({ slug, title, file }) => ({ slug, title, file }));
    const projectFolder = `projects/${getProjectFolderName(projectName)}`;

    zip.file("pagebuilder-project.json", JSON.stringify(exportedProject, null, 2));
    zip.file(`${projectFolder}/project.json`, JSON.stringify(exportedProject, null, 2));
    zip.file(`${projectFolder}/pages/index.json`, JSON.stringify(registry, null, 2));
    exportedProject.pages.forEach((page) => {
      zip.file(`${projectFolder}/pages/${page.file}`, JSON.stringify(page.canvas, null, 2));
    });

    zip.folder(`${projectFolder}/assets/images`);
    zip.folder(`${projectFolder}/assets/videos`);
    zip.folder(`${projectFolder}/assets/audio`);

    await Promise.all(
      Array.from(collectReferencedAssetSources(exportedProject)).map((src) => {
        if (getLocalAssetFolder(src) === "shapes") {
          return Promise.resolve();
        }
        if (getLocalAssetFolder(src)) {
          return addLocalAssetToZip(zip, src, skippedAssets, projectFolder);
        }
        skippedAssets.push(`${src} (external asset not embedded)`);
        return Promise.resolve();
      }),
    );

    zip.file(
      "README.txt",
      [
        "PageBuilder project package",
        "",
        "Project JSON is in pagebuilder-project.json and projects/<project>/project.json.",
        "Page JSON copies are in projects/<project>/pages/.",
        "Local public images, videos, and audio are copied into projects/<project>/assets/.",
        "Shapes are shared defaults and are not included in this project ZIP.",
        "",
        skippedAssets.length ? "Skipped assets:" : "Skipped assets: none",
        ...skippedAssets.map((asset) => `- ${asset}`),
      ].join("\n"),
    );

    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${getProjectFolderName(projectName)}-${new Date().toISOString().slice(0, 10)}.zip`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function addLocalAssetToZip(zip: JSZip, src: string, skippedAssets: string[], projectFolder: string) {
    const folder = getLocalAssetFolder(src);
    if (!folder || folder === "shapes") {
      return;
    }

    try {
      const response = await fetch(src);
      if (!response.ok) {
        throw new Error("Could not fetch asset.");
      }

      zip.file(`${projectFolder}/assets/${folder}/${getAssetFileName(src)}`, await response.blob());
    } catch {
      skippedAssets.push(`${src} (local asset fetch failed)`);
    }
  }

  async function exportWebRoomPackage() {
    try {
      const project = await getProjectExportData();
      downloadJson(
        {
          type: "webroom-package",
          version: 1,
          exportedAt: new Date().toISOString(),
          readme: "Send this package to Zane to publish it online. ZIP asset-folder packaging is not included yet; keep referenced public asset files with the project.",
          project,
          assetFolders: ["assets/images/", "assets/videos/", "assets/audio/", "assets/shapes/"],
        },
        `pagebuilder-package-${new Date().toISOString().slice(0, 10)}.pagebuilder.json`,
      );
      setQuickToolsOpen(false);
      showQuickToolsToast("Send this package to Zane to publish it online.");
    } catch {
      setEditorWarning("PageBuilder package export failed.");
    }
  }

  function restoreDraft() {
    if (!draftPrompt) {
      return;
    }

    setCanvas(draftPrompt.canvas);
    canvasRef.current = draftPrompt.canvas;
    draftPromptPendingRef.current = false;
    setDraftPrompt(null);
    setDraftStatus("draft restored");
  }

  function showQuickToolsToast(message: string) {
    if (quickToolsToastTimerRef.current) {
      window.clearTimeout(quickToolsToastTimerRef.current);
    }

    setQuickToolsToast(message);
    quickToolsToastTimerRef.current = window.setTimeout(() => setQuickToolsToast(""), 2600);
  }

  function showExportSuccessOverlay() {
    if (exportSuccessTimerRef.current) {
      window.clearTimeout(exportSuccessTimerRef.current);
      exportSuccessTimerRef.current = null;
    }
    setExportSuccessClosing(false);
    setExportSuccessOpen(true);
  }

  function dismissExportSuccessOverlay() {
    if (exportSuccessTimerRef.current) {
      window.clearTimeout(exportSuccessTimerRef.current);
    }
    setExportSuccessClosing(true);
    exportSuccessTimerRef.current = window.setTimeout(() => {
      setExportSuccessOpen(false);
      setExportSuccessClosing(false);
      exportSuccessTimerRef.current = null;
    }, EXPORT_SUCCESS_FADE_MS);
  }

  function dismissBetaSplash() {
    window.localStorage.setItem(BETA_SPLASH_STORAGE_KEY, "1");
    if (splashClosingTimerRef.current) {
      window.clearTimeout(splashClosingTimerRef.current);
    }
    setSplashClosing(true);
    splashClosingTimerRef.current = window.setTimeout(() => {
      setShowBetaSplash(false);
      setSplashClosing(false);
      splashClosingTimerRef.current = null;
    }, SPLASH_FADE_OUT_MS);
  }

  async function migrateProjectAssets(space: PageBuilderSpace) {
    try {
      const response = await fetch("/api/dev-assets/migrate-project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetFolder: space.assetFolder, project: space.project }),
      });

      if (!response.ok) {
        return;
      }

      const migrated = (await response.json()) as { assetBasePath?: string; project?: ProjectJsonImport };
      if (migrated.project && isProjectJsonImport(migrated.project)) {
        if (activeSpaceId === space.id) {
          const nextCanvas = getProjectCanvas(migrated.project, canvasRef.current);
          if (nextCanvas) {
            setCanvas(nextCanvas);
            canvasRef.current = nextCanvas;
          }
        }
        setSpaces((current) =>
          current.map((currentSpace) =>
            currentSpace.id === space.id
              ? {
                  ...currentSpace,
                  assetBasePath: migrated.assetBasePath ?? currentSpace.assetBasePath,
                  project: migrated.project as ProjectJsonImport,
                }
              : currentSpace,
          ),
        );
      }
    } catch {
      // Keep the project unchanged if local asset migration is unavailable.
    }
  }

  function initializeBlankProjectFolder(space: PageBuilderSpace) {
    void fetch("/api/dev-assets/migrate-project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetFolder: space.assetFolder, cleanGeneratedFiles: true, project: space.project }),
    }).catch(() => setEditorWarning("Project folder setup failed."));
  }

  function updateSpaceSnapshot(spaceId: string, project: ProjectJsonImport) {
    setSpaces((current) =>
      current.map((space) =>
        space.id === spaceId
          ? {
              ...space,
              updatedAt: new Date().toISOString(),
              project,
            }
          : space,
      ),
    );
  }

  function openSpaces() {
    if (activeSpaceId) {
      const activeSpace = spaces.find((space) => space.id === activeSpaceId);
      if (activeSpace && isLocalOnlySpace(activeSpace, spaces)) {
        updateSpaceSnapshot(activeSpaceId, updateProjectCanvas(activeSpace.project, canvasRef.current, activeSpace));
      } else {
        getProjectExportData()
          .then((project) => updateSpaceSnapshot(activeSpaceId, project))
          .catch(() => updateSpaceSnapshot(activeSpaceId, createFallbackProject(canvasRef.current)));
      }
    }
    if (spacesClosingTimerRef.current) {
      window.clearTimeout(spacesClosingTimerRef.current);
      spacesClosingTimerRef.current = null;
    }
    setSpacesClosing(false);
    setSpacesOpen(true);
    setQuickToolsOpen(false);
  }

  function closeSpaces() {
    if (spacesClosingTimerRef.current) {
      window.clearTimeout(spacesClosingTimerRef.current);
    }
    setSpacesClosing(true);
    spacesClosingTimerRef.current = window.setTimeout(() => {
      setSpacesOpen(false);
      setSpacesClosing(false);
      spacesClosingTimerRef.current = null;
    }, SPACES_CLOSE_MS);
  }

  function createSpace() {
    const now = new Date().toISOString();
    const name = getNextProjectName(spaces);
    const id = `space-${Date.now()}`;
    const assetFolder = getAssetFolderFromName(name);
    const nextSpace: PageBuilderSpace = {
      id,
      name,
      assetFolder,
      assetBasePath: `/${assetFolder}`,
      createdAt: now,
      updatedAt: now,
      project: createBlankProject(name, id),
    };
    setSpaces((current) => [...current, nextSpace]);
    setSpaceNameDrafts((current) => ({ ...current, [nextSpace.id]: nextSpace.name }));
    setSelectedSpaceId(nextSpace.id);
    migratedSpaceAssetsRef.current.add(nextSpace.id);
    initializeBlankProjectFolder(nextSpace);
  }

  function renameSpaceDraft(spaceId: string, name: string) {
    setSpaceNameDrafts((current) => ({ ...current, [spaceId]: name }));
  }

  async function commitSpaceRename(space: PageBuilderSpace) {
    const nextName = (spaceNameDrafts[space.id] ?? space.name).trim() || space.name;
    const isStarter = isStarterSpace(space, spaces);
    const nextFolder = isStarter ? space.assetFolder : getAssetFolderFromName(nextName);

    if (nextName === space.name && nextFolder === space.assetFolder) {
      return;
    }

    if (isStarter || nextFolder === space.assetFolder) {
      setSpaces((current) => current.map((currentSpace) => (currentSpace.id === space.id ? { ...currentSpace, name: nextName, updatedAt: new Date().toISOString() } : currentSpace)));
      return;
    }

    try {
      const response = await fetch("/api/dev-assets/rename-project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldFolder: space.assetFolder, nextName, project: space.project }),
      });

      if (!response.ok) {
        throw new Error("Project rename failed.");
      }

      const renamed = (await response.json()) as { assetFolder?: string; assetBasePath?: string; project?: ProjectJsonImport };
      if (!renamed.assetFolder || !renamed.project || !isProjectJsonImport(renamed.project)) {
        throw new Error("Project rename failed.");
      }

      setSpaces((current) =>
        current.map((currentSpace) =>
          currentSpace.id === space.id
            ? {
                ...currentSpace,
                name: nextName,
                assetFolder: renamed.assetFolder as string,
                assetBasePath: renamed.assetBasePath ?? `/${renamed.assetFolder}`,
                updatedAt: new Date().toISOString(),
                project: renamed.project as ProjectJsonImport,
              }
            : currentSpace,
        ),
      );
      setSpaceNameDrafts((current) => ({ ...current, [space.id]: nextName }));
      if (activeSpaceId === space.id) {
        const nextCanvas = getProjectCanvas(renamed.project, canvasRef.current);
        if (nextCanvas) {
          setCanvas(nextCanvas);
          canvasRef.current = nextCanvas;
        }
      }
    } catch {
      setEditorWarning("Project folder rename failed. Name was not saved.");
      setSpaceNameDrafts((current) => ({ ...current, [space.id]: space.name }));
    }
  }

  function openSpace(space: PageBuilderSpace) {
    const nextCanvas = getProjectCanvas(space.project, canvasRef.current);
    saveActiveSpaceSnapshot(canvasRef.current);
    if (nextCanvas) {
      setCanvas(nextCanvas);
      canvasRef.current = nextCanvas;
      lastSavedJsonRef.current = JSON.stringify(nextCanvas);
      setSaveState("saved");
      setSelectedId(undefined);
      setSelectedIds([]);
      setEditingTextId(undefined);
      setBackgroundInspectorOpen(false);
      setInspectorCollapsed(true);
    }
    setActiveSpaceId(space.id);
    setSelectedSpaceId(space.id);
    closeSpaces();
    showQuickToolsToast(`Opened ${space.name}.`);
  }

  function openProjectPage(slug: string) {
    if (!activeSpace) {
      return;
    }

    saveActiveSpaceSnapshot(canvasRef.current);
    const page = activeSpace.project.pages.find((projectPage) => projectPage.slug === slug) ?? activeSpace.project.pages.find((projectPage) => projectPage.slug === "") ?? activeSpace.project.pages[0];
    if (!page) {
      return;
    }

    setCanvas(page.canvas);
    canvasRef.current = page.canvas;
    setSelectedId(undefined);
    setSelectedIds([]);
    setEditingTextId(undefined);
    window.history.pushState(null, "", `${getProjectPagePath(activeSpace.assetFolder, page.slug)}?edit=1`);
    setSpaces((current) => current.map((space) => (space.id === activeSpace.id ? { ...space, project: { ...space.project, currentSlug: page.slug } } : space)));
  }

  function uniqueProjectPageSlug(project: ProjectJsonImport, requestedSlug: string, oldSlug?: string) {
    const base = getProjectFolderName(requestedSlug || "new-page");
    const existing = new Set(project.pages.filter((page) => page.slug !== oldSlug).map((page) => page.slug));
    let candidate = base;
    let index = 1;

    while (existing.has(candidate)) {
      candidate = `${base}-${index}`;
      index += 1;
    }

    return candidate;
  }

  function makeBlankProjectPage(space: PageBuilderSpace, title: string, slug: string) {
    const canvas: CanvasDocument = {
      slug,
      title,
      height: 810,
      mobileHeight: MOBILE_ARTBOARD_HEIGHT,
      backgroundColor: "#fafaf7",
      items: [],
    };

    return { slug, title, file: getSpaceSafeCanvasSlug(space, slug), canvas };
  }

  function selectProjectPage(space: PageBuilderSpace, page: ProjectJsonImport["pages"][number], project: ProjectJsonImport) {
    setCanvas(page.canvas);
    canvasRef.current = page.canvas;
    setSelectedId(undefined);
    setSelectedIds([]);
    setEditingTextId(undefined);
    window.history.pushState(null, "", `${getProjectPagePath(space.assetFolder, page.slug)}?edit=1`);
    updateSpaceSnapshot(space.id, project);
  }

  function createProjectPage(title: string, requestedSlug: string) {
    if (!activeSpace) {
      return;
    }

    const baseProject = updateProjectCanvas(activeSpace.project, canvasRef.current, activeSpace);
    const slug = uniqueProjectPageSlug(baseProject, requestedSlug);
    const page = makeBlankProjectPage(activeSpace, title, slug);
    selectProjectPage(activeSpace, page, { ...baseProject, currentSlug: slug, pages: [...baseProject.pages, page] });
  }

  function duplicateProjectPage(title?: string, requestedSlug?: string) {
    if (!activeSpace) {
      return;
    }

    const baseProject = updateProjectCanvas(activeSpace.project, canvasRef.current, activeSpace);
    const source = baseProject.pages.find((page) => page.slug === getCanvasRouteSlug(canvasRef.current)) ?? baseProject.pages.find((page) => page.slug === baseProject.currentSlug) ?? baseProject.pages[0];
    if (!source) {
      return;
    }

    const nextTitle = title || `${source.title} Copy`;
    const slug = uniqueProjectPageSlug(baseProject, requestedSlug || `${source.slug || "home"}-copy`);
    const page = { slug, title: nextTitle, file: getSpaceSafeCanvasSlug(activeSpace, slug), canvas: { ...source.canvas, slug, title: nextTitle } };
    selectProjectPage(activeSpace, page, { ...baseProject, currentSlug: slug, pages: [...baseProject.pages, page] });
  }

  function updateProjectPage(oldSlug: string, title: string, requestedSlug: string) {
    if (!activeSpace) {
      return;
    }

    const baseProject = updateProjectCanvas(activeSpace.project, canvasRef.current, activeSpace);
    const slug = oldSlug === "" ? "" : uniqueProjectPageSlug(baseProject, requestedSlug, oldSlug);
    const nextPages = baseProject.pages.map((page) => (page.slug === oldSlug ? { slug, title, file: getSpaceSafeCanvasSlug(activeSpace, slug), canvas: { ...page.canvas, slug, title } } : page));
    const page = nextPages.find((nextPage) => nextPage.slug === slug);
    if (page) {
      selectProjectPage(activeSpace, page, { ...baseProject, currentSlug: slug, pages: nextPages });
    }
  }

  function deleteProjectPage(slug: string) {
    if (!activeSpace) {
      return;
    }

    const baseProject = updateProjectCanvas(activeSpace.project, canvasRef.current, activeSpace);
    const remaining = baseProject.pages.filter((page) => page.slug !== slug);
    const pages = remaining.length ? remaining : [makeBlankProjectPage(activeSpace, "Home", "")];
    const nextPage = pages.find((page) => page.slug === "") ?? pages[0];
    selectProjectPage(activeSpace, nextPage, { ...baseProject, currentSlug: nextPage.slug, pages });
  }

  function deleteSpace(space: PageBuilderSpace) {
    if (spaces[0]?.id === space.id || space.name.trim().toLowerCase() === "project1" || !window.confirm("This will delete the entire project. Continue?")) {
      return;
    }

    const nextSpaces = spaces.filter((currentSpace) => currentSpace.id !== space.id);
    void fetch("/api/dev-assets/delete-project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetFolder: space.assetFolder, activeFolders: nextSpaces.map((nextSpace) => nextSpace.assetFolder) }),
    })
      .then((response) => {
        if (!response.ok) {
          setEditorWarning("Project folder cleanup failed.");
        }
      })
      .catch(() => setEditorWarning("Project folder cleanup failed."));
    if (selectedSpaceId === space.id) {
      setSelectedSpaceId(nextSpaces[0]?.id ?? "");
    }
    if (activeSpaceId === space.id) {
      setActiveSpaceId(nextSpaces[0]?.id ?? "");
    }
    setSpaces(nextSpaces);
  }

  async function importProjectJson(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    try {
      let parsed: unknown;
      let assetReplacements = new Map<string, string>();
      if (file.name.toLowerCase().endsWith(".zip")) {
        const zip = await JSZip.loadAsync(file);
        const projectFile = zip.file("pagebuilder-project.json");
        if (!projectFile) {
          throw new Error("Missing pagebuilder-project.json.");
        }
        parsed = JSON.parse(await projectFile.async("string")) as unknown;
        if (activeSpace) {
          assetReplacements = await importZipAssets(zip, activeSpace.assetFolder);
          parsed = rewriteImportedAssetPaths(parsed, assetReplacements);
        }
      } else {
        parsed = JSON.parse(await file.text()) as unknown;
      }
      const currentSlug = getCanvasRouteSlug(canvasRef.current);
      const projectImport = isProjectJsonImport(parsed) ? parsed : isWebRoomPackageImport(parsed) ? parsed.project : null;
      const importedCanvas = isCanvasImport(parsed)
        ? parsed
        : projectImport
          ? projectImport.pages.find((page) => page.slug === currentSlug)?.canvas ?? projectImport.pages.find((page) => page.slug === projectImport.currentSlug)?.canvas
          : null;

      if (!importedCanvas) {
        setEditorWarning(projectImport ? "No matching page found in project JSON." : "Invalid project JSON.");
        return;
      }

      if (!isCanvasImport(importedCanvas)) {
        setEditorWarning("Invalid project JSON.");
        return;
      }

      if (!window.confirm("Import Project and replace this page?")) {
        return;
      }

      commitCanvas(importedCanvas);
      setSelectedId(undefined);
      setSelectedIds([]);
      setEditingTextId(undefined);
      setBackgroundInspectorOpen(false);
      setInspectorCollapsed(true);
      setQuickToolsOpen(false);
      setEditorWarning("");
      showQuickToolsToast("Imported into this browser only. Export Project to keep it.");
    } catch {
      setEditorWarning("Invalid project JSON or ZIP.");
    }
  }

  async function importZipAssets(zip: JSZip, projectFolder: string) {
    const replacements = new Map<string, string>();

    await Promise.all(
      Object.values(zip.files).map(async (entry) => {
        if (entry.dir) {
          return;
        }

        const kind = getZipAssetKind(entry.name);
        if (!kind) {
          return;
        }

        const filename = getAssetFileName(entry.name);
        const blob = await entry.async("blob");
        const formData = new FormData();
        formData.append("kind", kind);
        formData.append("projectFolder", projectFolder);
        formData.append("file", new File([blob], filename));
        const response = await fetch("/api/dev-assets/upload", { method: "POST", body: formData });
        if (!response.ok) {
          return;
        }

        const uploaded = (await response.json()) as AssetFile;
        replacements.set(`${kind}/${filename}`, uploaded.src);
      }),
    );

    return replacements;
  }

  function rewriteImportedAssetPaths(value: unknown, replacements: Map<string, string>): unknown {
    if (!replacements.size) {
      return value;
    }
    if (typeof value === "string") {
      const filename = getAssetFileName(value);
      const folder = getZipAssetKind(value);
      return folder ? replacements.get(`${folder}/${filename}`) ?? value : value;
    }
    if (Array.isArray(value)) {
      return value.map((item) => rewriteImportedAssetPaths(item, replacements));
    }
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewriteImportedAssetPaths(item, replacements)]));
    }
    return value;
  }

  function getSpawnPosition(item: Pick<CanvasItem, "width" | "height">) {
    const count = canvasRef.current.items.length;
    const fallback = { x: 180 + count * 18, y: 180 + count * 18 };
    const rect = artboardRef.current?.getBoundingClientRect();

    if (!rect) {
      return fallback;
    }

    const clientX = clamp(window.innerWidth * 0.34, 24, window.innerWidth - 24);
    const clientY = clamp(window.innerHeight * 0.24, 72, window.innerHeight - 24);
    const stagger = (count % 6) * 18;
    const x = (clientX - rect.left) / editorScale + stagger;
    const y = (clientY - rect.top) / editorScale + stagger;

    return {
      x: clampPosition(clamp(x, -((item.width ?? 0) * 0.35), artboardWidth - Math.min(40, item.width ?? 40))),
      y: clampPosition(clamp(y, 0, artboardHeight - Math.min(40, item.height ?? 40))),
    };
  }

  function placeNewItem(baseItem: CanvasItem) {
    const spawn = getSpawnPosition(baseItem);
    const positioned = { ...baseItem, ...spawn };

    if (!mobileView) {
      return positioned;
    }

    return { ...positioned, mobile: { ...toMobileOverride(positioned), ...spawn } };
  }

  function commitTransformHistory() {
    if (groupTransformStartRef.current) {
      commitGroupTransformHistory();
      return;
    }

    const previous = transformStartRef.current;
    const draft = transformDraftRef.current;
    transformStartRef.current = null;
    transformDraftRef.current = null;
    dragStartRef.current = null;
    resizeStartRef.current = null;

    if (!previous || !draft || !selectedIdRef.current) {
      return;
    }

    const nextCanvas = {
      ...canvasRef.current,
      items: canvasRef.current.items.map((item) =>
        item.id === selectedIdRef.current ? mergeItemUpdates(item, draft, mobileView, Boolean(draft.fontSize !== undefined && (draft.width !== undefined || draft.height !== undefined))) : item,
      ),
    };

    if (JSON.stringify(previous) === JSON.stringify(nextCanvas)) {
      return;
    }

    pushPast(previous);
    setCanvas(nextCanvas);
    markDirty();
  }

  function commitGroupTransformHistory() {
    const previous = transformStartRef.current;
    const groupStart = groupTransformStartRef.current;
    const nextCanvas = canvasRef.current;
    transformStartRef.current = null;
    groupDraftRef.current = null;
    groupTransformStartRef.current = null;
    dragStartRef.current = null;

    if (!previous || !groupStart?.length) {
      return;
    }

    if (JSON.stringify(previous) === JSON.stringify(nextCanvas)) {
      return;
    }

    pushPast(previous);
    setCanvas(nextCanvas);
    markDirty();
  }

  function beginTransform() {
    transformStartRef.current = canvasRef.current;
    transformDraftRef.current = null;
    groupDraftRef.current = null;
    groupTransformStartRef.current = null;
    dragStartRef.current = null;
  }

  function beginDrag() {
    beginTransform();
    const selectedRoot = canvasRef.current.items.find((item) => item.id === selectedIdRef.current);
    const selected = selectedRoot ? getEffectiveItem(selectedRoot, mobileView) : undefined;
    dragStartRef.current = selected ? { id: selected.id, x: selected.x, y: selected.y } : null;
  }

  function beginGroupTransform() {
    beginTransform();
    groupTransformStartRef.current = selectedIdsRef.current
      .map((id) => canvasRef.current.items.find((item) => item.id === id))
      .filter((item): item is CanvasItem => Boolean(item && !item.locked))
      .map((item) => {
        const effective = getEffectiveItem(item, mobileView);
        return {
          id: effective.id,
          x: effective.x,
          y: effective.y,
          width: effective.width,
          height: effective.height ?? effective.width,
          fontSize: effective.fontSize ?? 24,
          type: effective.type,
          cropLeft: effective.cropLeft,
          cropTop: effective.cropTop,
          cropRight: effective.cropRight,
          cropBottom: effective.cropBottom,
        };
      });
  }

  function beginResize() {
    beginTransform();
    const selectedRoot = canvasRef.current.items.find((item) => item.id === selectedIdRef.current);
    const selected = selectedRoot ? getEffectiveItem(selectedRoot, mobileView) : undefined;
    resizeStartRef.current = selected
      ? {
          id: selected.id,
          x: selected.x,
          y: selected.y,
          width: selected.width,
          height: selected.height ?? selected.width,
          fontSize: selected.fontSize ?? 24,
          cropLeft: selected.cropLeft,
          cropTop: selected.cropTop,
          cropRight: selected.cropRight,
          cropBottom: selected.cropBottom,
        }
      : null;
  }

  function setLiveTargetTransform(target: HTMLElement | SVGElement, updates: Partial<CanvasItem>) {
    const selectedRoot = canvasRef.current.items.find((item) => item.id === selectedIdRef.current);
    const selected = selectedRoot ? getEffectiveItem(selectedRoot, mobileView) : undefined;

    if (!selected) {
      return;
    }

    const next = { ...selected, ...updates };
    target.style.transform = itemTransform(next);
    transformDraftRef.current = { ...transformDraftRef.current, ...updates };
  }

  function getTargetItemId(target: HTMLElement | SVGElement) {
    return target instanceof HTMLElement ? target.dataset.canvasItemId : undefined;
  }

  function setLiveGroupTargetTransform(target: HTMLElement | SVGElement, updates: Partial<CanvasItem>) {
    const id = getTargetItemId(target);
    const root = id ? canvasRef.current.items.find((item) => item.id === id) : undefined;
    const selected = root ? getEffectiveItem(root, mobileView) : undefined;

    if (!id || !selected || root?.locked) {
      return;
    }

    const next = { ...selected, ...updates };
    target.style.transform = itemTransform(next);

    if (updates.width !== undefined) {
      target.style.width = `${updates.width}px`;
    }

    if (updates.height !== undefined) {
      target.style.height = `${updates.height}px`;
    }

    if (updates.fontSize !== undefined) {
      target.style.fontSize = `${updates.fontSize}px`;
      const textNode = target.querySelector(".canvas-text-content");
      const audioPlayer = target.querySelector(".ascii-audio-player");
      if (textNode instanceof HTMLElement) {
        textNode.style.fontSize = `${updates.fontSize}px`;
      }
      if (audioPlayer instanceof HTMLElement) {
        audioPlayer.style.fontSize = `${updates.fontSize}px`;
      }
    }

    groupDraftRef.current = { ...groupDraftRef.current, [id]: { ...groupDraftRef.current?.[id], ...updates } };
  }

  function applyGroupDraftLive() {
    const draft = groupDraftRef.current;

    if (!draft || !Object.keys(draft).length) {
      return;
    }

    setCanvasLive({
      ...canvasRef.current,
      items: canvasRef.current.items.map((item) =>
        draft[item.id] && !item.locked
          ? mergeItemUpdates(item, draft[item.id], mobileView, Boolean(draft[item.id].fontSize !== undefined && (draft[item.id].width !== undefined || draft[item.id].height !== undefined)))
          : item,
      ),
    });
  }

  return (
    <main
      className={`canvas-shell ${mobileView ? "canvas-editor-mobile-shell" : ""}`}
      style={{ minHeight: mobileView ? "100dvh" : artboardHeight * editorScale, backgroundColor: mobileView ? undefined : canvas.backgroundColor ?? "#fafaf7" }}
    >
      {canvas.backgroundImage ? <div className="canvas-page-background-image" style={getBackgroundImageStyle(canvas)} /> : null}
      <PageBuilderPanel
        currentSlug={getCanvasRouteSlug(canvas)}
        pagesOverride={activeProjectPages}
        onSelectPage={useProjectScopedPages ? openProjectPage : undefined}
        getPageHref={activeSpace ? (slug) => `${getProjectPagePath(activeSpace.assetFolder, slug)}?edit=1` : undefined}
        onCreatePage={useProjectScopedPages ? createProjectPage : undefined}
        onDuplicatePage={useProjectScopedPages ? duplicateProjectPage : undefined}
        onUpdatePage={useProjectScopedPages ? updateProjectPage : undefined}
        onDeletePage={useProjectScopedPages ? deleteProjectPage : undefined}
      />
      <CanvasToolbar
        canSave={canSave}
        saveState={saveState}
        hasSelection={selectedIds.length > 0}
        mobileView={mobileView}
        onAdd={addItem}
        onView={openRealPage}
        onToggleMobileView={toggleMobileView}
        onDuplicate={duplicateSelected}
        onDelete={deleteSelected}
        onSave={saveCanvas}
      />
      <div ref={quickToolsRef} className={`canvas-quick-tools${quickToolsOpen ? " is-open" : ""}`}>
        <button type="button" className="canvas-quick-tools-button" onClick={() => setQuickToolsOpen((current) => !current)} aria-label="Quick tools">
          {QUICK_TOOLS_ICON}
        </button>
        <div className="canvas-quick-tools-menu">
          <button type="button" onClick={openSpaces}>
            Open Spaces
          </button>
          <button type="button" onClick={exportProjectJson}>
            Export Project
          </button>
          <button type="button" onClick={() => importInputRef.current?.click()}>
            Import Project
          </button>
          <button
            type="button"
            onClick={() => {
              if (splashClosingTimerRef.current) {
                window.clearTimeout(splashClosingTimerRef.current);
                splashClosingTimerRef.current = null;
              }
              setSplashClosing(false);
              setShowBetaSplash(true);
              setQuickToolsOpen(false);
            }}
          >
            Show Splash
          </button>
        </div>
        <input ref={importInputRef} className="visually-hidden" type="file" accept="application/json,.json,.webroom.json,.pagebuilder.json,.zip" onChange={importProjectJson} />
      </div>
      {exportSuccessOpen ? (
        <div
          className={`canvas-export-success-overlay${exportSuccessClosing ? " is-closing" : ""}`}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              dismissExportSuccessOverlay();
            }
          }}
        >
          <span>
            Perfect! Send this .zip to me using{" "}
            <a href="https://send.monks.tools/" target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
              this tool
            </a>
            .
          </span>
        </div>
      ) : null}
      {quickToolsToast ? (
        <div className="canvas-quick-tools-toast">
          {quickToolsToast}
        </div>
      ) : null}
      {editorWarning ? <div className="canvas-editor-warning">{editorWarning}</div> : null}
      {spacesOpen ? (
        <div className={`pagebuilder-spaces${spacesClosing ? " is-closing" : ""}`}>
          <div className="pagebuilder-spaces-panel">
            <div className="pagebuilder-spaces-topline">
              <span>Spaces</span>
              <button type="button" onClick={closeSpaces}>
                Back to Editor
              </button>
            </div>
            <div className="pagebuilder-spaces-grid">
              {spaces.map((space, index) => {
                const isStarterProject = index === 0 || space.name.trim().toLowerCase() === "project1";
                return (
                  <div key={space.id} className={`pagebuilder-space-card${selectedSpaceId === space.id ? " is-selected" : ""}`} onClick={() => setSelectedSpaceId(space.id)}>
                    <input
                      value={spaceNameDrafts[space.id] ?? space.name}
                      onChange={(event) => renameSpaceDraft(space.id, event.target.value)}
                      onBlur={() => void commitSpaceRename(space)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.currentTarget.blur();
                        }
                      }}
                      onClick={(event) => event.stopPropagation()}
                      aria-label="Project name"
                    />
                    <span>Last edited {new Date(space.updatedAt).toLocaleDateString()}</span>
                    <div className="pagebuilder-space-actions">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openSpace(space);
                        }}
                      >
                        Open
                      </button>
                      {isStarterProject ? (
                        <button type="button" disabled title="project1 is the starter project">
                          Delete
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            deleteSpace(space);
                          }}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              <button type="button" className="pagebuilder-space-card pagebuilder-space-new" onClick={createSpace}>
                New Project
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {draftPrompt ? (
        <div className="canvas-draft-prompt">
          <strong>Local draft found</strong>
          <span>You may have unsaved work from {new Date(draftPrompt.savedAt).toLocaleString()}.</span>
          <div>
            <button type="button" onClick={restoreDraft}>
              restore
            </button>
            <button
              type="button"
              onClick={() => {
                draftPromptPendingRef.current = false;
                setDraftPrompt(null);
              }}
            >
              ignore
            </button>
          </div>
        </div>
      ) : null}
      <div
        ref={artboardRef}
        className={`canvas-artboard ${mobileView ? "canvas-artboard-mobile-editor" : ""}`}
        style={{
          width: artboardWidth,
          height: artboardHeight,
          left: "50%",
          transform: `scale(${editorScale}) translateX(-50%)`,
          transformOrigin: "top left",
          backgroundColor: canvas.backgroundColor ?? "#fafaf7",
        }}
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) {
            if (selectedIdRef.current || editingTextId) {
              setSelectedId(undefined);
              setSelectedIds([]);
              setEditingTextId(undefined);
              setBackgroundInspectorOpen(false);
              setInspectorCollapsed(true);
              return;
            }

            if (backgroundInspectorOpen) {
              setBackgroundInspectorOpen(false);
              setInspectorCollapsed(true);
              return;
            }

            setBackgroundInspectorOpen(true);
            setInspectorCollapsed(false);
          }
        }}
      >
        {canvas.backgroundImage ? <div className="canvas-background-image" style={getBackgroundImageStyle(canvas)} /> : null}
        {effectiveItems.map((item) => (
          <div
            key={item.id}
            data-canvas-item-id={item.id}
            ref={(node) => {
              refs.current[item.id] = node;
              if (item.id === selectedIdRef.current && selectedIdsRef.current.length <= 1 && !item.locked) {
                setSelectedTarget(node);
              }
            }}
            className={[
              "canvas-item",
              `canvas-item-type-${item.type}`,
              selectedIds.includes(item.id) ? "canvas-item-selected" : "",
              item.locked ? "canvas-locked-ghost" : "",
              item.hidden ? "canvas-hidden-ghost" : "",
              item.hidden && item.type === "image" ? "canvas-hidden-ghost-image" : "",
              getHoverEffectClass(item),
              getIdleEffectClass(item),
            ]
              .filter(Boolean)
              .join(" ")}
            style={
              {
                width: item.width,
                height: item.height,
                zIndex: item.zIndex,
                transform: itemTransform(item),
                transformOrigin: "center center",
                "--parallax-y": "0px",
                "--fade-delay": `${item.fadeDelay ?? 0}s`,
                "--hover-color": item.hoverColor ?? item.color ?? "currentColor",
                ...getHoverStyleVars(item),
                ...getIdleStyleVars(item),
              } as CanvasItemStyle
            }
            onPointerDown={(event) => {
              event.stopPropagation();
              if (item.locked) {
                return;
              }
              const additive = event.shiftKey || event.ctrlKey || event.metaKey;
              if (additive) {
                setSelectedIds((current) => {
                  const next = current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id];
                  setSelectedId(next[0]);
                  return next;
                });
              } else {
                setSelectedId(item.id);
                setSelectedIds([item.id]);
              }
              setBackgroundInspectorOpen(false);
              if (!isTextLike(item)) {
                setEditingTextId(undefined);
              }
            }}
            onDoubleClick={(event) => {
              if (item.locked) {
                event.stopPropagation();
                updateItem(item.id, { locked: undefined });
                return;
              }

              if (!isTextLike(item)) {
                return;
              }

              event.stopPropagation();
              setSelectedId(item.id);
              setSelectedIds([item.id]);
              setBackgroundInspectorOpen(false);
              setInspectorCollapsed(false);
              setEditingTextId(item.id);
            }}
          >
            {item.hidden || item.locked ? (
              <div className="canvas-flag-row">
                {item.locked ? (
                  <button
                    type="button"
                    className="canvas-locked-label"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      updateItem(item.id, { locked: undefined });
                    }}
                  >
                    locked
                  </button>
                ) : null}
                {item.hidden ? <span className="canvas-hidden-label">hidden</span> : null}
              </div>
            ) : null}
            <div className="canvas-item-position-wrapper">
              <div className="canvas-item-fade-wrapper">
                <div className="canvas-item-hover-wrapper">
                  <div className="canvas-item-idle-wrapper">
                    <RenderCanvasItem
                      item={item}
                      editMode
                      editing={editingTextId === item.id}
                      selected={selectedIds.includes(item.id)}
                      onTextChange={
                        isTextLike(item)
                          ? (text) => {
                              updateItem(item.id, { text }, false);
                            }
                          : undefined
                      }
                      onTextBlur={() => setEditingTextId(undefined)}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
        <Moveable
          key={moveableKey}
          ref={moveableRef}
          target={moveableTarget}
          draggable={!editingTextId && (groupSelected ? selectedTargets.length > 0 : selectedIds.length === 1 && !selectedItem?.locked)}
          resizable={groupSelected ? selectedTargets.length > 0 : selectedIds.length === 1 && !selectedItem?.locked}
          rotatable={!groupSelected && selectedIds.length === 1 && !selectedItem?.locked}
          origin={false}
          keepRatio={false}
          renderDirections={renderDirections}
          throttleDrag={0}
          throttleResize={0}
          throttleRotate={0}
          zoom={1 / editorScale}
          onDragStart={() => {
            beginDrag();
            resizeStartRef.current = null;
          }}
          onDragGroupStart={() => {
            beginGroupTransform();
          }}
          onResizeStart={() => {
            beginResize();
          }}
          onResizeGroupStart={() => {
            beginGroupTransform();
          }}
          onRotateStart={() => {
            beginTransform();
            resizeStartRef.current = null;
          }}
          onDrag={({ target, dist }) => {
            const start = dragStartRef.current;

            if (!start) {
              return;
            }

            const x = clampPosition(start.x + dist[0] / editorScale);
            const y = clampPosition(start.y + dist[1] / editorScale);

            setLiveTargetTransform(target, { x, y });
          }}
          onDragGroup={({ events }) => {
            const starts = groupTransformStartRef.current ?? [];

            events.forEach(({ target, dist }) => {
              const id = getTargetItemId(target);
              const start = id ? starts.find((item) => item.id === id) : undefined;

              if (!start) {
                return;
              }

              setLiveGroupTargetTransform(target, {
                x: clampPosition(start.x + dist[0] / editorScale),
                y: clampPosition(start.y + dist[1] / editorScale),
              });
            });
            applyGroupDraftLive();
          }}
          onResize={({ target, width, height, drag, inputEvent, direction }) => {
            const selectedRoot = canvasRef.current.items.find((item) => item.id === selectedIdRef.current);
            const selected = selectedRoot ? getEffectiveItem(selectedRoot, mobileView) : undefined;
            const start = resizeStartRef.current;
            const modifierKey = Boolean(inputEvent && (("ctrlKey" in inputEvent && inputEvent.ctrlKey) || ("metaKey" in inputEvent && inputEvent.metaKey)));
            const x = start ? clampPosition(start.x + (drag.dist?.[0] ?? 0) / editorScale) : clampPosition(drag.beforeTranslate[0]);
            const y = start ? clampPosition(start.y + (drag.dist?.[1] ?? 0) / editorScale) : clampPosition(drag.beforeTranslate[1]);

            if (selected && start?.id === selected.id && isTextLike(selected)) {
              const isCornerResize = Boolean(direction?.[0] && direction?.[1]);
              const isHorizontalResize = Boolean(direction?.[0] && !direction?.[1]);
              const shiftKey = Boolean(inputEvent && "shiftKey" in inputEvent && inputEvent.shiftKey);

              if (!isCornerResize && !isHorizontalResize) {
                return;
              }

              const nextWidth = clampSize(width);
              const textNode = target.querySelector(".canvas-text-content");

              if (!shiftKey || isHorizontalResize) {
                const widthScale = shiftKey && start.width ? nextWidth / start.width : 1;
                const nextHeight = shiftKey && isHorizontalResize ? clampSize(start.height * widthScale) : isHorizontalResize ? start.height : clampSize(height);
                const nextFontSize = shiftKey ? clampFontSize(start.fontSize * widthScale) : undefined;

                target.style.width = `${nextWidth}px`;
                target.style.height = `${nextHeight}px`;

                if (nextFontSize !== undefined && textNode instanceof HTMLElement) {
                  textNode.style.fontSize = `${nextFontSize}px`;
                }

                const textUpdates: Partial<CanvasItem> = { width: nextWidth, height: nextHeight, autoFitText: false, x, y };
                if (nextFontSize !== undefined) {
                  textUpdates.fontSize = nextFontSize;
                }

                setLiveTargetTransform(target, textUpdates);
                return;
              }

              const lockedResize = getCornerRatioResize(start, direction, x, y, width, height);
              const nextScaledWidth = lockedResize.width;
              const nextScaledHeight = lockedResize.height;
              const nextFontSize = clampFontSize(start.fontSize * lockedResize.scale);

              target.style.width = `${nextScaledWidth}px`;
              target.style.height = `${nextScaledHeight}px`;

              if (textNode instanceof HTMLElement) {
                textNode.style.fontSize = `${nextFontSize}px`;
              }

              setLiveTargetTransform(target, { width: nextScaledWidth, height: nextScaledHeight, fontSize: nextFontSize, autoFitText: false, x: lockedResize.x, y: lockedResize.y });
              return;
            }

            if (selected && start?.id === selected.id && selected.type === "audio") {
              const isCornerResize = Boolean(direction?.[0] && direction?.[1]);
              const isSideResize = !isCornerResize;
              const shiftKey = Boolean(inputEvent && "shiftKey" in inputEvent && inputEvent.shiftKey);
              const wrappingOnly = isSideResize || shiftKey || modifierKey;

              if ((!isCornerResize && !isSideResize) || !start.width || !start.height) {
                return;
              }

              const lockedResize = isCornerResize && !wrappingOnly ? getCornerRatioResize(start, direction, x, y, width, height) : undefined;
              const nextWidth = lockedResize?.width ?? clampSize(width);
              const nextHeight = lockedResize?.height ?? clampSize(height);
              const nextFontSize = wrappingOnly || !lockedResize ? undefined : clampFontSize(start.fontSize * lockedResize.scale);
              const audioPlayer = target.querySelector(".ascii-audio-player");

              target.style.width = `${nextWidth}px`;
              target.style.height = `${nextHeight}px`;
              if (nextFontSize !== undefined && audioPlayer instanceof HTMLElement) {
                audioPlayer.style.fontSize = `${nextFontSize}px`;
              }
              const audioUpdates: Partial<CanvasItem> = {
                width: nextWidth,
                height: nextHeight,
                x: lockedResize?.x ?? x,
                y: lockedResize?.y ?? y,
              };

              if (nextFontSize !== undefined) {
                audioUpdates.fontSize = nextFontSize;
              }

              setLiveTargetTransform(target, audioUpdates);
              return;
            }

            if (selected && start?.id === selected.id && selected.type === "image" && modifierKey) {
              const cropUpdates = getCropUpdates(start, width, height, drag.dist ?? [0, 0], editorScale, direction);
              target.style.width = `${cropUpdates.width}px`;
              target.style.height = `${cropUpdates.height}px`;
              applyImageCropStyle(target, cropUpdates);
              setLiveTargetTransform(target, cropUpdates);
              return;
            }

            let nextWidth = clampSize(width);
            let nextHeight = clampSize(height);
            const shiftKey = Boolean(inputEvent && "shiftKey" in inputEvent && inputEvent.shiftKey);
            const isCornerResize = Boolean(direction?.[0] && direction?.[1]);
            const isSideResize = Boolean(direction?.[0] || direction?.[1]) && !isCornerResize;

            if (selected && start?.id === selected.id && (selected.type === "image" || selected.type === "video") && shiftKey && isSideResize && start.width && start.height) {
              const sideResize = getDirectSideResize(start, direction, width, height);

              target.style.width = `${sideResize.width}px`;
              target.style.height = `${sideResize.height}px`;
              setLiveTargetTransform(target, {
                width: sideResize.width,
                height: sideResize.height,
                x: sideResize.x,
                y: sideResize.y,
              });
              return;
            }

            if (selected && start?.id === selected.id && (selected.type === "image" || selected.type === "video") && shiftKey && isCornerResize && start.width && start.height) {
              const lockedResize = getCornerRatioResize(start, direction, x, y, width, height);
              nextWidth = lockedResize.width;
              nextHeight = lockedResize.height;
              target.style.width = `${nextWidth}px`;
              target.style.height = `${nextHeight}px`;
              setLiveTargetTransform(target, {
                width: nextWidth,
                height: nextHeight,
                x: lockedResize.x,
                y: lockedResize.y,
              });
              return;
            }

            target.style.width = `${nextWidth}px`;
            target.style.height = `${nextHeight}px`;
            setLiveTargetTransform(target, {
              width: nextWidth,
              height: nextHeight,
              x,
              y,
            });
          }}
          onResizeGroup={({ events }) => {
            const starts = groupTransformStartRef.current ?? [];

            events.forEach(({ target, width, height, drag }) => {
              const id = getTargetItemId(target);
              const start = id ? starts.find((item) => item.id === id) : undefined;
              const nextWidth = clampSize(width);
              const nextHeight = clampSize(height);
              const x = start ? clampPosition(start.x + (drag.dist?.[0] ?? 0) / editorScale) : clampPosition(drag.beforeTranslate[0]);
              const y = start ? clampPosition(start.y + (drag.dist?.[1] ?? 0) / editorScale) : clampPosition(drag.beforeTranslate[1]);

              if (start?.type === "audio" && start.width && start.height) {
                const audioWidth = clampSize(width);
                const audioHeight = clampSize(height);
                setLiveGroupTargetTransform(target, {
                  width: audioWidth,
                  height: audioHeight,
                  x,
                  y,
                });
                return;
              }

              if (start && (start.type === "text" || start.type === "link" || start.type === "symbol")) {
                const widthScale = start.width ? nextWidth / start.width : 1;
                setLiveGroupTargetTransform(target, {
                  width: nextWidth,
                  height: nextHeight,
                  fontSize: clampFontSize(start.fontSize * widthScale),
                  autoFitText: false,
                  x,
                  y,
                });
                return;
              }

              setLiveGroupTargetTransform(target, {
                width: clampSize(width),
                height: clampSize(height),
                x,
                y,
              });
            });
            applyGroupDraftLive();
          }}
          onRotate={({ target, beforeRotate }) => {
            const updates: Partial<CanvasItem> = { rotate: round(beforeRotate) };
            setLiveTargetTransform(target, updates);
          }}
          onDragEnd={commitTransformHistory}
          onDragGroupEnd={commitGroupTransformHistory}
          onResizeEnd={commitTransformHistory}
          onResizeGroupEnd={commitGroupTransformHistory}
          onRotateEnd={commitTransformHistory}
        />
      </div>
      {inspectorCollapsed ? (
        <button type="button" className="canvas-inspector-collapsed" onClick={() => setInspectorCollapsed(false)}>
          INSPECTOR{backgroundInspectorOpen ? " / background" : selectedItem ? ` / ${selectedItem.id}` : ""}
        </button>
      ) : selectedItem || backgroundInspectorOpen ? (
        <CanvasInspector
          item={selectedItem}
          items={selectedItems}
          canvas={canvas}
          backgroundOpen={backgroundInspectorOpen}
          mobileView={mobileView}
          onBackgroundPick={openBackgroundImagePicker}
          onBackgroundChange={updateBackground}
          onChange={updateSelected}
          onCollapse={() => setInspectorCollapsed(true)}
        />
      ) : null}
      {pickerKind ? (
        <AssetPicker
          kind={pickerKind}
          projectFolder={spaces.find((space) => space.id === activeSpaceId)?.assetFolder}
          onClose={() => setPickerKind(null)}
          onSelect={onPickerSelect}
        />
      ) : null}
      {showBetaSplash ? (
        <div className={`webrooms-splash-overlay${splashClosing ? " is-closing" : ""}`}>
          <div className="webrooms-splash-card">
            <img className="webrooms-splash-logo" src="/project1/images/xsorce.png" alt="xsorce" />
            <div className="webrooms-splash-intro">
              <p>welcome to xsorce's</p>
              <h1>PageBuilder</h1>
              <span>thanks for beta testing :D</span>
            </div>
            <div className="webrooms-splash-note">
              <h2>There is No cloud storage yet</h2>
              <p>Make a new folder on your PC, and upload all images, videos, and audio use on your page from that folder.</p>
            </div>
            <div className="webrooms-splash-note">
              <h2>Export before you leave</h2>
              <p>Autosave works in case you need to refresh the page, but make sure to export your project before closing. Open Quick Tools in the upper-right corner and export your project as a JSON file.</p>
            </div>
            <div className="webrooms-splash-note">
              <h2>Report any issues to me</h2>
              <p>Keep a list of any bugs, inconviences, or design opinions you have while using the builder. Your feedback is much needed!</p>
            </div>
            <button type="button" className="webrooms-splash-button" onClick={dismissBetaSplash}>
              understood! enter the builder
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function getBackgroundImageStyle(canvas: CanvasDocument) {
  const fit = canvas.backgroundImageFit ?? "cover";
  const recolorIntensity = Math.min(Math.max(canvas.backgroundImageRecolorIntensity ?? 0, 0), 100) / 100;
  const recolorColor = canvas.backgroundImageRecolorColor ?? "transparent";

  return {
    backgroundImage: recolorIntensity > 0 ? `linear-gradient(color-mix(in srgb, ${recolorColor} ${recolorIntensity * 100}%, transparent), color-mix(in srgb, ${recolorColor} ${recolorIntensity * 100}%, transparent)), url("${canvas.backgroundImage}")` : `url("${canvas.backgroundImage}")`,
    backgroundRepeat: fit === "tile" ? "repeat" : "no-repeat",
    backgroundPosition: "center",
    backgroundSize: fit === "stretch" ? "100% 100%" : fit === "tile" ? "auto" : fit,
    opacity: canvas.backgroundImageOpacity ?? 1,
    backgroundBlendMode: recolorIntensity > 0 ? "color" : undefined,
    filter: recolorIntensity > 0 ? `saturate(${1 + recolorIntensity})` : undefined,
  };
}
