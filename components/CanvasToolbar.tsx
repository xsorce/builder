"use client";

import type { CanvasItemType } from "@/content/canvas";

const addLabels: Record<Extract<CanvasItemType, "text" | "image" | "video" | "audio">, string> = {
  text: "Text",
  image: "Image",
  video: "Video",
  audio: "Audio",
};

const AUTOSAVE_OK = "\u2714";

type CanvasToolbarProps = {
  canSave: boolean;
  saveState: "idle" | "saving" | "saved" | "error";
  hasSelection: boolean;
  mobileView: boolean;
  onAdd: (type: CanvasItemType) => void;
  onView: () => void;
  onToggleMobileView: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onSave: () => void;
};

export function CanvasToolbar({
  canSave,
  saveState,
  hasSelection,
  mobileView,
  onAdd,
  onView,
  onToggleMobileView,
  onDuplicate,
  onDelete,
  onSave,
}: CanvasToolbarProps) {
  return (
    <div className="fixed left-4 top-4 z-[1000] flex max-w-[calc(100vw-2rem)] flex-wrap gap-1 border border-black/15 bg-[#f7f6f0]/92 p-1 font-mono text-[10px] tracking-[0.08em] shadow-[0_2px_10px_rgba(0,0,0,0.06)] backdrop-blur">
      <button type="button" className="canvas-tool-button" onClick={() => onAdd("text")}>
        {addLabels.text}
      </button>
      <button type="button" className="canvas-tool-button" onClick={() => onAdd("image")}>
        {addLabels.image}
      </button>
      <button type="button" className="canvas-tool-button" onClick={() => onAdd("video")}>
        {addLabels.video}
      </button>
      <button type="button" className="canvas-tool-button" onClick={() => onAdd("audio")}>
        {addLabels.audio}
      </button>
      <button type="button" className="canvas-tool-button" disabled={!hasSelection} onClick={onDuplicate}>
        Duplicate
      </button>
      <button type="button" className="canvas-tool-button" disabled={!hasSelection} onClick={onDelete}>
        Delete
      </button>
      <button type="button" className="canvas-tool-button canvas-tool-button-view-mode" onClick={onToggleMobileView}>
        {mobileView ? "Desktop View" : "Mobile View"}
      </button>
      <button type="button" className="canvas-tool-button canvas-tool-button-preview" onClick={onView}>
        Preview
      </button>
      <button type="button" className="canvas-tool-button canvas-tool-button-save" disabled={!canSave || saveState === "saving"} onClick={() => onSave()}>
        {saveState === "saving" ? "Autosave ..." : saveState === "error" ? "Autosave error" : `Autosave ${AUTOSAVE_OK}`}
      </button>
    </div>
  );
}
