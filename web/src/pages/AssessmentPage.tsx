import { type FormEvent, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type {
  AiReviewStatus,
  AssessmentDetail,
  AssessmentFunnel,
  BulkInviteResult,
  CandidateListItem,
} from '../../../shared/api';
import { downloadCsv, inviteEmail, mailtoHref, parsePeople, reminderEmail } from '../emails';
import { api, errorMessage } from '../api';
import { Funnel } from '../components/Funnel';
import { Icon } from '../components/Icon';
import { Avatar } from '../components/ReviewBits';
import { useAuth } from '../auth';
import {
  CopyButton,
  DecisionBadge,
  EmptyState,
  ErrorNote,
  RecommendationBadge,
  Score,
  StatusBadge,
  candidateLink,
} from '../components/ui';
import { formatDate, useApi } from '../hooks';

const IDENTITY_LABEL: Record<string, string> = {
  verified: 'ID verified',
  not_verified: 'ID not verified',
  not_checked: 'ID not checked',
};
const AI_STATUS_LABEL: Record<AiReviewStatus, string> = {
  pending: 'Queued',
  running: 'Reviewing…',
  done: 'Done',
  failed: 'Review failed',
  locked: 'Waiting for upgrade',
};

/** Candidates a recruiter can compare: they have answers to look at. */
const COMPARABLE = ['submitted', 'reviewed', 'decided'];
const MAX_COMPARE = 4;

const CONSISTENCY_LABEL: Record<string, string> = {
  consistent: 'consistent',
  partly: 'partly consistent',
  inconsistent: 'inconsistent',
};

export function AssessmentPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data, setData, error } = useApi<AssessmentDetail>(`/api/assessments/${id}`);
  const { data: funnel } = useApi<AssessmentFunnel>(`/api/assessments/${id}/funnel`);
  const [selected, setSelected] = useState<string[]>([]);
  const [onlyStarred, setOnlyStarred] = useState(false);

  if (error) return <ErrorNote error={error} />;
  if (!data) return <p className="muted">Loading…</p>;
  const { assessment, family, candidates } = data;
  const comparable = candidates.filter((c) => COMPARABLE.includes(c.status));
  const lockedCount = candidates.filter((c) => c.aiStatus === 'locked').length;
  const inviteCtx: InviteContext = {
    assessmentId: assessment.id,
    title: assessment.title,
    minutes: family.totalMinutes,
  };

  const toggle = (candidateId: string) =>
    setSelected((current) =>
      current.includes(candidateId)
        ? current.filter((x) => x !== candidateId)
        : current.length < MAX_COMPARE
          ? [...current, candidateId]
          : current,
    );

  return (
    <>
      <div className="page-head">
        <div>
          <Link to="/app" className="back-link">
            <Icon name="back" size={14} />
            Assessments
          </Link>
          <h1>{assessment.title}</h1>
          <div className="meta-dots">
            <span>{family.name}</span>
            <span>{family.stages.length} questions</span>
            <span>~{family.totalMinutes} min</span>
            <span>{assessment.currency}</span>
          </div>
        </div>
        <div className="row-gap">
          {comparable.length >= 2 && (
            <button
              className="btn btn-secondary"
              onClick={() =>
                navigate(
                  `/app/assessments/${assessment.id}/compare?ids=${comparable
                    .slice(0, MAX_COMPARE)
                    .map((c) => c.id)
                    .join(',')}`,
                )
              }
            >
              <Icon name="compare" />
              Compare finished
            </button>
          )}
          <Link to={`/app/library/${family.id}?currency=${assessment.currency}`} className="btn btn-secondary">
            Preview what candidates see
          </Link>
        </div>
      </div>

      {user?.role === 'manager' && (
        <InviteForm
          ctx={inviteCtx}
          onInvited={(added) => setData({ ...data, candidates: [...[...added].reverse(), ...candidates] })}
        />
      )}
      {user?.role === 'manager' && <NudgePanel ctx={inviteCtx} candidates={candidates} />}
      {lockedCount > 0 && (
        <div className="callout callout-warn locked-banner">
          <Icon name="lock" size={16} />
          <span>
            <strong>
              {lockedCount} finished candidate{lockedCount === 1 ? "'s review is" : "s' reviews are"} waiting.
            </strong>{' '}
            Your free trial's reviews are used up.
          </span>
          <Link to="/app/plan" className="btn btn-primary btn-sm">
            See plans
          </Link>
        </div>
      )}

      {candidates.length === 0 ? (
        <EmptyState title="No candidates yet">
          <p className="muted">Invite someone above. You'll get a private link to send them.</p>
        </EmptyState>
      ) : (
        <div className="card flush">
          <div className="card-head">
            <div className="row-gap">
              <h2>Candidates</h2>
              <div className="segmented-filter" role="group" aria-label="Show">
                <button className={!onlyStarred ? 'is-active' : ''} onClick={() => setOnlyStarred(false)}>
                  All <span className="num">{candidates.length}</span>
                </button>
                <button className={onlyStarred ? 'is-active' : ''} onClick={() => setOnlyStarred(true)}>
                  <Icon name="star" size={12} filled /> Starred{' '}
                  <span className="num">{candidates.filter((c) => c.starred).length}</span>
                </button>
              </div>
            </div>
            {comparable.length >= 2 && (
              <span className="small muted">Tick finished candidates to compare them side by side.</span>
            )}
          </div>
          <div className="table-scroll">
            <table className="list-table">
              <thead>
                <tr>
                  <th className="check-cell">
                    <span className="sr-only">Compare</span>
                  </th>
                  <th>Candidate</th>
                  <th>Status</th>
                  <th>AI score</th>
                  <th>Signals</th>
                  <th>Verification</th>
                  <th>Decision</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {onlyStarred && !candidates.some((c) => c.starred) && (
                  <tr>
                    <td colSpan={8} className="muted small center">
                      No starred candidates yet. Star someone to keep them on your watch list.
                    </td>
                  </tr>
                )}
                {candidates
                  .filter((c) => !onlyStarred || c.starred)
                  .map((c) => {
                    const canCompare = COMPARABLE.includes(c.status);
                    const isSelected = selected.includes(c.id);
                    return (
                      <tr key={c.id} className={isSelected ? 'is-selected' : ''}>
                        <td className="check-cell">
                          {canCompare && (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={!isSelected && selected.length >= MAX_COMPARE}
                              onChange={() => toggle(c.id)}
                              aria-label={`Compare ${c.name}`}
                            />
                          )}
                        </td>
                        <td>
                          <div className="person-cell">
                            <Avatar name={c.name} size="md" />
                            <div>
                              <div className="row-gap name-line">
                                <Link to={`/app/candidates/${c.id}`} className="strong-link">
                                  {c.name}
                                </Link>
                                <button
                                  type="button"
                                  className={`star-toggle star-sm ${c.starred ? 'is-on' : ''}`}
                                  aria-pressed={c.starred}
                                  title={c.starred ? 'Remove from your watch list' : 'Add to your watch list'}
                                  onClick={async () => {
                                    await api.put(`/api/candidates/${c.id}/star`, { starred: !c.starred });
                                    setData({
                                      ...data,
                                      candidates: candidates.map((x) =>
                                        x.id === c.id ? { ...x, starred: !c.starred } : x,
                                      ),
                                    });
                                  }}
                                >
                                  <Icon name="star" size={13} filled={c.starred} />
                                </button>
                              </div>
                              <div className="tiny muted">
                                {c.email}
                                {c.timeMultiplier > 1 && ` · ${c.timeMultiplier}× time`}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <StatusBadge status={c.status} />
                          {c.submittedAt && <div className="tiny subtle">Submitted {formatDate(c.submittedAt)}</div>}
                        </td>
                        <td>
                          {c.aiStatus === 'done' ? (
                            <span className="score-cell">
                              <Score value={c.adjustedScore ?? c.aiScore} />
                              <RecommendationBadge value={c.aiRecommendation} />
                            </span>
                          ) : c.aiStatus === 'locked' ? (
                            <Link to="/app/plan" className="badge badge-locked">
                              <Icon name="lock" size={11} /> {AI_STATUS_LABEL.locked}
                            </Link>
                          ) : (
                            <span className="small muted">{c.aiStatus ? AI_STATUS_LABEL[c.aiStatus] : '—'}</span>
                          )}
                        </td>
                        <td>
                          {c.notableSignals > 0 ? (
                            <span
                              className="badge badge-warn"
                              title="Answers with notable integrity signals: probe these live"
                            >
                              {c.notableSignals} to probe
                            </span>
                          ) : (
                            <span className="subtle">—</span>
                          )}
                        </td>
                        <td className="small">
                          {c.verification ? (
                            [
                              c.verification.identity && IDENTITY_LABEL[c.verification.identity],
                              c.verification.consistency && CONSISTENCY_LABEL[c.verification.consistency],
                            ]
                              .filter(Boolean)
                              .join(', ') || 'Notes only'
                          ) : (
                            <span className="subtle">—</span>
                          )}
                        </td>
                        <td>
                          <DecisionBadge decision={c.decision} />
                        </td>
                        <td className="right">
                          {c.status === 'invited' || c.status === 'in_progress' ? (
                            <CopyButton text={candidateLink(c.token)} />
                          ) : (
                            <Link to={`/app/candidates/${c.id}`} className="btn btn-secondary btn-sm">
                              Review
                            </Link>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selected.length > 0 && (
        <div className="compare-bar" role="region" aria-label="Compare candidates">
          <span>
            <strong>{selected.length}</strong> selected
            {selected.length < 2 && <span className="muted"> · pick at least one more</span>}
          </span>
          <div className="row-gap">
            <button className="btn btn-ghost btn-sm" onClick={() => setSelected([])}>
              Clear
            </button>
            <button
              className="btn btn-primary btn-sm"
              disabled={selected.length < 2}
              onClick={() => navigate(`/app/assessments/${assessment.id}/compare?ids=${selected.join(',')}`)}
            >
              <Icon name="compare" size={14} />
              Compare side by side
            </button>
          </div>
        </div>
      )}

      {funnel && funnel.started > 0 && <Funnel funnel={funnel} />}
    </>
  );
}

interface InviteContext {
  assessmentId: string;
  title: string;
  minutes: number;
}

/** The invite email for one person, from the recruiter's own account. */
function useInviteEmail(ctx: InviteContext) {
  const { user } = useAuth();
  return (candidate: CandidateListItem) =>
    inviteEmail({
      candidateName: candidate.name,
      title: ctx.title,
      orgName: user?.orgName ?? '',
      senderName: user?.name ?? '',
      minutes: ctx.minutes,
      link: candidateLink(candidate.token),
    });
}

function InviteForm({ ctx, onInvited }: { ctx: InviteContext; onInvited: (candidates: CandidateListItem[]) => void }) {
  const [mode, setMode] = useState<'one' | 'many'>('one');
  return (
    <div className="card invite-card">
      <div className="row-between">
        <h2 className="section-title">Invite candidates</h2>
        <div className="segmented-filter" role="group" aria-label="How many">
          <button className={mode === 'one' ? 'is-active' : ''} onClick={() => setMode('one')}>
            One person
          </button>
          <button className={mode === 'many' ? 'is-active' : ''} onClick={() => setMode('many')}>
            Many at once
          </button>
        </div>
      </div>
      {mode === 'one' ? <InviteOne ctx={ctx} onInvited={onInvited} /> : <InviteMany ctx={ctx} onInvited={onInvited} />}
    </div>
  );
}

function TimeSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="field">
      <span>Time</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="1">Standard</option>
        <option value="1.25">1.25× (adjustment)</option>
        <option value="1.5">1.5× (adjustment)</option>
        <option value="2">2× (adjustment)</option>
      </select>
    </label>
  );
}

function InviteOne({ ctx, onInvited }: { ctx: InviteContext; onInvited: (c: CandidateListItem[]) => void }) {
  const [form, setForm] = useState({ name: '', email: '', timeMultiplier: '1' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<CandidateListItem | null>(null);
  const emailFor = useInviteEmail(ctx);

  async function invite(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { candidate } = await api.post<{ candidate: CandidateListItem }>(
        `/api/assessments/${ctx.assessmentId}/candidates`,
        { name: form.name, email: form.email, timeMultiplier: Number(form.timeMultiplier) },
      );
      onInvited([candidate]);
      setLast(candidate);
      setForm({ name: '', email: '', timeMultiplier: '1' });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const draft = last ? emailFor(last) : null;
  return (
    <>
      <form className="invite-form" onSubmit={invite}>
        <label className="field">
          <span>Name</span>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            maxLength={120}
          />
        </label>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
        </label>
        <TimeSelect value={form.timeMultiplier} onChange={(v) => setForm({ ...form, timeMultiplier: v })} />
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Creating…' : 'Create link'}
        </button>
      </form>
      <ErrorNote error={error} />
      {last && draft && (
        <div className="invite-result">
          <div>
            <strong>{last.name}</strong>'s private link is ready. Send it with the invite email; it opens the assessment
            directly, no account needed.
            <code className="link-code">{candidateLink(last.token)}</code>
          </div>
          <div className="row-gap">
            <a className="btn btn-primary btn-sm" href={mailtoHref(last.email, draft)}>
              <Icon name="mail" size={14} /> Email the invite
            </a>
            <CopyButton text={`Subject: ${draft.subject}\n\n${draft.body}`} label="Copy invite email" />
            <CopyButton text={candidateLink(last.token)} />
          </div>
        </div>
      )}
    </>
  );
}

function InviteMany({ ctx, onInvited }: { ctx: InviteContext; onInvited: (c: CandidateListItem[]) => void }) {
  const [text, setText] = useState('');
  const [timeMultiplier, setTimeMultiplier] = useState('1');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BulkInviteResult | null>(null);
  const emailFor = useInviteEmail(ctx);
  const parsed = parsePeople(text);

  async function loadFile(file: File | undefined) {
    if (!file) return;
    setText((await file.text()).trim());
  }

  async function invite(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<BulkInviteResult>(`/api/assessments/${ctx.assessmentId}/candidates/bulk`, {
        people: parsed.people,
        timeMultiplier: Number(timeMultiplier),
      });
      onInvited(res.created);
      setResult(res);
      setText('');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function download(created: CandidateListItem[]) {
    downloadCsv(`${ctx.title} invites.csv`, [
      ['Name', 'Email', 'Link', 'Subject', 'Message'],
      ...created.map((c) => {
        const draft = emailFor(c);
        return [c.name, c.email, candidateLink(c.token), draft.subject, draft.body];
      }),
    ]);
  }

  return (
    <>
      <form className="invite-many" onSubmit={invite}>
        <label className="field">
          <span>One person per line: name and email, in any order. Paste from a spreadsheet or upload a CSV.</span>
          <textarea
            rows={6}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'Asha Rao, asha@example.com\nRavi Menon <ravi@example.com>\nneha@example.com'}
          />
        </label>
        <div className="invite-many-row">
          <label className="btn btn-secondary btn-sm file-btn">
            <Icon name="upload" size={14} /> Upload CSV
            <input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={(e) => loadFile(e.target.files?.[0])} />
          </label>
          <TimeSelect value={timeMultiplier} onChange={setTimeMultiplier} />
          <span className="small muted invite-count">
            {parsed.people.length} {parsed.people.length === 1 ? 'person' : 'people'}
            {parsed.ignored.length > 0 &&
              ` · ${parsed.ignored.length} line${parsed.ignored.length === 1 ? '' : 's'} without an email skipped`}
          </span>
          <button className="btn btn-primary" disabled={busy || parsed.people.length === 0}>
            {busy ? 'Creating…' : `Create ${parsed.people.length || ''} link${parsed.people.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </form>
      <ErrorNote error={error} />
      {result && (
        <div className="invite-result invite-result-many">
          <div>
            <strong>
              {result.created.length} link{result.created.length === 1 ? '' : 's'} created.
            </strong>{' '}
            Download them with a ready invite email for each person, for a mail merge (Gmail, Outlook or YAMM), or copy
            the links.
            {result.skipped.length > 0 && (
              <ul className="small invite-skipped">
                {result.skipped.map((s, i) => (
                  <li key={i}>
                    Skipped {s.name || s.email || 'a row'}
                    {s.email && s.name ? ` (${s.email})` : ''}: {s.reason}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {result.created.length > 0 && (
            <div className="row-gap">
              <button type="button" className="btn btn-primary btn-sm" onClick={() => download(result.created)}>
                <Icon name="file" size={14} /> Download CSV
              </button>
              <CopyButton
                text={result.created.map((c) => `${c.name}\t${c.email}\t${candidateLink(c.token)}`).join('\n')}
                label="Copy all links"
              />
            </div>
          )}
        </div>
      )}
    </>
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Invited two days ago and not started, or started a day ago and not finished. */
function needsNudge(c: CandidateListItem, now: number) {
  if (c.status === 'invited' && now - c.createdAt > 2 * DAY_MS) return 'invited';
  if (c.status === 'in_progress' && c.startedAt && now - c.startedAt > DAY_MS) return 'started';
  return null;
}

function NudgePanel({ ctx, candidates }: { ctx: InviteContext; candidates: CandidateListItem[] }) {
  const { user } = useAuth();
  const [now] = useState(() => Date.now());
  const waiting = candidates
    .map((c) => ({ c, why: needsNudge(c, now) }))
    .filter((x): x is { c: CandidateListItem; why: 'invited' | 'started' } => x.why !== null);
  if (!waiting.length) return null;
  const reminder = (c: CandidateListItem, started: boolean) =>
    reminderEmail({
      candidateName: c.name,
      title: ctx.title,
      orgName: user?.orgName ?? '',
      senderName: user?.name ?? '',
      minutes: ctx.minutes,
      link: candidateLink(c.token),
      started,
    });
  const days = (ts: number) => Math.max(1, Math.floor((now - ts) / DAY_MS));
  return (
    <section className="card nudge-card">
      <div className="row-between">
        <div>
          <h2 className="section-title">
            Needs a nudge <span className="num muted">{waiting.length}</span>
          </h2>
          <p className="small muted">A short reminder brings most people back. Each one opens in your own email.</p>
        </div>
        <CopyButton text={waiting.map((x) => x.c.email).join(', ')} label="Copy all addresses" />
      </div>
      <ul className="nudge-list">
        {waiting.map(({ c, why }) => {
          const draft = reminder(c, why === 'started');
          return (
            <li key={c.id}>
              <Avatar name={c.name} size="md" />
              <div className="nudge-who">
                <Link to={`/app/candidates/${c.id}`} className="strong-link">
                  {c.name}
                </Link>
                <span className="tiny muted">
                  {why === 'started'
                    ? `Started ${days(c.startedAt!)} day${days(c.startedAt!) === 1 ? '' : 's'} ago, not finished`
                    : `Invited ${days(c.createdAt)} days ago, not started`}
                </span>
              </div>
              <a className="btn btn-secondary btn-sm" href={mailtoHref(c.email, draft)}>
                <Icon name="mail" size={14} /> Remind
              </a>
              <CopyButton text={`Subject: ${draft.subject}\n\n${draft.body}`} label="Copy" />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
