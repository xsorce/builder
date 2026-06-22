"use client";

import { useEffect, useRef, useState } from "react";
import { AsciiAudioPlayer } from "@/components/AsciiAudioPlayer";
import type { CanvasItem as CanvasItemData } from "@/content/canvas";

type CanvasItemProps = {
  item: CanvasItemData;
  editMode?: boolean;
  editing?: boolean;
  selected?: boolean;
  onTextChange?: (text: string) => void;
  onTextBlur?: () => void;
};

export function CanvasItem({ item, editMode = false, editing = false, selected = false, onTextChange, onTextBlur }: CanvasItemProps) {
  const [failed, setFailed] = useState(false);
  const isHiddenInEditor = editMode && item.hidden;
  const shouldHidePublicly = item.hidden && !editMode;
  const commonStyle = {
    fontSize: item.fontSize,
    fontWeight: item.fontWeight,
    fontFamily: resolveCanvasFont(item.fontFamily, item),
    color: item.color ?? "#111111",
    opacity: isHiddenInEditor ? 1 : item.opacity ?? 1,
    mixBlendMode: item.blendMode,
  } as React.CSSProperties;

  if (shouldHidePublicly) {
    return null;
  }

  if ((item.type === "image" || item.type === "video") && failed && !editMode) {
    return null;
  }

  if (item.type === "image") {
    if (failed) {
      return <MissingMedia item={item} />;
    }

    const recolorIntensity = Math.min(Math.max(item.recolorIntensity ?? 0, 0), 100) / 100;
    const recolorColor = item.recolorColor ?? "#ffffff";
    const cropStyle = getImageCropStyle(item);
    const imageStyle = {
      opacity: isHiddenInEditor ? 0.7 : commonStyle.opacity,
    };
    const isSvg = typeof item.src === "string" && item.src.toLowerCase().split("?")[0].endsWith(".svg");
    const hasRecolorOverlay = recolorIntensity > 0 && Boolean(item.src);
    const svgBaseStyle = {
      backgroundImage: item.src ? `url("${item.src}")` : undefined,
      opacity: isSvg && hasRecolorOverlay ? 0 : undefined,
    };

    return (
      <MediaWithLabels item={item} editMode={editMode}>
        <div className={`canvas-recolor-wrap${isSvg && hasRecolorOverlay ? " canvas-image-has-recolor-overlay" : ""}`} style={imageStyle}>
          <div className="canvas-image-crop-layer" style={cropStyle}>
            {isSvg ? (
              <div className="canvas-svg-image-fill" style={svgBaseStyle} />
            ) : (
              <img
                src={item.src}
                alt={item.text ?? item.title ?? ""}
                className="canvas-image-fill"
                draggable={false}
                onError={() => setFailed(true)}
              />
            )}
            {hasRecolorOverlay ? (
              <span
                className="canvas-recolor-overlay"
                style={{
                  backgroundColor: recolorColor,
                  opacity: recolorIntensity,
                  WebkitMaskImage: `url("${item.src}")`,
                  maskImage: `url("${item.src}")`,
                }}
              />
            ) : null}
            {item.src ? (
              <span
                className="canvas-hover-color-overlay"
                style={{
                  WebkitMaskImage: `url("${item.src}")`,
                  maskImage: `url("${item.src}")`,
                }}
              />
            ) : null}
          </div>
        </div>
      </MediaWithLabels>
    );
  }

  if (item.type === "video") {
    if (failed) {
      return <MissingMedia item={item} />;
    }

    return (
      <MediaWithLabels item={item} editMode={editMode}>
        <video
          src={item.src || undefined}
          className={`h-full w-full object-fill${editMode ? " canvas-editor-media-inner" : ""}`}
          style={commonStyle}
          autoPlay={Boolean(item.autoPlay)}
          muted={item.muted ?? true}
          loop={item.loop ?? true}
          playsInline
          controls={item.controls}
          onError={() => setFailed(true)}
        />
        {editMode && item.controls ? <div className={`canvas-editor-video-overlay${selected ? " is-selected" : ""}`} /> : null}
      </MediaWithLabels>
    );
  }

  if (item.type === "audio") {
    const audioContent = (
      <AsciiAudioPlayer
        src={item.src || undefined}
        title={(item.showTitle ?? Boolean(item.title)) ? (item.title || item.text || undefined) : undefined}
        caption={(item.showCaption ?? Boolean(item.caption)) ? item.caption : undefined}
        background={item.audioBackground !== false}
        style={commonStyle}
      />
    );

    return wrapWithHref(item, audioContent, editMode);
  }

  if (item.type === "link") {
    return <EditableText item={item} asLink={!editing} style={commonStyle} editMode={editMode} editing={editing} onTextChange={onTextChange} onTextBlur={onTextBlur} />;
  }

  if (item.href && (item.type === "text" || item.type === "symbol")) {
    return <EditableText item={item} asLink={!editing} style={commonStyle} editMode={editMode} editing={editing} onTextChange={onTextChange} onTextBlur={onTextBlur} />;
  }

  return <EditableText item={item} style={commonStyle} editMode={editMode} editing={editing} onTextChange={onTextChange} onTextBlur={onTextBlur} />;
}

