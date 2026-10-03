import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { RoleFamilySummary } from '../../../shared/api';
import { useAuth } from '../auth';
import { GenerateScenario } from '../components/GenerateScenario';
import { RoleCatalog } from '../components/RoleCatalog';
import { ErrorNote } from '../components/ui';
import { useApi } from '../hooks';

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
      <RoleCatalog
        families={data?.families ?? []}
        action={(f) => (
          <>
            {f.generated && <GeneratedBadge />}
            <Link to={`/app/library/${f.id}`} className="btn btn-secondary btn-sm">
              Preview content and answer key
            </Link>
          </>
        )}
        empty={
          <p className="muted">
            No ready-made role matches. <a href="#generate">Have AI write one</a> from a description or job post.
          </p>
        }
      />
      <GenerateScenario canCreate={user?.role === 'manager'} onReady={reload} />
    </>
  );
}
