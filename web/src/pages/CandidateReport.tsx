import { type ReactNode, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type {
  AiStageReview,
  CandidateReport,
  ReportStage,
  ScoreOverride,
  VerificationRecord,
} from '../../../shared/api';
import { formatDuration } from '../../../shared/signals';
import type { Decision } from '../../../shared/types';
import { api, errorMessage } from '../api';
import { useAuth } from '../auth';
import { Blocks } from '../components/Blocks';
import { Icon } from '../components/Icon';
import { ThinkAloudReview } from '../components/ThinkAloudReview';
import {
  Collapsible,
  CopyButton,
  DecisionBadge,
  ErrorNote,
  KindBadge,
  RecommendationBadge,
  Score,
  StatusBadge,
  candidateLink,
} from '../components/ui';
import { formatDate, useApi } from '../hooks';

type Tab = 'review' | 'verification' | 'scenario';
const POLL_MS = 4000;

export function CandidateReportPage() {
  const { id } = useParams();
  const { data: report, setData: setReport, error, reload } = useApi<CandidateReport>(`/api/candidates/${id}`);
  const [tab, setTab] = useState<Tab>('review');
  const reviewing = report?.aiReview?.status === 'pending' || report?.aiReview?.status === 'running';

  // Keep checking while the AI review runs in the background.
  useEffect(() => {
    if (!reviewing) return;
    const timer = window.setInterval(() => void reload(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [reviewing, reload]);

  if (error) return <ErrorNote error={error} />;
  if (!report) return <p className="muted">Loading…</p>;

  const { candidate } = report;
  const finished = ['submitted', 'reviewed', 'decided'].includes(candidate.status);

  return (
    <>
      <div className="page-head">
        <div>
          <Link to={`/app/assessments/${report.assessment.id}`} className="back-link">
            <Icon name="back" size={14} />
            {report.assessment.title}
          </Link>
          <h1>
            {candidate.name} <StatusBadge status={candidate.status} />
          </h1>
          <p className="muted small">
            {candidate.email} · invited {formatDate(candidate.createdAt)} · started {formatDate(candidate.startedAt)} ·
            submitted {formatDate(candidate.submittedAt)}
            {candidate.timeMultiplier > 1 && ` · ${candidate.timeMultiplier}× time`}
          </p>
        </div>
        {!finished && <CopyButton text={candidateLink(candidate.token)} label="Copy candidate link" />}
      </div>

      <div className="tabs" role="tablist">
        {(
          [
            ['review', 'Review'],
            ['verification', 'Verification call'],
            ['scenario', "This candidate's scenario"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? 'active' : ''}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'review' && <ReviewTab report={report} finished={finished} onReport={setReport} />}
      {tab === 'verification' && <VerificationTab report={report} finished={finished} onReport={setReport} />}
      {tab === 'scenario' && (
        <div className="card">
          <p className="callout callout-info">
            {report.family.generated
              ? 'Every candidate on this assessment saw this same scenario.'
              : 'Numbers and names are generated for this candidate. Other candidates saw a different version.'}
          </p>
          <Blocks blocks={report.brief} />
        </div>
      )}
    </>
  );
}

// AI review -------------------------------------------------------------------

function ReviewTab({
  report,
  finished,
  onReport,
}: {
  report: CandidateReport;
  finished: boolean;
  onReport: (r: CandidateReport) => void;
}) {
  const result = report.aiReview?.result ?? null;
  return (
    <>
      <Verdict report={report} finished={finished} onReport={onReport} />
      <h2 className="section-title answers-title">Answers, question by question</h2>
      {report.stages.map((stage) => (
        <StageReview
          key={stage.id}
          stage={stage}
          ai={result?.stages.find((s) => s.stageId === stage.id) ?? null}
          stageScore={result?.byStage[stage.id] ?? null}
          adjustedScore={report.adjusted?.byStage[stage.id] ?? null}
          overrides={report.overrides.filter((o) => o.stageId === stage.id)}
          candidateId={report.candidate.id}
          onReport={onReport}
        />
      ))}
    </>
  );
}

/** Plain-language reason for a failed review; the raw error stays available underneath. */
function friendlyReviewError(error: string | null): string {
  const text = error ?? '';
  if (/not configured/i.test(text)) return "AI review isn't set up on this workspace yet.";
  if (/402|credit/i.test(text)) return 'The AI service has run out of credits.';
  if (/429|rate limit|busy/i.test(text)) return 'The AI service is busy right now.';
  if (/timed? ?out|timeout/i.test(text)) return 'The AI review took too long and stopped.';
  return 'Something went wrong while the AI was reviewing.';
}

/** The answer to "should we move forward?", before any of the detail. */
function Verdict({
  report,
  finished,
  onReport,
}: {
  report: CandidateReport;
  finished: boolean;
  onReport: (r: CandidateReport) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const review = report.aiReview;
  const r = review?.result ?? null;

  async function rerun() {
    setBusy(true);
    try {
      onReport(await api.post<CandidateReport>(`/api/candidates/${report.candidate.id}/ai-review`));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  let body: ReactNode;
  if (!finished) {
    const reached = report.stages.filter((s) => s.response).length;
    body = (
      <div className="verdict-state">
        <h2>{report.candidate.status === 'invited' ? "Hasn't started yet" : 'Still working'}</h2>
        <p className="muted">
          {report.candidate.status === 'invited'
            ? 'Send them their link. The AI review starts as soon as they submit.'
            : `On question ${reached} of ${report.stages.length}. The AI review starts as soon as they submit.`}
        </p>
      </div>
    );
  } else if (!review || review.status === 'pending' || review.status === 'running') {
    body = (
      <div className="verdict-state">
        <h2 className="reviewing">
          <span className="spinner" aria-hidden="true" />
          {review?.status === 'running' ? 'Transcribing audio and scoring answers…' : 'AI review queued…'}
        </h2>
        <p className="muted">This usually takes a minute or two. The page updates by itself.</p>
      </div>
    );
  } else if (review.status === 'failed' || !r) {
    body = (
      <div className="verdict-state">
        <h2>No AI review yet</h2>
        <p>
          {friendlyReviewError(review.error)} Every answer and recording is below, and you can still make a decision.
        </p>
        <div className="row-gap">
          <button className="btn btn-secondary btn-sm" onClick={rerun} disabled={busy}>
            {busy ? 'Starting…' : 'Try the AI review again'}
          </button>
          {review.error && (
            <details className="tiny muted error-details">
              <summary>Technical details</summary>
              {review.error}
            </details>
          )}
        </div>
        <ErrorNote error={error} />
      </div>
    );
  } else {
    const overall = report.adjusted?.overall ?? r.overall;
    const recommendation = report.adjusted?.recommendation ?? r.recommendation;
    body = (
      <div className="verdict-grid">
        <div className="verdict-score">
          <div className="tiny muted">Overall</div>
          <div className="verdict-number">
            <Score value={overall} />
          </div>
          <RecommendationBadge value={recommendation} />
          {report.adjusted && (
            <div className="tiny muted">
              AI scored <Score value={r.overall} />; {report.overrides.length} score
              {report.overrides.length === 1 ? '' : 's'} changed by your team
            </div>
          )}
        </div>
        <div className="verdict-body">
          <p className="verdict-summary">{r.summary}</p>
          <div className="verdict-lists">
            {r.strengths.length > 0 && (
              <div>
                <h4>Strengths</h4>
                <ul className="icon-list good">
                  {r.strengths.map((s, i) => (
                    <li key={i}>
                      <Icon name="check" size={14} />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {r.concerns.length > 0 && (
              <div>
                <h4>Concerns</h4>
                <ul className="icon-list warn">
                  {r.concerns.map((s, i) => (
                    <li key={i}>
                      <Icon name="x" size={14} />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          {r.withAndWithoutAi && (
            <div className="with-ai">
              <h4>
                <Icon name="sparkle" size={14} /> With and without AI
              </h4>
              <p>{r.withAndWithoutAi}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <section className="card verdict">
      <div className="verdict-top">
        <div className="verdict-content">{body}</div>
        <aside className="verdict-decide">
          <DecisionControl report={report} onReport={onReport} />
          {r && review?.status === 'done' && (
            <>
              <p className="tiny subtle">
                Reviewed {formatDate(review.updatedAt)} by {r.models.review}. The recommendation is the rubric average;
                the decision is yours.
              </p>
              <button className="btn btn-ghost btn-sm" onClick={rerun} disabled={busy}>
                Re-run AI review
              </button>
              <ErrorNote error={error} />
            </>
          )}
        </aside>
      </div>
      <Scorecard report={report} />
    </section>
  );
}

/** One chip per question: score and anything worth a closer look. Click to jump. */
function Scorecard({ report }: { report: CandidateReport }) {
  const result = report.aiReview?.result ?? null;
  return (
    <div className="scorecard" aria-label="Scores by question">
      {report.stages.map((stage) => {
        const ai = result?.stages.find((s) => s.stageId === stage.id) ?? null;
        const score = report.adjusted?.byStage[stage.id] ?? result?.byStage[stage.id] ?? null;
        const response = stage.response;
        const flags = [
          ai?.delivery?.label === 'read' && 'sounds read',
          response?.closedReason === 'timeout' && 'ran out of time',
          response?.signalNotes.some((n) => n.level === 'notable') && 'probe live',
        ].filter(Boolean) as string[];
        return (
          <a
            key={stage.id}
            href={`#stage-${stage.id}`}
            className={`score-chip ${response ? '' : 'is-empty'}`}
            onClick={(event) => {
              event.preventDefault();
              document.getElementById(`stage-${stage.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          >
            <span className="score-chip-q">Q{stage.index + 1}</span>
            <span className="score-chip-title">{stage.title}</span>
            <span className="score-chip-value">
              {!stage.scored ? <span className="subtle tiny">not scored</span> : <Score value={score} />}
            </span>
            {flags.length > 0 && <span className="score-chip-flag">{flags.join(' · ')}</span>}
          </a>
        );
      })}
    </div>
  );
}

function StageReview({
  stage,
  ai,
  stageScore,
  adjustedScore,
  overrides,
  candidateId,
  onReport,
}: {
  stage: ReportStage;
  ai: AiStageReview | null;
  stageScore: number | null;
  adjustedScore: number | null;
  overrides: ScoreOverride[];
  candidateId: string;
  onReport: (r: CandidateReport) => void;
}) {
  const r = stage.response;
  return (
    <section className="card stage-review" id={`stage-${stage.id}`}>
      <header className="stage-review-head">
        <div>
          <span className="muted small">Q{stage.index + 1}</span> <strong>{stage.title}</strong>{' '}
          <KindBadge kind={stage.kind} />
          {stage.thinkAloud && <span className="badge badge-think">Think aloud</span>}
        </div>
        {stage.scored ? (
          <span className="stage-scores">
            <Score value={stageScore} />
            {overrides.length > 0 && adjustedScore !== null && (
              <span className="small muted" title="After your team's changes">
                → <Score value={adjustedScore} />
              </span>
            )}
          </span>
        ) : (
          <span className="small muted">Not scored</span>
        )}
      </header>

      {!r ? (
        <p className="muted">Not reached yet.</p>
      ) : (
        <>
          <div className="meta-row small">
            <span>
              {r.timeUsedSec !== null
                ? `Took ${formatDuration(r.timeUsedSec)} of ${formatDuration(stage.timeLimitSec)}`
                : `Open now · ${formatDuration(stage.timeLimitSec)} limit`}
            </span>
            {r.closedReason === 'timeout' && <span className="badge badge-muted">Ran out of time</span>}
            {r.overtimeSec > 5 && <span className="badge badge-muted">Submitted {r.overtimeSec}s after the timer</span>}
            {r.signalNotes.map((note, i) => (
              <span
                key={i}
                className={`badge ${note.level === 'notable' ? 'badge-warn' : 'badge-muted'}`}
                title="A weak signal. Use it to decide what to probe on the call, never as proof."
              >
                {note.text}
              </span>
            ))}
          </div>

          {stage.shown && (
            <Collapsible title="What they saw" className="inset">
              <Blocks blocks={stage.shown.prompt} />
              {stage.shown.material.length > 0 && <Blocks blocks={stage.shown.material} />}
            </Collapsible>
          )}

          <div className="answer">
            {r.choiceLabel && (
              <p>
                <span className="small muted">Chose: </span>
                <strong>{r.choiceLabel}</strong>
              </p>
            )}
            {stage.thinkAloud ? (
              <ThinkAloudReview response={r} delivery={ai?.delivery ?? null} />
            ) : (
              r.audio.map((a) => (
                <div key={a.url} className="answer-audio">
                  <span className="small muted">
                    Voice note{a.sec ? ` (${formatDuration(a.sec)})` : ''}
                    {ai?.delivery && ` · AI: ${DELIVERY_LABEL[ai.delivery.label]}`}
                  </span>
                  <audio controls preload="none" src={a.url} className="audio" />
                </div>
              ))
            )}
            {ai?.transcript && (
              <Collapsible title="Transcript (AI)" className="inset" defaultOpen={stage.thinkAloud}>
                <div className="answer-text transcript">{ai.transcript}</div>
              </Collapsible>
            )}
            {stage.thinkAloud ? (
              r.text &&
              !r.scratch.length && (
                <div>
                  <div className="small muted">{r.audio.length ? 'Scratchpad' : 'Typed working'}</div>
                  <div className="answer-text">{r.text}</div>
                </div>
              )
            ) : r.text ? (
              <div className="answer-text">{r.text}</div>
            ) : (
              !r.audio.length && r.closedReason && <p className="muted">No answer.</p>
            )}
            {stage.kind === 'ai_allowed' && (
              <>
                <Collapsible
                  title={`Their AI conversation${r.aiTranscript ? ` (${r.aiTranscript.length.toLocaleString()} characters)` : ': none given'}`}
                  className="inset"
                >
                  <div className="answer-text transcript">{r.aiTranscript || 'None'}</div>
                </Collapsible>
                {r.reflection && (
                  <div>
                    <div className="small muted">What they kept, changed or rejected</div>
                    <div className="answer-text">{r.reflection}</div>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      {stage.scored && ai && (
        <div className="rubric">
          {ai.summary && <p className="ai-stage-summary">{ai.summary}</p>}
          {stage.rubric.map((criterion) => {
            const scored = ai.criteria[criterion.id];
            const override = overrides.find((o) => o.criterionId === criterion.id);
            return (
              <div key={criterion.id} className="criterion">
                <div className="criterion-label">
                  {criterion.label}
                  {criterion.weight > 1 && <span className="small muted"> · counts ×{criterion.weight}</span>}
                </div>
                <div className="anchors">
                  {criterion.anchors.map((anchor, i) => (
                    <div
                      key={i}
                      className={`anchor static ${scored?.score === i + 1 ? 'selected' : ''} ${override?.score === i + 1 ? 'overridden' : ''}`}
                    >
                      <span className="anchor-score">{i + 1}</span>
                      <span className="anchor-text">{anchor}</span>
                    </div>
                  ))}
                </div>
                {scored && (
                  <div className="ai-evidence small">
                    {scored.evidence && <q>{scored.evidence}</q>} {scored.rationale}
                  </div>
                )}
                {scored && (
                  <OverrideControl
                    candidateId={candidateId}
                    stageId={stage.id}
                    criterionId={criterion.id}
                    aiScore={scored.score}
                    override={override}
                    onReport={onReport}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      <Collapsible title="Answer key used by the AI" className="inset guide">
        <Blocks blocks={stage.reviewerGuide} />
      </Collapsible>
    </section>
  );
}

/** "I disagree": a recruiter's own score for one criterion, with a reason. */
function OverrideControl({
  candidateId,
  stageId,
  criterionId,
  aiScore,
  override,
  onReport,
}: {
  candidateId: string;
  stageId: string;
  criterionId: string;
  aiScore: number;
  override: ScoreOverride | undefined;
  onReport: (r: CandidateReport) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [score, setScore] = useState(override?.score ?? aiScore);
  const [note, setNote] = useState(override?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = `/api/candidates/${candidateId}/overrides`;

  async function act(fn: () => Promise<CandidateReport>) {
    setBusy(true);
    try {
      onReport(await fn());
      setEditing(false);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return override ? (
      <div className="override small">
        <strong>
          {override.userName} changed this from {override.aiScore} to {override.score}:
        </strong>{' '}
        {override.note}{' '}
        <button type="button" className="link-button" onClick={() => setEditing(true)}>
          Edit
        </button>{' '}
        <button
          type="button"
          className="link-button"
          disabled={busy}
          onClick={() => act(() => api.del(`${base}/${stageId}/${criterionId}`))}
        >
          Remove
        </button>
        <ErrorNote error={error} />
      </div>
    ) : (
      <button type="button" className="link-button small" onClick={() => setEditing(true)}>
        Disagree with this score?
      </button>
    );
  }

  return (
    <div className="override-form">
      <div className="row-gap small">
        <span>Your score:</span>
        {[1, 2, 3, 4].map((value) => (
          <button
            key={value}
            type="button"
            className={`btn btn-sm ${score === value ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setScore(value)}
          >
            {value}
          </button>
        ))}
        <span className="muted">AI gave {aiScore}</span>
      </div>
      <label className="field">
        <span className="small">Why? (helps calibrate the AI)</span>
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
      </label>
      <ErrorNote error={error} />
      <div className="row-gap">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy || note.trim().length < 3}
          onClick={() => act(() => api.put(base, { stageId, criterionId, score, note }))}
        >
          Save
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

const DELIVERY_LABEL = { natural: 'sounds like live reasoning', unsure: 'unclear delivery', read: 'sounds read' };

function DecisionControl({ report, onReport }: { report: CandidateReport; onReport: (r: CandidateReport) => void }) {
  const { user } = useAuth();
  const [error, setError] = useState<string | null>(null);
  if (user?.role !== 'manager') return null;
  const finished = ['submitted', 'reviewed', 'decided'].includes(report.candidate.status);
  if (!finished) return null;

  async function decide(decision: Decision | null) {
    try {
      onReport(await api.put<CandidateReport>(`/api/candidates/${report.candidate.id}/decision`, { decision }));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="decision">
      <h4>
        Your decision <DecisionBadge decision={report.candidate.decision} />
      </h4>
      <div className="decision-buttons">
        {(['advance', 'hold', 'reject'] as Decision[]).map((d) => (
          <button
            key={d}
            className={`btn decision-${d} ${report.candidate.decision === d ? 'is-chosen' : ''}`}
            aria-pressed={report.candidate.decision === d}
            onClick={() => decide(report.candidate.decision === d ? null : d)}
          >
            {d === 'advance' ? 'Advance' : d === 'hold' ? 'Hold' : 'Reject'}
          </button>
        ))}
      </div>
      <ErrorNote error={error} />
    </div>
  );
}

// Verification call -----------------------------------------------------------

function VerificationTab({
  report,
  finished,
  onReport,
}: {
  report: CandidateReport;
  finished: boolean;
  onReport: (r: CandidateReport) => void;
}) {
  const { script, record } = report.verification;
  const [identity, setIdentity] = useState<VerificationRecord['identity']>(record?.identity ?? null);
  const [consistency, setConsistency] = useState<VerificationRecord['consistency']>(record?.consistency ?? null);
  const [notes, setNotes] = useState(record?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    try {
      onReport(
        await api.put<CandidateReport>(`/api/candidates/${report.candidate.id}/verification`, {
          identity,
          consistency,
          notes,
        }),
      );
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (!finished) {
    return <div className="callout callout-info">The call script appears once the candidate has submitted.</div>;
  }

  return (
    <div className="verification">
      <div className="card script">
        <div className="row-between">
          <h2>Call script for {report.candidate.name}</h2>
          <button className="btn btn-secondary btn-sm no-print" onClick={() => window.print()}>
            Print
          </button>
        </div>
        <p className="muted">
          Real-time prompters and stand-in candidates struggle with quick follow-ups on their own specifics. This call,
          not detection software, is your security layer.
        </p>
        <ul>
          {script.opening.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>

        <h3>1. Identity (2 minutes)</h3>
        <ul className="check-list">
          {script.identity.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>

        <h3>2. Follow-ups on their answers (10 minutes)</h3>
        {script.probes.map((probe) => (
          <div key={probe.stageId} className={`probe ${probe.priority ? 'probe-priority' : ''}`}>
            <div className="row-between">
              <strong>{probe.stageTitle}</strong>
              {probe.priority && <span className="badge badge-warn">Probe first</span>}
            </div>
            {probe.reasons.map((reason, i) => (
              <p key={i} className="small probe-reason">
                {reason}
              </p>
            ))}
            <div className="probe-answer small">
              {probe.answer.choiceLabel && (
                <div>
                  Chose: <strong>{probe.answer.choiceLabel}</strong>
                </div>
              )}
              {probe.answer.hasText && <div>They wrote: “{probe.answer.excerpt}”</div>}
              {probe.answer.hasVoice && (
                <div>
                  Voice note{probe.answer.voiceSec ? ` (${formatDuration(probe.answer.voiceSec)})` : ''}: listen before
                  the call.
                </div>
              )}
              {!probe.answer.hasText && !probe.answer.hasVoice && <div className="muted">No answer given.</div>}
            </div>
            <ol className="probe-questions">
              {probe.questions.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ol>
          </div>
        ))}

        {report.aiReview?.result?.probes.length ? (
          <>
            <h4>Suggested by the AI review</h4>
            <ol className="probe-questions">
              {report.aiReview.result.probes.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ol>
          </>
        ) : null}

        <h3>3. Close (2 minutes)</h3>
        <ul>
          {script.closing.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </div>

      <div className="card outcome no-print">
        <h2>Call outcome</h2>
        <fieldset>
          <legend className="small">Identity</legend>
          <div className="row-gap">
            {(
              [
                ['verified', 'ID matches'],
                ['not_verified', "ID doesn't match"],
                ['not_checked', 'Not checked'],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className={`choice compact ${identity === value ? 'selected' : ''}`}>
                <input type="radio" name="identity" checked={identity === value} onChange={() => setIdentity(value)} />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="small">Were their live answers consistent with the written ones?</legend>
          <div className="row-gap">
            {(
              [
                ['consistent', 'Consistent'],
                ['partly', 'Partly'],
                ['inconsistent', 'Inconsistent'],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className={`choice compact ${consistency === value ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="consistency"
                  checked={consistency === value}
                  onChange={() => setConsistency(value)}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="field">
          <span className="small">Notes</span>
          <textarea rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <ErrorNote error={error} />
        <button className="btn btn-primary" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save outcome'}
        </button>
        {record && (
          <p className="small muted">
            Last saved by {record.interviewerName}, {formatDate(record.updatedAt)}
          </p>
        )}
      </div>
    </div>
  );
}
