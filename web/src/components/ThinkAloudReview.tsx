import { useMemo, useRef, useState } from 'react';
import type { StageResponseView } from '../../../shared/api';
import { formatDuration } from '../../../shared/signals';
import type { Delivery } from '../../../shared/types';
import { AudioPlayer, type Marker, type PlayerApi, SpeedPicker } from './AudioPlayer';
import { Collapsible } from './ui';

const DELIVERY_LABEL: Record<Delivery, string> = {
  natural: 'sounds like live reasoning',
  unsure: 'unclear',
  read: 'sounds read or rehearsed',
};

function clock(ms: number) {
  return formatDuration(Math.round(ms / 1000)) || '0s';
}

export function ThinkAloudReview({
  response,
  delivery,
}: {
  response: StageResponseView;
  /** The AI's read of the recording, once reviewed. */
  delivery: { label: Delivery; reasons: string } | null;
}) {
  const players = useRef<(PlayerApi | null)[]>([]);
  const [speed, setSpeed] = useState(1);
  const [selected, setSelected] = useState(response.scratch.length - 1);
  const parts = response.audio;
  const totalSec = parts.reduce((sum, p) => sum + (p.sec ?? 0), 0);
  const snapshot = response.scratch[selected];

  /** Which part a moment (ms since the question opened) falls in. */
  const partAt = (t: number) => {
    let index = -1;
    parts.forEach((p, i) => {
      if ((p.startMs ?? 0) <= t) index = i;
    });
    return index;
  };
  // Stable per-part callbacks so each player registers once.
  const registers = useMemo(() => parts.map((_, i) => (api: PlayerApi | null) => (players.current[i] = api)), [parts]);
  const markersFor = (i: number): Marker[] =>
    response.scratch
      .filter((s) => partAt(s.t) === i)
      .map((s) => ({ sec: (s.t - (parts[i].startMs ?? 0)) / 1000, label: `Scratchpad at ${clock(s.t)}` }));

  /** Plays the recording from a few seconds before a scratchpad snapshot was taken. */
  function seekTo(t: number) {
    const index = partAt(t);
    const player = players.current[index];
    if (!player) return;
    players.current.forEach((p, i) => i !== index && p?.pause());
    player.playFrom((t - (parts[index].startMs ?? 0)) / 1000 - 5);
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
              <AudioPlayer
                src={part.url}
                knownSec={part.sec}
                rate={speed}
                markers={markersFor(i)}
                register={registers[i]}
                onPlay={() => players.current.forEach((p, j) => j !== i && p?.pause())}
              />
            </div>
          ))}
          <SpeedPicker rate={speed} onChange={setSpeed} />
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
                className={`chip-button ${i === selected ? 'is-active' : ''}`}
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
