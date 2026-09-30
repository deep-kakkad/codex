import { type FormEvent, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { useAuth } from '../auth';
import { Logo } from '../components/Logo';
import { ErrorNote } from '../components/ui';

export function AuthPage({ mode }: { mode: 'login' | 'signup' }) {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ orgName: '', name: '', email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const from = (location.state as { from?: string } | null)?.from ?? '/app';

  if (user) return <Navigate to={from} replace />;

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [key]: e.target.value });

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'signup') await api.post('/api/auth/signup', form);
      else await api.post('/api/auth/login', { email: form.email, password: form.password });
      await refresh();
      navigate(from, { replace: true });
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <Link to="/" className="brand auth-brand">
        <Logo /> Proofwork
      </Link>
      <form className="card auth-card" onSubmit={submit}>
        <h1>{mode === 'signup' ? 'Create your hiring workspace' : 'Log in'}</h1>
        {mode === 'signup' && (
          <>
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
            <label className="field">
              <span>Your name</span>
              <input value={form.name} onChange={set('name')} required maxLength={120} autoComplete="name" />
            </label>
          </>
        )}
        <label className="field">
          <span>Work email</span>
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
          {busy ? 'Please wait…' : mode === 'signup' ? 'Create workspace' : 'Log in'}
        </button>
        <p className="small muted center">
          {mode === 'signup' ? (
            <>
              Already have an account? <Link to="/login">Log in</Link>
            </>
          ) : (
            <>
              New here? <Link to="/signup">Create a workspace</Link>
            </>
          )}
        </p>
      </form>
    </div>
  );
}
