"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

type AsciiAudioPlayerProps = {
  src?: string;
  title?: string;
  caption?: string;
  background?: boolean;
  style?: CSSProperties;
};

const MIN_BAR_LENGTH = 4;
const MAX_BAR_LENGTH = 80;
const VOLUME_LEVEL_CHARS = ["\u2583", "\u2585", "\u2587", "\u2589"] as const;
const MAX_VOLUME_LEVEL = VOLUME_LEVEL_CHARS.length;
const TIMELINE_FILLED = "\u2588";
const TIMELINE_EMPTY = "\u2591";

function formatTime(value: number) {
  if (!Number.isFinite(value)) {
    return "00:00";
  }

  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

export function AsciiAudioPlayer({ src, title, caption, background = true, style }: AsciiAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const barRef = useRef<HTMLButtonElement | null>(null);
  const barTextRef = useRef<HTMLSpanElement | null>(null);
  const volumeBarsRef = useRef<HTMLSpanElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volumeLevel, setVolumeLevel] = useState<number>(MAX_VOLUME_LEVEL);
  const [barLength, setBarLength] = useState(25);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    const audioEl = audio;

    function syncTime() {
      setCurrent(audioEl.currentTime);
      setDuration(audioEl.duration);
    }

    function syncPlaying() {
      setPlaying(!audioEl.paused);
    }

    function markFailed() {
      setFailed(true);
      setPlaying(false);
    }

    audioEl.addEventListener("timeupdate", syncTime);
    audioEl.addEventListener("durationchange", syncTime);
    audioEl.addEventListener("loadedmetadata", syncTime);
    audioEl.addEventListener("play", syncPlaying);
    audioEl.addEventListener("pause", syncPlaying);
    audioEl.addEventListener("ended", syncPlaying);
    audioEl.addEventListener("error", markFailed);
    syncTime();

    return () => {
      audioEl.removeEventListener("timeupdate", syncTime);
      audioEl.removeEventListener("durationchange", syncTime);
      audioEl.removeEventListener("loadedmetadata", syncTime);
      audioEl.removeEventListener("play", syncPlaying);
      audioEl.removeEventListener("pause", syncPlaying);
      audioEl.removeEventListener("ended", syncPlaying);
      audioEl.removeEventListener("error", markFailed);
    };
  }, [src]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volumeLevel / MAX_VOLUME_LEVEL;
    }
  }, [volumeLevel]);

  useEffect(() => {
    const node = barRef.current;
    const textNode = barTextRef.current;
    if (!node || typeof ResizeObserver === "undefined") {
      return;
    }

    function syncBarLength() {
      if (!node) {
        return;
      }
      const fontSize = Number.parseFloat(window.getComputedStyle(textNode ?? node).fontSize) || 12;
      const charCount = textNode?.textContent?.length ?? MIN_BAR_LENGTH;
      const previousMaxWidth = textNode?.style.maxWidth;
      if (textNode) {
        textNode.style.maxWidth = "none";
      }
      const measuredWidth = textNode?.getBoundingClientRect().width ?? 0;
      if (textNode) {
        textNode.style.maxWidth = previousMaxWidth ?? "";
      }
      const charWidth = measuredWidth / Math.max(charCount, 1) || fontSize * 0.62;
      const nextLength = Math.min(MAX_BAR_LENGTH, Math.max(MIN_BAR_LENGTH, Math.floor(node.clientWidth / charWidth)));
      setBarLength((current) => (current === nextLength ? current : nextLength));
    }

    const observer = new ResizeObserver(syncBarLength);
    observer.observe(node);
    syncBarLength();
    return () => observer.disconnect();
  }, []);

  const safeProgress = duration > 0 ? Math.min(Math.max(current / duration, 0), 1) : 0;
  const filled = duration > 0 ? Math.min(barLength, Math.max(0, Math.floor(safeProgress * barLength))) : 0;
  const empty = barLength - filled;
  const bar = `${TIMELINE_FILLED.repeat(filled)}${TIMELINE_EMPTY.repeat(empty)}`;
  const visibleTitle = title?.trim();

  async function toggle() {
    const audio = audioRef.current;
    if (!audio || failed) {
      return;
    }

    if (audio.paused) {
      await audio.play();
    } else {
      audio.pause();
    }
  }

  function seekAtClientX(clientX: number) {
    const audio = audioRef.current;
    if (!audio || !duration || failed) {
      return;
    }

    const rect = (barTextRef.current ?? barRef.current)?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    const nextProgress = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    const nextCurrent = nextProgress * duration;
    audio.currentTime = nextCurrent;
    setCurrent(nextCurrent);
  }

  function setVolumeFromPointer(event: React.PointerEvent<HTMLButtonElement>) {
    const rect = volumeBarsRef.current?.getBoundingClientRect();
    if (!rect?.width) {
      return;
    }
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    setVolumeLevel(Math.round(ratio * MAX_VOLUME_LEVEL));
  }

  function onVolumeWheel(event: React.WheelEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
  }

  return (
    <div className={`ascii-audio-player${background ? "" : " ascii-audio-player-no-bg"}`} style={style}>
      <audio ref={audioRef} src={src || undefined} preload="metadata" />
      {visibleTitle ? <div className="ascii-audio-title">{visibleTitle}</div> : null}
      {caption ? <div className="ascii-audio-caption">{caption}</div> : null}
      <div className="ascii-audio-row">
        <button type="button" onClick={toggle} aria-disabled={!src || failed}>
          {playing ? "pause" : "play"}
        </button>
        <button
          type="button"
          className="ascii-audio-volume"
          onWheel={onVolumeWheel}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            setVolumeFromPointer(event);
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              setVolumeFromPointer(event);
            }
          }}
          aria-label={`Volume level ${volumeLevel} of ${MAX_VOLUME_LEVEL}.`}
        >
          <span className="ascii-audio-volume-label">volume</span>
          <span ref={volumeBarsRef} className="ascii-audio-volume-bars" aria-hidden="true">
            {VOLUME_LEVEL_CHARS.map((char, index) => (
              <span key={index} className={index < volumeLevel ? "is-active" : ""}>
                {char}
              </span>
            ))}
          </span>
        </button>
        <span className="ascii-audio-time">
          {formatTime(current)} / {formatTime(duration)}
        </span>
      </div>
      <button
        ref={barRef}
        type="button"
        className="ascii-audio-bar"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          seekAtClientX(event.clientX);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            seekAtClientX(event.clientX);
          }
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }}
        aria-disabled={!duration || failed}
        aria-label="Seek audio"
      >
        <span ref={barTextRef}>{bar}</span>
      </button>
      {failed ? <div className="ascii-audio-warning">audio failed to load</div> : null}
    </div>
  );
}
