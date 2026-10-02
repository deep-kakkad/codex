import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type {
  AiStageReview,
  CandidateReport,
  ReportStage,
  ReviewNote,
  ScoreOverride,
  VerificationRecord,
} from '../../../shared/api';
import { formatDuration } from '../../../shared/signals';
import type { Decision, Delivery } from '../../../shared/types';
import { api, errorMessage } from '../api';
import { useAuth } from '../auth';
import { AudioPlayer, SpeedPicker } from '../components/AudioPlayer';
import { Blocks } from '../components/Blocks';
import { Icon } from '../components/Icon';
import { Avatar, type Evidence, Highlighted, ScoreRing, findEvidence } from '../components/ReviewBits';
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
const FLASH_MS = 1400;

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
  if (!report || report.candidate.id !== id) return <p className="muted">Loading…</p>;

  const { candidate } = report;
  const finished = ['submitted', 'reviewed', 'decided'].includes(candidate.status);

  return (
    <>
      <div className="page-head">
        <div className="person-head">
          <Link to={`/app/assessments/${report.assessment.id}`} className="back-link">
            <Icon name="back" size={14} />
            {report.assessment.title}
          </Link>
          <div className="person-title">
            <Avatar name={candidate.name} size="lg" />
            <div>
              <h1>
                {candidate.name} <StatusBadge status={candidate.status} />
              </h1>
              <div className="meta-dots">
                <span>{candidate.email}</span>
                {candidate.submittedAt ? (
                  <span
                    title={`Invited ${formatDate(candidate.createdAt)} · started ${formatDate(candidate.startedAt)}`}
                  >
                    Submitted {formatDate(candidate.submittedAt)}
                  </span>
                ) : (
                  <span>Invited {formatDate(candidate.createdAt)}</span>
                )}
                {candidate.timeMultiplier > 1 && <span>{candidate.timeMultiplier}× time</span>}
              </div>
            </div>
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

      {tab === 'review' && <ReviewTab key={candidate.id} report={report} finished={finished} onReport={setReport} />}
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

// Review ----------------------------------------------------------------------

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
  return { ai, aiScore, score, overrides, response, flags, delivery: ai?.delivery?.label ?? null };
}

function scoreTone(value: number | null) {
  if (value === null) return 'none';
  return value >= 3 ? 'good' : value >= 2.3 ? 'mid' : 'low';
}

const DELIVERY_TEXT: Record<Delivery, string> = {
  natural: 'Recording sounds like live reasoning',
  unsure: 'Recording: delivery unclear',
  read: 'Recording sounds read or rehearsed',
};

function DeliveryIcon({ delivery }: { delivery: Delivery | null }) {
  if (!delivery) return null;
  return (
    <span
      className={`delivery-icon delivery-${delivery}`}
      title={DELIVERY_TEXT[delivery]}
      aria-label={DELIVERY_TEXT[delivery]}
    >
      <Icon name="mic" size={13} />
    </span>
  );
}

