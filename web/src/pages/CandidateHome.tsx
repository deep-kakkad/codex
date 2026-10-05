import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { CandidateAssessmentItem } from '../../../shared/candidateApi';
import { api, errorMessage } from '../api';
import { useAuth } from '../auth';
import { Logo } from '../components/Logo';
import { EmptyState, ErrorNote } from '../components/ui';
import { formatDate, useApi } from '../hooks';

const STATUS: Record<CandidateAssessmentItem['status'], string> = {
  invited: 'Not started',
  in_progress: 'In progress',
  submitted: 'Submitted',
};

/** A candidate's own dashboard: every assessment they've been invited to. */
export function CandidateHome() {
  const { candidate, logoutCandidate } = useAuth();
  const navigate = useNavigate();
  const { data, error, loading } = useApi<{ assessments: CandidateAssessmentItem[] }>('/api/candidate/assessments');

  return (
    <div className="candidate-shell">
      <header className="candidate-header">
        <div className="candidate-header-inner">
          <Link to="/candidate" className="brand">
            <Logo /> Proofwork
          </Link>
          <div className="topbar-user">
            <span className="muted small">{candidate?.name}</span>
            <button
              className="btn btn-ghost btn-sm"
              onClick={async () => {
                await logoutCandidate();
                navigate('/');
              }}
            >
              Log out
            </button>
          </div>
        </div>
      </header>
      <main className="candidate-main narrow">
        <h1>Your assessments</h1>
        <p className="muted">Invitations sent to {candidate?.email} appear here.</p>
        <ErrorNote error={error} />
        {loading && !data ? (
          <p className="muted">Loading…</p>
        ) : !data?.assessments.length ? (
          <EmptyState title="No invitations yet">
            <p className="muted">
              When a company invites you, open the link in their email. Make sure it was sent to {candidate?.email}.
            </p>
          </EmptyState>
        ) : (
          data.assessments.map((a) => (
            <div key={a.token} className="card row-between candidate-item">
              <div>
                <div className="small muted">{a.orgName}</div>
                <h3>{a.title}</h3>
                <div className="small muted">
                  Invited {formatDate(a.invitedAt)}
                  {a.submittedAt && ` · submitted ${formatDate(a.submittedAt)}`}
                </div>
              </div>
              {a.status === 'submitted' ? (
                <div className="candidate-item-actions">
                  <span className="badge badge-status-decided">{STATUS[a.status]}</span>
                  <Link to={`/c/${a.token}`} className="small">
                    Your data
                  </Link>
                </div>
              ) : (
                <Link to={`/c/${a.token}`} className="btn btn-primary">
                  {a.status === 'invited' ? 'Start' : 'Continue'}
                </Link>
              )}
            </div>
          ))
        )}
        <DeleteAccount />
      </main>
    </div>
  );
}

/** Deletes the candidate account. Answers stay with each assessment, where they can be deleted too. */
function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/candidate/auth/delete-account', { password });
      // A fresh start: the signed-in state is gone.
      window.location.assign('/');
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <section className="card your-data">
      <h2>Your account</h2>
      <p className="muted small">
        Deleting your account removes your login and this list. Answers you gave stay with each company until you delete
        them: open an assessment and choose “Your data”.{' '}
        <Link to="/privacy" target="_blank" rel="noopener">
          How we handle your data
        </Link>
      </p>
      {!open ? (
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(true)}>
          Delete my account
        </button>
      ) : (
        <form className="your-data-confirm" onSubmit={submit}>
          <label className="field">
            <span>Your password, to confirm</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <div className="row-gap">
            <button className="btn btn-danger btn-sm" disabled={busy || !password}>
              {busy ? 'Deleting…' : 'Delete my account'}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
          <ErrorNote error={error} />
        </form>
      )}
    </section>
  );
}
