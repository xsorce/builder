"use client";

import { useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import type { AssetFile, AssetKind } from "@/types/canvas";

type AssetPickerProps = {
  kind: AssetKind;
  projectFolder?: string;
  onClose: () => void;
  onSelect: (asset: AssetFile) => void;
};

type PendingAction = { type: "close" } | { type: "select"; asset: AssetFile };

const acceptByKind: Record<AssetKind, string> = {
  images: ".jpg,.jpeg,.png,.webp,.gif,.svg,.avif",
  videos: ".mp4,.webm,.ogg,.ogv,.mov,.avi",
  audio: ".mp3,.wav,.ogg,.m4a",
  shapes: ".png,.svg,.webp,.avif",
};

const importLabelByKind: Record<AssetKind, string> = {
  images: "[browse, or drag images]",
  videos: "[browse, or drag videos]",
  audio: "[browse, or drag audio]",
  shapes: "[browse, or drag shapes]",
};

const maxUploadByKind: Record<AssetKind, { bytes: number; label: string }> = {
  images: { bytes: 10 * 1024 * 1024, label: "images max 10 MB" },
  videos: { bytes: 150 * 1024 * 1024, label: "videos max 150 MB" },
  audio: { bytes: 50 * 1024 * 1024, label: "audio max 50 MB" },
  shapes: { bytes: 2 * 1024 * 1024, label: "shapes max 2 MB" },
};

const titleByKind: Record<AssetKind, string> = {
  images: "Add Images",
  videos: "Add Videos",
  audio: "Add Audio",
  shapes: "Add Shapes",
};

const ASSET_PICKER_CLOSE_MS = 260;

const assetKindByFolder: Record<AssetKind, AssetFile["kind"]> = {
  images: "image",
  videos: "video",
  audio: "audio",
  shapes: "image",
};

const placeholderAssets: Partial<Record<AssetKind, AssetFile>> = {
  videos: {
    name: "default-video-placeholder",
    src: "",
    ext: "",
    kind: "video",
    warning: "Placeholder only. Add a video file when you are ready to publish.",
  },
  audio: {
    name: "default-audio-placeholder",
    src: "",
    ext: "",
    kind: "audio",
    warning: "Placeholder only. Add an audio file when you are ready to publish.",
  },
};

export function AssetPicker({ kind, projectFolder, onClose, onSelect }: AssetPickerProps) {
  const [assets, setAssets] = useState<AssetFile[]>([]);
  const [shapeAssets, setShapeAssets] = useState<AssetFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [closing, setClosing] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const closeTimerRef = useRef<number | null>(null);
  const closeFrameRef = useRef<number | null>(null);
  const pendingActionRef = useRef<PendingAction | null>(null);
  const importLabel = importLabelByKind[kind];
  const uploadLimit = maxUploadByKind[kind];
  const title = titleByKind[kind];

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function finishClose() {
    const pending = pendingActionRef.current;
    pendingActionRef.current = null;
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    closeFrameRef.current = null;
    if (!pending) {
      return;
    }
    if (pending.type === "select") {
      onSelect(pending.asset);
      return;
    }
    onClose();
  }

  function beginClose(action: PendingAction) {
    if (closing || pendingActionRef.current) {
      return;
    }
    if (prefersReducedMotion()) {
      action.type === "select" ? onSelect(action.asset) : onClose();
      return;
    }
    pendingActionRef.current = action;
    closeFrameRef.current = window.requestAnimationFrame(() => {
      setClosing(true);
      closeTimerRef.current = window.setTimeout(finishClose, ASSET_PICKER_CLOSE_MS + 80);
    });
  }

  function requestClose() {
    beginClose({ type: "close" });
  }

  function requestSelect(asset: AssetFile) {
    beginClose({ type: "select", asset });
  }

  async function loadAssets() {
    setLoading(true);
    setMessage("");

    try {
      const params = new URLSearchParams({ kind });
      if (projectFolder && kind !== "shapes") {
        params.set("projectFolder", projectFolder);
      }
      const response = await fetch(`/api/dev-assets/list?${params}`);
      if (!response.ok) {
        throw new Error("Could not load assets.");
      }

      setAssets((await response.json()) as AssetFile[]);
      if (kind === "images") {
        const shapesResponse = await fetch("/api/dev-assets/list?kind=shapes");
        setShapeAssets(shapesResponse.ok ? ((await shapesResponse.json()) as AssetFile[]) : []);
      } else {
        setShapeAssets([]);
      }
    } catch {
      setMessage("Could not load deployed assets.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAssets();
  }, [kind, projectFolder]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
      }
      if (closeFrameRef.current) {
        window.cancelAnimationFrame(closeFrameRef.current);
      }
    };
  }, []);

  async function uploadFile(file?: File) {
    if (!file) {
      return;
    }

    if (!validFile(file)) {
      setMessage("Import failed. Check file type.");
      return;
    }

    if (file.size > uploadLimit.bytes) {
      setMessage(`File too large. ${uploadLimit.label}.`);
      return;
    }

    setUploading(true);
    setMessage("");

    try {
      const formData = new FormData();
      formData.append("kind", kind);
      formData.append("file", file);
      if (projectFolder && kind !== "shapes") {
        formData.append("projectFolder", projectFolder);
      }

      const response = await fetch("/api/dev-assets/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(error?.error ?? "Upload failed.");
      }

      const uploaded = (await response.json()) as AssetFile;
      requestSelect({
        ...uploaded,
        ext: uploaded.ext ?? `.${uploaded.name.split(".").pop() ?? ""}`,
        kind: assetKindByFolder[kind],
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import failed. Check file type.");
    } finally {
      setUploading(false);
    }
  }

  function validFile(file: File) {
    const accepted = acceptByKind[kind].split(",");
    const name = file.name.toLowerCase();
    return accepted.some((ext) => name.endsWith(ext.trim().toLowerCase()));
  }

  function onDrag(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!uploading) {
      setDragActive(true);
    }
  }

  function onDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget === event.target) {
      setDragActive(false);
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (!file || !validFile(file)) {
      setMessage("Import failed. Check file type.");
      return;
    }

    uploadFile(file);
  }

  return (
    <div
      className={`asset-picker-overlay${closing ? " asset-picker-closing" : ""}`}
      onClick={requestClose}
      onDragEnter={onDrag}
      onDragOver={onDrag}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onAnimationEnd={(event) => {
        if (closing && event.currentTarget === event.target) {
          finishClose();
        }
      }}
    >
      <div className={`asset-picker asset-picker-panel${dragActive ? " asset-picker-drag-active" : ""}`} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="asset-picker-header">
          <div className="asset-picker-title">{title}</div>
          <button type="button" onClick={requestClose}>
            [close]
          </button>
        </div>

        <label className="asset-import">
          {dragActive ? "[drop to import]" : importLabel}
          <input className="visually-hidden" type="file" accept={acceptByKind[kind]} disabled={uploading} onChange={(event) => uploadFile(event.target.files?.[0])} />
        </label>
        <p className="asset-picker-message">{uploadLimit.label}</p>

        {message ? <p className="asset-picker-message">{message}</p> : null}
        {loading ? <p className="asset-picker-message">loading...</p> : null}

        <div className="asset-list">
          {kind === "images" ? <AssetSection title="Shapes" assets={shapeAssets} onSelect={requestSelect} /> : null}
          {kind === "images" ? <div className="asset-section-title">Images</div> : null}
          {assets.map((asset) => (
            <AssetRow key={asset.src || asset.name} asset={asset} onSelect={requestSelect} />
          ))}
          {!loading && assets.length === 0 && placeholderAssets[kind] ? <AssetRow asset={placeholderAssets[kind]} onSelect={requestSelect} /> : null}
          {!loading && assets.length === 0 ? <p className="asset-picker-message">No files in public/{kind} yet.</p> : null}
        </div>
      </div>
    </div>
  );
}

