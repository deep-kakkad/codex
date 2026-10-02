import { useCallback, useEffect, useState } from 'react';
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
          <div className="meta-dots">
            <span>{candidate.email}</span>
            {candidate.submittedAt ? (
              <span title={`Invited ${formatDate(candidate.createdAt)} · started ${formatDate(candidate.startedAt)}`}>
                Submitted {formatDate(candidate.submittedAt)}
              </span>
            ) : (
              <span>Invited {formatDate(candidate.createdAt)}</span>
            )}
            {candidate.timeMultiplier > 1 && <span>{candidate.timeMultiplier}× time</span>}
          </div>
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

/** What a recruiter needs to know about one question before opening it. */
function stageFacts(report: CandidateReport, stage: ReportStage) {
  const result = report.aiReview?.result ?? null;
  const ai = result?.stages.find((s) => s.stageId === stage.id) ?? null;
  const aiScore = result?.byStage[stage.id] ?? null;
  const overrides = report.overrides.filter((o) => o.stageId === stage.id);
  const score = overrides.length ? (report.adjusted?.byStage[stage.id] ?? aiScore) : aiScore;
  const response = stage.response;
  const flags: { text: string; tone: 'warn' | 'muted' }[] = [];
  if (ai?.delivery?.label === 'read') flags.push({ text: 'Sounds read', tone: 'warn' });
  if (response?.signalNotes.some((n) => n.level === 'notable')) flags.push({ text: 'Probe live', tone: 'warn' });
  if (response?.closedReason === 'timeout') flags.push({ text: 'Ran out of time', tone: 'muted' });
  if (overrides.length) flags.push({ text: 'Score changed by your team', tone: 'muted' });
  return { ai, aiScore, score, overrides, response, flags };
}

function scoreTone(value: number | null) {
  if (value === null) return 'none';
  return value >= 3 ? 'good' : value >= 2.3 ? 'mid' : 'low';
}

