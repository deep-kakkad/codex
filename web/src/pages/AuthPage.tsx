import { type FormEvent, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import type { LoginResult } from '../../../shared/api';
import { REFERRAL_REVIEWS } from '../../../shared/plans';
import { ApiError, api, errorMessage } from '../api';
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
  const [form, setForm] = useState({
    orgName: '',
    name: params.get('name') ?? '',
    email: params.get('email') ?? '',
    password: '',
  });
  const [error, setError] = useState<string | null>(null);
  // Set when the password checked out and the authenticator code comes next.
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  // Joining through another team's referral link adds free reviews to the new workspace.
  const ref = /^[a-z0-9]{8}$/.test(params.get('ref') ?? '') ? params.get('ref') : null;
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
      if (challenge) {
        await api.post<LoginResult>('/api/auth/login/verify', { challenge, code });
      } else if (mode === 'login') {
        const result = await api.post<LoginResult>(`${base}/login`, { email: form.email, password: form.password });
        if (result.twoFactor && result.challenge) {
          setChallenge(result.challenge);
          setBusy(false);
          return;
        }
      } else if (type === 'candidate') {
        await api.post(`${base}/signup`, { name: form.name, email: form.email, password: form.password });
      } else {
        await api.post(`${base}/signup`, { ...form, ref });
      }
      await refresh();
      navigate(next, { replace: true });
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
      // An expired or used-up sign-in starts again from the password.
      if (challenge && e instanceof ApiError && e.status === 401 && /expired/.test(e.message)) setChallenge(null);
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
      {challenge ? (
        <form className="card auth-card" onSubmit={submit}>
          <h1>Two-factor sign-in</h1>
          <p className="muted small">
            Enter the 6-digit code from your authenticator app. Lost your phone? Use one of your recovery codes instead.
          </p>
          <label className="field">
            <span>Code</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              autoFocus
              inputMode="text"
              autoComplete="one-time-code"
              maxLength={40}
              placeholder="123456"
            />
          </label>
          <ErrorNote error={error} />
          <button className="btn btn-primary btn-block" disabled={busy || !code.trim()}>
            {busy ? 'Checking…' : 'Sign in'}
          </button>
          <p className="small muted center">
            <button
              type="button"
              className="link-button"
              onClick={() => {
                setChallenge(null);
                setCode('');
                setError(null);
              }}
            >
              Use a different account
            </button>
          </p>
        </form>
      ) : (
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
          {mode === 'signup' && type === 'recruiter' && ref && (
            <p className="auth-referral">
              You were invited by another hiring team: your workspace starts with {REFERRAL_REVIEWS} extra free reviews.
            </p>
          )}
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
      )}
    </div>
  );
}
