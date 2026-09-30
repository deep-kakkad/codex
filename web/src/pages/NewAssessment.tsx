import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { RoleFamilySummary } from '../../../shared/api';
import type { Currency } from '../../../shared/types';
import { api, errorMessage } from '../api';
import { ErrorNote, KindBadge } from '../components/ui';
import { formatMinutes, useApi } from '../hooks';

export function NewAssessment() {
  const navigate = useNavigate();
  const { data, error: loadError } = useApi<{ families: RoleFamilySummary[] }>('/api/role-families');
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [currency, setCurrency] = useState<Currency>('INR');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const family = data?.families.find((f) => f.id === familyId);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!familyId) return;
    setBusy(true);
    try {
      const { id } = await api.post<{ id: string }>('/api/assessments', { roleFamilyId: familyId, title, currency });
      navigate(`/app/assessments/${id}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <Link to="/app" className="small muted">
            ← Assessments
          </Link>
          <h1>New assessment</h1>
        </div>
      </div>
      <ErrorNote error={loadError} />
      <h2 className="section-title">1. Choose a role family</h2>
      <div className="grid-cards">
        {data?.families.map((f) => {
          const select = () => {
            setFamilyId(f.id);
            if (!title) setTitle(f.roles[0]);
          };
          return (
            <div key={f.id} className={`card card-select ${familyId === f.id ? 'selected' : ''}`} onClick={select}>
              <div className="card-select-head">
                <label className="radio-title">
                  <input type="radio" name="family" checked={familyId === f.id} onChange={select} />
                  <span>{f.name}</span>
                </label>
                <span className="small muted">~{f.totalMinutes} min</span>
              </div>
              <p className="muted">{f.summary}</p>
              <div className="small">For: {f.roles.join(', ')}</div>
              <ol className="mini-outline">
                {f.stages.map((s) => (
                  <li key={s.id}>
                    <KindBadge kind={s.kind} /> {s.title}{' '}
                    <span className="muted">· {formatMinutes(s.timeLimitSec)}</span>
                  </li>
                ))}
              </ol>
              <Link to={`/app/library/${f.id}`} className="small" onClick={(e) => e.stopPropagation()}>
                Preview the full content →
              </Link>
            </div>
          );
        })}
      </div>

      {family && (
        <form className="card form-card" onSubmit={create}>
          <h2 className="section-title">2. Name it</h2>
          <label className="field">
            <span>Title candidates will see</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} />
          </label>
          <label className="field">
            <span>Currency used in the scenario</span>
            <select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
              <option value="INR">Indian rupee (₹)</option>
              <option value="USD">US dollar ($)</option>
            </select>
          </label>
          <ErrorNote error={error} />
          <button className="btn btn-primary" disabled={busy || !title.trim()}>
            {busy ? 'Creating…' : 'Create assessment'}
          </button>
        </form>
      )}
    </>
  );
}
