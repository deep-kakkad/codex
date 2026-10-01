import { Link, useNavigate } from 'react-router-dom';
import type { CandidateAssessmentItem } from '../../../shared/candidateApi';
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
                <span className="badge badge-status-decided">{STATUS[a.status]}</span>
              ) : (
                <Link to={`/c/${a.token}`} className="btn btn-primary">
                  {a.status === 'invited' ? 'Start' : 'Continue'}
                </Link>
              )}
            </div>
          ))
        )}
      </main>
    </div>
  );
}
