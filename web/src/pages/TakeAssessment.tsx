import { type ClipboardEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { CandidatePhaseView, CandidateSession } from '../../../shared/candidateApi';
import type { Block, CandidateStageView, ScratchSnapshot, StageSignals } from '../../../shared/types';
import { EMPTY_SIGNALS, STAGE_KIND_LABEL } from '../../../shared/types';
import { ApiError, api, errorMessage } from '../api';
import { Blocks } from '../components/Blocks';
import { Logo } from '../components/Logo';
import { Collapsible, ErrorNote, KindBadge } from '../components/ui';
import { ThinkAloudPanel, useThinkAloud } from '../components/ThinkAloud';
import { VoiceRecorder, voiceSupported } from '../components/VoiceRecorder';
import { formatClock, formatMinutes, useCountdown, useLatest } from '../hooks';

const AUTOSAVE_MS = 4000;

export function TakeAssessment() {
  const { token } = useParams();
  const base = `/api/c/${token}`;
  const [session, setSession] = useState<CandidateSession | null>(null);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((next: CandidateSession) => {
    setSession(next);
    setOffset(next.serverNow - Date.now());
    setError(null);
  }, []);

  const load = useCallback(async () => {
    try {
      apply(await api.get<CandidateSession>(base));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [apply, base]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (session) document.title = `${session.assessment.title} · ${session.assessment.orgName}`;
  }, [session]);

  if (!session) {
    return (
      <div className="candidate-shell">
        <div className="candidate-main narrow">
          {error ? <ErrorNote error={error} /> : <p className="muted">Loading…</p>}
        </div>
      </div>
    );
  }

  const { state } = session;
  const total = session.assessment.outline.length;
  const stepIndex = state.phase === 'ready' ? state.next.index : state.phase === 'stage' ? state.stage.index : null;

  return (
    <div className="candidate-shell">
      <header className="candidate-header">
        <div className="candidate-header-inner">
          <div>
            <div className="small muted">{session.assessment.orgName}</div>
            <div className="candidate-title">{session.assessment.title}</div>
          </div>
          {stepIndex !== null && (
            <ol className="stepper" aria-label="Progress">
              {session.assessment.outline.map((step, i) => (
                <li
                  key={i}
                  className={i < stepIndex ? 'done' : i === stepIndex ? 'current' : ''}
                  title={`${i + 1}. ${STAGE_KIND_LABEL[step.kind]}`}
                />
              ))}
            </ol>
          )}
        </div>
      </header>

      <ErrorNote error={error} />
      {state.phase === 'intro' && <Intro session={session} base={base} onSession={apply} />}
      {state.phase === 'ready' && (
        <Ready session={session} next={state.next} total={total} base={base} onSession={apply} />
      )}
      {state.phase === 'stage' && (
        <StageScreen
          key={state.stage.id}
          state={state}
          brief={session.brief ?? []}
          total={total}
          base={base}
          offset={offset}
          onSession={apply}
          onStale={load}
        />
      )}
      {state.phase === 'done' && <Done session={session} />}
      <footer className="candidate-footer small muted">
        <Logo size={14} /> Assessment by Proofwork. Your answers are reviewed by people, not scored by AI.
      </footer>
    </div>
  );
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0];
}

// Intro ------------------------------------------------------------------

function Intro({
  session,
  base,
  onSession,
}: {
  session: CandidateSession;
  base: string;
  onSession: (s: CandidateSession) => void;
}) {
  const [idName, setIdName] = useState(session.candidate.name);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { assessment, candidate } = session;
  const aiAllowed = assessment.outline.some((s) => s.kind === 'ai_allowed');
  const thinkAloudCount = assessment.outline.filter((s) => s.thinkAloud).length;

  async function start(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      onSession(await api.post<CandidateSession>(`${base}/start`, { idName, consent }));
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <main className="candidate-main narrow">
      <h1>Hi {firstName(candidate.name)},</h1>
      <p className="lead">
        {assessment.orgName} has invited you to a practical assessment for <strong>{assessment.title}</strong>. It's
        built around a realistic situation from the job, not trivia.
      </p>

      <section className="card">
        <h2>How it works</h2>
        <ul className="check-list">
          <li>
            {assessment.outline.length} short questions, about {assessment.totalMinutes} minutes in total. Each question
            has its own timer, and you can take a break between questions.
          </li>
          <li>Questions appear one at a time, and you can't go back, so finish each one before moving on.</li>
          {thinkAloudCount > 0 && (
            <li>
              <strong>
                {thinkAloudCount} question{thinkAloudCount === 1 ? '' : 's'} record you thinking out loud
              </strong>{' '}
              from the moment they open, next to a scratchpad. No preparation needed: we want to hear how you work it
              out, including sums, doubts and corrections. It's audio only, never video.
            </li>
          )}
          <li>
            Other questions work best as a short voice note, like explaining to a colleague. You can always type
            instead.
          </li>
          <li>The company is fictional. Your version of the numbers is unique to you. A calculator is fine.</li>
        </ul>
        <div className="outline">
          {assessment.outline.map((step, i) => (
            <span key={i} className="outline-step">
              <span className="outline-num">{i + 1}</span>
              {STAGE_KIND_LABEL[step.kind]}
              {step.thinkAloud && ' · think aloud'} · {formatMinutes(step.minutes * 60)}
            </span>
          ))}
        </div>
        {candidate.timeMultiplier > 1 && (
          <p className="callout callout-info">
            You have {candidate.timeMultiplier}× the standard time on every question.
          </p>
        )}
      </section>

      <section className="card">
        <h2>AI and outside help</h2>
        {aiAllowed ? (
          <p>
            One question is marked <strong>AI allowed</strong>. Use any AI tool you like there, and paste your
            conversation so we can see how you worked with it. For every other question, please answer on your own.
          </p>
        ) : (
          <p>Please answer on your own. A calculator is fine.</p>
        )}
      </section>

      <section className="card">
        <h2>What we record, and what we don't</h2>
        <div className="two-col">
          <div>
            <h3 className="small-heading">We record</h3>
            <ul>
              <li>Your answers (voice notes or text)</li>
              <li>How long each question takes</li>
              <li>When you leave this tab or paste text</li>
            </ul>
          </div>
          <div>
            <h3 className="small-heading">We don't</h3>
            <ul>
              <li>Use your camera or record your screen</li>
              <li>Score you with AI; people on the hiring team review your answers</li>
              <li>Reject anyone automatically</li>
            </ul>
          </div>
        </div>
        <p className="muted small">
          What comes next: if your answers stand out, you'll have a 10–15 minute call with the hiring team about your
          own answers. Please have a photo ID ready for that call.
        </p>
        <p className="muted small">Need extra time or a different format? Ask {assessment.orgName} before you start.</p>
      </section>

      <MicCheck recommended={thinkAloudCount > 0} />

      <form className="card start-form" onSubmit={start}>
        <label className="field">
          <span>Your full name as it appears on your photo ID</span>
          <input
            value={idName}
            onChange={(e) => setIdName(e.target.value)}
            required
            maxLength={120}
            autoComplete="name"
          />
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>I've read how this works, and I'll answer on my own except where AI is allowed.</span>
        </label>
        <ErrorNote error={error} />
        <button className="btn btn-primary btn-lg" disabled={!consent || !idName.trim() || busy}>
          {busy ? 'Starting…' : 'Continue to the scenario'}
        </button>
        <p className="muted small">The first timer starts only when you open the first question.</p>
      </form>
    </main>
  );
}

function MicCheck({ recommended }: { recommended: boolean }) {
  const [level, setLevel] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef<() => void>(() => {});

  useEffect(() => () => stopRef.current(), []);

  if (!voiceSupported()) return null;

  async function check() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      context.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      let frame = 0;
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
        setLevel(Math.min(1, peak / 64));
        frame = requestAnimationFrame(tick);
      };
      tick();
      const timeout = window.setTimeout(() => stopRef.current(), 8000);
      stopRef.current = () => {
        cancelAnimationFrame(frame);
        window.clearTimeout(timeout);
        stream.getTracks().forEach((t) => t.stop());
        void context.close();
        setLevel(null);
      };
    } catch {
      setError('We could not access a microphone. You can still type your answers.');
    }
  }

  return (
    <section className="card mic-check">
      <div>
        <h2>Check your microphone {recommended ? '(recommended)' : '(optional)'}</h2>
        <p className="muted small">Say a few words. The bar should move.</p>
      </div>
      {level === null ? (
        <button type="button" className="btn btn-secondary" onClick={check}>
          Test microphone
        </button>
      ) : (
        <div className="level" aria-label="Microphone level">
          <div style={{ width: `${Math.round(level * 100)}%` }} />
        </div>
      )}
      {error && <p className="small error-text">{error}</p>}
    </section>
  );
}