function AssetSection({ title, assets, onSelect }: { title: string; assets: AssetFile[]; onSelect: (asset: AssetFile) => void }) {
  return (
    <>
      <div className="asset-section-title">{title}</div>
      {assets.map((asset) => (
        <AssetRow key={asset.src || asset.name} asset={asset} onSelect={onSelect} />
      ))}
    </>
  );
}

function AssetRow({ asset, onSelect }: { asset: AssetFile; onSelect: (asset: AssetFile) => void }) {
  const displayName = asset.ext && asset.name.toLowerCase().endsWith(asset.ext.toLowerCase()) ? asset.name.slice(0, -asset.ext.length) : asset.name;

  return (
    <button type="button" className="asset-row" onClick={() => onSelect(asset)}>
      <span className="asset-row-preview">{asset.kind === "image" ? <img src={asset.src} alt="" /> : null}</span>
      <span title={asset.name}>{truncateMiddleFileName(displayName, 36)}</span>
      <span>{asset.ext}</span>
      {asset.warning ? <small>{asset.warning}</small> : null}
    </button>
  );
}

function truncateMiddleFileName(name: string, max = 36) {
  if (name.length <= max) {
    return name;
  }
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot + 1) : "";
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const suffix = ext ? `.${ext}` : "";
  const keep = Math.max(4, max - suffix.length - 3);
  return `${stem.slice(0, keep)}...${suffix}`;
}
