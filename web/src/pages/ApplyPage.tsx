import { type FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { ApplyPreview } from '../../../shared/api';
import { api, errorMessage } from '../api';
import { Icon } from '../components/Icon';
import { Logo } from '../components/Logo';
import { CopyButton, ErrorNote } from '../components/ui';
import { formatMinutes, useApi } from '../hooks';

/** The public apply link: put yourself forward, get your own private assessment link. */
export function ApplyPage() {
  const { token } = useParams();
  const { data, error } = useApi<ApplyPreview>(`/api/apply/${token}`);
  const [form, setForm] = useState({ name: '', email: '', website: '' });
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);

  useEffect(() => {
    if (data) document.title = `Apply: ${data.title} · ${data.orgName}`;
  }, [data]);

  async function apply(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setSendError(null);
    try {
      const result = await api.post<{ token: string }>(`/api/apply/${token}`, form);
      setLink(`/c/${result.token}`);
    } catch (e) {
      setSendError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div className="candidate-shell">
        <main className="candidate-main narrow center">
          <div className="done-mark" aria-hidden="true">
            <Logo size={48} />
          </div>
          <h1>This apply link isn’t open.</h1>
          <p className="lead">{error}</p>
        </main>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="candidate-shell">
        <p className="candidate-main narrow muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="candidate-shell">
      <header className="candidate-header">
        <div className="candidate-header-inner">
          <div>
            <div className="small muted">{data.orgName}</div>
            <div className="candidate-title">{data.title}</div>
          </div>
        </div>
      </header>
      <main className="candidate-main narrow">
        {link ? (
          <section className="apply-done">
            <span className="apply-done-mark" aria-hidden="true">
              <Icon name="check" size={26} />
            </span>
            <h1>You’re in, {form.name.trim().split(/\s+/)[0]}.</h1>
            <p className="lead">
              This is your own private link to the assessment. Save it: it’s how you come back if you stop halfway, and
              we don’t email it to you.
            </p>
            <div className="apply-link-box">
              <code className="link-code">{`${window.location.origin}${link}`}</code>
              <CopyButton text={`${window.location.origin}${link}`} />
            </div>
            <Link to={link} className="btn btn-primary btn-lg">
              Start now <Icon name="arrow" size={16} />
            </Link>
            <p className="muted small">Or come back to the link whenever suits you.</p>
          </section>
        ) : (
          <>
            <h1>Apply for {data.title}</h1>
            <p className="lead">
              {data.orgName} asks everyone to do a short, practical assessment built around a real situation from the
              job, instead of screening CVs. You can start as soon as you apply.
            </p>
            <ul className="apply-facts">
              <li>
                <Icon name="clock" size={16} /> {data.questions} questions, about{' '}
                {formatMinutes(data.totalMinutes * 60)}
              </li>
              {data.thinkAloud && (
                <li>
                  <Icon name="mic" size={16} /> Some questions record you thinking out loud (audio only)
                </li>
              )}
              {data.aiAllowed && (
                <li>
                  <Icon name="sparkle" size={16} /> One task allows any AI tool
                </li>
              )}
              <li>
                <Icon name="shield" size={16} /> No camera, no account, nothing to install
              </li>
            </ul>
            <form className="card apply-form" onSubmit={apply}>
              <label className="field">
                <span>Your full name</span>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  maxLength={120}
                  autoComplete="name"
                />
              </label>
              <label className="field">
                <span>Your email</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                  autoComplete="email"
                />
              </label>
              {/* Left empty by people; bots fill it in. */}
              <label className="hp-field" aria-hidden="true">
                Website
                <input
                  tabIndex={-1}
                  autoComplete="off"
                  value={form.website}
                  onChange={(e) => setForm({ ...form, website: e.target.value })}
                />
              </label>
              <ErrorNote error={sendError} />
              <button className="btn btn-primary btn-lg" disabled={busy}>
                {busy ? 'Applying…' : 'Apply and get my link'}
              </button>
              <p className="muted small">
                Your name and email go to {data.orgName} for this application.{' '}
                <Link to="/privacy" target="_blank" rel="noopener">
                  How we handle your data
                </Link>
              </p>
            </form>
          </>
        )}
      </main>
      <footer className="candidate-footer small muted">
        <Logo size={14} /> Assessment by Proofwork. AI reviews your answers; people at the company make every decision.
        <Link to="/privacy" target="_blank" rel="noopener">
          Privacy
        </Link>
      </footer>
    </div>
  );
}
