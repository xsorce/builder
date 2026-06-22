import type { CSSProperties } from "react";

export type CanvasItemType = "text" | "image" | "video" | "audio" | "link" | "symbol";
export type CanvasFontFamily = "display" | "body" | "mono" | string;
export type CanvasSlug = string;
export type AssetKind = "images" | "videos" | "audio" | "shapes";

export type AssetFile = {
  name: string;
  src: string;
  ext: string;
  kind: "image" | "video" | "audio";
  warning?: string;
};

export type CanvasItemMobileOverride = Partial<Pick<CanvasItem, "x" | "y" | "width" | "height" | "fontSize">>;

export type CanvasItem = {
  id: string;
  type: CanvasItemType;
  x: number;
  y: number;
  width: number;
  height?: number;
  rotate: number;
  zIndex: number;
  opacity?: number;
  text?: string;
  src?: string;
  href?: string;
  title?: string;
  caption?: string;
  showTitle?: boolean;
  showCaption?: boolean;
  controls?: boolean;
  muted?: boolean;
  loop?: boolean;
  autoPlay?: boolean;
  audioBackground?: boolean;
  fontSize?: number;
  fontWeight?: number;
  fontFamily?: CanvasFontFamily;
  textAlign?: "left" | "center" | "right";
  autoFitText?: boolean;
  color?: string;
  recolorColor?: string;
  recolorIntensity?: number;
  cropLeft?: number;
  cropTop?: number;
  cropRight?: number;
  cropBottom?: number;
  hoverColor?: string;
  blendMode?: CSSProperties["mixBlendMode"];
  parallaxSpeed?: number;
  fadeDelay?: number;
  hoverEffect?: "none" | "color" | "lift" | "drift" | "glow" | "focus" | "float" | "shock" | "tilt";
  idleEffect?: "none" | "float" | "breathe" | "drift" | "sway" | "pulse";
  hoverStrength?: number;
  idleStrength?: number;
  hidden?: boolean;
  locked?: boolean;
  mobile?: CanvasItemMobileOverride;
};

export type CanvasPageData = {
  slug: CanvasSlug;
  title: string;
  height: number;
  mobileHeight?: number;
  backgroundColor?: string;
  backgroundImage?: string;
  backgroundImageOpacity?: number;
  backgroundImageFit?: "cover" | "contain" | "tile" | "stretch";
  backgroundImageRecolorColor?: string;
  backgroundImageRecolorIntensity?: number;
  password?: string;
  items: CanvasItem[];
};

export type CanvasDocument = CanvasPageData;

export type CanvasPageRegistryEntry = {
  slug: string;
  title: string;
  file: string;
};
