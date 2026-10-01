import { type FormEvent, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { useAuth } from '../auth';
import { Logo } from '../components/Logo';
import { ErrorNote } from '../components/ui';

type AccountType = 'recruiter' | 'candidate';

/** Only same-site paths, so a crafted link can't bounce people elsewhere. */
function safeNext(value: string | null) {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : null;
}

export function AuthPage({ mode }: { mode: 'login' | 'signup' }) {
  const { user, candidate, refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [type, setType] = useState<AccountType>(params.get('as') === 'candidate' ? 'candidate' : 'recruiter');
  const [form, setForm] = useState({ orgName: '', name: '', email: params.get('email') ?? '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const next =
    safeNext(params.get('next')) ??
    (location.state as { from?: string } | null)?.from ??
    (type === 'candidate' ? '/candidate' : '/app');

  if (type === 'recruiter' && user) return <Navigate to={next} replace />;
  if (type === 'candidate' && candidate) return <Navigate to={next} replace />;

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [key]: e.target.value });

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const base = type === 'candidate' ? '/api/candidate/auth' : '/api/auth';
    try {
      if (mode === 'login') {
        await api.post(`${base}/login`, { email: form.email, password: form.password });
      } else if (type === 'candidate') {
        await api.post(`${base}/signup`, { name: form.name, email: form.email, password: form.password });
      } else {
        await api.post(`${base}/signup`, form);
      }
      await refresh();
      navigate(next, { replace: true });
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  const switchLink = (target: 'login' | 'signup') => {
    const query = new URLSearchParams(params);
    query.set('as', type);
    if (form.email) query.set('email', form.email);
    return `/${target}?${query.toString()}`;
  };

  return (
    <div className="auth-page">
      <Link to="/" className="brand auth-brand">
        <Logo /> Proofwork
      </Link>
      <form className="card auth-card" onSubmit={submit}>
        <div className="segmented full" role="tablist" aria-label="Account type">
          {(
            [
              ['recruiter', "I'm hiring"],
              ['candidate', "I'm a candidate"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={type === value}
              className={type === value ? 'active' : ''}
              onClick={() => setType(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <h1>
          {mode === 'signup'
            ? type === 'candidate'
              ? 'Create your candidate account'
              : 'Create your hiring workspace'
            : type === 'candidate'
              ? 'Candidate log in'
              : 'Recruiter log in'}
        </h1>
        {mode === 'signup' && type === 'recruiter' && (
          <label className="field">
            <span>Company name</span>
            <input
              value={form.orgName}
              onChange={set('orgName')}
              required
              maxLength={120}
              autoComplete="organization"
            />
          </label>
        )}
        {mode === 'signup' && (
          <label className="field">
            <span>Your name</span>
            <input value={form.name} onChange={set('name')} required maxLength={120} autoComplete="name" />
          </label>
        )}
        <label className="field">
          <span>{type === 'candidate' ? 'Email (the one your invitation was sent to)' : 'Work email'}</span>
          <input type="email" value={form.email} onChange={set('email')} required autoComplete="email" />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={form.password}
            onChange={set('password')}
            required
            minLength={mode === 'signup' ? 8 : undefined}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          />
          {mode === 'signup' && <small className="muted">At least 8 characters.</small>}
        </label>
        <ErrorNote error={error} />
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Log in'}
        </button>
        <p className="small muted center">
          {mode === 'signup' ? (
            <>
              Already have an account? <Link to={switchLink('login')}>Log in</Link>
            </>
          ) : (
            <>
              New here? <Link to={switchLink('signup')}>Create an account</Link>
            </>
          )}
        </p>
      </form>
    </div>
  );
}
