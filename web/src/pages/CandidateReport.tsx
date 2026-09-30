import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { CandidateReport, ReportStage, VerificationRecord } from '../../../shared/api';
import { formatDuration } from '../../../shared/signals';
import type { Decision, Delivery, Recommendation, ReviewScores } from '../../../shared/types';
import { api, errorMessage } from '../api';
import { useAuth } from '../auth';
import { Blocks } from '../components/Blocks';
import { ThinkAloudReview } from '../components/ThinkAloudReview';
import {
  Collapsible,
  CopyButton,
  DecisionBadge,
  ErrorNote,
  KindBadge,
  Score,
  StatusBadge,
  candidateLink,
} from '../components/ui';
import { formatDate, useApi } from '../hooks';

type Tab = 'answers' | 'verification' | 'scenario';

const RECOMMENDATION_LABEL: Record<Recommendation, string> = {
  advance: 'Advance to verification call',
  hold: 'Hold',
  reject: 'Do not advance',
};

/** Weighted mean over the rubric, mirroring the server's scoring. */
function localScore(stages: ReportStage[], scores: ReviewScores) {
  let weighted = 0;
  let weights = 0;
  let scored = 0;
  let total = 0;
  const byStage: Record<string, number | null> = {};
  for (const stage of stages) {
    if (!stage.scored) continue;
    let sw = 0;
    let sWeights = 0;
    for (const criterion of stage.rubric) {
      total += 1;
      const value = scores[stage.id]?.[criterion.id];
      if (!value) continue;
      scored += 1;
      sw += value * criterion.weight;
      sWeights += criterion.weight;
    }
    byStage[stage.id] = sWeights ? Math.round((sw / sWeights) * 10) / 10 : null;
    weighted += sw;
    weights += sWeights;
  }
  return { overall: weights ? Math.round((weighted / weights) * 10) / 10 : null, byStage, scored, total };
}

function suggestion(overall: number | null): Recommendation | null {
  if (overall === null) return null;
  return overall >= 3 ? 'advance' : overall >= 2.3 ? 'hold' : 'reject';
}

export function CandidateReportPage() {
  const { id } = useParams();
  const { data: report, setData: setReport, error } = useApi<CandidateReport>(`/api/candidates/${id}`);
  const [tab, setTab] = useState<Tab>('answers');

  if (error) return <ErrorNote error={error} />;
  if (!report) return <p className="muted">Loading…</p>;

  const { candidate } = report;
  const finished = ['submitted', 'reviewed', 'decided'].includes(candidate.status);

  return (
    <>
      <div className="page-head">
        <div>
          <Link to={`/app/assessments/${report.assessment.id}`} className="small muted">
            ← {report.assessment.title}
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
            ['answers', 'Answers and scoring'],
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

      {tab === 'answers' && <AnswersTab report={report} finished={finished} onReport={setReport} />}
      {tab === 'verification' && <VerificationTab report={report} finished={finished} onReport={setReport} />}
      {tab === 'scenario' && (
        <div className="card">
          <p className="callout callout-info">
            Numbers and names are generated for this candidate. Other candidates saw a different version.
          </p>
          <Blocks blocks={report.brief} />
        </div>
      )}
    </>
  );
}

// Answers and scoring -------------------------------------------------------