function preventEditNavigation(event: React.MouseEvent<HTMLElement>) {
  event.preventDefault();
}

function wrapWithHref(item: CanvasItemData, children: React.ReactNode, editMode: boolean) {
  if (!item.href) {
    return children;
  }

  return (
    <a href={item.href} className="canvas-link inline-block h-full w-full" onClick={editMode ? preventEditNavigation : undefined}>
      {children}
    </a>
  );
}

function EditableText({
  item,
  asLink = false,
  style,
  editMode,
  editing,
  onTextChange,
  onTextBlur,
}: {
  item: CanvasItemData;
  asLink?: boolean;
  style: React.CSSProperties;
  editMode: boolean;
  editing: boolean;
  onTextChange?: (text: string) => void;
  onTextBlur?: () => void;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const setRef = (node: HTMLElement | null) => {
    ref.current = node;
  };
  const className = `canvas-text-content whitespace-pre-wrap leading-[0.95]${asLink ? " canvas-link canvas-link-inline" : ""}`;
  const text = item.text ?? (item.type === "link" ? item.href ?? "" : "");
  const embedSrc = getSafeEmbedSrc(text);
  const textStyle = {
    ...style,
    pointerEvents: editMode && !editing ? "none" : undefined,
    userSelect: editMode && !editing ? "none" : undefined,
  } as React.CSSProperties;
  if (!editing && (item.type === "text" || item.type === "link" || item.type === "symbol")) {
    textStyle.pointerEvents = undefined;
  }

  useEffect(() => {
    if (!editing || !ref.current) {
      return;
    }

    const node = ref.current;
    node.textContent = text ?? "";
    node.focus();

    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(node);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);
    // Intentionally only run when editing starts so typing does not reset the caret.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const props = {
    ref: setRef,
    className,
    style: textStyle,
    contentEditable: editMode && editing,
    suppressContentEditableWarning: true,
    onInput: (event: React.FormEvent<HTMLElement>) => onTextChange?.(event.currentTarget.innerText),
    onBlur: (event: React.FocusEvent<HTMLElement>) => {
      onTextChange?.(event.currentTarget.innerText);
      window.getSelection()?.removeAllRanges();
      onTextBlur?.();
    },
    onClick: editMode ? preventEditNavigation : undefined,
  };

  if (editing) {
    return asLink ? <a key={`text-edit-${item.id}`} href={item.href ?? "#"} {...props} /> : <div key={`text-edit-${item.id}`} {...props} />;
  }

  if (embedSrc) {
    return (
      <div key={`embed-${item.id}-${embedSrc}`} className="canvas-embed-content" style={textStyle}>
        <iframe src={embedSrc} title={item.title ?? item.id} loading="lazy" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
      </div>
    );
  }

  if (asLink) {
    return (
      <a href={item.href ?? "#"} {...props}>
        <span className="canvas-text-hover-target">{text}</span>
      </a>
    );
  }

  return (
    <div {...props}>
      <span className="canvas-text-hover-target">{text}</span>
    </div>
  );
}

function getSafeEmbedSrc(text: string) {
  const value = text.trim();
  const iframeMatch = value.match(/<iframe[^>]+src=["']([^"']+)["']/i);
  const rawSrc = iframeMatch?.[1] ?? value;

  try {
    const url = new URL(rawSrc);

    if (url.hostname === "youtu.be") {
      return `https://www.youtube.com/embed/${url.pathname.replace(/^\/+/, "")}`;
    }

    if (url.hostname.endsWith("youtube.com")) {
      const id = url.searchParams.get("v") || url.pathname.match(/\/embed\/([^/?#]+)/)?.[1];
      return id ? `https://www.youtube.com/embed/${id}` : undefined;
    }

    if (url.hostname.endsWith("vimeo.com")) {
      const id = url.pathname.match(/\/(?:video\/)?(\d+)/)?.[1];
      return id ? `https://player.vimeo.com/video/${id}` : undefined;
    }

    if (url.hostname.endsWith("spotify.com") && url.pathname.startsWith("/embed/")) {
      return url.toString();
    }

    if (url.hostname.endsWith("soundcloud.com") && url.pathname.includes("/player/")) {
      return url.toString();
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function MediaWithLabels({ item, editMode, children }: { item: CanvasItemData; editMode: boolean; children: React.ReactNode }) {
  const visibleTitle = (item.showTitle ?? Boolean(item.title)) ? item.title : undefined;
  const visibleCaption = (item.showCaption ?? Boolean(item.caption)) ? item.caption : undefined;

  const content = (
    <div className="canvas-media-wrap">
      <div className="canvas-media-asset">{children}</div>
      {visibleTitle ? <div className="canvas-media-title">{visibleTitle}</div> : null}
      {visibleCaption ? <div className="canvas-media-caption">{visibleCaption}</div> : null}
    </div>
  );

  return wrapWithHref(item, content, editMode);
}

function getImageCropStyle(item: CanvasItemData) {
  const left = clampCrop(item.cropLeft);
  const top = clampCrop(item.cropTop);
  const right = clampCrop(item.cropRight);
  const bottom = clampCrop(item.cropBottom);
  const width = Math.max(1, 100 - left - right);
  const height = Math.max(1, 100 - top - bottom);

  if (!left && !top && !right && !bottom) {
    return undefined;
  }

  return {
    width: `${10000 / width}%`,
    height: `${10000 / height}%`,
    transform: `translate(${-left}%, ${-top}%)`,
  } as React.CSSProperties;
}

function clampCrop(value: number | undefined) {
  return Math.min(Math.max(value ?? 0, 0), 80);
}

function resolveCanvasFont(fontFamily: string | undefined, item: CanvasItemData) {
  if (fontFamily === "display") {
    return "var(--font-display), Syne, var(--font-body), ui-sans-serif, system-ui, sans-serif";
  }

  if (fontFamily === "body") {
    return "var(--font-body), Inter, ui-sans-serif, system-ui, sans-serif";
  }

  if (fontFamily === "mono" || fontFamily === "monospace") {
    return "var(--font-mono), 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
  }

  if (fontFamily) {
    return fontFamily;
  }

  if ((item.fontSize ?? 0) >= 56 || item.id === "title") {
    return "var(--font-display), Syne, var(--font-body), ui-sans-serif, system-ui, sans-serif";
  }

  if (item.type === "symbol" || item.type === "link" || (item.fontSize ?? 18) <= 18) {
    return "var(--font-mono), 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
  }

  return "var(--font-body), Inter, ui-sans-serif, system-ui, sans-serif";
}

function MissingMedia({ item }: { item: CanvasItemData }) {
  return (
    <div className="flex h-full w-full items-end bg-[linear-gradient(135deg,#f3f2ec,#d7dbd2,#f7f6f0)] p-2 opacity-70 scanline">
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-black/35">{item.src ?? "missing media"}</span>
    </div>
  );
}
