import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { GenerationView } from '../../../shared/api';
import { api, errorMessage } from '../api';
import { Icon } from '../components/Icon';
import { ErrorNote } from '../components/ui';
import { useDemo } from '../demo/mode';
import { useApi } from '../hooks';

const POLL_MS = 4000;

/** Rough phases of writing a scenario, by elapsed time; the server doesn't report finer progress. */
const STEPS = [
  { label: 'Reading your job description', until: 30 },
  { label: 'Writing a realistic scenario with real numbers', until: 200 },
  { label: 'Writing the questions, answer key and rubrics', until: 320 },
  { label: 'Checking the arithmetic and the answer key', until: Infinity },
];

/** Waits while AI builds an assessment from a pasted job description, then hands over to setup. */
export function FromJobDescription() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: gen, error, reload } = useApi<GenerationView>(`/api/generations/${id}`);
  const [now, setNow] = useState(() => Date.now());
  const [retryError, setRetryError] = useState<string | null>(null);
  const working = gen?.status === 'pending' || gen?.status === 'running';
  const demo = useDemo();

  useEffect(() => {
    if (!working) return;
    const poll = window.setInterval(() => void reload(), POLL_MS);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(tick);
    };
  }, [working, reload]);

  useEffect(() => {
    if (gen?.status === 'done') navigate(`/app/new?family=${gen.id}&from=jd`, { replace: true });
  }, [gen?.status]);

  if (error) return <ErrorNote error={error} />;
  if (!gen) return <p className="muted">Loading…</p>;
  const elapsed = Math.max(0, Math.round((now - gen.createdAt) / 1000));
  const current = STEPS.findIndex((s) => elapsed < s.until);

  return (
    <div className="jd-progress">
      <Link to="/app/new" className="back-link">
        <Icon name="back" size={14} />
        New assessment
      </Link>
      <section className="card jd-card">
        <span className="plan-eyebrow">Building from your job description</span>
        <h1 className="jd-title">{gen.roleTitle}</h1>
        {gen.status === 'failed' ? (
          <>
            <p className="error-text">{gen.error ?? 'Something went wrong.'}</p>
            <button
              className="btn btn-primary"
              onClick={async () => {
                try {
                  await api.post(`/api/generations/${gen.id}/retry`);
                  await reload();
                } catch (e) {
                  setRetryError(errorMessage(e));
                }
              }}
            >
              Try again
            </button>
            <ErrorNote error={retryError} />
          </>
        ) : (
          <>
            <ol className="jd-steps">
              {STEPS.map((step, i) => (
                <li key={step.label} className={i < current ? 'is-done' : i === current ? 'is-now' : ''}>
                  <span className="jd-step-dot" aria-hidden="true">
                    {i < current ? (
                      <Icon name="check" size={12} />
                    ) : i === current ? (
                      <span className="spinner" />
                    ) : null}
                  </span>
                  {step.label}
                </li>
              ))}
            </ol>
            {demo ? (
              <p className="small muted">
                In the demo, AI doesn't run: in a few seconds you'll get the closest ready-made scenario instead. A real
                build takes 3 to 6 minutes and is written for your role, from your job description.
              </p>
            ) : (
              <p className="small muted">
                This usually takes 3 to 6 minutes ({Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')} so
                far). You can leave this page: it keeps going, and the finished scenario appears in your{' '}
                <Link to="/app/library">role library</Link>.
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
