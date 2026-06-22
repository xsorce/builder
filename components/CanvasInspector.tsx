"use client";

import { useEffect, useRef, useState } from "react";
import type { CanvasDocument, CanvasItem } from "@/content/canvas";

type CanvasInspectorProps = {
  item?: CanvasItem;
  items?: CanvasItem[];
  canvas?: CanvasDocument;
  backgroundOpen?: boolean;
  mobileView?: boolean;
  onBackgroundPick?: () => void;
  onBackgroundChange: (updates: Partial<Pick<CanvasDocument, "backgroundColor" | "height" | "mobileHeight" | "backgroundImage" | "backgroundImageOpacity" | "backgroundImageFit" | "backgroundImageRecolorColor" | "backgroundImageRecolorIntensity" | "password">>) => void;
  onChange: (updates: Partial<CanvasItem>) => void;
  onCollapse: () => void;
};

type NumberField = {
  field: keyof Pick<
    CanvasItem,
    | "x"
    | "y"
    | "width"
    | "height"
    | "rotate"
    | "zIndex"
    | "opacity"
    | "parallaxSpeed"
    | "fadeDelay"
    | "fontSize"
    | "hoverStrength"
    | "idleStrength"
    | "recolorIntensity"
  >;
  label: string;
  placeholder: string;
  helper?: string;
  min?: number;
  max?: number;
  step?: number;
};

const weightOptions = [
  [300, "300 Light"],
  [400, "400 Regular"],
  [500, "500 Medium"],
  [600, "600 Semi Bold"],
  [700, "700 Bold"],
  [800, "800 Extra Bold"],
  [900, "900 Black"],
] as const;

