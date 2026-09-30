import { Link } from 'react-router-dom';
import type { RoleFamilySummary } from '../../../shared/api';
import { ErrorNote, KindBadge } from '../components/ui';
import { formatMinutes, useApi } from '../hooks';

export function RoleLibrary() {
  const { data, error } = useApi<{ families: RoleFamilySummary[] }>('/api/role-families');
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Role library</h1>
          <p className="muted">
            Each role family is written by practitioners: a realistic scenario, questions that build on each other,
            planted flaws to find, and rubrics with behavioural anchors.
          </p>
        </div>
      </div>
      <ErrorNote error={error} />
      <div className="grid-cards">
        {data?.families.map((f) => (
          <div key={f.id} className="card">
            <div className="card-select-head">
              <h3>{f.name}</h3>
              <span className="small muted">~{f.totalMinutes} min</span>
            </div>
            <p className="muted">{f.summary}</p>
            <div className="small">For: {f.roles.join(', ')}</div>
            <ol className="mini-outline">
              {f.stages.map((s) => (
                <li key={s.id}>
                  <KindBadge kind={s.kind} /> {s.title} <span className="muted">· {formatMinutes(s.timeLimitSec)}</span>
                </li>
              ))}
            </ol>
            <Link to={`/app/library/${f.id}`} className="btn btn-secondary btn-sm">
              Preview content and answer key
            </Link>
          </div>
        ))}
      </div>
    </>
  );
}
