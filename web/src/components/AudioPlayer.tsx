import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

const BARS = 96;

export interface PlayerApi {
  /** Jumps to a time (seconds) and plays from there. */
  playFrom: (sec: number) => void;
  pause: () => void;
}

export interface Marker {
  sec: number;
  label: string;
}

function clock(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Loudness per bar, 0..1, from the decoded audio. Null when the browser can't decode it. */
async function peaksOf(url: string): Promise<{ peaks: number[]; duration: number } | null> {
  try {
    const data = await (await fetch(url, { credentials: 'same-origin' })).arrayBuffer();
    const Ctx =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const buffer = await ctx.decodeAudioData(data);
    void ctx.close();
    const channel = buffer.getChannelData(0);
    const size = Math.max(1, Math.floor(channel.length / BARS));
    const peaks: number[] = [];
    for (let i = 0; i < BARS; i++) {
      let max = 0;
      for (let j = i * size; j < Math.min(channel.length, (i + 1) * size); j += 16) {
        const v = Math.abs(channel[j]);
        if (v > max) max = v;
      }
      peaks.push(max);
    }
    const top = Math.max(...peaks, 0.01);
    return { peaks: peaks.map((p) => Math.max(0.06, p / top)), duration: buffer.duration };
  } catch {
    return null;
  }
}

/**
 * A recording as a waveform you can click to seek, with speed control and
 * optional markers (e.g. scratchpad snapshots). Falls back to a plain bar
 * when the browser can't decode the file.
 */
export function AudioPlayer({
  src,
  knownSec,
  rate = 1,
  markers = [],
  onPlay,
  register,
  label,
}: {
  src: string;
  /** Duration from the server, used until the file is decoded. */
  knownSec?: number | null;
  rate?: number;
  markers?: Marker[];
  onPlay?: () => void;
  register?: (api: PlayerApi | null) => void;
  label?: string;
}) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [wave, setWave] = useState<{ peaks: number[]; duration: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const duration = wave?.duration || knownSec || 0;

  useEffect(() => {
    let cancelled = false;
    void peaksOf(src).then((result) => {
      if (cancelled) return;
      if (result) setWave(result);
      else setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [src]);

  useEffect(() => {
    if (audio.current) audio.current.playbackRate = rate;
  }, [rate]);

  useEffect(() => {
    if (!register) return;
    register({
      playFrom: (sec) => {
        const el = audio.current;
        if (!el) return;
        el.currentTime = Math.max(0, sec);
        el.playbackRate = rate;
        void el.play();
      },
      pause: () => audio.current?.pause(),
    });
    return () => register(null);
  }, [register, rate]);

  function seekTo(fraction: number) {
    const el = audio.current;
    if (!el || !duration) return;
    el.currentTime = Math.min(duration, Math.max(0, fraction * duration));
    setTime(el.currentTime);
  }

  function toggle() {
    const el = audio.current;
    if (!el) return;
    if (el.paused) {
      el.playbackRate = rate;
      void el.play();
    } else el.pause();
  }

  const progress = duration ? Math.min(1, time / duration) : 0;
  const bars = wave?.peaks ?? Array.from({ length: BARS }, () => 0.18);
  return (
    <div className={`player ${playing ? 'is-playing' : ''}`}>
      <audio
        ref={audio}
        src={src}
        preload="metadata"
        onPlay={() => {
          setPlaying(true);
          onPlay?.();
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          // MediaRecorder WebM has no duration until scanned; jumping far ahead forces the scan.
          const el = e.currentTarget;
          if (el.duration === Infinity) {
            const reset = () => {
              el.removeEventListener('durationchange', reset);
              el.currentTime = 0;
            };
            el.addEventListener('durationchange', reset);
            el.currentTime = 1e101;
          }
        }}
      />
      <button
        type="button"
        className="player-toggle"
        onClick={toggle}
        aria-label={playing ? 'Pause' : `Play${label ? ` ${label}` : ''}`}
      >
        <Icon name={playing ? 'pause' : 'play'} size={14} filled={!playing} />
      </button>
      <div className="player-body">
        <div
          className={`player-wave ${failed ? 'is-plain' : ''}`}
          role="slider"
          tabIndex={0}
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(time)}
          onClick={(e) => {
            const box = e.currentTarget.getBoundingClientRect();
            seekTo((e.clientX - box.left) / box.width);
          }}
          onMouseMove={(e) => {
            const box = e.currentTarget.getBoundingClientRect();
            setHover((e.clientX - box.left) / box.width);
          }}
          onMouseLeave={() => setHover(null)}
          onKeyDown={(e) => {
            const el = audio.current;
            if (!el) return;
            if (e.key === 'ArrowRight') el.currentTime = Math.min(duration, el.currentTime + 5);
            if (e.key === 'ArrowLeft') el.currentTime = Math.max(0, el.currentTime - 5);
            if (e.key === ' ') {
              e.preventDefault();
              toggle();
            }
          }}
        >
          {bars.map((h, i) => (
            <i
              key={i}
              className={i / bars.length < progress ? 'played' : ''}
              style={{ height: `${Math.round(h * 100)}%` }}
            />
          ))}
          {markers.map((m, i) =>
            duration ? (
              <button
                key={i}
                type="button"
                className="player-marker"
                style={{ left: `${Math.min(100, (m.sec / duration) * 100)}%` }}
                title={m.label}
                aria-label={m.label}
                onClick={(e) => {
                  e.stopPropagation();
                  const el = audio.current;
                  if (!el) return;
                  el.currentTime = Math.max(0, m.sec - 5);
                  void el.play();
                }}
              />
            ) : null,
          )}
          {hover !== null && duration > 0 && (
            <span className="player-hover" style={{ left: `${hover * 100}%` }}>
              {clock(hover * duration)}
            </span>
          )}
        </div>
        <div className="player-meta tiny">
          <span className="num">
            {clock(time)} / {clock(duration)}
          </span>
          {label && <span className="muted">{label}</span>}
        </div>
      </div>
    </div>
  );
}

export const SPEEDS = [1, 1.25, 1.5, 2];

export function SpeedPicker({ rate, onChange }: { rate: number; onChange: (rate: number) => void }) {
  return (
    <div className="speed-picker" role="group" aria-label="Playback speed">
      {SPEEDS.map((value) => (
        <button
          key={value}
          type="button"
          className={value === rate ? 'is-active' : ''}
          aria-pressed={value === rate}
          onClick={() => onChange(value)}
        >
          {value}×
        </button>
      ))}
    </div>
  );
}
