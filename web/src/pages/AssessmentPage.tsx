import { type FormEvent, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { AiReviewStatus, AssessmentDetail, AssessmentFunnel, CandidateListItem } from '../../../shared/api';
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
          assessmentId={assessment.id}
          onInvited={(candidate) => setData({ ...data, candidates: [candidate, ...candidates] })}
        />
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

function InviteForm({
  assessmentId,
  onInvited,
}: {
  assessmentId: string;
  onInvited: (candidate: CandidateListItem) => void;
}) {
  const [form, setForm] = useState({ name: '', email: '', timeMultiplier: '1' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<CandidateListItem | null>(null);

  async function invite(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { candidate } = await api.post<{ candidate: CandidateListItem }>(
        `/api/assessments/${assessmentId}/candidates`,
        { name: form.name, email: form.email, timeMultiplier: Number(form.timeMultiplier) },
      );
      onInvited(candidate);
      setLast(candidate);
      setForm({ name: '', email: '', timeMultiplier: '1' });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="row-between">
        <h2 className="section-title">Invite a candidate</h2>
        <span className="tiny subtle">They open the link directly; no account needed.</span>
      </div>
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
        <label className="field">
          <span>Time</span>
          <select value={form.timeMultiplier} onChange={(e) => setForm({ ...form, timeMultiplier: e.target.value })}>
            <option value="1">Standard</option>
            <option value="1.25">1.25× (adjustment)</option>
            <option value="1.5">1.5× (adjustment)</option>
            <option value="2">2× (adjustment)</option>
          </select>
        </label>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Creating…' : 'Create link'}
        </button>
      </form>
      <ErrorNote error={error} />
      {last && (
        <div className="invite-result">
          <div>
            <strong>{last.name}</strong>'s private link. Send it to them; it opens the assessment directly, no account
            needed.
            <code className="link-code">{candidateLink(last.token)}</code>
          </div>
          <CopyButton text={candidateLink(last.token)} />
        </div>
      )}
    </div>
  );
}
