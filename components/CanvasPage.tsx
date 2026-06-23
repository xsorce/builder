"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent } from "react";
import type { CanvasDocument, CanvasItem as CanvasItemData } from "@/content/canvas";
import { CanvasEditor } from "@/components/CanvasEditor";
import { CanvasItem } from "@/components/CanvasItem";

const ARTBOARD_WIDTH = 1440;
const MOBILE_ARTBOARD_WIDTH = 390;
const MOBILE_ARTBOARD_HEIGHT = 844;
const MOBILE_PARALLAX_CUTOFF = 640;

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

type CanvasPageProps = {
  canvas: CanvasDocument;
  editMode?: boolean;
};

export function CanvasPage({ canvas, editMode = false }: CanvasPageProps) {
  const [previewCanvas, setPreviewCanvas] = useState<CanvasDocument | null>(null);
  const [viewportWidth, setViewportWidth] = useState<number | null>(null);
  const [forcedMobilePreview, setForcedMobilePreview] = useState(false);
  const [passwordValue, setPasswordValue] = useState("");
  const [passwordWrong, setPasswordWrong] = useState(false);
  const [passwordUnlocked, setPasswordUnlocked] = useState(false);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const currentCanvas = previewCanvas ?? canvas;

  useLayoutEffect(() => {
    function updateWidth() {
      setViewportWidth(window.innerWidth);
    }

    updateWidth();
    setForcedMobilePreview(new URLSearchParams(window.location.search).get("view") === "mobile");
    if (!editMode) {
      try {
        const [, projectSlug, rawPageSlug] = window.location.pathname.split("/");
        const storedCanvas = window.sessionStorage.getItem("pagebuilder-preview-canvas");
        const storedSpaces = window.localStorage.getItem("pagebuilder-spaces-v1");
        const spaces = storedSpaces ? (JSON.parse(storedSpaces) as Array<{ assetFolder?: string; project?: { pages?: Array<{ slug: string; canvas: CanvasDocument }> } }>) : [];
        const project = spaces.find((space) => space.assetFolder === projectSlug)?.project;
        const pageSlug = rawPageSlug === "home" ? "" : rawPageSlug ?? "";
        const page = project?.pages?.find((projectPage) => projectPage.slug === pageSlug) ?? project?.pages?.find((projectPage) => projectPage.slug === "") ?? project?.pages?.[0];
        setPreviewCanvas(page?.canvas ?? (new URLSearchParams(window.location.search).get("previewCanvas") === "1" && storedCanvas ? (JSON.parse(storedCanvas) as CanvasDocument) : null));
      } catch {
        setPreviewCanvas(null);
      }
    }
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, [editMode]);

  const mobilePreview = !editMode && viewportWidth !== null && (forcedMobilePreview || viewportWidth <= MOBILE_PARALLAX_CUTOFF);
  const artboardWidth = mobilePreview ? MOBILE_ARTBOARD_WIDTH : ARTBOARD_WIDTH;
  const artboardHeight = mobilePreview ? currentCanvas.mobileHeight ?? MOBILE_ARTBOARD_HEIGHT : currentCanvas.height;
  const effectiveItems = useMemo(() => currentCanvas.items.map((item) => (mobilePreview ? getMobilePreviewItem(item) : item)), [currentCanvas.items, mobilePreview]);
  const scale = useMemo(() => {
    if (forcedMobilePreview && viewportWidth !== null) {
      return Math.max(0.2, Math.min((viewportWidth - 32) / artboardWidth, (window.innerHeight - 32) / artboardHeight));
    }

    return Math.min(1, (viewportWidth ?? artboardWidth) / artboardWidth);
  }, [artboardHeight, artboardWidth, forcedMobilePreview, viewportWidth]);
  const canvasReady = viewportWidth !== null;
  const shellClassName = `canvas-shell${forcedMobilePreview ? " canvas-shell-mobile-preview" : ""}`;
  const pagePassword = currentCanvas.password?.trim();

  useEffect(() => {
    document.title = currentCanvas.title || currentCanvas.slug || "project";
  }, [currentCanvas.slug, currentCanvas.title]);

  useEffect(() => {
    if (editMode || !currentCanvas.password?.trim()) {
      setPasswordUnlocked(false);
      return;
    }

    setPasswordUnlocked(window.sessionStorage.getItem(getPasswordStorageKey(currentCanvas.slug)) === "1");
  }, [currentCanvas.password, currentCanvas.slug, editMode]);

  useEffect(() => {
    if (!passwordWrong) {
      return;
    }

    const timeout = window.setTimeout(() => setPasswordWrong(false), 1500);
    return () => window.clearTimeout(timeout);
  }, [passwordWrong]);

  useLayoutEffect(() => {
    if (editMode) {
      return;
    }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let interval = 0;
    let lastScrollY = -1;
    let lastWidth = -1;

    function updateParallax() {
      const disabled = reduceMotion.matches || forcedMobilePreview || window.innerWidth <= MOBILE_PARALLAX_CUTOFF;

      for (const item of effectiveItems) {
        const node = itemRefs.current[item.id];
        if (!node) {
          continue;
        }

        const offset = disabled ? 0 : window.scrollY * getParallaxSpeed(item);
        node.style.setProperty("--parallax-y", `${offset.toFixed(2)}px`);
      }
    }

    function tick() {
      if (lastScrollY !== window.scrollY || lastWidth !== window.innerWidth) {
        lastScrollY = window.scrollY;
        lastWidth = window.innerWidth;
        updateParallax();
      }
    }

    function scheduleTick() {
      if (frame) {
        return;
      }

      frame = window.requestAnimationFrame(() => {
        frame = 0;
        tick();
      });
    }

    tick();
    window.addEventListener("scroll", scheduleTick, { passive: true });
    window.addEventListener("resize", scheduleTick);
    interval = window.setInterval(tick, 240);
    reduceMotion.addEventListener("change", updateParallax);

    return () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
      window.clearInterval(interval);
      window.removeEventListener("scroll", scheduleTick);
      window.removeEventListener("resize", scheduleTick);
      reduceMotion.removeEventListener("change", updateParallax);
    };
  }, [effectiveItems, editMode, forcedMobilePreview]);

  if (editMode) {
    return <CanvasEditor initialCanvas={currentCanvas} scale={scale} />;
  }

  if (pagePassword && !passwordUnlocked) {
    return (
      <main className="canvas-password-screen">
        <form
          className="canvas-password-card"
          onSubmit={(event) => {
            event.preventDefault();
            if (passwordValue === pagePassword) {
              window.sessionStorage.setItem(getPasswordStorageKey(currentCanvas.slug), "1");
              setPasswordUnlocked(true);
              setPasswordWrong(false);
            } else {
              setPasswordWrong(true);
            }
          }}
        >
          <div>Password</div>
          <input
            value={passwordValue}
            onChange={(event) => {
              setPasswordValue(event.target.value);
              setPasswordWrong(false);
            }}
            autoComplete="current-password"
          />
          <button type="submit">Enter</button>
          <small>{passwordWrong ? "wrong password" : "\u00a0"}</small>
        </form>
      </main>
    );
  }

  function keepForcedMobileLinks(event: MouseEvent<HTMLElement>) {
    if (!forcedMobilePreview) {
      return;
    }

    const anchor = (event.target as HTMLElement).closest("a");
    if (!anchor || anchor.target === "_blank") {
      return;
    }

    const href = anchor.getAttribute("href");
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
      return;
    }

    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin) {
      return;
    }

    url.searchParams.set("view", "mobile");
    event.preventDefault();
    window.location.href = `${url.pathname}${url.search}${url.hash}`;
  }

  return (
    <main className={shellClassName} onClick={keepForcedMobileLinks} style={{ minHeight: forcedMobilePreview ? "100dvh" : artboardHeight * scale, visibility: canvasReady ? "visible" : "hidden", backgroundColor: forcedMobilePreview ? undefined : currentCanvas.backgroundColor ?? "#fafaf7" }}>
      {currentCanvas.backgroundImage ? <div className="canvas-page-background-image" style={getBackgroundImageStyle(currentCanvas)} /> : null}
      <div
        className="canvas-artboard"
        style={{
          width: artboardWidth,
          height: artboardHeight,
          left: "50%",
          top: forcedMobilePreview ? "50%" : 0,
          transform: forcedMobilePreview ? `translate(-50%, -50%) scale(${scale})` : `scale(${scale}) translateX(-50%)`,
          transformOrigin: forcedMobilePreview ? "center center" : "top left",
          backgroundColor: currentCanvas.backgroundColor ?? "#fafaf7",
        }}
      >
        {currentCanvas.backgroundImage ? <div className="canvas-background-image" style={getBackgroundImageStyle(currentCanvas)} /> : null}
        {effectiveItems.filter((item) => !item.hidden).map((item) => (
          <div
            key={item.id}
            ref={(node) => {
              itemRefs.current[item.id] = node;
            }}
            className={[
              "canvas-item",
              `canvas-item-type-${item.type}`,
              item.href ? "canvas-item-clickable" : "",
              item.hoverColor ? "canvas-item-has-hover-color" : "",
              isPassiveMediaItem(item) ? "canvas-item-passive-media" : "",
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
                "--canvas-x": `${item.x}px`,
                "--canvas-y": `${item.y}px`,
                "--canvas-rotate": `${item.rotate}deg`,
                "--parallax-y": "0px",
                "--fade-delay": `${item.fadeDelay ?? 0}s`,
                "--hover-color": item.hoverColor ?? item.color ?? "currentColor",
                ...getHoverStyleVars(item),
                ...getIdleStyleVars(item),
              } as CanvasItemStyle
            }
          >
            <div className="canvas-item-position-wrapper">
              <div className="canvas-item-fade-wrapper">
                <div className="canvas-item-hover-wrapper">
                  <div className="canvas-item-idle-wrapper">
                    <CanvasItem item={item} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

function getPasswordStorageKey(slug: string) {
  return `web-builder-page-password-${slug || "home"}`;
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

function getMobilePreviewItem(item: CanvasItemData) {
  const effective = { ...item, ...item.mobile };
  return isBackIndexLink(item) ? { ...effective, x: 275, y: 54, fontSize: 13 } : effective;
}

function isBackIndexLink(item: Pick<CanvasItemData, "href" | "text">) {
  return item.href === "/" && typeof item.text === "string" && item.text.toLowerCase().startsWith("back /");
}

function isPassiveMediaItem(item: CanvasItemData) {
  return (item.type === "image" || item.type === "video") && !item.href && !item.controls && !getHoverEffectClass(item);
}

function getHoverEffectClass(item: CanvasItemData) {
  const effect = item.hoverEffect === "shock" || item.hoverEffect === "float" || item.hoverEffect === "tilt" || item.hoverEffect === "drift" ? "lift" : item.hoverEffect ?? "none";

  if (effect === "color" || effect === "lift" || effect === "glow" || effect === "focus") {
    return `canvas-item-hover-${effect}`;
  }

  return "";
}

function getHoverStyleVars(_item: CanvasItemData): CanvasItemStyle {
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

function getIdleEffectClass(item: CanvasItemData) {
  const effect = item.idleEffect === "pulse" ? "breathe" : item.idleEffect ?? "none";

  if (effect === "float" || effect === "breathe" || effect === "drift" || effect === "sway") {
    return `canvas-item-idle-${effect}`;
  }

  return "";
}

function getIdleStyleVars(item: CanvasItemData): CanvasItemStyle {
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

function getParallaxSpeed(item: CanvasItemData) {
  let speed = 0.18;

  if (typeof item.parallaxSpeed === "number") {
    speed = item.parallaxSpeed;
  } else if (item.type === "image" || item.type === "video" || item.type === "audio") {
    speed = 0.08;
  } else if (item.type === "text") {
    speed = 0;
  } else if (item.type === "link") {
    speed = 0.24;
  }

  return Math.min(Math.max(speed, 0), 1);
}
