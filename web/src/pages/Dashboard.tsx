import { Link } from 'react-router-dom';
import type { AssessmentSummary } from '../../../shared/api';
import { useAuth } from '../auth';
import { Icon } from '../components/Icon';
import { EmptyState, ErrorNote } from '../components/ui';
import { formatDate, useApi } from '../hooks';

export function Dashboard() {
  const { user } = useAuth();
  const { data, error, loading } = useApi<{ assessments: AssessmentSummary[] }>('/api/assessments');
  const assessments = data?.assessments ?? [];
  const total = (pick: (a: AssessmentSummary) => number) => assessments.reduce((sum, a) => sum + pick(a), 0);
  const toReview = total((a) => a.counts.submitted + a.counts.reviewed);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Assessments</h1>
          <p className="muted">
            {toReview > 0
              ? `${toReview} candidate${toReview === 1 ? ' is' : 's are'} waiting for your decision.`
              : 'Everything is up to date.'}
          </p>
        </div>
        {user?.role === 'manager' && (
          <Link to="/app/new" className="btn btn-primary">
            <Icon name="plus" size={14} />
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
          <div className="row-gap" style={{ justifyContent: 'center' }}>
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
        <>
          <div className="kpis">
            <Kpi label="Waiting for a decision" value={toReview} attention />
            <Kpi label="Taking the assessment" value={total((a) => a.counts.in_progress)} />
            <Kpi label="Invited, not started" value={total((a) => a.counts.invited)} />
            <Kpi label="Decided" value={total((a) => a.counts.decided)} />
          </div>
          <div className="grid-cards">
            {assessments.map((a) => (
              <AssessmentCard key={a.id} assessment={a} />
            ))}
          </div>
        </>
      )}
    </>
  );
}

function Kpi({ label, value, attention }: { label: string; value: number; attention?: boolean }) {
  return (
    <div className={`kpi ${attention && value > 0 ? 'kpi-attention' : ''}`}>
      <div className="kpi-value">{value}</div>
      <div className="kpi-label">{label}</div>
    </div>
  );
}

function AssessmentCard({ assessment: a }: { assessment: AssessmentSummary }) {
  const toReview = a.counts.submitted + a.counts.reviewed;
  const segments = [
    { key: 'p-invited', label: 'Invited', value: a.counts.invited },
    { key: 'p-progress', label: 'In progress', value: a.counts.in_progress },
    { key: 'p-review', label: 'To review', value: toReview, attention: true },
    { key: 'p-decided', label: 'Decided', value: a.counts.decided },
  ];
  const total = Math.max(1, a.candidateCount);
  return (
    <Link to={`/app/assessments/${a.id}`} className="card card-link assessment-card">
      <div className="row-between">
        <span className="small muted">{a.roleFamilyName}</span>
        {toReview > 0 && <span className="badge badge-warn badge-dot">{toReview} to review</span>}
      </div>
      <h3>{a.title}</h3>
      <div className="pipeline" aria-hidden="true">
        {segments.map((s) =>
          s.value > 0 ? <span key={s.key} className={s.key} style={{ width: `${(s.value / total) * 100}%` }} /> : null,
        )}
      </div>
      <div className="pipeline-legend">
        {segments.map((s) => (
          <span key={s.key} className={s.attention && s.value > 0 ? 'attention' : ''}>
            <span className={`legend-dot ${s.key}`} />
            <b>{s.value}</b> {s.label.toLowerCase()}
          </span>
        ))}
      </div>
      <div className="tiny subtle">
        {a.candidateCount} candidate{a.candidateCount === 1 ? '' : 's'} · created {formatDate(a.createdAt)} ·{' '}
        {a.currency}
      </div>
    </Link>
  );
}