const asciiSymbols = [
  "˚", "˖", "₊", "｡", "･", "﹏", "〰",
  "⋆", "★", "☆", "⬩", "⊹",
  "♡", "❣", "୨୧", "ꕤ", "ꔛ", "︶", "︵",
  "◍", "◎", "◐", "◑", "꩜",
  "☁", "☾", "☼", "♻", "➴",
  "♩", "♪", "♫", "♬",
  "✎", "✿", "❀", "❁", "❊", "☘",
  "✧", "⟡", "☺", "♠", "♣",
  "☯", "☮", "☪", "ૐ", "⚕", "⚔", "⚛", "⚜",
  "⚠", "⚿", "⛒", "⛬", "☣", "☢", "☠"
];
const asciiCells = Array.from({ length: 100 }, (_, index) => asciiSymbols[index] ?? "");
function getColorPickerValue(value?: string, fallback = "#111111") {
  if (!value) return fallback;
  if (/^#[0-9A-Fa-f]{6}$/.test(value)) return value;
  return fallback;
}

function supportsTextControls(type: CanvasItem["type"]) {
  return type === "text" || type === "link" || type === "symbol";
}

function nextTextAlign(current: CanvasItem["textAlign"]) {
  if (current === "left") return "center";
  if (current === "center") return "right";
  return "left";
}

function supportsMediaLabels(type: CanvasItem["type"]) {
  return type === "image" || type === "video" || type === "audio";
}

function supportsLink(type: CanvasItem["type"]) {
  return type === "link" || type === "text" || type === "symbol" || type === "image" || type === "video";
}

export function CanvasInspector({ item, items = item ? [item] : [], canvas, backgroundOpen = false, mobileView = false, onBackgroundPick, onBackgroundChange, onChange, onCollapse }: CanvasInspectorProps) {
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const asciiMenuRef = useRef<HTMLSpanElement | null>(null);
  const selectionRef = useRef({ start: 0, end: 0 });
  const [asciiOpen, setAsciiOpen] = useState(false);
  const [asciiClosing, setAsciiClosing] = useState(false);

  useEffect(() => {
    if (!asciiOpen) {
      return;
    }
    function onPointerDown(event: PointerEvent) {
      if (asciiMenuRef.current?.contains(event.target as Node)) {
        return;
      }
      closeAsciiMenu();
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [asciiOpen]);

  function closeAsciiMenu() {
    setAsciiClosing(true);
    window.setTimeout(() => {
      setAsciiOpen(false);
      setAsciiClosing(false);
    }, 160);
  }

  function toggleAsciiMenu() {
    asciiOpen ? closeAsciiMenu() : setAsciiOpen(true);
  }

  function rememberTextSelection() {
    const node = textAreaRef.current;
    if (node) {
      selectionRef.current = { start: node.selectionStart, end: node.selectionEnd };
      return;
    }
    const text = item?.text ?? "";
    selectionRef.current = { start: text.length, end: text.length };
  }

  function insertAscii(symbol: string) {
    const text = item?.text ?? "";
    const start = Math.min(selectionRef.current.start, text.length);
    const end = Math.min(selectionRef.current.end, text.length);
    const nextText = `${text.slice(0, start)}${symbol}${text.slice(end)}`;
    onChange({ text: nextText });
    window.requestAnimationFrame(() => {
      const node = textAreaRef.current;
      if (!node) {
        return;
      }
      const cursor = start + symbol.length;
      node.focus();
      node.setSelectionRange(cursor, cursor);
      selectionRef.current = { start: cursor, end: cursor };
    });
  }

  if (!item && backgroundOpen) {
    const backgroundColor = canvas?.backgroundColor;
    const backgroundImage = canvas?.backgroundImage ?? "";

    return (
      <aside className="canvas-inspector">
        <section className="canvas-inspector-section">
          <div className="canvas-inspector-topline">
            <div className="canvas-inspector-breadcrumb">background</div>
            <button type="button" className="canvas-inspector-collapse-button" onClick={onCollapse}>
              Collapse
            </button>
          </div>
        </section>

        <section className="canvas-inspector-section">
          <div className="canvas-inspector-section-title">Style</div>
          <label className="canvas-field">
            Background color
            <div className="canvas-color-row">
              <input type="color" value={getColorPickerValue(backgroundColor, "#fafaf7")} onChange={(event) => onBackgroundChange({ backgroundColor: event.target.value })} />
              <input value={backgroundColor ?? ""} placeholder="#fafaf7" onChange={(event) => onBackgroundChange({ backgroundColor: event.target.value || undefined })} />
            </div>
          </label>
          <div className="canvas-field-grid canvas-page-meta-row">
            <label className="canvas-field">
              {mobileView ? "Mobile height" : "Height"}
              <input
                type="number"
                min={400}
                max={10000}
                step={1}
                value={mobileView ? canvas?.mobileHeight ?? 844 : canvas?.height ?? 810}
                onChange={(event) => onBackgroundChange(mobileView ? { mobileHeight: clampPageHeight(event.target.value) } : { height: clampPageHeight(event.target.value) })}
              />
            </label>
            <label className="canvas-field">
              Password
              <input value={canvas?.password ?? ""} onChange={(event) => onBackgroundChange({ password: event.target.value.trim() || undefined })} />
            </label>
          </div>
          <div className={`canvas-background-file-row${backgroundImage ? "" : " is-empty"}`} onClick={backgroundImage ? undefined : onBackgroundPick}>
            <span title={backgroundImage || undefined}>{backgroundImage ? truncateMiddleFileName(getFileName(backgroundImage), 24) : "[add background image]"}</span>
            {backgroundImage ? (
              <button type="button" onClick={() => onBackgroundChange({ backgroundImage: undefined, backgroundImageOpacity: undefined, backgroundImageFit: undefined, backgroundImageRecolorColor: undefined, backgroundImageRecolorIntensity: undefined })}>
                âœ–
              </button>
            ) : null}
          </div>
          {backgroundImage ? (
            <>
              <div className="canvas-field-grid">
                <label className="canvas-field">
                  Image opacity
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={canvas?.backgroundImageOpacity ?? 1}
                    onChange={(event) => onBackgroundChange({ backgroundImageOpacity: clampOpacity(event.target.value) })}
                  />
                </label>
                <label className="canvas-field">
                  Image fit
                  <select value={canvas?.backgroundImageFit ?? "cover"} onChange={(event) => onBackgroundChange({ backgroundImageFit: event.target.value as CanvasDocument["backgroundImageFit"] })}>
                    <option value="cover">Cover</option>
                    <option value="contain">Contain</option>
                    <option value="tile">Tile</option>
                    <option value="stretch">Stretch</option>
                  </select>
                </label>
              </div>
              <div className="canvas-field-grid">
                <label className="canvas-field">
                  Image recolor
                  <div className="canvas-color-row">
                    <input type="color" value={getColorPickerValue(canvas?.backgroundImageRecolorColor, "#ffffff")} onChange={(event) => onBackgroundChange({ backgroundImageRecolorColor: event.target.value })} />
                    <input value={canvas?.backgroundImageRecolorColor ?? ""} placeholder="#ffffff" onChange={(event) => onBackgroundChange({ backgroundImageRecolorColor: event.target.value || undefined })} />
                  </div>
                </label>
                <label className="canvas-field">
                  Intensity
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={canvas?.backgroundImageRecolorIntensity ?? 0}
                    onChange={(event) => onBackgroundChange({ backgroundImageRecolorIntensity: clampPercent(event.target.value) })}
                  />
                </label>
              </div>
            </>
          ) : null}
        </section>
      </aside>
    );
  }

  if (!item) {
    return null;
  }

  if (items.length > 1) {
    return <MultiCanvasInspector items={items} onChange={onChange} onCollapse={onCollapse} />;
  }

  const isTextLike = supportsTextControls(item.type);
  const supportsAudioSizing = item.type === "audio";
  const supportsFontSize = isTextLike || supportsAudioSizing;
  const supportsColor = isTextLike || supportsAudioSizing;
  const supportsFontControls = isTextLike || item.type === "audio";
  const isMedia = supportsMediaLabels(item.type);
  const supportsMediaText = item.type === "audio";
  const supportsMediaControls = item.type === "video";
  const hasSource = item.type === "image" || item.type === "video" || item.type === "audio";
  const hoverEffectSelected = isHoverEffectSelected(item.hoverEffect);
  const idleEffectSelected = isIdleEffectSelected(item.idleEffect);
  const textAlign = item.textAlign ?? "left";
  const textAlignIcon = textAlign === "center" ? "=" : textAlign === "right" ? "\u00bb" : "\u00ab";

  const positionFields: NumberField[] = [
    { field: "x", label: "X", placeholder: "0" },
    { field: "y", label: "Y", placeholder: "0" },
    { field: "width", label: "Width", placeholder: "300", min: 1, step: 1 },
    { field: "height", label: "Height", placeholder: "auto", min: 1, step: 1 },
    { field: "rotate", label: "Rotate", placeholder: "0", step: 1 },
  ];

  const styleFields: NumberField[] = [
    { field: "opacity", label: "Opacity", placeholder: "1", min: 0, max: 1, step: 0.05 },
    { field: "zIndex", label: "Layer", placeholder: "1", step: 1 },
  ];

  const motionFields: NumberField[] = [
    { field: "parallaxSpeed", label: "Scroll speed", placeholder: "0", min: 0, max: 1, step: 0.01 },
    { field: "fadeDelay", label: "Fade in", placeholder: "0", min: 0, step: 0.05 },
  ];

  return (
    <aside className="canvas-inspector">
      <section className="canvas-inspector-section">
        <div className="canvas-inspector-topline">
          <div className="canvas-inspector-breadcrumb" title={item.id}>{truncateEnd(item.id, 32)}</div>
          <button type="button" className="canvas-inspector-collapse-button" onClick={onCollapse}>
            Collapse
          </button>
        </div>
      </section>

      {(isTextLike || hasSource || supportsLink(item.type) || isMedia) ? (
        <section className="canvas-inspector-section">
          <div className="canvas-inspector-section-title">Content</div>
          {isTextLike ? (
            <label className="canvas-field canvas-text-field">
              Text
              <span className="canvas-text-input-wrap" ref={asciiMenuRef}>
                <button
                  type="button"
                  className="canvas-text-align-button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onChange({ textAlign: nextTextAlign(textAlign) })}
                  aria-label={`Align ${textAlign}`}
                >
                  {textAlignIcon}
                </button>
                <textarea
                  ref={textAreaRef}
                  value={item.text ?? ""}
                  rows={2}
                  placeholder="type visible text..."
                  onSelect={rememberTextSelection}
                  onKeyUp={rememberTextSelection}
                  onClick={rememberTextSelection}
                  onChange={(event) => {
                    rememberTextSelection();
                    onChange({ text: event.target.value });
                  }}
                />
                <span className="canvas-ascii-wrap">
                  <button type="button" className="canvas-ascii-button" onMouseDown={(event) => event.preventDefault()} onClick={toggleAsciiMenu}>
                    add ascii
                  </button>
                  {asciiOpen ? (
                    <span className={`canvas-ascii-menu${asciiClosing ? " is-closing" : ""}`}>
                      {asciiCells.map((symbol, index) => (
                        <button key={`${symbol}-${index}`} type="button" disabled={!symbol} onMouseDown={(event) => event.preventDefault()} onClick={() => symbol && insertAscii(symbol)}>
                          {symbol}
                        </button>
                      ))}
                    </span>
                  ) : null}
                </span>
              </span>
            </label>
          ) : null}

          {hasSource ? (
            <label className="canvas-field">
              Source
              <input value={item.src ?? ""} placeholder="/images/example.png" onChange={(event) => onChange({ src: event.target.value || undefined })} />
            </label>
          ) : null}

          {supportsLink(item.type) ? (
            <label className="canvas-field">
              Link URL
              <input value={item.href ?? ""} placeholder="/apps or https://example.com" onChange={(event) => onChange({ href: event.target.value || undefined })} />
            </label>
          ) : null}

          {supportsMediaText ? (
            <>
              <label className="canvas-field">
                Title
                <input value={item.title ?? ""} placeholder="optional visible title" onChange={(event) => onChange({ title: event.target.value || undefined })} />
              </label>

              <label className="canvas-field">
                Caption
                <textarea value={item.caption ?? ""} rows={2} placeholder="optional visible caption" onChange={(event) => onChange({ caption: event.target.value || undefined })} />
              </label>
            </>
          ) : null}

        </section>
      ) : null}

      {supportsMediaControls ? (
        <section className="canvas-inspector-section">
          <div className="canvas-inspector-section-title">Media</div>
          <div className="canvas-toggle-row">
            <label>
              <input type="checkbox" checked={Boolean(item.controls)} onChange={(event) => onChange({ controls: event.target.checked })} />
              Controls
            </label>
            <label>
              <input type="checkbox" checked={item.muted ?? true} onChange={(event) => onChange({ muted: event.target.checked })} />
              Muted
            </label>
            <label>
              <input type="checkbox" checked={item.loop ?? true} onChange={(event) => onChange({ loop: event.target.checked })} />
              Loop
            </label>
            <label>
              <input
                type="checkbox"
                checked={Boolean(item.autoPlay)}
                onChange={(event) => onChange(event.target.checked ? { autoPlay: true, muted: true } : { autoPlay: false })}
              />
              Autoplay
            </label>
          </div>
        </section>
      ) : null}

      <section className="canvas-inspector-section">
        <div className="canvas-inspector-section-title">Style</div>
        {supportsFontControls ? (
          <>
          <div className="canvas-field-grid">
            <label className="canvas-field">
              Font
              <select value={item.fontFamily ?? getDefaultFontFamily(item)} onChange={(event) => onChange({ fontFamily: event.target.value })}>
                <option value="display">Display / Syne</option>
                <option value="body">Body / Inter</option>
                <option value="mono">Mono / JetBrains Mono</option>
              </select>
            </label>

            <label className="canvas-field">
              Weight
              <select
                value={item.fontWeight ?? 600}
                onChange={(event) => onChange({ fontWeight: Number(event.target.value) })}
              >
                {weightOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="canvas-field-grid">
            <NumberInput field={{ field: "fontSize", label: "Font size", placeholder: "18", min: 1, step: 1 }} item={item} onChange={onChange} />
            <label className="canvas-field">
              Color
              <div className="canvas-color-row">
                <input type="color" value={getColorPickerValue(item.color)} onChange={(event) => onChange({ color: event.target.value })} />
                <input value={item.color ?? ""} placeholder="#111111" onChange={(event) => onChange({ color: event.target.value || undefined })} />
              </div>
            </label>
          </div>
          </>
        ) : supportsFontSize || supportsColor ? (
          <>
            <div className="canvas-field-row">
              {supportsFontSize ? <NumberInput field={{ field: "fontSize", label: "Font size", placeholder: "18", min: 1, step: 1 }} item={item} onChange={onChange} /> : null}
            </div>
            {supportsColor ? (
              <label className="canvas-field">
                Color
                <div className="canvas-color-row">
                  <input type="color" value={getColorPickerValue(item.color)} onChange={(event) => onChange({ color: event.target.value })} />
                  <input value={item.color ?? ""} placeholder="#111111" onChange={(event) => onChange({ color: event.target.value || undefined })} />
                </div>
              </label>
            ) : null}
          </>
        ) : null}

        <div className="canvas-field-grid">
          {styleFields.map((field) => (
            <NumberInput key={field.field} field={field} item={item} onChange={onChange} />
          ))}
          <small className="canvas-row-helper">0 = hidden, 1 = full.</small>
          <small className="canvas-row-helper">higher # = more front.</small>
        </div>
        {item.type === "audio" ? (
          <div className="canvas-toggle-row">
            <label>
              <input type="checkbox" checked={item.audioBackground !== false} onChange={(event) => onChange({ audioBackground: event.target.checked })} />
              Background
            </label>
          </div>
        ) : null}
        {item.type === "image" ? (
          <div className="canvas-field-grid">
            <label className="canvas-field">
              Recolor
              <div className="canvas-color-row">
                <input type="color" value={getColorPickerValue(item.recolorColor, "#ffffff")} onChange={(event) => onChange({ recolorColor: event.target.value })} />
                <input value={item.recolorColor ?? ""} placeholder="#ffffff" onChange={(event) => onChange({ recolorColor: event.target.value || undefined })} />
              </div>
            </label>
            <NumberInput field={{ field: "recolorIntensity", label: "Intensity", placeholder: "0", min: 0, max: 100, step: 1 }} item={item} onChange={onChange} />
          </div>
        ) : null}
      </section>

      <section className="canvas-inspector-section">
        <div className="canvas-inspector-section-title">Animation</div>
        <div className="canvas-field-grid">
          <label className="canvas-field">
            Idle effect
            <select
              value={getIdleSelectValue(item.idleEffect)}
              onChange={(event) => onChange({ idleEffect: (event.target.value === "none" ? undefined : event.target.value) as CanvasItem["idleEffect"] })}
            >
              <option value="none">None</option>
              <option value="float">Float</option>
              <option value="breathe">Breathe</option>
              <option value="drift">Drift</option>
              <option value="sway">Sway</option>
            </select>
          </label>
          <label className="canvas-field">
            Hover effect
            <select
              value={getHoverSelectValue(item.hoverEffect)}
              onChange={(event) => onChange({ hoverEffect: (event.target.value === "none" ? undefined : event.target.value) as CanvasItem["hoverEffect"] })}
            >
              <option value="none">None</option>
              <option value="color">Color</option>
              <option value="lift">Lift</option>
              <option value="glow">Glow</option>
              <option value="focus">Focus</option>
            </select>
          </label>
        </div>
        <div className="canvas-field-grid">
          {idleEffectSelected || hoverEffectSelected ? (
            <SharedIntensityInput value={item.idleStrength ?? item.hoverStrength} disabled={!idleEffectSelected && hoverEffectSelected} onChange={onChange} />
          ) : null}
          {hoverEffectSelected ? <HoverColorInput item={item} onChange={onChange} /> : null}
        </div>
        <div className="canvas-field-grid">
          <NumberInput field={motionFields[0]} item={item} onChange={onChange} />
          <NumberInput field={motionFields[1]} item={item} onChange={onChange} />
          <small className="canvas-row-helper">0 = normal, 1 = fixed.</small>
          <small className="canvas-row-helper">in seconds.</small>
        </div>
      </section>

      <section className="canvas-inspector-section">
        <div className="canvas-inspector-section-title">Position</div>
        <div className="canvas-field-stack">
          <div className="canvas-field-grid">
            {positionFields.slice(0, 2).map((field) => (
              <NumberInput key={field.field} field={field} item={item} onChange={onChange} />
            ))}
          </div>
          <div className="canvas-field-grid">
            {(isTextLike ? [positionFields[2], positionFields[4]] : item.type === "audio" ? [positionFields[4]] : positionFields.slice(2, 4)).map((field) => (
              <NumberInput key={field.field} field={field} item={item} onChange={onChange} />
            ))}
          </div>
          {!isTextLike && item.type !== "audio" ? <div className="canvas-field-grid">
            {positionFields.slice(4, 5).map((field) => (
              <NumberInput key={field.field} field={field} item={item} onChange={onChange} />
            ))}
          </div> : null}
        </div>
      </section>

      <section className="canvas-inspector-section canvas-inspector-hide-section">
        <div className="canvas-toggle-row">
          <label>
            <input type="checkbox" checked={Boolean(item.locked)} onChange={(event) => onChange({ locked: event.target.checked || undefined })} />
            Lock
          </label>
          <label>
            <input type="checkbox" checked={Boolean(item.hidden)} onChange={(event) => onChange({ hidden: event.target.checked || undefined })} />
            Hide
          </label>
        </div>
      </section>
    </aside>
  );
}

function clampPageHeight(value: string) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(10000, Math.max(400, Math.round(number))) : 400;
}

function clampOpacity(value: string) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : 1;
}

function clampPercent(value: string) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(100, Math.max(0, Math.round(number))) : 0;
}

function getFileName(path: string) {
  return path.split("/").filter(Boolean).at(-1) ?? path;
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

function truncateEnd(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function getDefaultFontFamily(item: CanvasItem) {
  return item.type === "text" ? "body" : "mono";
}

function MultiCanvasInspector({ items, onChange, onCollapse }: { items: CanvasItem[]; onChange: (updates: Partial<CanvasItem>) => void; onCollapse: () => void }) {
  const first = items[0];
  const hoverEffectSelected = items.some((item) => isHoverEffectSelected(item.hoverEffect));
  const idleEffectSelected = items.some((item) => isIdleEffectSelected(item.idleEffect));

  return (
    <aside className="canvas-inspector">
      <section className="canvas-inspector-section">
        <div className="canvas-inspector-topline">
          <div className="canvas-inspector-breadcrumb">{items.length} selected</div>
          <button type="button" className="canvas-inspector-collapse-button" onClick={onCollapse}>
            Collapse
          </button>
        </div>
      </section>
      <section className="canvas-inspector-section">
        <div className="canvas-inspector-section-title">Style</div>
        <div className="canvas-field-grid">
          <NumberInput field={{ field: "opacity", label: "Opacity", placeholder: "1", min: 0, max: 1, step: 0.05 }} item={first} onChange={onChange} />
          <NumberInput field={{ field: "zIndex", label: "Layer", placeholder: "1", step: 1 }} item={first} onChange={onChange} />
        </div>
      </section>
      <section className="canvas-inspector-section">
        <div className="canvas-inspector-section-title">Animation</div>
        <div className="canvas-field-grid">
          <label className="canvas-field">
            Idle effect
            <select value={getIdleSelectValue(first.idleEffect)} onChange={(event) => onChange({ idleEffect: (event.target.value === "none" ? undefined : event.target.value) as CanvasItem["idleEffect"] })}>
              <option value="none">None</option>
              <option value="float">Float</option>
              <option value="breathe">Breathe</option>
              <option value="drift">Drift</option>
              <option value="sway">Sway</option>
            </select>
          </label>
          <label className="canvas-field">
            Hover effect
            <select value={getHoverSelectValue(first.hoverEffect)} onChange={(event) => onChange({ hoverEffect: (event.target.value === "none" ? undefined : event.target.value) as CanvasItem["hoverEffect"] })}>
              <option value="none">None</option>
              <option value="color">Color</option>
              <option value="lift">Lift</option>
              <option value="glow">Glow</option>
              <option value="focus">Focus</option>
            </select>
          </label>
        </div>
        <div className="canvas-field-grid">
          {idleEffectSelected || hoverEffectSelected ? <SharedIntensityInput value={first.idleStrength ?? first.hoverStrength} disabled={!idleEffectSelected && hoverEffectSelected} onChange={onChange} /> : null}
          {hoverEffectSelected ? <HoverColorInput item={first} onChange={onChange} /> : null}
          <NumberInput field={{ field: "parallaxSpeed", label: "Scroll speed", placeholder: "0", min: 0, max: 1, step: 0.01 }} item={first} onChange={onChange} />
          <NumberInput field={{ field: "fadeDelay", label: "Fade in", placeholder: "0", min: 0, step: 0.05 }} item={first} onChange={onChange} />
        </div>
      </section>
      <section className="canvas-inspector-section canvas-inspector-hide-section">
        <div className="canvas-toggle-row">
          <label>
            <input type="checkbox" checked={items.every((item) => item.locked)} onChange={(event) => onChange({ locked: event.target.checked || undefined })} />
            Lock
          </label>
          <label>
            <input type="checkbox" checked={items.every((item) => item.hidden)} onChange={(event) => onChange({ hidden: event.target.checked || undefined })} />
            Hide
          </label>
        </div>
      </section>
    </aside>
  );
}

function getHoverSelectValue(effect: CanvasItem["hoverEffect"]) {
  return effect === "shock" || effect === "float" || effect === "tilt" || effect === "drift" ? "lift" : effect ?? "none";
}

function getIdleSelectValue(effect: CanvasItem["idleEffect"]) {
  return effect === "pulse" ? "breathe" : effect ?? "none";
}

function isHoverEffectSelected(effect: CanvasItem["hoverEffect"]) {
  return Boolean(effect && effect !== "none");
}

function isIdleEffectSelected(effect: CanvasItem["idleEffect"]) {
  return Boolean(effect && effect !== "none");
}

function SharedIntensityInput({ value, disabled = false, onChange }: { value?: number; disabled?: boolean; onChange: (updates: Partial<CanvasItem>) => void }) {
  const displayValue = value === undefined ? 1 : Number((value / 3).toFixed(2));

  return (
    <label className="canvas-field">
      Intensity
      <input
        type="number"
        min={0}
        max={4}
        step={0.1}
        placeholder="1"
        value={displayValue}
        disabled={disabled}
        onChange={(event) => {
          if (disabled) {
            return;
          }
          const next = event.target.value === "" ? undefined : Number(event.target.value) * 3;
          onChange({ idleStrength: next, hoverStrength: next });
        }}
      />
    </label>
  );
}

function HoverColorInput({ item, onChange }: { item: CanvasItem; onChange: (updates: Partial<CanvasItem>) => void }) {
  return (
    <label className="canvas-field">
      Hover color
      <div className="canvas-color-row">
        <input type="color" value={getColorPickerValue(item.hoverColor, getColorPickerValue(item.color))} onChange={(event) => onChange({ hoverColor: event.target.value })} />
        <input value={item.hoverColor ?? ""} placeholder={item.color ?? "currentColor"} onChange={(event) => onChange({ hoverColor: event.target.value || undefined })} />
      </div>
    </label>
  );
}

function NumberInput({
  field,
  item,
  onChange,
}: {
  field: NumberField;
  item: CanvasItem;
  onChange: (updates: Partial<CanvasItem>) => void;
}) {
  return (
    <label className="canvas-field">
      {field.label}
      <input
        type="number"
        min={field.min}
        max={field.max}
        step={field.step ?? 1}
        placeholder={field.placeholder}
        value={(item[field.field] as number | undefined) ?? ""}
        onChange={(event) =>
          onChange({
            [field.field]: event.target.value === "" ? undefined : Number(event.target.value),
          })
        }
      />
      {field.helper ? <small className="canvas-helper">{field.helper}</small> : null}
    </label>
  );
}
