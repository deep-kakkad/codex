import { type FormEvent, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { AssessmentDetail, CandidateListItem } from '../../../shared/api';
import { api, errorMessage } from '../api';
import { useAuth } from '../auth';
import { CopyButton, DecisionBadge, EmptyState, ErrorNote, Score, StatusBadge, candidateLink } from '../components/ui';
import { formatDate, useApi } from '../hooks';

const IDENTITY_LABEL: Record<string, string> = {
  verified: 'ID verified',
  not_verified: 'ID not verified',
  not_checked: 'ID not checked',
};
const CONSISTENCY_LABEL: Record<string, string> = {
  consistent: 'consistent',
  partly: 'partly consistent',
  inconsistent: 'inconsistent',
};

export function AssessmentPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data, setData, error } = useApi<AssessmentDetail>(`/api/assessments/${id}`);

  if (error) return <ErrorNote error={error} />;
  if (!data) return <p className="muted">Loading…</p>;
  const { assessment, family, candidates } = data;

  return (
    <>
      <div className="page-head">
        <div>
          <Link to="/app" className="small muted">
            ← Assessments
          </Link>
          <h1>{assessment.title}</h1>
          <p className="muted">
            {family.name} · {family.stages.length} questions · ~{family.totalMinutes} min · {assessment.currency} ·{' '}
            <Link to={`/app/library/${family.id}?currency=${assessment.currency}`}>Preview what candidates see</Link>
          </p>
        </div>
      </div>

      {user?.role === 'manager' && (
        <InviteForm
          assessmentId={assessment.id}
          onInvited={(candidate) => setData({ ...data, candidates: [candidate, ...candidates] })}
        />
      )}

      <h2 className="section-title">Candidates</h2>
      {candidates.length === 0 ? (
        <EmptyState title="No candidates yet">
          <p className="muted">Invite someone above. You'll get a private link to send them.</p>
        </EmptyState>
      ) : (
        <div className="table-scroll card flush">
          <table className="list-table">
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Status</th>
                <th>Submitted</th>
                <th>Your score</th>
                <th>Team</th>
                <th>Signals</th>
                <th>Verification</th>
                <th>Decision</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link to={`/app/candidates/${c.id}`} className="strong-link">
                      {c.name}
                    </Link>
                    <div className="small muted">
                      {c.email}
                      {c.timeMultiplier > 1 && ` · ${c.timeMultiplier}× time`}
                    </div>
                  </td>
                  <td>
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="small">{formatDate(c.submittedAt)}</td>
                  <td>
                    <Score value={c.myScore} />
                  </td>
                  <td>
                    {c.teamScore !== null ? (
                      <Score value={c.teamScore} />
                    ) : (
                      <span className="small muted">{c.reviewCount > 0 ? `${c.reviewCount} hidden` : '—'}</span>
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
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td className="small">
                    {c.verification
                      ? [
                          c.verification.identity && IDENTITY_LABEL[c.verification.identity],
                          c.verification.consistency && CONSISTENCY_LABEL[c.verification.consistency],
                        ]
                          .filter(Boolean)
                          .join(', ') || 'Notes only'
                      : '—'}
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
              ))}
            </tbody>
          </table>
        </div>
      )}
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
      <h2 className="section-title">Invite a candidate</h2>
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
            <strong>{last.name}</strong>'s private link. Send it to them yourself; each link has its own version of the
            scenario.
            <code className="link-code">{candidateLink(last.token)}</code>
          </div>
          <CopyButton text={candidateLink(last.token)} />
        </div>
      )}
    </div>
  );
}
