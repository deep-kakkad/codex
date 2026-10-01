import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { RoleFamilySummary } from '../../../shared/api';
import { useAuth } from '../auth';
import { GenerateScenario } from '../components/GenerateScenario';
import { ErrorNote, KindBadge } from '../components/ui';
import { formatMinutes, useApi } from '../hooks';

export function GeneratedBadge() {
  return (
    <span className="badge badge-generated" title="Written by AI for your team; not checked by a practitioner">
      AI-generated
    </span>
  );
}

export function RoleLibrary() {
  const { user } = useAuth();
  const { data, error, reload } = useApi<{ families: RoleFamilySummary[] }>('/api/role-families');
  const { hash } = useLocation();
  useEffect(() => {
    if (data && hash === '#generate') document.getElementById('generate')?.scrollIntoView();
  }, [data, hash]);
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
              <h3>
                {f.name} {f.generated && <GeneratedBadge />}
              </h3>
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
      <GenerateScenario canCreate={user?.role === 'manager'} onReady={reload} />
    </>
  );
}
