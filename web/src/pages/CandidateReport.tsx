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
import type { Decision, Delivery, Recommendation } from '../../../shared/types';
import { api, errorMessage } from '../api';
import { useAuth } from '../auth';
import { AudioPlayer, SpeedPicker } from '../components/AudioPlayer';
import { Blocks } from '../components/Blocks';
import { Icon, type IconName } from '../components/Icon';
import { Avatar, type Evidence, Highlighted, ScoreRing, findEvidence } from '../components/ReviewBits';
import { DecisionEmail, IntegrityPanel, InterviewKitPanel, LockedReview } from '../components/ReviewExtras';
import { ThinkAloudReview } from '../components/ThinkAloudReview';
import {
  Collapsible,
  CopyButton,
  DecisionBadge,
  ErrorNote,
  KindBadge,
  StatusBadge,
  candidateLink,
} from '../components/ui';
import { useDemo } from '../demo/mode';
import { formatDate, useApi } from '../hooks';

type Tab = 'review' | 'verification' | 'scenario';
const POLL_MS = 4000;
const FLASH_MS = 1400;
/** The entrance plays while the page carries `rv-intro`; this is how long it keeps it. */
const INTRO_MS = 1100;

const REC_LABEL: Record<Recommendation, string> = { advance: 'Advance', hold: 'Hold', reject: 'Do not advance' };
const DECISIONS: { value: Decision; label: string; icon: IconName }[] = [
  { value: 'advance', label: 'Advance', icon: 'check' },
  { value: 'hold', label: 'Hold', icon: 'pause' },
  { value: 'reject', label: 'Reject', icon: 'x' },
];

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