function ordinal(n: number) {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${suffix}`;
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
  const navigate = useNavigate();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const stages = report.stages;
  const { prev, next } = report.siblings;

  const show = useCallback((stageId: string) => {
    setOpen((current) => new Set(current).add(stageId));
    setFocus(stageId);
    setFlash(stageId);
    window.setTimeout(() => setFlash((current) => (current === stageId ? null : current)), FLASH_MS);
    requestAnimationFrame(() =>
      document.getElementById(`stage-${stageId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  }, []);
  const toggle = (stageId: string) =>
    setOpen((current) => {
      const nextOpen = new Set(current);
      if (nextOpen.has(stageId)) nextOpen.delete(stageId);
      else nextOpen.add(stageId);
      return nextOpen;
    });

  // J / K move between questions; [ and ] move between candidates.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (event.metaKey || event.ctrlKey || event.altKey || /INPUT|TEXTAREA|SELECT/.test(target.tagName)) return;
      if (event.key === '[' && prev) navigate(`/app/candidates/${prev.id}`);
      if (event.key === ']' && next) navigate(`/app/candidates/${next.id}`);
      if (event.key !== 'j' && event.key !== 'k') return;
      const index = focus ? stages.findIndex((s) => s.id === focus) : -1;
      const target2 = stages[Math.min(stages.length - 1, Math.max(0, index + (event.key === 'j' ? 1 : -1)))];
      if (target2) show(target2.id);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focus, stages, show, prev, next, navigate]);

  const allOpen = open.size === stages.length;
  return (
    <>
      <DecisionBar report={report} onReport={onReport} />
      <div className="review-grid">
        <nav className="q-nav" aria-label="Questions">
          <div className="q-nav-title">Questions</div>
          {stages.map((stage) => {
            const { score, flags, response, delivery } = stageFacts(report, stage);
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
                {flags.some((f) => f.tone === 'warn') || delivery === 'read' ? (
                  <span className="q-nav-flag" title="Worth a closer look" />
                ) : (
                  <span />
                )}
              </button>
            );
          })}
          <p className="q-nav-hint tiny subtle">
            <kbd>J</kbd> <kbd>K</kbd> questions · <kbd>[</kbd> <kbd>]</kbd> candidates
          </p>
        </nav>

        <div className="review-main">
          <Verdict report={report} finished={finished} onReport={onReport} onJump={show} />
          <TeamNotes report={report} onReport={onReport} />
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
                flashing={flash === stage.id}
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

/** True while the page header (with the candidate's name) is on screen. */
function useHeaderVisible() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const header = document.querySelector('.person-head');
    if (!header || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  return visible;
}

