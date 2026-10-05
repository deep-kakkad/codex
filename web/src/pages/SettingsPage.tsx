import { type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AccountSecurity, AuditEvent, PrivacySettings } from '../../../shared/api';
import { RECORDING_DAY_OPTIONS } from '../../../shared/privacy';
import { api, errorMessage } from '../api';
import { useAuth } from '../auth';
import { Icon } from '../components/Icon';
import { ErrorNote } from '../components/ui';
import { formatDate, useApi } from '../hooks';

export function SettingsPage() {
  const { user } = useAuth();
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="muted">How you sign in, and everything that has happened in your workspace.</p>
        </div>
      </div>
      <TwoFactor />
      <OtherDevices />
      <DataPrivacy manager={user?.role === 'manager'} />
      {user?.role === 'manager' && <Activity />}
    </>
  );
}

// Two-factor sign-in ------------------------------------------------------------------

function TwoFactor() {
  const { data: security, setData, error } = useApi<AccountSecurity>('/api/auth/security');
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [mode, setMode] = useState<'idle' | 'disable' | 'regenerate'>('idle');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function act<T>(run: () => Promise<T>) {
    setBusy(true);
    setActionError(null);
    try {
      return await run();
    } catch (e) {
      setActionError(errorMessage(e));
      return null;
    } finally {
      setBusy(false);
    }
  }

  const begin = () => act(async () => setSetup(await api.post<{ secret: string; qr: string }>('/api/auth/2fa/setup')));

  async function confirm(event: FormEvent) {
    event.preventDefault();
    const result = await act(() =>
      api.post<{ recoveryCodes: string[]; security: AccountSecurity }>('/api/auth/2fa/enable', { code }),
    );
    if (!result) return;
    setSetup(null);
    setCode('');
    setCodes(result.recoveryCodes);
    setData(result.security);
  }

  async function disable(event: FormEvent) {
    event.preventDefault();
    const result = await act(() => api.post<AccountSecurity>('/api/auth/2fa/disable', { password, code }));
    if (!result) return;
    setData(result);
    setMode('idle');
    setCode('');
    setPassword('');
  }

  async function regenerate(event: FormEvent) {
    event.preventDefault();
    const result = await act(() =>
      api.post<{ recoveryCodes: string[]; security: AccountSecurity }>('/api/auth/2fa/recovery-codes', { code }),
    );
    if (!result) return;
    setCodes(result.recoveryCodes);
    setData(result.security);
    setMode('idle');
    setCode('');
  }

  const on = security?.twoFactor ?? false;
  return (
    <section className="card settings-card">
      <div className="settings-head">
        <span className={`settings-icon ${on ? 'is-on' : ''}`} aria-hidden="true">
          <Icon name="shield" size={18} />
        </span>
        <div>
          <h2 className="section-title">Two-factor sign-in</h2>
          <p className="muted small">
            Ask for a code from an authenticator app (Google Authenticator, 1Password, Authy) each time you sign in, so
            a stolen password isn’t enough.
          </p>
        </div>
        {security && <span className={`badge ${on ? 'badge-good' : ''}`}>{on ? 'On' : 'Off'}</span>}
      </div>
      <ErrorNote error={error} />

      {codes && <RecoveryCodes codes={codes} onDone={() => setCodes(null)} />}

      {!codes && security && !on && !setup && (
        <button type="button" className="btn btn-primary" onClick={begin} disabled={busy}>
          {busy ? 'Starting…' : 'Turn on two-factor sign-in'}
        </button>
      )}

      {setup && (
        <form className="twofa-setup" onSubmit={confirm}>
          <img src={setup.qr} alt="QR code to add Proofwork to your authenticator app" width={180} height={180} />
          <div>
            <ol className="twofa-steps">
              <li>Open your authenticator app and scan this code.</li>
              <li>
                Can’t scan? Enter this key instead:
                <code className="twofa-secret">{setup.secret.match(/.{1,4}/g)?.join(' ')}</code>
              </li>
              <li>Type the 6-digit code it shows.</li>
            </ol>
            <label className="field">
              <span>Code from the app</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={10}
                required
                placeholder="123456"
              />
            </label>
            <div className="row-gap">
              <button className="btn btn-primary" disabled={busy || !code.trim()}>
                {busy ? 'Checking…' : 'Confirm and turn on'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setSetup(null)}>
                Cancel
              </button>
            </div>
          </div>
        </form>
      )}

      {!codes && on && mode === 'idle' && (
        <div className="settings-row">
          <span className="small muted">
            {security!.recoveryCodesLeft} recovery code{security!.recoveryCodesLeft === 1 ? '' : 's'} left
          </span>
          <div className="row-gap">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMode('regenerate')}>
              Make new recovery codes
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode('disable')}>
              Turn off
            </button>
          </div>
        </div>
      )}

      {mode !== 'idle' && (
        <form className="settings-form" onSubmit={mode === 'disable' ? disable : regenerate}>
          {mode === 'disable' && (
            <label className="field">
              <span>Your password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
          )}
          <label className="field">
            <span>Code from your app (or a recovery code)</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="one-time-code"
              maxLength={40}
              required
            />
          </label>
          <div className="row-gap">
            <button className={`btn ${mode === 'disable' ? 'btn-danger' : 'btn-primary'}`} disabled={busy}>
              {mode === 'disable' ? 'Turn off two-factor sign-in' : 'Make new codes'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setMode('idle')}>
              Cancel
            </button>
          </div>
        </form>
      )}
      <ErrorNote error={actionError} />
    </section>
  );
}

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const text = codes.join('\n');
  const download = () => {
    const url = URL.createObjectURL(new Blob([`Proofwork recovery codes\n\n${text}\n`], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'proofwork-recovery-codes.txt';
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="recovery">
      <p className="recovery-title">
        <Icon name="check" size={15} /> Save these recovery codes now
      </p>
      <p className="small muted">Each one signs you in once if you lose your phone. They won’t be shown again.</p>
      <ul className="recovery-codes">
        {codes.map((c) => (
          <li key={c}>
            <code>{c}</code>
          </li>
        ))}
      </ul>
      <div className="row-gap">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => void navigator.clipboard?.writeText(text)}
        >
          <Icon name="copy" size={14} /> Copy
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={download}>
          Download
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={onDone}>
          I’ve saved them
        </button>
      </div>
    </div>
  );
}

