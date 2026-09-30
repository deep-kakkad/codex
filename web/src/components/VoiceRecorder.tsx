import { useEffect, useRef, useState } from 'react';
import { formatClock } from '../hooks';

const PREFERRED_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return null;
  return PREFERRED_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

export function voiceSupported() {
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) && pickMimeType() !== null;
}

type Status = 'idle' | 'recording' | 'saving' | 'saved' | 'error';

interface Props {
  maxSec: number;
  /** A recording the server already has (e.g. after a page refresh). */
  savedSec: number | null;
  disabled?: boolean;
  onRecorded: (blob: Blob, seconds: number) => Promise<void>;
}

export function VoiceRecorder({ maxSec, savedSec, disabled, onRecorded }: Props) {
  const [status, setStatus] = useState<Status>(savedSec !== null ? 'saved' : 'idle');
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState<number | null>(savedSec);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef(0);
  const tickRef = useRef<number | undefined>(undefined);
  const pendingRef = useRef<{ blob: Blob; seconds: number } | null>(null);

  useEffect(
    () => () => {
      window.clearInterval(tickRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    },
    [],
  );

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  // Stop automatically when the question's timer runs out.
  useEffect(() => {
    if (disabled && recorderRef.current?.state === 'recording') recorderRef.current.stop();
  }, [disabled]);

  async function save(blob: Blob, seconds: number) {
    pendingRef.current = { blob, seconds };
    setStatus('saving');
    setMessage(null);
    try {
      await onRecorded(blob, seconds);
      pendingRef.current = null;
      setStatus('saved');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Could not save the recording');
    }
  }

  async function start() {
    setMessage(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setStatus('error');
      setMessage('We could not access your microphone. Allow microphone access, or type your answer instead.');
      return;
    }
    streamRef.current = stream;
    const mimeType = pickMimeType() ?? '';
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = () => {
      window.clearInterval(tickRef.current);
      stream.getTracks().forEach((t) => t.stop());
      const seconds = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
      const blob = new Blob(chunks, { type: (recorder.mimeType || 'audio/webm').split(';')[0] });
      setDuration(seconds);
      setPreviewUrl(URL.createObjectURL(blob));
      void save(blob, seconds);
    };
    recorderRef.current = recorder;
    startedAtRef.current = Date.now();
    setElapsed(0);
    recorder.start(1000);
    setStatus('recording');
    tickRef.current = window.setInterval(() => {
      const secs = (Date.now() - startedAtRef.current) / 1000;
      setElapsed(secs);
      if (secs >= maxSec && recorder.state === 'recording') recorder.stop();
    }, 200);
  }

  function stop() {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  }

  if (!voiceSupported()) {
    return <p className="muted">Voice notes are not supported in this browser. Please type your answer.</p>;
  }

  return (
    <div className="recorder">
      {status === 'recording' ? (
        <div className="recorder-row">
          <span className="rec-dot" aria-hidden="true" />
          <span className="recorder-time" aria-live="polite">
            {formatClock(elapsed * 1000)} / {formatClock(maxSec * 1000)}
          </span>
          <div className="recorder-bar" aria-hidden="true">
            <div style={{ width: `${Math.min(100, (elapsed / maxSec) * 100)}%` }} />
          </div>
          <button type="button" className="btn btn-primary" onClick={stop}>
            Stop
          </button>
        </div>
      ) : (
        <div className="recorder-row">
          <button type="button" className="btn btn-record" onClick={start} disabled={disabled || status === 'saving'}>
            <span className="rec-dot" aria-hidden="true" />
            {duration ? 'Record again' : 'Start recording'}
          </button>
          <span className="muted small">Up to {formatClock(maxSec * 1000)}</span>
          {status === 'saving' && <span className="small">Saving…</span>}
          {status === 'saved' && duration !== null && (
            <span className="small saved-note">Voice note saved ({formatClock(duration * 1000)})</span>
          )}
        </div>
      )}
      {previewUrl && status !== 'recording' && <audio controls src={previewUrl} className="audio" />}
      {status === 'error' && message && (
        <div className="alert alert-error small">
          {message}
          {pendingRef.current && (
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              onClick={() => pendingRef.current && save(pendingRef.current.blob, pendingRef.current.seconds)}
            >
              Try saving again
            </button>
          )}
        </div>
      )}
    </div>
  );
}
