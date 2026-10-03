import {
  type FormEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
import { type Decision, type Delivery, type Recommendation, STAGE_KIND_LABEL } from '../../../shared/types';
import { api, errorMessage } from '../api';
import { useAuth } from '../auth';
import { AudioPlayer, SpeedPicker } from '../components/AudioPlayer';
import { Blocks } from '../components/Blocks';
import { Icon, type IconName } from '../components/Icon';
import { Avatar, type Evidence, Highlighted, ScoreRing, findEvidence } from '../components/ReviewBits';
import { ThinkAloudReview } from '../components/ThinkAloudReview';
import { Collapsible, CopyButton, DecisionBadge, ErrorNote, StatusBadge, candidateLink } from '../components/ui';
import { formatDate, useApi } from '../hooks';

type Tab = 'review' | 'verification' | 'scenario';
const POLL_MS = 4000;
const FLASH_MS = 1400;
/** The entrance plays while the page carries `rv-intro`; this is how long it keeps it. */
const INTRO_MS = 1100;
/** The question crossing this line (a share of the window's height) is the one being read. */
const READING_LINE = 0.3;
/** Space between margin notes; matches `.crit-note + .crit-note`. */
const NOTE_GAP = 24;

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
      <div className="rv-topline">
        <Link to={`/app/assessments/${report.assessment.id}`} className="back-link">
          <Icon name="back" size={14} />
          {report.assessment.title}
        </Link>
        <Pager report={report} />
      </div>

      <SummaryHeader report={report} finished={finished} tab={tab} onTab={setTab} onReport={setReport} />

      {tab === 'review' && <ReviewTab key={candidate.id} report={report} finished={finished} onReport={setReport} />}
      {tab === 'verification' && (
        <div className="rv-pane">
          <VerificationTab report={report} finished={finished} onReport={setReport} />
        </div>
      )}
      {tab === 'scenario' && (
        <div className="rv-pane rv-scenario">
          <p className="callout callout-info">
            {report.family.generated
              ? 'Every candidate on this assessment saw this same scenario.'
              : 'Numbers and names are generated for this candidate. Other candidates saw a different version.'}
          </p>
          <Blocks blocks={report.brief} />
        </div>
      )}
    </div>
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

// Summary header ----------------------------------------------------------------

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

/** Who they are, the verdict, and the decision, composed as one block. */
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
  const headline = r ? r.headline?.trim() || firstSentence(r.summary) : null;
  const bench = report.benchmark;
  const scoring = !review || review.status === 'pending' || review.status === 'running';
  const reached = report.stages.filter((s) => s.response).length;

  return (
    <header className="rv-head">
      <div className="rv-head-who">
        <Avatar name={candidate.name} size="xl" />
        <div className="rv-head-text">
          <div className="rv-name-row">
            <h1 className="rv-name">{candidate.name}</h1>
            <StarToggle report={report} onReport={onReport} />
          </div>
          <div className="rv-meta">
            <StatusBadge status={candidate.status} />
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
          {headline && <p className="rv-headline">{headline}</p>}
        </div>
      </div>

      <div className="rv-unit">
        {!finished ? (
          <div className="rv-unit-wait">
            <span className="rv-label">{candidate.status === 'invited' ? "Hasn't started yet" : 'Still working'}</span>
            <p>
              {candidate.status === 'invited'
                ? 'Send them their link. The AI review starts as soon as they submit.'
                : `On question ${reached} of ${report.stages.length}. The AI review starts as soon as they submit.`}
            </p>
            <CopyButton text={candidateLink(candidate.token)} label="Copy candidate link" />
          </div>
        ) : (
          <>
            <div className="rv-unit-verdict">
              {r ? (
                <ScoreRing value={overall} size={88} />
              ) : (
                <div className="rv-ring-empty" aria-hidden="true">
                  {scoring ? <span className="spinner" /> : '—'}
                </div>
              )}
              <div className="rv-rec">
                <span className="rv-label">AI recommends</span>
                {r ? (
                  <strong className={`rv-rec-value rec-${recommendation ?? 'none'}`}>
                    {recommendation ? REC_LABEL[recommendation] : '—'}
                  </strong>
                ) : (
                  <strong className="rv-rec-value rec-none">{scoring ? 'Scoring…' : 'No AI score'}</strong>
                )}
                <span className="rv-rank">
                  {!r ? (
                    scoring ? (
                      'Usually takes a minute or two.'
                    ) : (
                      'You can still review the answers and decide.'
                    )
                  ) : bench ? (
                    <>
                      Ranked <strong>{ordinal(bench.rank)}</strong> of {bench.of}
                      {bench.overallAverage !== null && <> · pool average {bench.overallAverage.toFixed(1)}</>}
                    </>
                  ) : (
                    'The first reviewed candidate here'
                  )}
                </span>
                {r && report.adjusted && (
                  <span className="rv-rank">
                    AI scored {r.overall?.toFixed(1)}; {report.overrides.length} score
                    {report.overrides.length === 1 ? '' : 's'} changed by your team
                  </span>
                )}
              </div>
            </div>
            <DecisionControl report={report} onReport={onReport} />
          </>
        )}
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
  const [current, setCurrent] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  // While a jump scrolls the page, the reading line would point at questions passing by.
  const holdCurrentUntil = useRef(0);
  const headerVisible = useInView('.rv-head');
  const stages = report.stages;
  const { prev, next } = report.siblings;

  const show = useCallback((stageId: string) => {
    setOpen((now) => new Set(now).add(stageId));
    setCurrent(stageId);
    holdCurrentUntil.current = Date.now() + 1000;
    setFlash(stageId);
    window.setTimeout(() => setFlash((now) => (now === stageId ? null : now)), FLASH_MS);
    requestAnimationFrame(() =>
      document
        .getElementById(`stage-${stageId}`)
        ?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' }),
    );
  }, []);
  const toggle = (stageId: string) =>
    setOpen((now) => {
      const nextOpen = new Set(now);
      if (nextOpen.has(stageId)) nextOpen.delete(stageId);
      else nextOpen.add(stageId);
      return nextOpen;
    });

  // The current question is the last one whose top has crossed the reading line.
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      if (Date.now() < holdCurrentUntil.current) return;
      const line = window.innerHeight * READING_LINE;
      let found: string | null = null;
      for (const stage of stages) {
        const el = document.getElementById(`stage-${stage.id}`);
        if (el && el.getBoundingClientRect().top <= line) found = stage.id;
      }
      setCurrent(found);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [stages]);

  // J / K move between questions; [ and ] move between candidates.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (event.metaKey || event.ctrlKey || event.altKey || /INPUT|TEXTAREA|SELECT/.test(target.tagName)) return;
      if (event.key === '[' && prev) navigate(`/app/candidates/${prev.id}`);
      if (event.key === ']' && next) navigate(`/app/candidates/${next.id}`);
      if (event.key !== 'j' && event.key !== 'k') return;
      const index = current ? stages.findIndex((s) => s.id === current) : -1;
      const step = stages[Math.min(stages.length - 1, Math.max(0, index + (event.key === 'j' ? 1 : -1)))];
      if (step) show(step.id);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, stages, show, prev, next, navigate]);

  const allOpen = open.size === stages.length;
  return (
    <>
      <StickyBar report={report} current={current} shown={!headerVisible} onJump={show} onReport={onReport} />
      <QuestionNav report={report} current={current} onJump={show} />

      <div className="rv-sheet">
        <Overview report={report} finished={finished} onJump={show} onReport={onReport} />
        <TeamNotes report={report} onReport={onReport} />

        <div className="rv-row rv-answers-head">
          <div className="rv-c">
            <h2 className="rv-section">Answers</h2>
            <span className="rv-legend">
              <i className="marker-swatch" aria-hidden="true" /> Highlighted: what the AI quoted as evidence
            </span>
          </div>
          <div className="rv-r">
            <h2 className="rv-label">AI evaluation</h2>
            <button
              type="button"
              className="rv-text-btn"
              onClick={() => setOpen(allOpen ? new Set() : new Set(stages.map((s) => s.id)))}
            >
              {allOpen ? 'Collapse all' : 'Expand all'}
            </button>
          </div>
        </div>

        {stages.map((stage) => (
          <StageReview
            key={stage.id}
            report={report}
            stage={stage}
            open={open.has(stage.id)}
            current={current === stage.id}
            flashing={flash === stage.id}
            onToggle={() => toggle(stage.id)}
            onReport={onReport}
          />
        ))}
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

/** The questions down the left, with a marker that follows the one you're reading. */
function QuestionNav({
  report,
  current,
  onJump,
}: {
  report: CandidateReport;
  current: string | null;
  onJump: (stageId: string) => void;
}) {
  const list = useRef<HTMLOListElement | null>(null);
  const marker = useRef<HTMLSpanElement | null>(null);
  const stages = report.stages;
  const index = current ? stages.findIndex((s) => s.id === current) : -1;

  useLayoutEffect(() => {
    const item = current ? list.current?.querySelector<HTMLElement>(`[data-nav="${current}"]`) : null;
    const el = marker.current;
    if (!el) return;
    el.classList.toggle('is-on', Boolean(item));
    if (!item) return;
    el.style.transform = `translateY(${item.offsetTop}px)`;
    el.style.height = `${item.offsetHeight}px`;
  }, [current]);

  return (
    <nav className="rv-nav" aria-label="Questions">
      <div className="rv-nav-head">
        <span className="rv-label">Questions</span>
        <span className="rv-nav-pos num">{index >= 0 ? `${index + 1} of ${stages.length}` : stages.length}</span>
      </div>
      <div className="rv-nav-track">
        <span ref={marker} className="rv-nav-marker" aria-hidden="true" />
        <ol ref={list}>
          {stages.map((stage) => {
            const { score, response } = stageFacts(report, stage);
            return (
              <li key={stage.id} data-nav={stage.id}>
                <button
                  type="button"
                  className={`rv-nav-item ${current === stage.id ? 'is-current' : ''} ${response ? '' : 'is-empty'}`}
                  aria-current={current === stage.id ? 'step' : undefined}
                  onClick={() => onJump(stage.id)}
                >
                  <span className="rv-nav-num">Q{stage.index + 1}</span>
                  <span className="rv-nav-title">{stage.title}</span>
                  {worthALook(report, stage) ? <span className="rv-flag-dot" title="Worth a closer look" /> : <span />}
                  <span className={`rv-nav-score num tone-${stage.scored ? scoreTone(score) : 'none'}`}>
                    {stage.scored ? (score?.toFixed(1) ?? '—') : '–'}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
      <p className="rv-nav-keys">
        <span>
          <kbd>J</kbd> <kbd>K</kbd> questions
        </span>
        <span>
          <kbd>[</kbd> <kbd>]</kbd> candidates
        </span>
      </p>
    </nav>
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

/** A row of the sheet: the centre column and the evaluation rail beside it. */
function Row({ className = '', centre, rail }: { className?: string; centre: ReactNode; rail?: ReactNode }) {
  return (
    <section className={`rv-row ${className}`}>
      <div className="rv-c">{centre}</div>
      <div className="rv-r">{rail}</div>
    </section>
  );
}

/** The evidence at a glance, then the reasoning: strengths and concerns beside the scores. */
function Overview({
  report,
  finished,
  onJump,
  onReport,
}: {
  report: CandidateReport;
  finished: boolean;
  onJump: (stageId: string) => void;
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

  if (!finished) {
    return (
      <Row
        className="rv-state"
        centre={
          <>
            <h2 className="rv-section">No answers to review yet</h2>
            <p className="muted">Answers appear below as they come in. The AI review starts once they submit.</p>
          </>
        }
      />
    );
  }
  if (!review || review.status === 'pending' || review.status === 'running') {
    return (
      <Row
        className="rv-state"
        centre={
          <>
            <h2 className="rv-section reviewing">
              <span className="spinner" aria-hidden="true" />
              {review?.status === 'running' ? 'Transcribing audio and scoring answers…' : 'AI review queued…'}
            </h2>
            <p className="muted">This usually takes a minute or two. The page updates by itself.</p>
          </>
        }
      />
    );
  }
  if (review.status === 'failed' || !r) {
    return (
      <Row
        className="rv-state"
        centre={
          <>
            <h2 className="rv-section">No AI review yet</h2>
            <p>
              {friendlyReviewError(review.error)} Every answer and recording is below, and you can still make a
              decision.
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
          </>
        }
      />
    );
  }

  return (
    <>
      <Row
        className="rv-ov"
        centre={
          <div className="rv-points-pair">
            <PointList kind="good" icon="check" title="Strengths" items={r.strengths} />
            <PointList kind="warn" icon="alert" title="Concerns" items={r.concerns} />
          </div>
        }
        rail={<ByQuestion report={report} onJump={onJump} />}
      />
      <Row
        className="rv-ov"
        centre={
          <div className="rv-why rv-fade">
            <h2 className="rv-label">
              <Icon name="sparkle" size={14} /> Why this score
            </h2>
            <p className="rv-summary">{r.summary}</p>
          </div>
        }
        rail={
          <>
            <WithAndWithoutAi report={report} text={r.withAndWithoutAi} />
            <div className="rv-ai-foot">
              <span>
                Reviewed {formatDate(review.updatedAt)} by {r.models.review}
              </span>
              <button className="rv-text-btn" onClick={rerun} disabled={busy}>
                {busy ? 'Starting…' : 'Re-run AI review'}
              </button>
              <ErrorNote error={error} />
            </div>
          </>
        }
      />
    </>
  );
}

/** Strengths or concerns: the first three, the rest on request. */
function PointList({ kind, icon, title, items }: { kind: string; icon: IconName; title: string; items: string[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, 3);
  const hidden = items.length - 3;
  return (
    <div className={`rv-points rv-points-${kind} rv-fade`}>
      <h3 className="rv-points-head">
        <span className="rv-points-icon">
          <Icon name={icon} size={14} />
        </span>
        {title}
        <span className="rv-points-count num">{items.length}</span>
      </h3>
      {items.length ? (
        <ul>
          {shown.map((item, i) => (
            <li key={i}>{item}</li>
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

/** One bar per scored question, with the pool average marked. Each bar opens its question. */
function ByQuestion({ report, onJump }: { report: CandidateReport; onJump: (stageId: string) => void }) {
  const bench = report.benchmark;
  return (
    <div className="rv-byq">
      <div className="rv-r-head">
        <h2 className="rv-label">By question</h2>
        {bench && (
          <span className="rv-legend">
            <i className="legend-avg" aria-hidden="true" /> Pool average
          </span>
        )}
      </div>
      {report.stages
        .filter((s) => s.scored)
        .map((stage, i) => {
          const { score } = stageFacts(report, stage);
          const avg = bench?.byStage[stage.id] ?? null;
          return (
            <button
              key={stage.id}
              type="button"
              className="rv-byq-row"
              onClick={() => onJump(stage.id)}
              style={{ ['--i' as string]: i }}
              title={avg !== null ? `Pool average ${avg.toFixed(1)}` : undefined}
            >
              <span className="rv-byq-label">
                <span className="rv-byq-num">Q{stage.index + 1}</span>
                {stage.title}
                {worthALook(report, stage) && <span className="rv-flag-dot" title="Worth a closer look" />}
              </span>
              <span className={`rv-byq-value num tone-${scoreTone(score)}`}>{score?.toFixed(1) ?? '—'}</span>
              <span className="rv-byq-track">
                <span
                  className={`rv-byq-fill tone-${scoreTone(score)}`}
                  style={{ width: `${((score ?? 0) / 4) * 100}%` }}
                />
                {avg !== null && <span className="rv-byq-avg" style={{ left: `${(avg / 4) * 100}%` }} />}
              </span>
            </button>
          );
        })}
    </div>
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
    <div className="rv-wai rv-fade">
      <h2 className="rv-label">With and without AI</h2>
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
    </div>
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
      <Row
        className="rv-notes is-empty"
        centre={
          <div className="rv-notes-empty">
            <span className="rv-label">
              <Icon name="note" size={14} /> Team notes
            </span>
            <span className="muted">None yet</span>
            <button className="rv-text-btn" onClick={() => setComposing(true)}>
              Add a note
            </button>
          </div>
        }
      />
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
    <Row
      className="rv-notes"
      centre={
        <>
          <div className="rv-notes-head">
            <h2 className="rv-label">
              <Icon name="note" size={14} /> Team notes
              {report.notes.length > 0 && <span className="num">{report.notes.length}</span>}
            </h2>
            <span className="rv-hint">Visible to everyone on your team</span>
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
        </>
      }
    />
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

/** Mounts content on first open, then lets CSS animate it open and closed. */
function useDisclosure(open: boolean) {
  const [mounted, setMounted] = useState(open);
  const [expanded, setExpanded] = useState(open);
  useEffect(() => {
    if (!open) {
      setExpanded(false);
      return;
    }
    setMounted(true);
    // One frame closed first, so the height has something to grow from.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => setExpanded(true));
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);
  return { mounted, expanded };
}

/**
 * Beside an open answer, each criterion's note starts level with the passage it quotes, like a
 * comment in the margin. Notes keep rubric order, so one never moves above the one before it.
 */
function useEvidenceAlignment(item: RefObject<HTMLElement | null>, expanded: boolean) {
  useLayoutEffect(() => {
    const root = item.current;
    const list = root?.querySelector<HTMLElement>('.rv-crit-notes');
    const answer = root?.querySelector<HTMLElement>('.rv-q-main');
    if (!root || !list || !answer) return;
    const notes = [...list.querySelectorAll<HTMLElement>(':scope > .crit-note')];

    const place = () => {
      const sideBySide = list.getBoundingClientRect().left >= answer.getBoundingClientRect().right;
      if (!expanded || !sideBySide) {
        for (const note of notes) note.style.marginTop = '';
        return;
      }
      const top = list.getBoundingClientRect().top;
      let bottom = 0;
      notes.forEach((note, i) => {
        const natural = i === 0 ? 0 : bottom + NOTE_GAP;
        const mark = answer.querySelector<HTMLElement>(`mark[data-crit="${note.dataset.crit}"]`);
        const visible = mark && mark.getClientRects().length > 0 && !mark.closest('.is-scrollbox');
        const at = visible ? Math.max(natural, mark.getBoundingClientRect().top - top - 3) : natural;
        note.style.marginTop = `${at - bottom}px`;
        bottom = at + note.offsetHeight;
      });
    };

    place();
    const observer = new ResizeObserver(place);
    observer.observe(answer);
    for (const note of notes) observer.observe(note);
    window.addEventListener('resize', place);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', place);
    };
  }, [item, expanded]);
}

type StagePanel = 'saw' | 'key' | null;

function StageReview({
  report,
  stage,
  open,
  current,
  flashing,
  onToggle,
  onReport,
}: {
  report: CandidateReport;
  stage: ReportStage;
  open: boolean;
  current: boolean;
  flashing: boolean;
  onToggle: () => void;
  onReport: (r: CandidateReport) => void;
}) {
  const { ai, aiScore, score, overrides, response: r, flags, delivery } = stageFacts(report, stage);
  const [panel, setPanel] = useState<StagePanel>(null);
  const [rate, setRate] = useState(1);
  const [hot, setHot] = useState<string | null>(null);
  const item = useRef<HTMLElement | null>(null);
  const { mounted, expanded } = useDisclosure(open);
  useEvidenceAlignment(item, expanded);

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
    const mark = item.current?.querySelector<HTMLElement>(`mark[data-crit="${criterionId}"]`);
    if (!mark) return;
    mark.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
    mark.classList.remove('is-flash');
    void mark.offsetWidth;
    mark.classList.add('is-flash');
  }

  const choiceKinds = stage.kind === 'decision' || stage.kind === 'branch';
  const take = !r
    ? 'Not reached.'
    : ai?.summary || (stage.scored ? 'No AI review yet.' : 'Not scored. A voice sample.');
  return (
    <section
      ref={item}
      id={`stage-${stage.id}`}
      data-stage={stage.id}
      className={`rv-row rv-q ${expanded ? 'is-expanded' : ''} ${current ? 'is-current' : ''} ${flashing ? 'is-flash' : ''} ${r ? '' : 'is-empty'}`}
      onMouseOver={(e) => setHot((e.target as HTMLElement).closest('[data-crit]')?.getAttribute('data-crit') ?? null)}
      onMouseLeave={() => setHot(null)}
    >
      <div className="rv-c rv-q-main">
        <button type="button" className="rv-q-toggle" onClick={onToggle} aria-expanded={open}>
          <span className="rv-q-meta">
            <span className="rv-q-num">Q{stage.index + 1}</span>
            <span>{STAGE_KIND_LABEL[stage.kind]}</span>
            {stage.thinkAloud && <span>Think aloud</span>}
            <DeliveryIcon delivery={delivery} />
            <TimeUsed
              used={r?.timeUsedSec ?? null}
              limit={stage.timeLimitSec}
              timedOut={r?.closedReason === 'timeout'}
            />
          </span>
          <span className="rv-q-title">
            {stage.title}
            <Icon name="chevron" size={16} className="rv-q-chevron" />
          </span>
          <span className="rv-q-take">{take}</span>
        </button>
        {flags.length > 0 && (
          <div className="rv-q-flags">
            {flags.map((f) => (
              <span key={f.text} className={`badge ${f.tone === 'warn' ? 'badge-warn' : 'badge-muted'}`}>
                {f.text}
              </span>
            ))}
          </div>
        )}

        {mounted && (
          <div className="rv-q-body" inert={!expanded}>
            <div className="rv-q-inner">
              {choiceKinds && <ChoicePath report={report} stage={stage} />}
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
            </div>
          </div>
        )}
      </div>

      <div className="rv-r rv-q-rail" onClick={open ? undefined : onToggle}>
        <div className="rv-q-score">
          <span className="rv-label">{stage.scored ? 'AI score' : 'Not scored'}</span>
          {stage.scored && (
            <span className={`rv-score num tone-${scoreTone(score)}`}>
              {score?.toFixed(1) ?? '—'}
              <small>/4</small>
            </span>
          )}
        </div>
        {stage.scored && ai ? (
          <>
            <div className="rv-scoreboard">
              {stage.rubric.map((criterion) => {
                const value =
                  overrides.find((o) => o.criterionId === criterion.id)?.score ??
                  ai.criteria[criterion.id]?.score ??
                  null;
                return (
                  <div
                    key={criterion.id}
                    className={`crit-score ${hot === criterion.id ? 'is-hot' : ''}`}
                    data-crit={criterion.id}
                  >
                    <span className="crit-label">
                      {criterion.label}
                      {criterion.weight > 1 && <span className="crit-weight"> ×{criterion.weight}</span>}
                    </span>
                    <Meter value={value} />
                  </div>
                );
              })}
            </div>
            {mounted && (
              <div className="rv-notes-wrap" inert={!expanded}>
                <div className="rv-notes-inner">
                  <div className="rv-crit-notes">
                    {stage.rubric.map((criterion) => (
                      <CriterionNote
                        key={criterion.id}
                        criterion={criterion}
                        scored={ai.criteria[criterion.id] ?? null}
                        override={overrides.find((o) => o.criterionId === criterion.id)}
                        candidateId={report.candidate.id}
                        stageId={stage.id}
                        inAnswer={found.has(criterion.id)}
                        hot={hot === criterion.id}
                        onShowEvidence={() => showEvidence(criterion.id)}
                        onReport={onReport}
                      />
                    ))}
                  </div>
                  {overrides.length > 0 && aiScore !== null && (
                    <p className="rv-rail-note">
                      AI scored this question {aiScore.toFixed(1)}; with your team's changes it is{' '}
                      {score?.toFixed(1) ?? '—'}.
                    </p>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="rv-rail-note">
            {!stage.scored
              ? 'A voice sample for the call.'
              : r
                ? 'Waiting for the AI review.'
                : 'Nothing to score yet.'}
          </p>
        )}
      </div>
    </section>
  );
}

/** A four-step meter with the number on the score axis. */
function Meter({ value }: { value: number | null }) {
  return (
    <span className={`meter tone-${scoreTone(value)}`} aria-label={`${value ?? 'No score'} out of 4`}>
      {[1, 2, 3, 4].map((step) => (
        <i key={step} className={value !== null && step <= value ? 'on' : ''} />
      ))}
      <b className="num">{value ?? '—'}</b>
    </span>
  );
}

/** A criterion's margin note: the quote it rests on, the reason, and the controls. */
function CriterionNote({
  criterion,
  scored,
  override,
  candidateId,
  stageId,
  inAnswer,
  hot,
  onShowEvidence,
  onReport,
}: {
  criterion: ReportStage['rubric'][number];
  scored: AiStageReview['criteria'][string] | null;
  override: ScoreOverride | undefined;
  candidateId: string;
  stageId: string;
  inAnswer: boolean;
  hot: boolean;
  onShowEvidence: () => void;
  onReport: (r: CandidateReport) => void;
}) {
  const [showRubric, setShowRubric] = useState(false);
  const value = override?.score ?? scored?.score ?? null;
  return (
    <div className={`crit-note ${hot ? 'is-hot' : ''}`} data-crit={criterion.id}>
      <div className="crit-note-head">
        <span>{criterion.label}</span>
        <b className={`num tone-${scoreTone(value)}`}>{value ?? '—'}</b>
      </div>
      {scored?.evidence &&
        (inAnswer ? (
          <button type="button" className="crit-quote is-linked" onClick={onShowEvidence}>
            <q>{scored.evidence}</q>
            <span className="crit-quote-hint">
              <Icon name="highlighter" size={13} /> Show in answer
            </span>
          </button>
        ) : (
          <q className="crit-quote">{scored.evidence}</q>
        ))}
      {scored?.rationale && <p className="crit-why">{scored.rationale}</p>}
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