// Other devices ------------------------------------------------------------------------

function OtherDevices() {
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function signOut() {
    setBusy(true);
    setError(null);
    try {
      const { signedOut } = await api.post<{ signedOut: number }>('/api/auth/sessions/sign-out-others');
      setResult(
        signedOut
          ? `Signed out ${signedOut} other session${signedOut === 1 ? '' : 's'}.`
          : 'No other devices were signed in.',
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card settings-card">
      <div className="settings-head">
        <span className="settings-icon" aria-hidden="true">
          <Icon name="logout" size={18} />
        </span>
        <div>
          <h2 className="section-title">Other devices</h2>
          <p className="muted small">Signed in on a shared or lost computer? Sign out everywhere except here.</p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={signOut} disabled={busy}>
          {busy ? 'Signing out…' : 'Sign out other devices'}
        </button>
      </div>
      {result && <p className="small muted settings-note">{result}</p>}
      <ErrorNote error={error} />
    </section>
  );
}

// Data and privacy ---------------------------------------------------------------------------

function DataPrivacy({ manager }: { manager: boolean }) {
  const { data, setData, error } = useApi<PrivacySettings>('/api/privacy');
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function choose(days: number) {
    setBusy(true);
    setSaveError(null);
    setSaved(false);
    try {
      setData(await api.put<PrivacySettings>('/api/privacy', { recordingDays: days }));
      setSaved(true);
    } catch (e) {
      setSaveError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card settings-card">
      <div className="settings-head">
        <span className="settings-icon" aria-hidden="true">
          <Icon name="lock" size={18} />
        </span>
        <div>
          <h2 className="section-title">Data and privacy</h2>
          <p className="muted small">
            Candidates agree to how their answers are used before they start, and can download or delete them from their
            link at any time. You can do the same from a candidate’s page.
          </p>
        </div>
      </div>
      <ErrorNote error={error} />
      {data && (
        <>
          <div className="settings-row privacy-row">
            <div>
              <strong className="small">Keep candidates’ recordings for</strong>
              <p className="small muted">
                Then the audio is deleted; answers, transcripts and reviews stay until you delete the candidate.
              </p>
            </div>
            <div className="segmented" role="radiogroup" aria-label="Keep recordings for">
              {RECORDING_DAY_OPTIONS.map((days) => (
                <button
                  key={days}
                  type="button"
                  role="radio"
                  aria-checked={data.recordingDays === days}
                  className={data.recordingDays === days ? 'active' : ''}
                  disabled={!manager || busy}
                  onClick={() => void choose(days)}
                >
                  {days === 365 ? '1 year' : `${days} days`}
                </button>
              ))}
            </div>
          </div>
          {saved && <p className="small privacy-saved">Saved. The next clean-up runs tonight.</p>}
          <ErrorNote error={saveError} />
          <dl className="privacy-stats">
            <div>
              <dt>Candidates deleted in the last year</dt>
              <dd>{data.deletionsLastYear}</dd>
            </div>
            <div>
              <dt>Of them, withdrawn by the candidate</dt>
              <dd>{data.withdrawnLastYear}</dd>
            </div>
            <div>
              <dt>Candidates whose recordings were cleaned up</dt>
              <dd>{data.recordingsDeleted}</dd>
            </div>
          </dl>
          <p className="small muted privacy-links">
            <Link to="/trust">Security and sub-processors</Link> · <Link to="/privacy">Privacy notice</Link> ·{' '}
            <Link to="/dpa">Data processing agreement</Link>
          </p>
        </>
      )}
    </section>
  );
}

// Activity ---------------------------------------------------------------------------------

function Activity() {
  const { data, error } = useApi<{ events: AuditEvent[] }>('/api/audit');
  return (
    <section className="card flush settings-card">
      <div className="settings-head padded">
        <span className="settings-icon" aria-hidden="true">
          <Icon name="assessments" size={18} />
        </span>
        <div>
          <h2 className="section-title">Activity</h2>
          <p className="muted small">
            Sign-ins, security changes, invitations, decisions, plan requests and deleted candidates in your workspace.
          </p>
        </div>
      </div>
      <ErrorNote error={error} />
      {data && data.events.length === 0 && <p className="muted small settings-note padded">Nothing yet.</p>}
      {data && data.events.length > 0 && (
        <div className="table-scroll">
          <table className="list-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>What</th>
              </tr>
            </thead>
            <tbody>
              {data.events.map((e) => (
                <tr key={e.id}>
                  <td className="nowrap small muted">{formatDate(e.createdAt)}</td>
                  <td className="small">{e.actor}</td>
                  <td>
                    {e.action}
                    {e.target && <strong> {e.target}</strong>}
                    {e.detail && <span className="small muted"> · {e.detail}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
