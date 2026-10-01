import { type FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { GenerationView } from '../../../shared/api';
import type { Currency } from '../../../shared/types';
import { api, errorMessage } from '../api';
import { formatDate, useApi } from '../hooks';
import { ErrorNote } from './ui';

const POLL_MS = 5000;

const STATUS_LABEL: Record<GenerationView['status'], string> = {
  pending: 'Queued',
  running: 'Writing…',
  done: 'Ready',
  failed: 'Failed',
};

/**
 * Recruiters describe a role and AI writes a scenario for it in the
 * background. Finished scenarios appear in the role library like any other.
 */
export function GenerateScenario({ canCreate, onReady }: { canCreate: boolean; onReady: () => void }) {
  const { data, error: loadError, reload } = useApi<{ generations: GenerationView[] }>('/api/generations');
  const [roleTitle, setRoleTitle] = useState('');
  const [description, setDescription] = useState('');
  const [currency, setCurrency] = useState<Currency>('INR');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const generations = data?.generations ?? [];
  const inFlight = generations.some((g) => g.status === 'pending' || g.status === 'running');
  const readyCount = generations.filter((g) => g.status === 'done').length;

  // Poll while something is being written; refresh the library when one finishes.
  useEffect(() => {
    if (!inFlight) return;
    const id = window.setInterval(() => void reload(), POLL_MS);
    return () => window.clearInterval(id);
  }, [inFlight, reload]);
  useEffect(() => {
    if (readyCount) onReady();
  }, [readyCount, onReady]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/generations', { roleTitle, description, currency });
      setRoleTitle('');
      setDescription('');
      await reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function act(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      await reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <section className="card generate-card" id="generate">
      <h2 className="section-title">Hiring for another role? Have AI write a scenario</h2>
      <p className="small muted">
        Describe the role and what good looks like. AI writes a scenario in the same format: a brief with numbers,
        think-aloud questions, a decision with situation changes, a critique with planted flaws, an AI-allowed task and
        an answer key. It takes a few minutes. Unlike the library's scenarios, every candidate gets the same numbers,
        and nobody has checked it yet: read the preview and answer key before you send it to candidates.
      </p>
      <ErrorNote error={loadError} />
      {canCreate && (
        <form onSubmit={submit} className="generate-form">
          <label className="field">
            <span>Role title</span>
            <input
              value={roleTitle}
              onChange={(e) => setRoleTitle(e.target.value)}
              placeholder="e.g. Field Sales Executive"
              maxLength={120}
              required
            />
          </label>
          <label className="field">
            <span>What does the job involve, and what separates a strong hire from a weak one?</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              minLength={40}
              maxLength={4000}
              required
              placeholder="e.g. Sells card machines to small merchants in one city. Visits 8–10 shops a day, reads a weekly territory report, decides where to spend time. Strong hires prioritise by data and handle objections honestly; weak ones chase volume."
            />
          </label>
          <label className="field field-inline">
            <span>Currency for amounts</span>
            <select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
              <option value="INR">Indian rupee (₹)</option>
              <option value="USD">US dollar ($)</option>
            </select>
          </label>
          <ErrorNote error={error} />
          <button className="btn btn-primary" disabled={busy || !roleTitle.trim() || description.trim().length < 40}>
            {busy ? 'Starting…' : 'Write a scenario'}
          </button>
        </form>
      )}

      {generations.length > 0 && (
        <ul className="generation-list">
          {generations.map((g) => (
            <li key={g.id} className="generation">
              <div>
                <strong>{g.name ?? g.roleTitle}</strong>{' '}
                <span className={`badge generation-${g.status}`}>{STATUS_LABEL[g.status]}</span>
                <div className="small muted">
                  {g.roleTitle} · {g.currency} · requested {formatDate(g.createdAt)}
                  {g.assessmentCount > 0 &&
                    ` · used by ${g.assessmentCount} assessment${g.assessmentCount > 1 ? 's' : ''}`}
                </div>
                {g.status === 'running' && <div className="small muted">Usually takes 3–8 minutes.</div>}
                {g.status === 'failed' && g.error && <div className="small error-text">{g.error}</div>}
              </div>
              <div className="row-gap">
                {g.status === 'done' && (
                  <>
                    <Link to={`/app/library/${g.id}`} className="btn btn-secondary btn-sm">
                      Preview
                    </Link>
                    {canCreate && (
                      <Link to={`/app/new?family=${g.id}`} className="btn btn-secondary btn-sm">
                        Use it
                      </Link>
                    )}
                  </>
                )}
                {canCreate && g.status === 'failed' && (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => act(() => api.post(`/api/generations/${g.id}/retry`))}
                  >
                    Try again
                  </button>
                )}
                {canCreate && g.status !== 'running' && g.assessmentCount === 0 && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      if (window.confirm(`Delete "${g.name ?? g.roleTitle}"?`))
                        void act(() => api.del(`/api/generations/${g.id}`));
                    }}
                  >
                    Delete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
