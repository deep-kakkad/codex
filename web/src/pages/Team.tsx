import { type FormEvent, useState } from 'react';
import type { TeamMember } from '../../../shared/api';
import { api, errorMessage } from '../api';
import { useAuth } from '../auth';
import { ErrorNote } from '../components/ui';
import { formatDate, useApi } from '../hooks';

export function Team() {
  const { user } = useAuth();
  const { data, error, reload } = useApi<{ team: TeamMember[] }>('/api/team');
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'reviewer' });
  const [formError, setFormError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      await api.post('/api/team', form);
      setAdded(`${form.name} can now log in as ${form.email} with the temporary password you set.`);
      setForm({ name: '', email: '', password: '', role: 'reviewer' });
      await reload();
    } catch (e) {
      setFormError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Team</h1>
          <p className="muted">
            Reviewers score candidates and run verification calls. Hiring managers can also create assessments, invite
            candidates and record decisions.
          </p>
        </div>
      </div>
      <ErrorNote error={error} />
      <div className="card flush table-scroll">
        <table className="list-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Added</th>
            </tr>
          </thead>
          <tbody>
            {data?.team.map((m) => (
              <tr key={m.id}>
                <td>
                  {m.name}
                  {m.id === user?.id && <span className="small muted"> (you)</span>}
                </td>
                <td>{m.email}</td>
                <td>{m.role === 'manager' ? 'Hiring manager' : 'Reviewer'}</td>
                <td className="small">{formatDate(m.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {user?.role === 'manager' && (
        <form className="card form-card" onSubmit={add}>
          <h2 className="section-title">Add a teammate</h2>
          <div className="invite-form">
            <label className="field">
              <span>Name</span>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </label>
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </label>
            <label className="field">
              <span>Temporary password</span>
              <input
                type="text"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                minLength={8}
                required
                autoComplete="off"
              />
            </label>
            <label className="field">
              <span>Role</span>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="reviewer">Reviewer</option>
                <option value="manager">Hiring manager</option>
              </select>
            </label>
          </div>
          <ErrorNote error={formError} />
          {added && <div className="alert alert-success">{added}</div>}
          <button className="btn btn-primary" disabled={busy}>
            Add teammate
          </button>
        </form>
      )}
    </>
  );
}
