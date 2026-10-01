import { useRef, useState } from 'react';
import type { StageResponseView } from '../../../shared/api';
import { formatDuration } from '../../../shared/signals';
import type { Delivery } from '../../../shared/types';
import { Collapsible } from './ui';

const SPEEDS = [1, 1.25, 1.5, 2];

const DELIVERY_LABEL: Record<Delivery, string> = {
  natural: 'sounds like live reasoning',
  unsure: 'unclear',
  read: 'sounds read or rehearsed',
};

function clock(ms: number) {
  return formatDuration(Math.round(ms / 1000)) || '0s';
}

/**
 * MediaRecorder WebM files carry no duration or seek index, so browsers can't
 * seek until they've scanned the file. Jumping far past the end forces the
 * scan; then we return to the start.
 */
function primeSeeking(audio: HTMLAudioElement) {
  if (audio.duration !== Infinity) return;
  const reset = () => {
    audio.removeEventListener('durationchange', reset);
    audio.currentTime = 0;
  };
  audio.addEventListener('durationchange', reset);
  audio.currentTime = 1e101;
}

export function ThinkAloudReview({
  response,
  delivery,
}: {
  response: StageResponseView;
  /** The AI's read of the recording, once reviewed. */
  delivery: { label: Delivery; reasons: string } | null;
}) {
  const audioRefs = useRef<(HTMLAudioElement | null)[]>([]);
  const [speed, setSpeed] = useState(1);
  const [selected, setSelected] = useState(response.scratch.length - 1);
  const parts = response.audio;
  const totalSec = parts.reduce((sum, p) => sum + (p.sec ?? 0), 0);
  const snapshot = response.scratch[selected];

  function setRate(rate: number) {
    setSpeed(rate);
    audioRefs.current.forEach((a) => a && (a.playbackRate = rate));
  }

  /** Plays the recording from the moment a scratchpad snapshot was taken. */
  function seekTo(t: number) {
    let index = -1;
    parts.forEach((p, i) => {
      if ((p.startMs ?? 0) <= t) index = i;
    });
    const audio = audioRefs.current[index];
    if (!audio) return;
    audioRefs.current.forEach((a) => a && a !== audio && a.pause());
    // Start a few seconds early so the reviewer hears what led up to the note.
    audio.currentTime = Math.max(0, (t - (parts[index].startMs ?? 0)) / 1000 - 5);
    audio.playbackRate = speed;
    void audio.play();
  }

  return (
    <div className="think-aloud-review">
      <div className="row-between">
        <strong>Think-aloud recording</strong>
        <span className="small muted">{totalSec ? formatDuration(totalSec) : ''}</span>
      </div>
      {parts.length === 0 ? (
        <p className="small muted">No recording: the candidate typed their working instead (microphone unavailable).</p>
      ) : (
        <>
          {parts.map((part, i) => (
            <div key={part.url} className="answer-audio">
              {parts.length > 1 && (
                <span className="small muted">
                  Part {i + 1}, from {clock(part.startMs ?? 0)}
                  {i > 0 && ' (after a page reload; a few seconds before it may be missing)'}
                </span>
              )}
              <audio
                ref={(el) => {
                  audioRefs.current[i] = el;
                }}
                controls
                preload="metadata"
                src={part.url}
                className="audio"
                onLoadedMetadata={(e) => primeSeeking(e.currentTarget)}
              />
            </div>
          ))}
          <div className="row-gap small" role="group" aria-label="Playback speed">
            <span className="muted">Speed</span>
            {SPEEDS.map((rate) => (
              <button
                key={rate}
                type="button"
                className={`btn btn-sm ${speed === rate ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setRate(rate)}
              >
                {rate}×
              </button>
            ))}
          </div>
        </>
      )}

      {response.scratch.length > 0 && (
        <div className="scratch-timeline">
          <div className="small muted">Scratchpad over time: click a moment to hear what they were saying then</div>
          <div className="row-gap">
            {response.scratch.map((s, i) => (
              <button
                key={i}
                type="button"
                className={`btn btn-sm ${i === selected ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => {
                  setSelected(i);
                  if (parts.length) seekTo(s.t);
                }}
              >
                {clock(s.t)}
              </button>
            ))}
          </div>
          {snapshot && (
            <div className="answer-text scratch-text">
              <div className="small muted">
                {selected === response.scratch.length - 1 ? 'Final scratchpad' : `Scratchpad at ${clock(snapshot.t)}`}
              </div>
              {snapshot.text || <span className="muted">(empty)</span>}
            </div>
          )}
        </div>
      )}

      {delivery && (
        <div className={`delivery-box delivery-${delivery.label}`}>
          <strong>AI's read of the recording: {DELIVERY_LABEL[delivery.label]}.</strong> {delivery.reasons}
        </div>
      )}
      <Collapsible title="How the AI judges delivery" className="inset listen-for">
        <div className="two-col small">
          <div>
            <strong>Live reasoning usually has</strong>
            <ul>
              <li>This scenario's own numbers, read and used</li>
              <li>Sums done out loud, with pauses</li>
              <li>Self-corrections ("wait, that's wrong…")</li>
              <li>A conclusion reached, not announced</li>
            </ul>
          </div>
          <div>
            <strong>Reading usually has</strong>
            <ul>
              <li>Long silence, then a fluent, complete answer</li>
              <li>Even, reading-aloud cadence throughout</li>
              <li>Numbers or facts that aren't in the scenario</li>
              <li>Scratchpad filling in big blocks while they're quiet</li>
            </ul>
          </div>
        </div>
        <p className="small muted">
          Accent, fluency and confidence are never assessed. "Sounds read" puts the question first on the verification
          call; it is a question to ask, not proof.
        </p>
      </Collapsible>
    </div>
  );
}
