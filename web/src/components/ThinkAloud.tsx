import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api';
import { formatClock } from '../hooks';
import { pickMimeType, voiceSupported } from './VoiceRecorder';

/** How often the recorder hands over a chunk to upload. */
const CHUNK_MS = 4000;
const RETRIES = 4;

export type ThinkAloudStatus = 'starting' | 'recording' | 'stopped' | 'unavailable';

interface Options {
  enabled: boolean;
  /** e.g. /api/c/<token>/stages/<id>/stream */
  url: string;
  /** Parts the server already has (a reload starts the next part). */
  existingParts: number;
  /** When the question opened, in client clock ms. */
  openedAt: number;
  /** Called when the stage has closed on the server (time ran out). */
  onClosed: () => void;
}

/**
 * Records from the moment a think-aloud question opens until it is finished,
 * uploading a chunk every few seconds so a crash or reload loses almost
 * nothing. Chunks upload strictly in order; a failed chunk is retried.
 */
export function useThinkAloud({ enabled, url, existingParts, openedAt, onClosed }: Options) {
  const [status, setStatus] = useState<ThinkAloudStatus>(
    !enabled ? 'stopped' : voiceSupported() ? 'starting' : 'unavailable',
  );
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadedChunks, setUploadedChunks] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const seqRef = useRef(0);
  const closedRef = useRef(false);
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;

  useEffect(() => {
    if (!enabled || !voiceSupported()) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let context: AudioContext | null = null;
    let frame = 0;
    let tick = 0;

    const upload = async (blob: Blob, seq: number, startMs: number, sec: number) => {
      const query = `part=${existingParts}&seq=${seq}&startMs=${Math.round(startMs)}&sec=${sec.toFixed(1)}`;
      for (let attempt = 0; attempt < RETRIES; attempt++) {
        if (closedRef.current) return;
        try {
          const res = await fetch(`${url}?${query}`, {
            method: 'POST',
            headers: { 'Content-Type': blob.type || 'audio/webm' },
            body: blob,
          });
          if (res.ok) {
            setUploadedChunks((n) => n + 1);
            setUploadError(null);
            return;
          }
          const data = await res.json().catch(() => ({}));
          if (res.status === 409 && /Time ran out/.test(data.error ?? '')) {
            closedRef.current = true;
            onClosedRef.current();
            return;
          }
          if (res.status < 500) throw new ApiError(res.status, data.error ?? 'Upload refused');
        } catch (error) {
          if (error instanceof ApiError) {
            setUploadError(error.message);
            return;
          }
        }
        setUploadError('Connection problem, retrying the recording upload…');
        await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
      }
      setUploadError('Part of your recording could not be uploaded. Keep going; you can also type your working.');
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        if (!cancelled) setStatus('unavailable');
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const mimeType = pickMimeType() ?? '';
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const startedAt = Date.now();
      const startMs = startedAt - openedAt;
      recorder.ondataavailable = (event) => {
        if (event.data.size === 0) return;
        const seq = seqRef.current++;
        const blob = new Blob([event.data], { type: (recorder.mimeType || 'audio/webm').split(';')[0] });
        const sec = (Date.now() - startedAt) / 1000;
        queueRef.current = queueRef.current.then(() => upload(blob, seq, startMs, sec));
      };
      recorder.start(CHUNK_MS);
      recorderRef.current = recorder;
      setStatus('recording');
      tick = window.setInterval(() => setElapsed((Date.now() - startedAt) / 1000), 500);

      try {
        context = new AudioContext();
        const analyser = context.createAnalyser();
        analyser.fftSize = 512;
        context.createMediaStreamSource(stream).connect(analyser);
        const data = new Uint8Array(analyser.fftSize);
        const draw = () => {
          analyser.getByteTimeDomainData(data);
          let peak = 0;
          for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
          setLevel(Math.min(1, peak / 48));
          frame = requestAnimationFrame(draw);
        };
        draw();
      } catch {
        // The level meter is a nicety; recording works without it.
      }
    })();

    return () => {
      cancelled = true;
      window.clearInterval(tick);
      cancelAnimationFrame(frame);
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      stream?.getTracks().forEach((t) => t.stop());
      void context?.close();
    };
  }, [enabled, url, existingParts, openedAt]);

  /** Stops recording and waits for every chunk to reach the server. */
  const finish = useCallback(async () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state === 'recording') {
      await new Promise<void>((resolve) => {
        recorder.addEventListener('stop', () => resolve(), { once: true });
        recorder.stop();
      });
      recorder.stream.getTracks().forEach((t) => t.stop());
      setStatus('stopped');
    }
    await queueRef.current;
  }, []);

  return {
    status,
    elapsed,
    level,
    uploadError,
    hasAudio: existingParts > 0 || uploadedChunks > 0,
    finish,
  };
}

export function ThinkAloudPanel({
  status,
  elapsed,
  level,
  uploadError,
  existingParts,
}: {
  status: ThinkAloudStatus;
  elapsed: number;
  level: number;
  uploadError: string | null;
  existingParts: number;
}) {
  if (status === 'unavailable') {
    return (
      <div className="think-aloud-panel unavailable">
        <strong>We couldn't use your microphone.</strong> Type your working and your answer in the box below instead.
        Reviewers read it the same way.
      </div>
    );
  }
  return (
    <div className="think-aloud-panel" aria-live="polite">
      <div className="think-aloud-row">
        <span className={`rec-dot ${status === 'recording' ? 'live' : ''}`} aria-hidden="true" />
        <strong>
          {status === 'starting'
            ? 'Starting your microphone…'
            : status === 'recording'
              ? `Recording your thinking · ${formatClock(elapsed * 1000)}`
              : 'Recording finished'}
        </strong>
        {status === 'recording' && (
          <div className="level small-level" aria-label="Microphone level">
            <div style={{ width: `${Math.round(level * 100)}%` }} />
          </div>
        )}
      </div>
      <p className="small muted">
        Think out loud as you work: sums, doubts and corrections are exactly what we want to hear. When you're done, say
        your answer out loud, then submit.
        {existingParts > 0 && ' Your earlier recording for this question is saved; this continues it.'}
      </p>
      {uploadError && <p className="small error-text">{uploadError}</p>}
    </div>
  );
}