function ReviewTab({
  report,
  finished,
  onReport,
}: {
  report: CandidateReport;
  finished: boolean;
  onReport: (r: CandidateReport) => void;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState<string | null>(null);
  const stages = report.stages;

  const show = useCallback((stageId: string) => {
    setOpen((current) => new Set(current).add(stageId));
    setFocus(stageId);
    requestAnimationFrame(() =>
      document.getElementById(`stage-${stageId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  }, []);
  const toggle = (stageId: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(stageId)) next.delete(stageId);
      else next.add(stageId);
      return next;
    });

  // J / K move between questions, like most review tools.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (event.metaKey || event.ctrlKey || event.altKey || /INPUT|TEXTAREA|SELECT/.test(target.tagName)) return;
      if (event.key !== 'j' && event.key !== 'k') return;
      const index = focus ? stages.findIndex((s) => s.id === focus) : -1;
      const next = stages[Math.min(stages.length - 1, Math.max(0, index + (event.key === 'j' ? 1 : -1)))];
      if (next) show(next.id);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focus, stages, show]);

  const allOpen = open.size === stages.length;
  return (
    <>
      <DecisionBar report={report} onReport={onReport} />
      <div className="review-grid">
        <nav className="q-nav" aria-label="Questions">
          <div className="q-nav-title">Questions</div>
          {stages.map((stage) => {
            const { score, flags, response } = stageFacts(report, stage);
            return (
              <button
                key={stage.id}
                className={`q-nav-item ${focus === stage.id ? 'is-active' : ''} ${response ? '' : 'is-empty'}`}
                onClick={() => show(stage.id)}
              >
                <span className="q-nav-num">{stage.index + 1}</span>
                <span className="q-nav-label">{stage.title}</span>
                {stage.scored ? (
                  <span className={`q-nav-score tone-${scoreTone(score)}`}>{score?.toFixed(1) ?? '—'}</span>
                ) : (
                  <span className="q-nav-score tone-none">–</span>
                )}
                {flags.some((f) => f.tone === 'warn') && <span className="q-nav-flag" title="Worth a closer look" />}
              </button>
            );
          })}
          <p className="q-nav-hint tiny subtle">
            Press <kbd>J</kbd> / <kbd>K</kbd> to move between questions.
          </p>
        </nav>

        <div className="review-main">
          <Verdict report={report} finished={finished} onReport={onReport} onJump={show} />
          <div className="row-between answers-head">
            <h2 className="section-title">Answers</h2>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setOpen(allOpen ? new Set() : new Set(stages.map((s) => s.id)))}
            >
              {allOpen ? 'Collapse all' : 'Expand all'}
            </button>
          </div>
          <div className="q-list">
            {stages.map((stage) => (
              <StageReview
                key={stage.id}
                report={report}
                stage={stage}
                open={open.has(stage.id)}
                focused={focus === stage.id}
                onToggle={() => {
                  toggle(stage.id);
                  setFocus(stage.id);
                }}
                onReport={onReport}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

/** Stays at the top while scrolling: who, how they did, and the decision. */
function DecisionBar({ report, onReport }: { report: CandidateReport; onReport: (r: CandidateReport) => void }) {
  const r = report.aiReview?.result ?? null;
  const overall = report.adjusted?.overall ?? r?.overall ?? null;
  const recommendation = report.adjusted?.recommendation ?? r?.recommendation ?? null;
  return (
    <div className="decision-bar">
      <div className="decision-bar-who">
        <strong>{report.candidate.name}</strong>
        {r && (
          <span className="decision-bar-score">
            <Score value={overall} />
            <RecommendationBadge value={recommendation} />
          </span>
        )}
      </div>
      <DecisionControl report={report} onReport={onReport} compact />
    </div>
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

/** The answer to "should we move forward?", then the evidence at a glance. */
function Verdict({
  report,
  finished,
  onReport,
  onJump,
}: {
  report: CandidateReport;
  finished: boolean;
  onReport: (r: CandidateReport) => void;
  onJump: (stageId: string) => void;
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

  if (!finished) {
    const reached = report.stages.filter((s) => s.response).length;
    return (
      <section className="card verdict-state">
        <h2>{report.candidate.status === 'invited' ? "Hasn't started yet" : 'Still working'}</h2>
        <p className="muted">
          {report.candidate.status === 'invited'
            ? 'Send them their link. The AI review starts as soon as they submit.'
            : `On question ${reached} of ${report.stages.length}. The AI review starts as soon as they submit.`}
        </p>
      </section>
    );
  }
  if (!review || review.status === 'pending' || review.status === 'running') {
    return (
      <section className="card verdict-state">
        <h2 className="reviewing">
          <span className="spinner" aria-hidden="true" />
          {review?.status === 'running' ? 'Transcribing audio and scoring answers…' : 'AI review queued…'}
        </h2>
        <p className="muted">This usually takes a minute or two. The page updates by itself.</p>
      </section>
    );
  }
  if (review.status === 'failed' || !r) {
    return (
      <section className="card verdict-state">
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
      </section>
    );
  }

  const overall = report.adjusted?.overall ?? r.overall;
  const recommendation = report.adjusted?.recommendation ?? r.recommendation;
  const headline = r.headline?.trim();
  return (
    <section className="card verdict2">
      <div className="verdict2-head">
        <div className="verdict2-score">
          <span className={`verdict2-number tone-${scoreTone(overall)}`}>{overall?.toFixed(1) ?? '—'}</span>
          <span className="verdict2-max">/4</span>
        </div>
        <div className="verdict2-title">
          <div className="row-gap">
            <RecommendationBadge value={recommendation} />
            <span className="tiny muted">
              {report.adjusted
                ? `AI scored ${r.overall?.toFixed(1)}; ${report.overrides.length} score${report.overrides.length === 1 ? '' : 's'} changed by your team`
                : 'AI recommendation from the rubric average. You decide.'}
            </span>
          </div>
          <h2 className="verdict2-headline">{headline || r.summary}</h2>
        </div>
      </div>
      {headline && <p className="verdict2-summary">{r.summary}</p>}

      <div className="verdict2-cols">
        <div className="vcol vcol-good">
          <h3>
            <Icon name="check" size={14} /> Strengths <span className="vcount">{r.strengths.length}</span>
          </h3>
          <ul>
            {r.strengths.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
        <div className="vcol vcol-warn">
          <h3>
            <Icon name="x" size={14} /> Concerns <span className="vcount">{r.concerns.length}</span>
          </h3>
          <ul>
            {r.concerns.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
        <div className="vcol vcol-info">
          <h3>
            <Icon name="sparkle" size={14} /> With and without AI
          </h3>
          <p>{r.withAndWithoutAi || 'No AI-allowed question in this assessment.'}</p>
        </div>
      </div>

      <div className="score-bars" aria-label="Scores by question">
        {report.stages
          .filter((s) => s.scored)
          .map((stage) => {
            const { score, flags } = stageFacts(report, stage);
            return (
              <button key={stage.id} className="score-bar-row" onClick={() => onJump(stage.id)}>
                <span className="score-bar-label">
                  <span className="subtle">Q{stage.index + 1}</span> {stage.title}
                </span>
                <span className="score-bar-track">
                  <span
                    className={`score-bar-fill tone-${scoreTone(score)}`}
                    style={{ width: `${((score ?? 0) / 4) * 100}%` }}
                  />
                </span>
                <span className={`score-bar-value tone-${scoreTone(score)}`}>{score?.toFixed(1) ?? '—'}</span>
                <span className="score-bar-flags">
                  {flags
                    .filter((f) => f.tone === 'warn')
                    .map((f) => (
                      <span key={f.text} className="badge badge-warn">
                        {f.text}
                      </span>
                    ))}
                </span>
              </button>
            );
          })}
      </div>

      <div className="verdict2-foot tiny subtle">
        <span>
          Reviewed {formatDate(review.updatedAt)} by {r.models.review}
        </span>
        <button className="link-button" onClick={rerun} disabled={busy}>
          {busy ? 'Starting…' : 'Re-run AI review'}
        </button>
        <ErrorNote error={error} />
      </div>
    </section>
  );
}

type StagePanel = 'saw' | 'key' | null;

function StageReview({
  report,
  stage,
  open,
  focused,
  onToggle,
  onReport,
}: {
  report: CandidateReport;
  stage: ReportStage;
  open: boolean;
  focused: boolean;
  onToggle: () => void;
  onReport: (r: CandidateReport) => void;
}) {
  const { ai, aiScore, score, overrides, response: r, flags } = stageFacts(report, stage);
  const [panel, setPanel] = useState<StagePanel>(null);
  return (
    <section className={`q-card ${open ? 'is-open' : ''} ${focused ? 'is-focused' : ''}`} id={`stage-${stage.id}`}>
      <button className="q-row" onClick={onToggle} aria-expanded={open}>
        <span className="q-num">Q{stage.index + 1}</span>
        <span className="q-main">
          <span className="q-title">
            {stage.title}
            <KindBadge kind={stage.kind} />
            {stage.thinkAloud && <span className="badge badge-think">Think aloud</span>}
          </span>
          <span className="q-take">
            {!r ? 'Not reached.' : ai?.summary || (stage.scored ? 'No AI review yet.' : 'Not scored. A voice sample.')}
          </span>
          {flags.length > 0 && (
            <span className="q-flags">
              {flags.map((f) => (
                <span key={f.text} className={`badge ${f.tone === 'warn' ? 'badge-warn' : 'badge-muted'}`}>
                  {f.text}
                </span>
              ))}
            </span>
          )}
        </span>
        <span className="q-side">
          {stage.scored ? (
            <span className={`q-score tone-${scoreTone(score)}`}>
              {score?.toFixed(1) ?? '—'}
              <span className="score-max">/4</span>
            </span>
          ) : (
            <span className="tiny subtle">Not scored</span>
          )}
          {r?.timeUsedSec != null && (
            <span className="tiny subtle">
              {formatDuration(r.timeUsedSec)} of {formatDuration(stage.timeLimitSec)}
            </span>
          )}
        </span>
        <span className="q-chevron" aria-hidden="true">
          ›
        </span>
      </button>

      {open && (
        <div className="q-body">
          <div className="q-panels">
            <div className="q-answer">
              <h4 className="q-section-label">Their answer</h4>
              {!r ? (
                <p className="muted">Not reached yet.</p>
              ) : (
                <>
                  {r.choiceLabel && (
                    <p className="q-choice">
                      <span className="tiny muted">Chose</span>
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
                  {r.signalNotes.length > 0 && (
                    <div className="q-signals tiny muted">
                      {r.signalNotes.map((note, i) => (
                        <span
                          key={i}
                          title="A weak signal. Use it to decide what to probe on the call, never as proof."
                        >
                          {note.text}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="q-scoring">
              <h4 className="q-section-label">How the AI scored it</h4>
              {!stage.scored ? (
                <p className="muted small">Not scored. Use it as a voice sample for the call.</p>
              ) : !ai ? (
                <p className="muted small">No AI review yet.</p>
              ) : (
                <>
                  {stage.rubric.map((criterion) => (
                    <CriterionRow
                      key={criterion.id}
                      criterion={criterion}
                      scored={ai.criteria[criterion.id] ?? null}
                      override={overrides.find((o) => o.criterionId === criterion.id)}
                      candidateId={report.candidate.id}
                      stageId={stage.id}
                      onReport={onReport}
                    />
                  ))}
                  {overrides.length > 0 && aiScore !== null && (
                    <p className="tiny muted">
                      AI scored this question {aiScore.toFixed(1)}; with your team's changes it is{' '}
                      {score?.toFixed(1) ?? '—'}.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="q-extra">
            {stage.shown && (
              <button
                className={`q-extra-tab ${panel === 'saw' ? 'is-active' : ''}`}
                onClick={() => setPanel(panel === 'saw' ? null : 'saw')}
              >
                What they saw
              </button>
            )}
            <button
              className={`q-extra-tab ${panel === 'key' ? 'is-active' : ''}`}
              onClick={() => setPanel(panel === 'key' ? null : 'key')}
            >
              Answer key used by the AI
            </button>
          </div>
          {panel === 'saw' && stage.shown && (
            <div className="q-extra-panel">
              <Blocks blocks={stage.shown.prompt} />
              {stage.shown.material.length > 0 && <Blocks blocks={stage.shown.material} />}
            </div>
          )}
          {panel === 'key' && (
            <div className="q-extra-panel guide-panel">
              <Blocks blocks={stage.reviewerGuide} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** One rubric line: a 4-step meter, the quote, the reason. The full anchors only when asked. */
function CriterionRow({
  criterion,
  scored,
  override,
  candidateId,
  stageId,
  onReport,
}: {
  criterion: ReportStage['rubric'][number];
  scored: AiStageReview['criteria'][string] | null;
  override: ScoreOverride | undefined;
  candidateId: string;
  stageId: string;
  onReport: (r: CandidateReport) => void;
}) {
  const [showRubric, setShowRubric] = useState(false);
  const value = override?.score ?? scored?.score ?? null;
  return (
    <div className="crit">
      <div className="crit-head">
        <span className="crit-label">
          {criterion.label}
          {criterion.weight > 1 && <span className="tiny subtle"> ×{criterion.weight}</span>}
        </span>
        <span className={`meter tone-${scoreTone(value)}`} aria-label={`${value ?? 'no'} out of 4`}>
          {[1, 2, 3, 4].map((step) => (
            <i key={step} className={value !== null && step <= value ? 'on' : ''} />
          ))}
          <b>{value ?? '—'}</b>
        </span>
      </div>
      {scored?.evidence && <q className="crit-quote">{scored.evidence}</q>}
      {scored?.rationale && <p className="crit-why">{scored.rationale}</p>}
      <div className="crit-actions">
        <button type="button" className="link-button tiny" onClick={() => setShowRubric(!showRubric)}>
          {showRubric ? 'Hide rubric' : 'See rubric'}
        </button>
        {scored && (
          <OverrideControl
            candidateId={candidateId}
            stageId={stageId}
            criterionId={criterion.id}
            aiScore={scored.score}
            override={override}
            onReport={onReport}
          />
        )}
      </div>
      {showRubric && (
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
      )}
    </div>
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

function DecisionControl({
  report,
  onReport,
  compact = false,
}: {
  report: CandidateReport;
  onReport: (r: CandidateReport) => void;
  compact?: boolean;
}) {
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
    <div className={compact ? 'decision decision-compact' : 'decision'}>
      {!compact && (
        <h4>
          Your decision <DecisionBadge decision={report.candidate.decision} />
        </h4>
      )}
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