/** Stays at the top while scrolling: who, how they did, the team's lean, and the decision. */
function DecisionBar({ report, onReport }: { report: CandidateReport; onReport: (r: CandidateReport) => void }) {
  const r = report.aiReview?.result ?? null;
  const overall = report.adjusted?.overall ?? r?.overall ?? null;
  const recommendation = report.adjusted?.recommendation ?? r?.recommendation ?? null;
  const { prev, next, index, total } = report.siblings;
  const leans = report.notes.reduce<Record<string, number>>((acc, n) => {
    if (n.lean) acc[n.lean] = (acc[n.lean] ?? 0) + 1;
    return acc;
  }, {});
  const headerVisible = useHeaderVisible();
  const leanText = (['advance', 'hold', 'reject'] as Decision[])
    .filter((d) => leans[d])
    .map((d) => `${leans[d]} ${d}`)
    .join(' · ');
  return (
    <div className={`decision-bar ${headerVisible ? 'header-visible' : ''}`}>
      <div className="decision-bar-who">
        <span className="decision-bar-name">
          <Avatar name={report.candidate.name} size="sm" />
          <strong>{report.candidate.name}</strong>
        </span>
        <StarToggle report={report} onReport={onReport} />
        {r && (
          <span className="decision-bar-score">
            <Score value={overall} />
            <RecommendationBadge value={recommendation} />
          </span>
        )}
        {leanText && <span className="tiny muted">Team: {leanText}</span>}
      </div>
      <div className="decision-bar-actions">
        <DecisionControl report={report} onReport={onReport} compact />
        {total > 1 && index !== null && (
          <div className="pager" aria-label="Other candidates">
            {prev ? (
              <Link to={`/app/candidates/${prev.id}`} className="btn btn-ghost btn-sm" title={`Previous: ${prev.name}`}>
                <Icon name="back" size={14} />
              </Link>
            ) : (
              <span className="btn btn-ghost btn-sm is-disabled" aria-hidden="true">
                <Icon name="back" size={14} />
              </span>
            )}
            <span className="tiny muted num">
              {index} of {total}
            </span>
            {next ? (
              <Link
                to={`/app/candidates/${next.id}`}
                className={`btn btn-sm ${report.candidate.decision ? 'btn-primary' : 'btn-ghost'}`}
                title={`Next: ${next.name}`}
              >
                {report.candidate.decision && <span>Next</span>}
                <Icon name="next" size={14} />
              </Link>
            ) : (
              <span className="btn btn-ghost btn-sm is-disabled" aria-hidden="true">
                <Icon name="next" size={14} />
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Adds or removes the candidate from the viewer's watch list. */
function StarToggle({ report, onReport }: { report: CandidateReport; onReport: (r: CandidateReport) => void }) {
  const [busy, setBusy] = useState(false);
  const starred = report.starred;
  async function toggleStar() {
    setBusy(true);
    try {
      await api.put(`/api/candidates/${report.candidate.id}/star`, { starred: !starred });
      onReport({ ...report, starred: !starred });
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      type="button"
      className={`star-toggle ${starred ? 'is-on' : ''}`}
      onClick={toggleStar}
      disabled={busy}
      aria-pressed={starred}
      title={starred ? 'Remove from your watch list' : 'Add to your watch list'}
    >
      <Icon name="star" size={16} filled={starred} />
    </button>
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
  const bench = report.benchmark;
  return (
    <section className="card verdict2">
      <div className="verdict2-head">
        <div className="verdict2-ring">
          <ScoreRing value={overall} />
          <RecommendationBadge value={recommendation} />
        </div>
        <div className="verdict2-title">
          <div className="verdict2-kicker tiny muted">
            {bench ? (
              <span className="bench">
                Ranked <strong>{ordinal(bench.rank)}</strong> of {bench.of} reviewed on this assessment
                {bench.overallAverage !== null && <> · pool average {bench.overallAverage.toFixed(1)}</>}
              </span>
            ) : (
              <span>The first reviewed candidate on this assessment</span>
            )}
            {report.adjusted && (
              <span>
                · AI scored {r.overall?.toFixed(1)}; {report.overrides.length} score
                {report.overrides.length === 1 ? '' : 's'} changed by your team
              </span>
            )}
          </div>
          <h2 className="verdict2-headline">{headline || r.summary}</h2>
          {headline && <p className="verdict2-summary">{r.summary}</p>}
        </div>
      </div>

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
          .map((stage, i) => {
            const { score, flags, delivery } = stageFacts(report, stage);
            const avg = bench?.byStage[stage.id] ?? null;
            return (
              <button
                key={stage.id}
                className="score-bar-row"
                onClick={() => onJump(stage.id)}
                style={{ ['--i' as string]: i }}
              >
                <span className="score-bar-label">
                  <span className="subtle">Q{stage.index + 1}</span> {stage.title}
                </span>
                <span className="score-bar-track">
                  <span
                    className={`score-bar-fill tone-${scoreTone(score)}`}
                    style={{ width: `${((score ?? 0) / 4) * 100}%` }}
                  />
                  {avg !== null && (
                    <span
                      className="score-bar-avg"
                      style={{ left: `${(avg / 4) * 100}%` }}
                      title={`Pool average ${avg.toFixed(1)}`}
                    />
                  )}
                </span>
                <span className={`score-bar-value tone-${scoreTone(score)}`}>{score?.toFixed(1) ?? '—'}</span>
                <span className="score-bar-flags">
                  <DeliveryIcon delivery={delivery} />
                  {flags
                    .filter((f) => f.tone === 'warn' && f.text !== 'Sounds read')
                    .map((f) => (
                      <span key={f.text} className="badge badge-warn">
                        {f.text}
                      </span>
                    ))}
                </span>
              </button>
            );
          })}
        {bench && (
          <div className="score-bars-legend tiny subtle">
            <span className="legend-avg" /> Pool average of {bench.of} reviewed candidates
          </div>
        )}
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

const LEANS: { value: Decision; label: string }[] = [
  { value: 'advance', label: 'Lean advance' },
  { value: 'hold', label: 'Lean hold' },
  { value: 'reject', label: 'Lean reject' },
];

/** Teammates' short takes before the decision. */
function TeamNotes({ report, onReport }: { report: CandidateReport; onReport: (r: CandidateReport) => void }) {
  const [body, setBody] = useState('');
  const [lean, setLean] = useState<Decision | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const finished = ['submitted', 'reviewed', 'decided'].includes(report.candidate.status);
  if (!finished) return null;

  if (!report.notes.length && !composing) {
    return (
      <section className="team-notes is-empty">
        <span className="row-gap">
          <Icon name="note" size={15} />
          <strong>Team notes</strong>
          <span className="small muted">None yet</span>
        </span>
        <button className="btn btn-secondary btn-sm" onClick={() => setComposing(true)}>
          Add a note
        </button>
      </section>
    );
  }

  async function post(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      onReport(await api.post<CandidateReport>(`/api/candidates/${report.candidate.id}/notes`, { body, lean }));
      setBody('');
      setLean(null);
      setError(null);
      setComposing(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(note: ReviewNote) {
    try {
      onReport(await api.del<CandidateReport>(`/api/candidates/${report.candidate.id}/notes/${note.id}`));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <section className="card team-notes">
      <div className="row-between">
        <h2 className="section-title">
          <Icon name="note" size={15} /> Team notes{' '}
          {report.notes.length > 0 && <span className="muted num">{report.notes.length}</span>}
        </h2>
        <span className="tiny subtle">Visible to everyone on your team</span>
      </div>
      {report.notes.length > 0 && (
        <ul className="note-list">
          {report.notes.map((note) => (
            <li key={note.id} className="note">
              <Avatar name={note.userName} size="sm" />
              <div className="note-body">
                <div className="note-meta">
                  <strong>{note.userName}</strong>
                  {note.lean && <DecisionBadge decision={note.lean} />}
                  <span className="tiny subtle">{formatDate(note.createdAt)}</span>
                  {note.mine && (
                    <button className="link-button tiny" onClick={() => remove(note)}>
                      Delete
                    </button>
                  )}
                </div>
                <p>{note.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form className="note-form" onSubmit={post}>
        <textarea
          rows={2}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={2000}
          placeholder="Your take, e.g. “Strong on the numbers; ask about Q4 on the call.”"
          aria-label="Your note"
        />
        <div className="row-between note-actions">
          <div className="lean-picker" role="group" aria-label="Your lean (optional)">
            {LEANS.map((l) => (
              <button
                key={l.value}
                type="button"
                className={`lean lean-${l.value} ${lean === l.value ? 'is-on' : ''}`}
                aria-pressed={lean === l.value}
                onClick={() => setLean(lean === l.value ? null : l.value)}
              >
                {l.label}
              </button>
            ))}
          </div>
          <span className="row-gap">
            {!report.notes.length && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setComposing(false)}>
                Cancel
              </button>
            )}
            <button className="btn btn-primary btn-sm" disabled={busy || !body.trim()}>
              {busy ? 'Posting…' : 'Post note'}
            </button>
          </span>
        </div>
        <ErrorNote error={error} />
      </form>
    </section>
  );
}

/** The decision they made, and the situation it led to. */
function ChoicePath({ report, stage }: { report: CandidateReport; stage: ReportStage }) {
  const decision = stage.kind === 'branch' ? report.stages.find((s) => s.id === stage.dependsOn) : stage;
  if (!decision?.shown?.choices?.length) return null;
  const branch = report.stages.find((s) => s.dependsOn === decision.id);
  const chosen = decision.response?.choiceId ?? null;
  const branchLead = (() => {
    const first = branch?.shown?.prompt.find((b) => b.type === 'p');
    if (!first || first.type !== 'p') return null;
    const sentence = first.text.replace(/\*\*/g, '').split(/(?<=[.!?])\s/)[0];
    return sentence.length > 160 ? `${sentence.slice(0, 157)}…` : sentence;
  })();
  return (
    <div className="choice-path" aria-label="Their decision and what followed">
      <div className="choice-options">
        <div className="tiny subtle">Q{decision.index + 1} options</div>
        {decision.shown.choices.map((c) => (
          <div key={c.id} className={`choice-node ${c.id === chosen ? 'is-chosen' : ''}`}>
            {c.id === chosen && <Icon name="check" size={13} />}
            {c.label}
          </div>
        ))}
      </div>
      {branch && (
        <>
          <div className="choice-arrow" aria-hidden="true">
            <Icon name="arrow" size={16} />
          </div>
          <div className={`choice-node choice-outcome ${branch.response ? '' : 'is-empty'}`}>
            <div className="tiny subtle">
              Led to Q{branch.index + 1} · {branch.title}
            </div>
            {branch.response ? branchLead : 'Not reached'}
          </div>
        </>
      )}
    </div>
  );
}

function TimeBar({ used, limit, timedOut }: { used: number | null; limit: number; timedOut: boolean }) {
  if (used === null) return null;
  const ratio = Math.min(1, used / Math.max(1, limit));
  return (
    <span className="time-bar" title={`Used ${formatDuration(used)} of ${formatDuration(limit)}`}>
      <span className="time-bar-track">
        <span className={`time-bar-fill ${timedOut ? 'is-out' : ''}`} style={{ width: `${ratio * 100}%` }} />
      </span>
      <span className="tiny subtle num">
        {formatDuration(used)} / {formatDuration(limit)}
      </span>
    </span>
  );
}

/** One labelled part of an answer: the same label style and spacing everywhere. */
function AnswerPart({ label, aside, children }: { label: string; aside?: string | null; children: ReactNode }) {
  return (
    <div className="answer-part">
      <div className="answer-label">
        <span>{label}</span>
        {aside && <span className="answer-aside">{aside}</span>}
      </div>
      {children}
    </div>
  );
}

type StagePanel = 'saw' | 'key' | null;

function StageReview({
  report,
  stage,
  open,
  focused,
  flashing,
  onToggle,
  onReport,
}: {
  report: CandidateReport;
  stage: ReportStage;
  open: boolean;
  focused: boolean;
  flashing: boolean;
  onToggle: () => void;
  onReport: (r: CandidateReport) => void;
}) {
  const { ai, aiScore, score, overrides, response: r, flags, delivery } = stageFacts(report, stage);
  const [panel, setPanel] = useState<StagePanel>(null);
  const [rate, setRate] = useState(1);
  const card = useRef<HTMLElement | null>(null);

  // The AI's quotes, highlighted where they appear in the answer.
  const evidence: Evidence[] = useMemo(
    () =>
      ai
        ? stage.rubric.flatMap((c) =>
            ai.criteria[c.id]?.evidence ? [{ id: c.id, label: c.label, quote: ai.criteria[c.id].evidence }] : [],
          )
        : [],
    [ai, stage.rubric],
  );
  const searchable = [r?.text, ai?.transcript, r?.reflection, r?.aiTranscript].filter(Boolean).join('\n');
  const found = useMemo(() => new Set(findEvidence(searchable, evidence).map((s) => s.id)), [searchable, evidence]);
  const inTranscript = Boolean(ai?.transcript && findEvidence(ai.transcript, evidence).length);

  function showEvidence(criterionId: string) {
    const mark = card.current?.querySelector<HTMLElement>(`mark[data-crit="${criterionId}"]`);
    if (!mark) return;
    mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
    mark.classList.remove('is-flash');
    void mark.offsetWidth;
    mark.classList.add('is-flash');
  }

  const choiceKinds = stage.kind === 'decision' || stage.kind === 'branch';
  return (
    <section
      ref={card}
      className={`q-card ${open ? 'is-open' : ''} ${focused ? 'is-focused' : ''} ${flashing ? 'is-flash' : ''}`}
      id={`stage-${stage.id}`}
    >
      <button className="q-row" onClick={onToggle} aria-expanded={open}>
        <span className="q-num">Q{stage.index + 1}</span>
        <span className="q-main">
          <span className="q-title">
            {stage.title}
            <KindBadge kind={stage.kind} />
            {stage.thinkAloud && <span className="badge badge-think">Think aloud</span>}
            <DeliveryIcon delivery={delivery} />
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
          <TimeBar used={r?.timeUsedSec ?? null} limit={stage.timeLimitSec} timedOut={r?.closedReason === 'timeout'} />
        </span>
        <span className="q-chevron" aria-hidden="true">
          ›
        </span>
      </button>

      {open && (
        <div className="q-body">
          {choiceKinds && <ChoicePath report={report} stage={stage} />}
          <div className="q-panels">
            <div className="q-answer">
              <h4 className="q-section-label">Their answer</h4>
              {!r ? (
                <p className="muted">Not reached yet.</p>
              ) : (
                <>
                  {r.choiceLabel && (
                    <AnswerPart label="Their choice">
                      <p className="q-choice">{r.choiceLabel}</p>
                    </AnswerPart>
                  )}
                  {stage.thinkAloud ? (
                    <AnswerPart
                      label="Recording"
                      aside={r.audio.length ? formatDuration(r.audio.reduce((sum, a) => sum + (a.sec ?? 0), 0)) : null}
                    >
                      <ThinkAloudReview response={r} delivery={ai?.delivery ?? null} />
                    </AnswerPart>
                  ) : (
                    r.audio.length > 0 && (
                      <AnswerPart label="Voice note">
                        <div className="voice-notes">
                          {r.audio.map((a) => (
                            <AudioPlayer
                              key={a.url}
                              src={a.url}
                              knownSec={a.sec}
                              rate={rate}
                              label={ai?.delivery ? `AI: ${DELIVERY_TEXT[ai.delivery.label].toLowerCase()}` : undefined}
                            />
                          ))}
                          <SpeedPicker rate={rate} onChange={setRate} />
                        </div>
                      </AnswerPart>
                    )
                  )}
                  {ai?.transcript && (
                    <AnswerPart label="Transcript" aside="by AI">
                      <Collapsible
                        title={stage.thinkAloud || inTranscript ? 'Hide transcript' : 'Show transcript'}
                        className="inset"
                        defaultOpen={stage.thinkAloud || inTranscript}
                      >
                        <div className="answer-text transcript">
                          <Highlighted text={ai.transcript} evidence={evidence} />
                        </div>
                      </Collapsible>
                    </AnswerPart>
                  )}
                  {stage.thinkAloud ? (
                    r.text &&
                    !r.scratch.length && (
                      <AnswerPart label={r.audio.length ? 'Scratchpad' : 'Typed working'}>
                        <div className="answer-text">
                          <Highlighted text={r.text} evidence={evidence} />
                        </div>
                      </AnswerPart>
                    )
                  ) : r.text ? (
                    <AnswerPart label="Written answer">
                      <div className="answer-text">
                        <Highlighted text={r.text} evidence={evidence} />
                      </div>
                    </AnswerPart>
                  ) : (
                    !r.audio.length && r.closedReason && <p className="muted">No answer.</p>
                  )}
                  {stage.kind === 'ai_allowed' && (
                    <>
                      <AnswerPart
                        label="Their AI conversation"
                        aside={r.aiTranscript ? `${r.aiTranscript.length.toLocaleString()} characters` : 'none given'}
                      >
                        {r.aiTranscript ? (
                          <Collapsible title="Show conversation" className="inset">
                            <div className="answer-text transcript">
                              <Highlighted text={r.aiTranscript} evidence={evidence} />
                            </div>
                          </Collapsible>
                        ) : (
                          <p className="muted small">They didn't paste a conversation.</p>
                        )}
                      </AnswerPart>
                      {r.reflection && (
                        <AnswerPart label="What they kept, changed or rejected">
                          <div className="answer-text">
                            <Highlighted text={r.reflection} evidence={evidence} />
                          </div>
                        </AnswerPart>
                      )}
                    </>
                  )}
                  {r.signalNotes.length > 0 && (
                    <AnswerPart label="Signals" aside="weak hints, not proof">
                      <div className="q-signals">
                        {r.signalNotes.map((note, i) => (
                          <span key={i} className={note.level === 'notable' ? 'is-notable' : ''}>
                            {note.text}
                          </span>
                        ))}
                      </div>
                    </AnswerPart>
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
                      inAnswer={found.has(criterion.id)}
                      onShowEvidence={() => showEvidence(criterion.id)}
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
  inAnswer,
  onShowEvidence,
  onReport,
}: {
  criterion: ReportStage['rubric'][number];
  scored: AiStageReview['criteria'][string] | null;
  override: ScoreOverride | undefined;
  candidateId: string;
  stageId: string;
  inAnswer: boolean;
  onShowEvidence: () => void;
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
      {scored?.evidence &&
        (inAnswer ? (
          <button type="button" className="crit-quote is-linked" onClick={onShowEvidence} title="Show in their answer">
            <q>{scored.evidence}</q>
            <span className="crit-quote-hint tiny">Show in answer</span>
          </button>
        ) : (
          <q className="crit-quote">{scored.evidence}</q>
        ))}
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