// Ready ------------------------------------------------------------------

function Ready({
  session,
  next,
  total,
  base,
  onSession,
}: {
  session: CandidateSession;
  next: Extract<CandidatePhaseView, { phase: 'ready' }>['next'];
  total: number;
  base: string;
  onSession: (s: CandidateSession) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setBusy(true);
    try {
      onSession(await api.post<CandidateSession>(`${base}/next`, { index: next.index }));
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <main className="candidate-main narrow">
      {next.index === 0 && (
        <>
          <h1>The scenario</h1>
          <p className="lead">Read this first. It isn't timed, and it stays on screen next to every question.</p>
          <section className="card brief-card">
            <Blocks blocks={session.brief ?? []} />
          </section>
        </>
      )}
      <section className="card next-card">
        <div className="next-meta">
          <span className="muted">
            Question {next.index + 1} of {total}
          </span>
          <KindBadge kind={next.kind} />
        </div>
        <h2>{formatMinutes(next.timeLimitSec)} on the clock</h2>
        {next.thinkAloud ? (
          <>
            <p>
              <strong>This question records audio from the moment you open it.</strong> Think out loud as you work: read
              the numbers, do the sums, change your mind. There's a scratchpad for notes. Finish by saying your answer,
              then submit.
            </p>
            <p className="small muted">
              Your browser will ask to use the microphone. If you can't use one, you can type your working instead.
            </p>
          </>
        ) : next.kind === 'ai_allowed' ? (
          <p>
            AI tools are <strong>allowed</strong> on this one. Have your preferred tool open, and be ready to paste your
            conversation.
          </p>
        ) : (
          <p>The timer starts when you open the question and keeps running if you leave the page.</p>
        )}
        <ErrorNote error={error} />
        <button className="btn btn-primary btn-lg" onClick={open} disabled={busy}>
          {busy ? 'Opening…' : next.index === 0 ? "I've read it. Start question 1" : `Start question ${next.index + 1}`}
        </button>
      </section>
      {next.index > 0 && (
        <Collapsible title="Scenario brief" className="card">
          <Blocks blocks={session.brief ?? []} />
        </Collapsible>
      )}
    </main>
  );
}

// Stage ------------------------------------------------------------------

type StageState = Extract<CandidatePhaseView, { phase: 'stage' }>;

function StageScreen({
  state,
  brief,
  total,
  base,
  offset,
  onSession,
  onStale,
}: {
  state: StageState;
  brief: Block[];
  total: number;
  base: string;
  offset: number;
  onSession: (s: CandidateSession) => void;
  onStale: () => Promise<void>;
}) {
  const stage: CandidateStageView = state.stage;
  const draft = state.draft ?? {};
  const [text, setText] = useState(draft.text ?? '');
  const [choiceId, setChoiceId] = useState(draft.choiceId ?? '');
  const [aiTranscript, setAiTranscript] = useState(draft.aiTranscript ?? '');
  const [reflection, setReflection] = useState(draft.reflection ?? '');
  const [hasAudio, setHasAudio] = useState(Boolean(state.audio));
  const [scratch, setScratch] = useState<ScratchSnapshot[]>(draft.scratch ?? []);
  // Fixed at mount: a later session refresh must not restart the recorder.
  const [openedAt] = useState(() => state.deadlineAt - stage.timeLimitSec * 1000 - offset);
  const [existingParts] = useState(() => (stage.thinkAloud ? (state.audio?.parts ?? 0) : 0));
  const thinkAloud = useThinkAloud({
    enabled: stage.thinkAloud,
    url: `${base}/stages/${stage.id}/stream`,
    existingParts,
    openedAt,
    onClosed: onStale,
  });
  const voiceAllowed = stage.voiceMaxSec > 0 && voiceSupported();
  const [mode, setMode] = useState<'voice' | 'text'>(
    voiceAllowed && stage.preferVoice && !draft.text ? 'voice' : 'text',
  );
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const uploadRef = useRef<Promise<unknown> | null>(null);
  const remaining = useCountdown(state.deadlineAt, offset);

  // Integrity signals: weak evidence, disclosed to the candidate up front.
  const signals = useRef<StageSignals>({ ...EMPTY_SIGNALS });
  const hiddenSince = useRef<number | null>(null);
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        signals.current.tabHidden += 1;
        hiddenSince.current = Date.now();
      } else if (hiddenSince.current) {
        signals.current.hiddenMs += Date.now() - hiddenSince.current;
        hiddenSince.current = null;
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const length = event.clipboardData.getData('text').length;
    signals.current.pasteCount += 1;
    signals.current.pasteChars += length;
    signals.current.largestPaste = Math.max(signals.current.largestPaste, length);
  };
  const onKeyDown = () => {
    signals.current.keystrokes += 1;
  };

  /** Scratchpad edits become timestamped snapshots so reviewers can line them up with the audio. */
  const updateScratchpad = (value: string) => {
    setText(value);
    const t = Date.now() - openedAt;
    setScratch((prev) => {
      const last = prev[prev.length - 1];
      // One snapshot per ~8 seconds of editing keeps the timeline readable.
      if (last && t - last.t < 8000) return [...prev.slice(0, -1), { t, text: value }];
      return prev.length >= 200 ? [...prev.slice(0, -1), { t, text: value }] : [...prev, { t, text: value }];
    });
  };

  const values = {
    text,
    choiceId: choiceId || undefined,
    aiTranscript,
    reflection,
    scratch: stage.thinkAloud ? scratch : undefined,
  };
  const latest = useLatest(values);
  const lastSaved = useRef(JSON.stringify(values));

  // Autosave, so a timeout or a closed tab never loses work.
  useEffect(() => {
    const id = window.setInterval(async () => {
      if (submittingRef.current) return;
      const json = JSON.stringify(latest.current);
      if (json === lastSaved.current) return;
      try {
        await api.put(`${base}/stages/${stage.id}/draft`, latest.current);
        lastSaved.current = json;
        setSavedAt(Date.now());
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) void onStale();
      }
    }, AUTOSAVE_MS);
    return () => window.clearInterval(id);
  }, [base, stage.id, latest, onStale]);

  const submit = useCallback(
    async (timedOut: boolean) => {
      if (submittingRef.current) return;
      submittingRef.current = true;
      setSubmitting(true);
      setError(null);
      // Never race audio that is still uploading.
      if (uploadRef.current) await uploadRef.current.catch(() => undefined);
      await thinkAloud.finish();
      if (hiddenSince.current) {
        signals.current.hiddenMs += Date.now() - hiddenSince.current;
        hiddenSince.current = Date.now();
      }
      try {
        const next = await api.post<CandidateSession>(`${base}/stages/${stage.id}/submit`, {
          ...latest.current,
          timedOut,
          signals: signals.current,
        });
        window.scrollTo({ top: 0 });
        onSession(next);
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          await onStale();
          return;
        }
        setError(errorMessage(e));
        submittingRef.current = false;
        setSubmitting(false);
        setConfirming(false);
      }
    },
    [base, stage.id, latest, onSession, onStale, thinkAloud.finish],
  );

  // Submit whatever is there when the clock runs out.
  useEffect(() => {
    if (remaining === 0 && !submittingRef.current) {
      // Give the recorder a moment to stop and upload.
      const id = window.setTimeout(() => void submit(true), 1500);
      return () => window.clearTimeout(id);
    }
  }, [remaining, submit]);

  const hasText = text.trim().length > 0;
  const canSubmit =
    (stage.kind !== 'decision' || Boolean(choiceId)) &&
    (stage.kind === 'ai_allowed' ? hasText : hasText || hasAudio || thinkAloud.hasAudio);
  const timeUp = remaining === 0;
  const urgency = remaining === null ? '' : remaining < 20_000 ? 'danger' : remaining < 60_000 ? 'warn' : '';

  return (
    <main className="candidate-main wide">
      <div className={`timer-bar ${urgency}`}>
        <div className="timer-meta">
          <span className="muted">
            Question {stage.index + 1} of {total}
          </span>
          <KindBadge kind={stage.kind} />
          {stage.thinkAloud && <span className="badge badge-think">Think aloud</span>}
        </div>
        <div className="timer" role="timer" aria-live={urgency ? 'polite' : 'off'}>
          {timeUp ? "Time's up, submitting…" : formatClock(remaining ?? 0)}
        </div>
        <div className="timer-progress" aria-hidden="true">
          <div style={{ width: `${remaining === null ? 0 : (remaining / (stage.timeLimitSec * 1000)) * 100}%` }} />
        </div>
      </div>

      <div className="stage-layout">
        <aside className="stage-brief">
          <Collapsible
            title="Scenario brief"
            defaultOpen={typeof window !== 'undefined' && window.matchMedia('(min-width: 960px)').matches}
            className="card"
          >
            <Blocks blocks={brief} />
          </Collapsible>
        </aside>

        <section className="stage-main">
          <div className="card">
            <h1 className="stage-title">{stage.title}</h1>
            <Blocks blocks={stage.prompt} />
            {stage.material.length > 0 && (
              <div className="material">
                <Blocks blocks={stage.material} />
              </div>
            )}
            {stage.lookingFor.length > 0 && (
              <div className="looking-for">
                <span className="small muted">What reviewers look for:</span>
                {stage.lookingFor.map((label) => (
                  <span key={label} className="chip">
                    {label}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="card answer-card">
            {stage.thinkAloud && (
              <ThinkAloudPanel
                status={thinkAloud.status}
                elapsed={thinkAloud.elapsed}
                level={thinkAloud.level}
                uploadError={thinkAloud.uploadError}
                existingParts={existingParts}
              />
            )}
            {stage.choices && (
              <fieldset className="choices" disabled={timeUp}>
                <legend>Your choice</legend>
                {stage.choices.map((choice) => (
                  <label key={choice.id} className={`choice ${choiceId === choice.id ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="choice"
                      value={choice.id}
                      checked={choiceId === choice.id}
                      onChange={() => setChoiceId(choice.id)}
                    />
                    {choice.label}
                  </label>
                ))}
              </fieldset>
            )}

            {stage.kind === 'ai_allowed' ? (
              <>
                <label className="field">
                  <span>1. Your final answer</span>
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={7}
                    maxLength={20000}
                    disabled={timeUp}
                  />
                </label>
                <label className="field">
                  <span>2. Your AI conversation (paste it all, or write "none")</span>
                  <textarea
                    value={aiTranscript}
                    onChange={(e) => setAiTranscript(e.target.value)}
                    rows={7}
                    maxLength={100000}
                    disabled={timeUp}
                  />
                </label>
                <label className="field">
                  <span>3. What you kept, changed or rejected, and why</span>
                  <textarea
                    value={reflection}
                    onChange={(e) => setReflection(e.target.value)}
                    rows={3}
                    maxLength={5000}
                    disabled={timeUp}
                  />
                </label>
              </>
            ) : stage.thinkAloud ? (
              <label className="field">
                <span>
                  {thinkAloud.status === 'unavailable'
                    ? 'Your working and your answer'
                    : 'Scratchpad (optional): jot numbers and working as you go'}
                </span>
                <textarea
                  value={text}
                  onChange={(e) => updateScratchpad(e.target.value)}
                  onPaste={onPaste}
                  onKeyDown={onKeyDown}
                  rows={thinkAloud.status === 'unavailable' ? 9 : 6}
                  maxLength={20000}
                  disabled={timeUp}
                />
              </label>
            ) : (
              <>
                {voiceAllowed && (
                  <div className="segmented" role="tablist" aria-label="Answer format">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={mode === 'voice'}
                      className={mode === 'voice' ? 'active' : ''}
                      onClick={() => setMode('voice')}
                    >
                      Voice note{stage.preferVoice ? ' (recommended)' : ''}
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={mode === 'text'}
                      className={mode === 'text' ? 'active' : ''}
                      onClick={() => setMode('text')}
                    >
                      Type instead
                    </button>
                  </div>
                )}
                {mode === 'voice' && voiceAllowed ? (
                  <VoiceRecorder
                    maxSec={stage.voiceMaxSec}
                    savedSec={state.audio ? (state.audio.sec ?? 0) : null}
                    disabled={timeUp}
                    onRecorded={async (blob, seconds) => {
                      const upload = api.upload(`${base}/stages/${stage.id}/audio?seconds=${seconds}`, blob);
                      uploadRef.current = upload;
                      await upload;
                      setHasAudio(true);
                    }}
                  />
                ) : (
                  <label className="field">
                    <span className="sr-only">Your answer</span>
                    <textarea
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      onPaste={onPaste}
                      onKeyDown={onKeyDown}
                      rows={9}
                      maxLength={20000}
                      placeholder="Type your answer…"
                      disabled={timeUp}
                    />
                  </label>
                )}
                {mode === 'voice' && hasText && (
                  <p className="small muted">You also have a typed answer saved; both will be sent.</p>
                )}
                {mode === 'text' && hasAudio && (
                  <p className="small muted">Your voice note is saved too; both will be sent.</p>
                )}
              </>
            )}

            <ErrorNote error={error} />
            <div className="submit-row">
              <span className="small muted">{savedAt ? 'Draft autosaved' : ''}</span>
              {confirming ? (
                <div className="confirm">
                  <span className="small">You can't come back to this question.</span>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setConfirming(false)}
                    disabled={submitting}
                  >
                    Keep working
                  </button>
                  <button type="button" className="btn btn-primary" onClick={() => submit(false)} disabled={submitting}>
                    {submitting ? 'Submitting…' : 'Submit'}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!canSubmit || submitting || timeUp}
                  onClick={() => setConfirming(true)}
                >
                  Submit and continue
                </button>
              )}
            </div>
            {!canSubmit && !timeUp && (
              <p className="small muted right">
                {stage.kind === 'decision' && !choiceId
                  ? 'Choose an option, then explain your reasoning.'
                  : stage.kind === 'ai_allowed'
                    ? 'Paste your final answer to continue.'
                    : stage.thinkAloud
                      ? 'Start talking through it; you can submit once some of your recording is saved.'
                      : 'Record a voice note or type an answer to continue.'}
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

// Done -------------------------------------------------------------------

function Done({ session }: { session: CandidateSession }) {
  return (
    <main className="candidate-main narrow center">
      <div className="done-mark" aria-hidden="true">
        <Logo size={48} />
      </div>
      <h1>Thank you, {firstName(session.candidate.name)}. Your answers are in.</h1>
      <p className="lead">
        People on the {session.assessment.orgName} hiring team will read and listen to your answers. If they'd like to
        go further, they'll set up a short call about your own answers. Please have a photo ID ready for it.
      </p>
      <p className="muted">You can close this page.</p>
    </main>
  );
}
