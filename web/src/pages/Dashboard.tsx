import { Link } from 'react-router-dom';
import type { AssessmentSummary } from '../../../shared/api';
import { useAuth } from '../auth';
import { EmptyState, ErrorNote } from '../components/ui';
import { formatDate, useApi } from '../hooks';

export function Dashboard() {
  const { user } = useAuth();
  const { data, error, loading } = useApi<{ assessments: AssessmentSummary[] }>('/api/assessments');
  const assessments = data?.assessments ?? [];
  const awaiting = assessments.reduce((sum, a) => sum + a.counts.submitted, 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Assessments</h1>
          {awaiting > 0 && (
            <p className="muted">
              {awaiting} candidate{awaiting === 1 ? '' : 's'} waiting for review.
            </p>
          )}
        </div>
        {user?.role === 'manager' && (
          <Link to="/app/new" className="btn btn-primary">
            New assessment
          </Link>
        )}
      </div>
      <ErrorNote error={error} />
      {loading && !data ? (
        <p className="muted">Loading…</p>
      ) : assessments.length === 0 ? (
        <EmptyState title="No assessments yet">
          <p className="muted">Create an assessment from a role family, then invite candidates with a private link.</p>
          <div className="row-gap">
            {user?.role === 'manager' && (
              <Link to="/app/new" className="btn btn-primary">
                Create your first assessment
              </Link>
            )}
            <Link to="/app/library" className="btn btn-secondary">
              Browse the role library
            </Link>
          </div>
        </EmptyState>
      ) : (
        <div className="grid-cards">
          {assessments.map((a) => (
            <Link key={a.id} to={`/app/assessments/${a.id}`} className="card card-link assessment-card">
              <div className="small muted">{a.roleFamilyName}</div>
              <h3>{a.title}</h3>
              <div className="stat-row">
                <Stat label="Invited" value={a.candidateCount} />
                <Stat label="In progress" value={a.counts.in_progress} />
                <Stat label="To review" value={a.counts.submitted} highlight />
                <Stat label="Decided" value={a.counts.decided} />
              </div>
              <div className="small muted">
                Created {formatDate(a.createdAt)} · {a.currency}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`stat ${highlight && value > 0 ? 'stat-highlight' : ''}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