export function CandidateReportPage() {
  const { id } = useParams();
  const { data: report, setData: setReport, error, reload } = useApi<CandidateReport>(`/api/candidates/${id}`);
  const [tab, setTab] = useState<Tab>('review');
  const [settled, setSettled] = useState<string | null>(null);
  const status = report?.aiReview?.status;
  const reviewing = status === 'pending' || status === 'running';
  const ready = report?.candidate.id === id;
  // The entrance plays for each candidate, and again when their AI review arrives.
  const introKey = ready ? `${id}:${status ?? 'none'}` : null;

  // Keep checking while the AI review runs in the background.
  useEffect(() => {
    if (!reviewing) return;
    const timer = window.setInterval(() => void reload(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [reviewing, reload]);

  useEffect(() => {
    if (!introKey) return;
    const timer = window.setTimeout(() => setSettled(introKey), INTRO_MS);
    return () => window.clearTimeout(timer);
  }, [introKey]);

  if (error) return <ErrorNote error={error} />;
  if (!report || !ready) return <p className="muted">Loading…</p>;

  const { candidate } = report;
  const finished = ['submitted', 'reviewed', 'decided'].includes(candidate.status);

  return (
    <div className={`rv ${settled !== introKey ? 'rv-intro' : ''}`}>
      <div className="rv-crumbs">
        <nav aria-label="Breadcrumb" className="crumbs">
          <Link to="/app" aria-label="Home">
            <Icon name="home" size={15} />
          </Link>
          <Icon name="next" size={12} />
          <Link to="/app">Assessments</Link>
          <Icon name="next" size={12} />
          <Link to={`/app/assessments/${report.assessment.id}`}>{report.assessment.title}</Link>
          <Icon name="next" size={12} />
          <span aria-current="page">Candidate review</span>
        </nav>
        <Pager report={report} />
      </div>

      <SummaryHeader report={report} finished={finished} tab={tab} onTab={setTab} onReport={setReport} />
      <DecisionEmail key={`mail-${candidate.id}`} report={report} onReport={setReport} />

      {tab === 'review' && <ReviewTab key={candidate.id} report={report} finished={finished} onReport={setReport} />}
      {tab === 'verification' && <VerificationTab report={report} finished={finished} onReport={setReport} />}
      {tab === 'scenario' && (
        <div className="rv-card rv-scenario">
          <p className="callout callout-info">
            {report.family.generated
              ? 'Every candidate on this assessment saw this same scenario.'
              : 'Numbers and names are generated for this candidate. Other candidates saw a different version.'}
          </p>
          <Blocks blocks={report.brief} />
        </div>
      )}
      <CandidateData key={`data-${candidate.id}`} report={report} />
    </div>
  );
}

/** For a candidate's request to see or delete their data. Managers only, and not in the demo. */
function CandidateData({ report }: { report: CandidateReport }) {
  const { user } = useAuth();
  const demo = useDemo();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (demo || user?.role !== 'manager') return null;
  const { candidate } = report;

  async function erase() {
    setBusy(true);
    setError(null);
    try {
      await api.del(`/api/candidates/${candidate.id}`);
      navigate(`/app/assessments/${report.assessment.id}`, { replace: true });
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <section className="rv-card rv-data no-print">
      <div className="rv-data-head">
        <div>
          <h2 className="section-title">Candidate data</h2>
          <p className="muted small">
            For when {candidate.name} asks for a copy of their data or for it to be deleted. Recordings are deleted
            automatically {candidate.recordingDays} days after they finish (
            <Link to="/app/settings">change in Settings</Link>).
          </p>
        </div>
        {!confirming && (
          <div className="row-gap">
            <a className="btn btn-secondary btn-sm" href={`/api/candidates/${candidate.id}/export`} download>
              <Icon name="file" size={14} /> Download all their data
            </a>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirming(true)}>
              Delete candidate
            </button>
          </div>
        )}
      </div>
      {confirming && (
        <div className="your-data-confirm">
          <p>
            <strong>Delete {candidate.name} and everything about them?</strong> Their answers, recordings, the AI
            review, your team’s notes and the decision are deleted for good. Their review still counts towards your
            plan.
          </p>
          <div className="row-gap">
            <button type="button" className="btn btn-danger btn-sm" onClick={erase} disabled={busy}>
              {busy ? 'Deleting…' : 'Delete for good'}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      <ErrorNote error={error} />
    </section>
  );
}

/** Previous and next candidate on this assessment. Once decided, "Next" becomes the obvious step. */
function Pager({ report, compact = false }: { report: CandidateReport; compact?: boolean }) {
  const { prev, next, index, total } = report.siblings;
  if (total < 2 || index === null) return null;
  const decided = Boolean(report.candidate.decision);
  return (
    <div className="pager" aria-label="Other candidates">
      {prev ? (
        <Link
          to={`/app/candidates/${prev.id}`}
          className="btn btn-ghost btn-sm"
          title={`Previous: ${prev.name}`}
          aria-label={`Previous candidate: ${prev.name}`}
        >
          <Icon name="back" size={14} />
        </Link>
      ) : (
        <span className="btn btn-ghost btn-sm is-disabled" aria-hidden="true">
          <Icon name="back" size={14} />
        </span>
      )}
      <span className="pager-pos num">
        {index} of {total}
      </span>
      {next ? (
        <Link
          to={`/app/candidates/${next.id}`}
          className={`btn btn-sm ${decided ? 'btn-primary' : 'btn-ghost'}`}
          title={`Next: ${next.name}`}
          aria-label={`Next candidate: ${next.name}`}
        >
          {decided && <span>{compact ? 'Next' : 'Next candidate'}</span>}
          <Icon name="next" size={14} />
        </Link>
      ) : (
        <span className="btn btn-ghost btn-sm is-disabled" aria-hidden="true">
          <Icon name="next" size={14} />
        </span>
      )}
    </div>
  );
}

function firstSentence(text: string) {
  const sentence = text.trim().split(/(?<=[.!?])\s/)[0] ?? '';
  return sentence.length > 160 ? `${sentence.slice(0, 157)}…` : sentence;
}

function ordinal(n: number) {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${suffix}`;
}

/** The team's leans from their notes, e.g. "2 advance · 1 hold". */
function teamLean(report: CandidateReport) {
  const counts: Partial<Record<Decision, number>> = {};
  for (const note of report.notes) if (note.lean) counts[note.lean] = (counts[note.lean] ?? 0) + 1;
  return DECISIONS.filter((d) => counts[d.value])
    .map((d) => `${counts[d.value]} ${d.value}`)
    .join(' · ');
}

/** Who they are, the overall score, the AI's recommendation and the decision. */
function SummaryHeader({
  report,
  finished,
  tab,
  onTab,
  onReport,
}: {
  report: CandidateReport;
  finished: boolean;
  tab: Tab;
  onTab: (tab: Tab) => void;
  onReport: (r: CandidateReport) => void;
}) {
  const { candidate } = report;
  const review = report.aiReview;
  const r = review?.result ?? null;
  const overall = report.adjusted?.overall ?? r?.overall ?? null;
  const recommendation = report.adjusted?.recommendation ?? r?.recommendation ?? null;
  const bench = report.benchmark;
  const scoring = !review || review.status === 'pending' || review.status === 'running';
  const reached = report.stages.filter((s) => s.response).length;

  return (
    <header className="rv-card rv-head">
      <div className="rv-who">
        <Avatar name={candidate.name} size="xl" />
        <div className="rv-who-text">
          <span className="rv-eyebrow">Candidate</span>
          <div className="rv-name-row">
            <h1 className="rv-name">{candidate.name}</h1>
            <StarToggle report={report} onReport={onReport} />
          </div>
          <div className="rv-meta">
            <span>{candidate.email}</span>
            {candidate.submittedAt ? (
              <span title={`Invited ${formatDate(candidate.createdAt)} · started ${formatDate(candidate.startedAt)}`}>
                Submitted {formatDate(candidate.submittedAt)}
              </span>
            ) : (
              <span>Invited {formatDate(candidate.createdAt)}</span>
            )}
            {candidate.timeMultiplier > 1 && <span>{candidate.timeMultiplier}× time</span>}
            <StatusBadge status={candidate.status} />
          </div>
        </div>
      </div>

      <div className="rv-tabs" role="tablist">
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
            onClick={() => onTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="rv-scorecard">
        {r ? (
          <ScoreRing value={overall} size={104} />
        ) : (
          <div className="rv-ring-empty" aria-hidden="true">
            {finished && scoring ? <span className="spinner" /> : '—'}
          </div>
        )}
        <span className="rv-scorecard-label">Overall score</span>
      </div>

      <div className="rv-reco">
        {!finished ? (
          <div className="rv-reco-card">
            <span className="rv-eyebrow">{candidate.status === 'invited' ? "Hasn't started" : 'Still working'}</span>
            <p className="rv-reco-note">
              {candidate.status === 'invited'
                ? 'Send them their link. The AI review starts as soon as they submit.'
                : `On question ${reached} of ${report.stages.length}. The AI review starts as soon as they submit.`}
            </p>
            <CopyButton text={candidateLink(candidate.token)} label="Copy candidate link" />
          </div>
        ) : (
          <>
            <div className="rv-reco-card">
              <span className="rv-eyebrow rv-eyebrow-accent">
                <Icon name="sparkle" size={13} filled /> AI recommendation
              </span>
              {r ? (
                <strong className={`rv-reco-value rec-${recommendation ?? 'none'}`}>
                  {recommendation ? REC_LABEL[recommendation] : '—'}
                </strong>
              ) : (
                <strong className="rv-reco-value rec-none">{scoring ? 'Scoring…' : 'No AI score'}</strong>
              )}
              <span className="rv-reco-note">
                {!r ? (
                  scoring ? (
                    'Usually takes a minute or two.'
                  ) : (
                    'You can still review the answers and decide.'
                  )
                ) : bench ? (
                  <>
                    Ranked {ordinal(bench.rank)} of {bench.of}
                    {bench.overallAverage !== null && <> · Pool average {bench.overallAverage.toFixed(1)}</>}
                  </>
                ) : (
                  'The first reviewed candidate here'
                )}
              </span>
              {r && report.adjusted && (
                <span className="rv-reco-note">
                  AI scored {r.overall?.toFixed(1)}; {report.overrides.length} score
                  {report.overrides.length === 1 ? '' : 's'} changed by your team
                </span>
              )}
            </div>
            <DecisionControl report={report} onReport={onReport} />
          </>
        )}
      </div>
    </header>
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
      <Icon name="star" size={18} filled={starred} />
    </button>
  );
}

/** Advance, hold or reject: the page's main task. Large in the header, compact in the sticky bar. */
function DecisionControl({
  report,
  onReport,
  size = 'lg',
}: {
  report: CandidateReport;
  onReport: (r: CandidateReport) => void;
  size?: 'lg' | 'sm';
}) {
  const { user } = useAuth();
  const [error, setError] = useState<string | null>(null);
  if (user?.role !== 'manager') return null;
  const finished = ['submitted', 'reviewed', 'decided'].includes(report.candidate.status);
  if (!finished) return null;
  const chosen = report.candidate.decision;
  const lean = teamLean(report);

  async function decide(decision: Decision | null) {
    try {
      onReport(await api.put<CandidateReport>(`/api/candidates/${report.candidate.id}/decision`, { decision }));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className={`rv-decide rv-decide-${size}`}>
      {size === 'lg' && (
        <div className="rv-decide-head">
          <span className="rv-label">Your decision</span>
          {lean && <span className="rv-lean">Team notes: {lean}</span>}
        </div>
      )}
      <div className="rv-decide-buttons" role="group" aria-label="Your decision">
        {DECISIONS.map((d) => (
          <button
            key={d.value}
            type="button"
            className={`rv-decide-btn is-${d.value} ${chosen === d.value ? 'is-chosen' : ''}`}
            aria-pressed={chosen === d.value}
            title={chosen === d.value ? 'Chosen. Click again to clear.' : undefined}
            onClick={() => decide(chosen === d.value ? null : d.value)}
          >
            <Icon name={d.icon} size={size === 'lg' ? 16 : 14} />
            <span>{d.label}</span>
          </button>
        ))}
      </div>
      <ErrorNote error={error} />
    </div>
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

function worthALook(report: CandidateReport, stage: ReportStage) {
  const { flags, delivery } = stageFacts(report, stage);
  return flags.some((f) => f.tone === 'warn') || delivery === 'read';
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
      <Icon name="mic" size={12} />
    </span>
  );
}

/** True while the element matching `selector` is on screen (below the top `inset` pixels). */
function useInView(selector: string, inset = 72) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const el = document.querySelector(selector);
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      rootMargin: `-${inset}px 0px 0px 0px`,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [selector, inset]);
  return visible;
}

const TONE_WORD: Record<string, string> = { good: 'Strong', mid: 'Mixed', low: 'Weak', none: '' };

/** The AI's quotes for one question, and which of them appear in the candidate's own words. */
function stageEvidence(report: CandidateReport, stage: ReportStage) {
  const { ai, response: r } = stageFacts(report, stage);
  const evidence: Evidence[] = ai
    ? stage.rubric.flatMap((c) =>
        ai.criteria[c.id]?.evidence ? [{ id: c.id, label: c.label, quote: ai.criteria[c.id].evidence }] : [],
      )
    : [];
  const searchable = [r?.text, ai?.transcript, r?.reflection, r?.aiTranscript].filter(Boolean).join('\n');
  const found = new Set(findEvidence(searchable, evidence).map((s) => s.id));
  return { evidence, found };
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
  const stages = report.stages;
  const [current, setCurrent] = useState<string | null>(
    () => (stages.find((s) => s.scored && s.response) ?? stages[0])?.id ?? null,
  );
  const [view, setView] = useState<'questions' | 'transcript'>('questions');
  const [flash, setFlash] = useState(false);
  const headerVisible = useInView('.rv-head');
  const { prev, next } = report.siblings;
  const index = stages.findIndex((s) => s.id === current);
  const stage = index >= 0 ? stages[index] : null;

  /** Selects a question; brings the question card into view if its top is off screen. */
  const show = useCallback((stageId: string) => {
    setView('questions');
    setCurrent(stageId);
    setFlash(true);
    window.setTimeout(() => setFlash(false), FLASH_MS);
    requestAnimationFrame(() => {
      const card = document.getElementById('rv-questions');
      if (card && card.getBoundingClientRect().top < 72)
        card.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
      else if (card && card.getBoundingClientRect().top > window.innerHeight * 0.6)
        card.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
    });
  }, []);
  const step = (delta: number) => {
    const target = stages[Math.min(stages.length - 1, Math.max(0, index + delta))];
    if (target && target.id !== current) show(target.id);
  };

  // J / K move between questions; [ and ] move between candidates.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (event.metaKey || event.ctrlKey || event.altKey || /INPUT|TEXTAREA|SELECT/.test(target.tagName)) return;
      if (event.key === '[' && prev) navigate(`/app/candidates/${prev.id}`);
      if (event.key === ']' && next) navigate(`/app/candidates/${next.id}`);
      if (event.key === 'j') step(1);
      if (event.key === 'k') step(-1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const r = report.aiReview?.result ?? null;
  return (
    <>
      <StickyBar report={report} current={current} shown={!headerVisible} onJump={show} onReport={onReport} />
      <div className="rv-body">
        <div className="rv-main">
          <ExecutiveSummary report={report} finished={finished} onReport={onReport} />

          <section id="rv-questions" className={`rv-card rv-questions ${flash ? 'is-flash' : ''}`}>
            <div className="rv-seg" role="tablist" aria-label="How to read the answers">
              <button
                role="tab"
                aria-selected={view === 'questions'}
                className={view === 'questions' ? 'active' : ''}
                onClick={() => setView('questions')}
              >
                Question by question
              </button>
              <button
                role="tab"
                aria-selected={view === 'transcript'}
                className={view === 'transcript' ? 'active' : ''}
                onClick={() => setView('transcript')}
              >
                Full transcript
              </button>
            </div>
            {view === 'questions' ? (
              <div className="rv-qwrap">
                <Stepper report={report} current={current} onSelect={show} />
                {stage && (
                  <QuestionDetail
                    key={stage.id}
                    report={report}
                    stage={stage}
                    prevStage={index > 0 ? stages[index - 1] : null}
                    nextStage={index < stages.length - 1 ? stages[index + 1] : null}
                    onSelect={show}
                    onReport={onReport}
                  />
                )}
              </div>
            ) : (
              <FullTranscript report={report} onSelect={show} />
            )}
          </section>
        </div>

        <aside className="rv-side" aria-label="Scores and notes">
          <ScoreBreakdown report={report} current={current} onSelect={show} />
          {r && <WithAndWithoutAi report={report} text={r.withAndWithoutAi} />}
          {r && <EvidenceCheck report={report} />}
          {r && <IntegrityPanel report={report} onReport={onReport} />}
          <TeamNotes report={report} onReport={onReport} />
        </aside>
      </div>
    </>
  );
}

/** Appears once the header scrolls away: who, the score, where you are, and the decision. */
function StickyBar({
  report,
  current,
  shown,
  onJump,
  onReport,
}: {
  report: CandidateReport;
  current: string | null;
  shown: boolean;
  onJump: (stageId: string) => void;
  onReport: (r: CandidateReport) => void;
}) {
  const r = report.aiReview?.result ?? null;
  const overall = report.adjusted?.overall ?? r?.overall ?? null;
  const recommendation = report.adjusted?.recommendation ?? r?.recommendation ?? null;
  const stages = report.stages;
  const index = current ? stages.findIndex((s) => s.id === current) : -1;
  const stage = index >= 0 ? stages[index] : null;
  return (
    <div className={`rv-bar ${shown ? 'is-shown' : ''}`} inert={!shown}>
      <div className="rv-bar-who">
        <Avatar name={report.candidate.name} size="sm" />
        <strong>{report.candidate.name}</strong>
        {r && overall !== null && (
          <span className={`rv-bar-score tone-${scoreTone(overall)}`}>
            {overall.toFixed(1)}
            {recommendation && <span className="rv-bar-rec">{REC_LABEL[recommendation]}</span>}
          </span>
        )}
      </div>
      <div className="rv-bar-q" aria-live="polite">
        <span className="rv-bar-pos num">
          {stage ? (
            <>
              Q{index + 1} <span className="rv-bar-of">of {stages.length}</span>
            </>
          ) : (
            'Overview'
          )}
        </span>
        <span className="rv-bar-title">{stage ? stage.title : `${stages.length} questions`}</span>
        <span className="rv-steps" aria-label="Jump to a question">
          {stages.map((s, i) => {
            const { score } = stageFacts(report, s);
            return (
              <button
                key={s.id}
                type="button"
                className={`rv-step tone-${s.scored ? scoreTone(score) : 'none'} ${s.id === current ? 'is-current' : ''}`}
                title={`Q${i + 1} ${s.title}${s.scored && score !== null ? ` · ${score.toFixed(1)}` : ''}`}
                aria-label={`Question ${i + 1}: ${s.title}`}
                onClick={() => onJump(s.id)}
              />
            );
          })}
        </span>
      </div>
      <div className="rv-bar-act">
        <DecisionControl report={report} onReport={onReport} size="sm" />
        <Pager report={report} compact />
      </div>
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

/** The verdict in a sentence, the reasoning, then strengths and concerns. */
function ExecutiveSummary({
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

  if (finished && review?.status === 'locked') {
    return (
      <section className="rv-card rv-exec">
        <LockedReview report={report} />
      </section>
    );
  }
  if (!finished || !review || review.status === 'pending' || review.status === 'running' || !r) {
    const failed = finished && review?.status === 'failed';
    return (
      <section className="rv-card rv-exec rv-state">
        <span className="rv-eyebrow">Executive summary</span>
        {!finished ? (
          <>
            <h2 className="rv-state-title">No answers to review yet</h2>
            <p className="rv-summary">Answers appear below as they come in. The AI review starts once they submit.</p>
          </>
        ) : failed ? (
          <>
            <h2 className="rv-state-title">No AI review yet</h2>
            <p className="rv-summary">
              {friendlyReviewError(review?.error ?? null)} Every answer and recording is below, and you can still
              decide.
            </p>
            <div className="row-gap">
              <button className="btn btn-secondary btn-sm" onClick={rerun} disabled={busy}>
                {busy ? 'Starting…' : 'Try the AI review again'}
              </button>
              {review?.error && (
                <details className="tiny muted error-details">
                  <summary>Technical details</summary>
                  {review.error}
                </details>
              )}
            </div>
            <ErrorNote error={error} />
          </>
        ) : (
          <>
            <h2 className="rv-state-title reviewing">
              <span className="spinner" aria-hidden="true" />
              {review?.status === 'running' ? 'Transcribing audio and scoring answers…' : 'AI review queued…'}
            </h2>
            <p className="rv-summary">This usually takes a minute or two. The page updates by itself.</p>
          </>
        )}
      </section>
    );
  }

  const headline = r.headline?.trim() || firstSentence(r.summary);
  return (
    <section className="rv-card rv-exec">
      <span className="rv-eyebrow">Executive summary</span>
      <h2 className="rv-headline">{headline}</h2>
      <p className="rv-summary">{r.summary}</p>
      <div className="rv-points-pair">
        <PointList kind="good" icon="check" title="Key strengths" items={r.strengths} />
        <PointList kind="warn" icon="alert" title="Key concerns" items={r.concerns} />
      </div>
      <div className="rv-exec-foot">
        <span>
          Reviewed {formatDate(review.updatedAt)} by {r.models.review}
        </span>
        <button className="rv-text-btn" onClick={rerun} disabled={busy}>
          {busy ? 'Starting…' : 'Re-run AI review'}
        </button>
        <ErrorNote error={error} />
      </div>
    </section>
  );
}

/** Strengths or concerns: the first three, the rest on request. */
function PointList({ kind, icon, title, items }: { kind: string; icon: IconName; title: string; items: string[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, 3);
  const hidden = items.length - 3;
  return (
    <div className={`rv-points rv-points-${kind}`}>
      <h3>
        {title} <span className="rv-count num">{items.length}</span>
      </h3>
      {items.length ? (
        <ul>
          {shown.map((item, i) => (
            <li key={i}>
              <span className="rv-pt-icon" aria-hidden="true">
                <Icon name={icon} size={12} />
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">None noted.</p>
      )}
      {hidden > 0 && (
        <button type="button" className="rv-text-btn" onClick={() => setAll(!all)}>
          {all ? 'Show fewer' : `Show ${hidden} more`}
        </button>
      )}
    </div>
  );
}

/** Every question as a step, coloured by score. */
function Stepper({
  report,
  current,
  onSelect,
}: {
  report: CandidateReport;
  current: string | null;
  onSelect: (stageId: string) => void;
}) {
  const list = useRef<HTMLOListElement | null>(null);
  // On phones the steps scroll sideways: keep the current one in view.
  useEffect(() => {
    const el = list.current;
    const item = el?.querySelector<HTMLElement>('[aria-current="step"]');
    if (el && item && el.scrollWidth > el.clientWidth)
      el.scrollTo({ left: item.offsetLeft - 16, behavior: reducedMotion() ? 'auto' : 'smooth' });
  }, [current]);
  return (
    <nav className="rv-stepper" aria-label="Questions">
      <ol ref={list}>
        {report.stages.map((stage) => {
          const { score, response } = stageFacts(report, stage);
          const tone = stage.scored ? scoreTone(score) : 'none';
          return (
            <li key={stage.id}>
              <button
                type="button"
                className={`rv-step-item ${current === stage.id ? 'is-current' : ''} ${response ? '' : 'is-empty'}`}
                aria-current={current === stage.id ? 'step' : undefined}
                onClick={() => onSelect(stage.id)}
              >
                <span className={`rv-step-dot dot-${tone}`} aria-hidden="true" />
                <span className="rv-qbadge">Q{stage.index + 1}</span>
                <span className="rv-step-title">{stage.title}</span>
                {worthALook(report, stage) ? <span className="rv-flag-dot" title="Worth a closer look" /> : <span />}
                <span className={`rv-step-score num tone-${tone}`}>
                  {stage.scored ? (score?.toFixed(1) ?? '—') : '–'}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="rv-keys">
        <kbd>J</kbd> <kbd>K</kbd> questions · <kbd>[</kbd> <kbd>]</kbd> candidates
      </p>
    </nav>
  );
}

type StagePanel = 'saw' | 'key' | null;

/** One question: the AI's take and score, the rubric, the candidate's answer and the evidence. */
function QuestionDetail({
  report,
  stage,
  prevStage,
  nextStage,
  onSelect,
  onReport,
}: {
  report: CandidateReport;
  stage: ReportStage;
  prevStage: ReportStage | null;
  nextStage: ReportStage | null;
  onSelect: (stageId: string) => void;
  onReport: (r: CandidateReport) => void;
}) {
  const { ai, aiScore, score, overrides, response: r, flags, delivery } = stageFacts(report, stage);
  const [panel, setPanel] = useState<StagePanel>(null);
  const [rate, setRate] = useState(1);
  const [hot, setHot] = useState<string | null>(null);
  const root = useRef<HTMLElement | null>(null);
  const { evidence, found } = useMemo(() => stageEvidence(report, stage), [report, stage]);
  const inTranscript = Boolean(ai?.transcript && findEvidence(ai.transcript, evidence).length);
  const tone = stage.scored ? scoreTone(score) : 'none';

  function showEvidence(criterionId: string) {
    const mark = root.current?.querySelector<HTMLElement>(`mark[data-crit="${criterionId}"]`);
    if (!mark) return;
    mark.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
    mark.classList.remove('is-flash');
    void mark.offsetWidth;
    mark.classList.add('is-flash');
  }

  const choiceKinds = stage.kind === 'decision' || stage.kind === 'branch';
  const take = !r
    ? 'Not reached.'
    : ai?.summary || (stage.scored ? 'No AI review yet.' : 'Not scored. Use it as a voice sample for the call.');
  return (
    <article
      ref={root}
      className="rv-detail"
      aria-label={`Question ${stage.index + 1}: ${stage.title}`}
      onMouseOver={(e) => setHot((e.target as HTMLElement).closest('[data-crit]')?.getAttribute('data-crit') ?? null)}
      onMouseLeave={() => setHot(null)}
    >
      <div className="rv-detail-top">
        <span className="rv-qbadge">Q{stage.index + 1}</span>
        <KindBadge kind={stage.kind} />
        {stage.thinkAloud && <span className="badge badge-think">Think aloud</span>}
        <DeliveryIcon delivery={delivery} />
        <TimeUsed used={r?.timeUsedSec ?? null} limit={stage.timeLimitSec} timedOut={r?.closedReason === 'timeout'} />
        <span className="rv-detail-nav">
          <button
            type="button"
            className="rv-round-btn"
            onClick={() => prevStage && onSelect(prevStage.id)}
            disabled={!prevStage}
            aria-label="Previous question"
          >
            <Icon name="back" size={14} />
          </button>
          <button
            type="button"
            className="rv-round-btn"
            onClick={() => nextStage && onSelect(nextStage.id)}
            disabled={!nextStage}
            aria-label="Next question"
          >
            <Icon name="next" size={14} />
          </button>
        </span>
      </div>

      <div className="rv-detail-head">
        <div>
          <h2 className="rv-detail-title">{stage.title}</h2>
          <p className="rv-detail-take">{take}</p>
          {flags.length > 0 && (
            <div className="rv-flags">
              {flags.map((f) => (
                <span key={f.text} className={`badge ${f.tone === 'warn' ? 'badge-warn' : 'badge-muted'}`}>
                  {f.text}
                </span>
              ))}
            </div>
          )}
        </div>
        {stage.scored && (
          <div className={`rv-detail-score is-${tone}`}>
            <span className="rv-detail-score-n num">
              {score?.toFixed(1) ?? '—'}
              <small>/ 4</small>
            </span>
            {TONE_WORD[tone] && <span className="rv-detail-score-w">{TONE_WORD[tone]}</span>}
          </div>
        )}
      </div>

      {choiceKinds && <ChoicePath report={report} stage={stage} />}

      {stage.scored && ai && (
        <section className="rv-block rv-quality">
          <h3 className="rv-block-title">
            <Icon name="bars" size={16} /> Answer quality
            <span className="rv-block-hint">Open a line for the AI's reasoning</span>
          </h3>
          {stage.rubric.map((criterion) => (
            <QualityRow
              key={criterion.id}
              criterion={criterion}
              scored={ai.criteria[criterion.id] ?? null}
              override={overrides.find((o) => o.criterionId === criterion.id)}
              candidateId={report.candidate.id}
              stageId={stage.id}
              hot={hot === criterion.id}
              onReport={onReport}
            />
          ))}
          {overrides.length > 0 && aiScore !== null && (
            <p className="rv-note">
              AI scored this question {aiScore.toFixed(1)}; with your team's changes it is {score?.toFixed(1) ?? '—'}.
            </p>
          )}
        </section>
      )}

      <section className="rv-block rv-answer">
        <h3 className="rv-block-title">Candidate answer</h3>
        {!r ? (
          <p className="muted">Not reached yet.</p>
        ) : (
          <>
            {r.choiceLabel && (
              <AnswerPart label="Their choice">
                <p className="q-choice">{r.choiceLabel}</p>
              </AnswerPart>
            )}
            {report.candidate.recordingsDeletedAt ? (
              (stage.thinkAloud || ai?.transcript) && (
                <AnswerPart label="Recording">
                  <p className="muted small rec-deleted">
                    <Icon name="clock" size={14} /> Deleted {formatDate(report.candidate.recordingsDeletedAt)}, at the
                    end of your workspace’s retention period.
                    {ai?.transcript ? ' The transcript is kept.' : ''}
                  </p>
                </AnswerPart>
              )
            ) : stage.thinkAloud ? (
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
                    <Highlighted text={ai.transcript} evidence={evidence} hot={hot} />
                  </div>
                </Collapsible>
              </AnswerPart>
            )}
            {stage.thinkAloud ? (
              r.text &&
              !r.scratch.length && (
                <AnswerPart label={r.audio.length ? 'Scratchpad' : 'Typed working'}>
                  <div className="answer-text">
                    <Highlighted text={r.text} evidence={evidence} hot={hot} />
                  </div>
                </AnswerPart>
              )
            ) : r.text ? (
              <AnswerPart label="Written answer">
                <div className="answer-text">
                  <Highlighted text={r.text} evidence={evidence} hot={hot} />
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
                      <div className="answer-text transcript is-scrollbox">
                        <Highlighted text={r.aiTranscript} evidence={evidence} hot={hot} />
                      </div>
                    </Collapsible>
                  ) : (
                    <p className="muted">They didn't paste a conversation.</p>
                  )}
                </AnswerPart>
                {r.reflection && (
                  <AnswerPart label="What they kept, changed or rejected">
                    <div className="answer-text">
                      <Highlighted text={r.reflection} evidence={evidence} hot={hot} />
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
      </section>

      {evidence.length > 0 && (
        <section className="rv-block rv-evidence">
          <h3 className="rv-block-title">Evidence from answer</h3>
          <div className="rv-evidence-grid">
            {evidence.map((e) => (
              <button
                key={e.id}
                type="button"
                className={`rv-ev-card ${hot === e.id ? 'is-hot' : ''}`}
                data-crit={e.id}
                onClick={() => showEvidence(e.id)}
                disabled={!found.has(e.id)}
                title={found.has(e.id) ? 'Show in their answer' : "This quote wasn't found word for word in the answer"}
              >
                <span className="rv-ev-icon" aria-hidden="true">
                  <Icon name="quote" size={15} />
                </span>
                <span className="rv-ev-label">{e.label}</span>
                <q className="rv-ev-quote">{e.quote}</q>
                {found.has(e.id) && <span className="rv-ev-link">Show in answer</span>}
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="q-extra">
        {stage.shown && (
          <button
            type="button"
            className={`q-extra-tab ${panel === 'saw' ? 'is-active' : ''}`}
            aria-expanded={panel === 'saw'}
            onClick={() => setPanel(panel === 'saw' ? null : 'saw')}
          >
            What they saw
          </button>
        )}
        <button
          type="button"
          className={`q-extra-tab ${panel === 'key' ? 'is-active' : ''}`}
          aria-expanded={panel === 'key'}
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

      <div className="rv-detail-foot">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => prevStage && onSelect(prevStage.id)}
          disabled={!prevStage}
        >
          <Icon name="back" size={14} /> Previous question
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => nextStage && onSelect(nextStage.id)}
          disabled={!nextStage}
        >
          Next question <Icon name="next" size={14} />
        </button>
      </div>
    </article>
  );
}

/** One rubric line as a bar; open it for the AI's reasoning, the rubric and "disagree". */
function QualityRow({
  criterion,
  scored,
  override,
  candidateId,
  stageId,
  hot,
  onReport,
}: {
  criterion: ReportStage['rubric'][number];
  scored: AiStageReview['criteria'][string] | null;
  override: ScoreOverride | undefined;
  candidateId: string;
  stageId: string;
  hot: boolean;
  onReport: (r: CandidateReport) => void;
}) {
  const [open, setOpen] = useState(false);
  const [showRubric, setShowRubric] = useState(false);
  const value = override?.score ?? scored?.score ?? null;
  const tone = scoreTone(value);
  return (
    <div className={`rv-qrow ${open ? 'is-open' : ''} ${hot ? 'is-hot' : ''}`} data-crit={criterion.id}>
      <button type="button" className="rv-qrow-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="rv-qrow-label">
          {criterion.label}
          {criterion.weight > 1 && <span className="rv-qrow-weight"> ×{criterion.weight}</span>}
          {override && <span className="rv-qrow-changed">changed</span>}
        </span>
        <span className="rv-track" aria-hidden="true">
          <span className={`rv-track-fill fill-${tone}`} style={{ width: `${((value ?? 0) / 4) * 100}%` }} />
        </span>
        <span className={`rv-qrow-value num tone-${tone}`}>{value ?? '—'}/4</span>
        <Icon name="chevron" size={14} className="rv-qrow-chevron" />
      </button>
      {open && (
        <div className="rv-qrow-body">
          {scored?.rationale && <p>{scored.rationale}</p>}
          <div className="crit-actions">
            <button type="button" className="rv-text-btn" onClick={() => setShowRubric(!showRubric)}>
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
      )}
    </div>
  );
}

/** Every answer in order, for reading straight through. */
function FullTranscript({ report, onSelect }: { report: CandidateReport; onSelect: (stageId: string) => void }) {
  const answered = report.stages.filter((s) => s.response);
  if (!answered.length) return <p className="rv-transcript muted">No answers yet.</p>;
  return (
    <div className="rv-transcript">
      {answered.map((stage) => {
        const { ai, response: r } = stageFacts(report, stage);
        const { evidence } = stageEvidence(report, stage);
        return (
          <section key={stage.id} className="rv-transcript-part">
            <h3>
              <span className="rv-qbadge">Q{stage.index + 1}</span>
              <button type="button" className="rv-text-btn rv-transcript-title" onClick={() => onSelect(stage.id)}>
                {stage.title}
              </button>
            </h3>
            {r?.choiceLabel && <p className="q-choice">{r.choiceLabel}</p>}
            {ai?.transcript && (
              <div className="answer-text transcript">
                <Highlighted text={ai.transcript} evidence={evidence} />
              </div>
            )}
            {r?.text && (!stage.thinkAloud || !r.scratch.length) && (
              <div className="answer-text">
                <Highlighted text={r.text} evidence={evidence} />
              </div>
            )}
            {r?.reflection && (
              <div className="answer-text">
                <Highlighted text={r.reflection} evidence={evidence} />
              </div>
            )}
            {!ai?.transcript && !r?.text && !r?.reflection && (
              <p className="muted">No written or transcribed answer.</p>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** One bar per question, with the pool average marked. Each row opens its question. */
function ScoreBreakdown({
  report,
  current,
  onSelect,
}: {
  report: CandidateReport;
  current: string | null;
  onSelect: (stageId: string) => void;
}) {
  const bench = report.benchmark;
  return (
    <section className="rv-card rv-side-card">
      <h2 className="rv-card-title">
        Score breakdown
        <span className="rv-info" title="Each question out of 4. The thin line is the pool average.">
          <Icon name="info" size={15} />
        </span>
      </h2>
      <div className="rv-sb">
        {report.stages.map((stage, i) => {
          const { score } = stageFacts(report, stage);
          const tone = stage.scored ? scoreTone(score) : 'none';
          const avg = bench?.byStage[stage.id] ?? null;
          return (
            <button
              key={stage.id}
              type="button"
              className={`rv-sb-row ${current === stage.id ? 'is-current' : ''}`}
              onClick={() => onSelect(stage.id)}
              style={{ ['--i' as string]: i }}
            >
              <span className={`rv-qbadge badge-${tone}`}>Q{stage.index + 1}</span>
              <span className="rv-sb-title">{stage.title}</span>
              {stage.scored ? (
                <span className="rv-track">
                  <span className={`rv-track-fill fill-${tone}`} style={{ width: `${((score ?? 0) / 4) * 100}%` }} />
                  {avg !== null && <span className="rv-track-avg" style={{ left: `${(avg / 4) * 100}%` }} />}
                </span>
              ) : (
                <span className="rv-sb-none">Not scored</span>
              )}
              <span className={`rv-sb-value num tone-${tone}`}>{stage.scored ? (score?.toFixed(1) ?? '—') : '–'}</span>
            </button>
          );
        })}
      </div>
      {bench && (
        <div className="rv-legend">
          <span className="rv-legend-avg" aria-hidden="true" /> Pool average of {bench.of} reviewed candidates
        </div>
      )}
    </section>
  );
}

function mean(values: number[]) {
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
}

/** Their average on their own against their score on the AI-allowed task, on one 0–4 line. */
function WithAndWithoutAi({ report, text }: { report: CandidateReport; text: string }) {
  const scored = report.stages
    .filter((s) => s.scored)
    .map((stage) => ({ stage, score: stageFacts(report, stage).score }))
    .filter((x): x is { stage: ReportStage; score: number } => x.score !== null);
  const ownRaw = mean(scored.filter((x) => x.stage.kind !== 'ai_allowed').map((x) => x.score));
  const withAiRaw = mean(scored.filter((x) => x.stage.kind === 'ai_allowed').map((x) => x.score));
  const own = ownRaw === null ? null : Math.round(ownRaw * 10) / 10;
  const withAi = withAiRaw === null ? null : Math.round(withAiRaw * 10) / 10;
  const delta = own !== null && withAi !== null ? Math.round((withAi - own) * 10) / 10 : null;
  const ownCount = scored.filter((x) => x.stage.kind !== 'ai_allowed').length;

  return (
    <section className="rv-card rv-side-card rv-wai">
      <h2 className="rv-card-title">With and without AI</h2>
      {own !== null && withAi !== null && delta !== null ? (
        <>
          <div className="rv-wai-nums">
            <div className="rv-wai-num" title={`Average of the ${ownCount} scored questions done without AI`}>
              <span className="rv-wai-key">
                <i className="rv-dot is-own" aria-hidden="true" /> On their own
              </span>
              <span className="rv-wai-value num">{own.toFixed(1)}</span>
            </div>
            <Icon name="arrow" size={18} className="rv-wai-arrow" />
            <div className="rv-wai-num">
              <span className="rv-wai-key">
                <i className="rv-dot is-ai" aria-hidden="true" /> With AI
              </span>
              <span className="rv-wai-value num">{withAi.toFixed(1)}</span>
            </div>
            <span className="rv-wai-delta num">
              {delta === 0 ? 'No change' : `${delta > 0 ? '+' : '−'}${Math.abs(delta).toFixed(1)}`}
            </span>
          </div>
          <div className="rv-wai-scale" aria-hidden="true">
            <span className="rv-wai-line" />
            <span
              className="rv-wai-span"
              style={{ left: `${(Math.min(own, withAi) / 4) * 100}%`, width: `${(Math.abs(withAi - own) / 4) * 100}%` }}
            />
            <i className="rv-dot is-own" style={{ left: `${(own / 4) * 100}%` }} />
            <i
              className="rv-dot is-ai"
              style={{ left: `${(withAi / 4) * 100}%`, ['--from' as string]: `${(own / 4) * 100}%` }}
            />
            {[0, 1, 2, 3, 4].map((n) => (
              <span key={n} className="rv-wai-tick num" style={{ left: `${(n / 4) * 100}%` }}>
                {n}
              </span>
            ))}
          </div>
        </>
      ) : null}
      <p className="rv-wai-text">{text || 'No AI-allowed question in this assessment.'}</p>
    </section>
  );
}

/**
 * How well the scores rest on the candidate's own work: quotes found word for word in their
 * answers, how the recordings sound, time, and any signals. All from data already on the page.
 */
function EvidenceCheck({ report }: { report: CandidateReport }) {
  let total = 0;
  let quoted = 0;
  let read = 0;
  let unsure = 0;
  let recordings = 0;
  let timedOut = 0;
  let notable = 0;
  for (const stage of report.stages) {
    const { ai, response } = stageFacts(report, stage);
    if (stage.scored && ai) {
      const { evidence, found } = stageEvidence(report, stage);
      total += evidence.length;
      quoted += evidence.filter((e) => found.has(e.id)).length;
    }
    if (ai?.delivery) {
      recordings += 1;
      if (ai.delivery.label === 'read') read += 1;
      if (ai.delivery.label === 'unsure') unsure += 1;
    }
    if (response?.closedReason === 'timeout') timedOut += 1;
    notable += response?.signalNotes.filter((n) => n.level === 'notable').length ?? 0;
  }
  const share = total ? quoted / total : 0;
  const items: { ok: boolean; text: string }[] = [
    { ok: share >= 0.8, text: `${quoted} of ${total} scores quote their own words` },
    recordings === 0
      ? { ok: true, text: 'No recordings were rated for delivery' }
      : read > 0
        ? {
            ok: false,
            text: `${read} recording${read === 1 ? '' : 's'} sound${read === 1 ? 's' : ''} read or rehearsed`,
          }
        : unsure > 0
          ? { ok: false, text: `Delivery unclear on ${unsure} recording${unsure === 1 ? '' : 's'}` }
          : { ok: true, text: 'Recordings sound like live reasoning' },
    timedOut > 0
      ? { ok: false, text: `Ran out of time on ${timedOut} question${timedOut === 1 ? '' : 's'}` }
      : { ok: true, text: 'Finished every question in time' },
    notable > 0
      ? { ok: false, text: `${notable} signal${notable === 1 ? '' : 's'} worth asking about on the call` }
      : { ok: true, text: 'No unusual signals' },
  ];
  const solid = items.every((i) => i.ok);
  const c = 2 * Math.PI * 42;
  return (
    <section className="rv-card rv-side-card rv-ec">
      <h2 className="rv-card-title">
        Evidence check
        <span
          className="rv-info"
          title="Checks how far the scores rest on the candidate's own words, and anything to ask about on the call."
        >
          <Icon name="info" size={15} />
        </span>
      </h2>
      <div className="rv-ec-body">
        <div className={`rv-ec-ring ${solid ? 'is-solid' : 'is-check'}`}>
          <svg width="100" height="100" viewBox="0 0 100 100" aria-hidden="true">
            <circle cx="50" cy="50" r="42" fill="none" strokeWidth="8" className="rv-ec-track" />
            <circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              strokeWidth="8"
              strokeLinecap="round"
              className="rv-ec-arc"
              strokeDasharray={c}
              strokeDashoffset={c * (1 - share)}
              transform="rotate(-90 50 50)"
              style={{ ['--ring-c' as string]: c }}
            />
          </svg>
          <span className="rv-ec-pct num">{Math.round(share * 100)}%</span>
        </div>
        <ul className="rv-ec-list">
          {items.map((item) => (
            <li key={item.text} className={item.ok ? 'is-ok' : 'is-flag'}>
              <span className="rv-ec-icon" aria-hidden="true">
                <Icon name={item.ok ? 'check' : 'alert'} size={12} />
              </span>
              {item.text}
            </li>
          ))}
        </ul>
      </div>
      <div className="rv-ec-callout">
        <Icon name="sparkle" size={18} filled />
        <div>
          <strong>{solid ? 'Well supported' : 'Check on the call'}</strong>
          <p>
            {solid
              ? 'The scores rest on their own words, and nothing stands out to probe.'
              : 'Some of the above is worth a question on the verification call.'}
          </p>
        </div>
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

  const empty = !report.notes.length && !composing;
  return (
    <section className={`rv-card rv-side-card rv-notes ${empty ? 'is-empty' : ''}`}>
      <h2 className="rv-card-title">
        Team notes {report.notes.length > 0 && <span className="rv-count num">{report.notes.length}</span>}
      </h2>
      {empty ? (
        <div className="rv-notes-empty">
          <span className="muted">Nothing from the team yet.</span>
          <button className="btn btn-secondary btn-sm" onClick={() => setComposing(true)}>
            Add a note
          </button>
        </div>
      ) : (
        <>
          {report.notes.length > 0 && (
            <ul className="note-list">
              {report.notes.map((note) => (
                <li key={note.id} className="note">
                  <Avatar name={note.userName} size="sm" />
                  <div className="note-body">
                    <div className="note-meta">
                      <strong>{note.userName}</strong>
                      {note.lean && <DecisionBadge decision={note.lean} />}
                      <span>{formatDate(note.createdAt)}</span>
                      {note.mine && (
                        <button className="rv-text-btn" onClick={() => remove(note)}>
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
            <div className="note-actions">
              <span className="rv-hint">Visible to everyone on your team</span>
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
        </>
      )}
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
        <div className="answer-label">Q{decision.index + 1} options</div>
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
          <div className={`choice-outcome ${branch.response ? '' : 'is-empty'}`}>
            <div className="answer-label">
              Led to Q{branch.index + 1} · {branch.title}
            </div>
            {branch.response ? branchLead : 'Not reached'}
          </div>
        </>
      )}
    </div>
  );
}

function TimeUsed({ used, limit, timedOut }: { used: number | null; limit: number; timedOut: boolean }) {
  if (used === null) return null;
  const ratio = Math.min(1, used / Math.max(1, limit));
  return (
    <span className="time-used" title={`Used ${formatDuration(used)} of ${formatDuration(limit)}`}>
      <span className="time-used-track" aria-hidden="true">
        <span className={`time-used-fill ${timedOut ? 'is-out' : ''}`} style={{ width: `${ratio * 100}%` }} />
      </span>
      <span className="num">
        {formatDuration(used)} of {formatDuration(limit)}
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
      <div className="override">
        <strong>
          {override.userName} changed this from {override.aiScore} to {override.score}:
        </strong>{' '}
        {override.note}{' '}
        <button type="button" className="rv-text-btn" onClick={() => setEditing(true)}>
          Edit
        </button>{' '}
        <button
          type="button"
          className="rv-text-btn"
          disabled={busy}
          onClick={() => act(() => api.del(`${base}/${stageId}/${criterionId}`))}
        >
          Remove
        </button>
        <ErrorNote error={error} />
      </div>
    ) : (
      <button type="button" className="rv-text-btn" onClick={() => setEditing(true)}>
        Disagree with this score?
      </button>
    );
  }

  return (
    <div className="override-form">
      <div className="row-gap">
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
        <span>Why? (helps calibrate the AI)</span>
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
    <>
      <div className="px-stack">
        <InterviewKitPanel report={report} onReport={onReport} />
        <IntegrityPanel report={report} onReport={onReport} />
      </div>
      <div className="verification">
        <div className="card script">
          <div className="row-between">
            <h2>Call script for {report.candidate.name}</h2>
            <button className="btn btn-secondary btn-sm no-print" onClick={() => window.print()}>
              Print
            </button>
          </div>
          <p className="muted">
            Real-time prompters and stand-in candidates struggle with quick follow-ups on their own specifics. This
            call, not detection software, is your security layer.
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
                    Voice note{probe.answer.voiceSec ? ` (${formatDuration(probe.answer.voiceSec)})` : ''}: listen
                    before the call.
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
                  <input
                    type="radio"
                    name="identity"
                    checked={identity === value}
                    onChange={() => setIdentity(value)}
                  />
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
    </>
  );
}