function AnswersTab({
  report,
  finished,
  onReport,
}: {
  report: CandidateReport;
  finished: boolean;
  onReport: (r: CandidateReport) => void;
}) {
  const [scores, setScores] = useState<ReviewScores>(report.myReview?.scores ?? {});
  const [notes, setNotes] = useState(report.myReview?.notes ?? '');
  const [observations, setObservations] = useState<Record<string, Delivery>>(report.myReview?.observations ?? {});
  const [recommendation, setRecommendation] = useState<Recommendation | null>(report.myReview?.recommendation ?? null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const summary = useMemo(() => localScore(report.stages, scores), [report.stages, scores]);
  const submitted = report.myReview?.submittedAt != null;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function setScore(stageId: string, criterionId: string, value: number) {
    setScores((prev) => ({ ...prev, [stageId]: { ...prev[stageId], [criterionId]: value } }));
    setDirty(true);
  }

  async function save(submit: boolean) {
    setBusy(true);
    setError(null);
    try {
      const next = await api.put<CandidateReport>(`/api/candidates/${report.candidate.id}/review`, {
        scores,
        observations,
        notes,
        recommendation,
        submit,
      });
      onReport(next);
      setDirty(false);
      setSavedAt(Date.now());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="review-layout">
      <div className="review-main">
        {!finished && (
          <div className="callout callout-info">
            {report.candidate.status === 'invited'
              ? "This candidate hasn't started yet."
              : "This candidate is still working. You can review once they've submitted."}
          </div>
        )}
        {report.stages.map((stage) => (
          <StageReview
            key={stage.id}
            stage={stage}
            scores={scores[stage.id] ?? {}}
            stageScore={summary.byStage[stage.id] ?? null}
            canScore={finished}
            onScore={(criterionId, value) => setScore(stage.id, criterionId, value)}
            delivery={observations[stage.id]}
            onDelivery={(value) => {
              setObservations((prev) => ({ ...prev, [stage.id]: value }));
              setDirty(true);
            }}
          />
        ))}
      </div>

      <aside className="review-side">
        <div className="card sticky">
          <h3>Your review</h3>
          <div className="overall">
            <Score value={summary.overall} />
            <span className="small muted">
              {summary.scored} of {summary.total} criteria scored
            </span>
          </div>
          <fieldset className="recommendation" disabled={!finished}>
            <legend className="small">Recommendation</legend>
            {(Object.keys(RECOMMENDATION_LABEL) as Recommendation[]).map((key) => (
              <label key={key} className={`choice compact ${recommendation === key ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="recommendation"
                  checked={recommendation === key}
                  onChange={() => {
                    setRecommendation(key);
                    setDirty(true);
                  }}
                />
                {RECOMMENDATION_LABEL[key]}
                {suggestion(summary.overall) === key && <span className="small muted"> (suggested)</span>}
              </label>
            ))}
          </fieldset>
          <label className="field">
            <span className="small">Notes for the team</span>
            <textarea
              rows={4}
              value={notes}
              disabled={!finished}
              onChange={(e) => {
                setNotes(e.target.value);
                setDirty(true);
              }}
              placeholder="What stood out? What should the verification call probe?"
            />
          </label>
          <ErrorNote error={error} />
          <div className="row-gap">
            {submitted ? (
              <button className="btn btn-primary" onClick={() => save(false)} disabled={busy || !dirty || !finished}>
                Save changes
              </button>
            ) : (
              <>
                <button className="btn btn-secondary" onClick={() => save(false)} disabled={busy || !finished}>
                  Save draft
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => save(true)}
                  disabled={busy || !finished || summary.scored < summary.total || !recommendation}
                  title={summary.scored < summary.total ? 'Score every criterion first' : undefined}
                >
                  Submit review
                </button>
              </>
            )}
          </div>
          <p className="small muted">
            {submitted
              ? `Submitted ${formatDate(report.myReview!.submittedAt)}`
              : savedAt
                ? 'Draft saved'
                : 'Scores are your judgment. The suggestion only reflects the rubric average.'}
            {dirty && ' · Unsaved changes'}
          </p>

          <TeamReviews report={report} />
          <DecisionControl report={report} onReport={onReport} />
        </div>
      </aside>
    </div>
  );
}

function StageReview({
  stage,
  scores,
  stageScore,
  canScore,
  onScore,
  delivery,
  onDelivery,
}: {
  stage: ReportStage;
  scores: Record<string, number>;
  stageScore: number | null;
  canScore: boolean;
  onScore: (criterionId: string, value: number) => void;
  delivery: Delivery | undefined;
  onDelivery: (value: Delivery) => void;
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
        {stage.scored ? <Score value={stageScore} /> : <span className="small muted">Not scored</span>}
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
              <ThinkAloudReview response={r} delivery={delivery} canObserve={canScore} onDelivery={onDelivery} />
            ) : (
              r.audio.map((a) => (
                <div key={a.url} className="answer-audio">
                  <span className="small muted">Voice note{a.sec ? ` (${formatDuration(a.sec)})` : ''}</span>
                  <audio controls preload="none" src={a.url} className="audio" />
                </div>
              ))
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
                  title={`AI conversation${r.aiTranscript ? ` (${r.aiTranscript.length.toLocaleString()} characters)` : ': none given'}`}
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

      <Collapsible title="Reviewer guide" defaultOpen={stage.scored} className="inset guide">
        <Blocks blocks={stage.reviewerGuide} />
      </Collapsible>

      {stage.scored && (
        <div className="rubric">
          {stage.rubric.map((criterion) => (
            <div key={criterion.id} className="criterion">
              <div className="criterion-label">
                {criterion.label}
                {criterion.weight > 1 && <span className="small muted"> · counts ×{criterion.weight}</span>}
              </div>
              <div className="anchors" role="radiogroup" aria-label={criterion.label}>
                {criterion.anchors.map((anchor, i) => {
                  const value = i + 1;
                  const selected = scores[criterion.id] === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      disabled={!canScore}
                      className={`anchor ${selected ? 'selected' : ''}`}
                      onClick={() => onScore(criterion.id, value)}
                    >
                      <span className="anchor-score">{value}</span>
                      <span className="anchor-text">{anchor}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function TeamReviews({ report }: { report: CandidateReport }) {
  if (report.hiddenReviews > 0) {
    return (
      <div className="team-reviews">
        <h4>Team</h4>
        <p className="small muted">
          {report.hiddenReviews} review{report.hiddenReviews === 1 ? ' is' : 's are'} hidden until you submit yours, so
          nobody anchors on the first score.
        </p>
      </div>
    );
  }
  if (!report.otherReviews.length) return null;
  return (
    <div className="team-reviews">
      <h4>
        Team <Score value={report.teamScore} />
      </h4>
      {report.otherReviews.map((review) => (
        <div key={review.reviewerId} className="team-review">
          <div className="row-between">
            <strong>{review.reviewerName}</strong>
            <Score value={review.overall} />
          </div>
          {review.recommendation && <div className="small">{RECOMMENDATION_LABEL[review.recommendation]}</div>}
          {review.notes && <p className="small muted">{review.notes}</p>}
        </div>
      ))}
    </div>
  );
}

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
        Decision <DecisionBadge decision={report.candidate.decision} />
      </h4>
      <div className="row-gap">
        {(['advance', 'hold', 'reject'] as Decision[]).map((d) => (
          <button
            key={d}
            className={`btn btn-sm ${report.candidate.decision === d ? 'btn-primary' : 'btn-secondary'}`}
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
