import { type FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { RoleFamilySummary, StageOutline } from '../../../shared/api';
import type { Currency } from '../../../shared/types';
import { api, errorMessage } from '../api';
import { Icon } from '../components/Icon';
import { RoleCatalog } from '../components/RoleCatalog';
import { ErrorNote, KindBadge } from '../components/ui';
import { formatMinutes, useApi } from '../hooks';

/** Adds an activity's prerequisite; removing a prerequisite removes what needs it. */
function toggle(stages: StageOutline[], selected: Set<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) {
    next.delete(id);
    for (const s of stages) if (s.dependsOn === id) next.delete(s.id);
  } else {
    next.add(id);
    const dependsOn = stages.find((s) => s.id === id)?.dependsOn;
    if (dependsOn) next.add(dependsOn);
  }
  return next;
}

export function NewAssessment() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { data, error: loadError } = useApi<{ families: RoleFamilySummary[] }>('/api/role-families');
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState('');
  const [currency, setCurrency] = useState<Currency>('INR');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const family = data?.families.find((f) => f.id === familyId);
  const chosen = family?.stages.filter((s) => selected.has(s.id)) ?? [];
  const minutes = Math.round(chosen.reduce((sum, s) => sum + s.timeLimitSec, 0) / 60);
  const hasScored = chosen.some((s) => s.scored);

  function pickRole(f: RoleFamilySummary) {
    // Choosing a role moves on to its activities.
    if (familyId !== f.id) {
      window.setTimeout(() => document.getElementById('activities')?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
    setFamilyId(f.id);
    setSelected(new Set(f.stages.map((s) => s.id)));
    setTitle(f.roles[0]);
    if (f.fixedCurrency) setCurrency(f.fixedCurrency);
  }

  // Arriving from "Use it" on a generated scenario, or from a job description.
  const preselect = params.get('family');
  const fromJd = params.get('from') === 'jd' && familyId === preselect;
  useEffect(() => {
    const f = data?.families.find((x) => x.id === preselect);
    if (f && !familyId) pickRole(f);
  }, [data, preselect]);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!family) return;
    setBusy(true);
    try {
      const { id } = await api.post<{ id: string }>('/api/assessments', {
        roleFamilyId: family.id,
        title,
        currency,
        stageIds: chosen.map((s) => s.id),
      });
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

      {!fromJd && <FromJdCard />}
      {fromJd && family && (
        <div className="callout callout-info jd-ready">
          <Icon name="sparkle" size={16} filled />
          <span>
            <strong>Your assessment is ready: {family.name}.</strong> Check the activities and{' '}
            <Link to={`/app/library/${family.id}`}>read the scenario and answer key</Link>, then create it.
          </span>
        </div>
      )}

      <h2 className="section-title">
        {fromJd ? '1. Built from your job description' : '1. Or pick a ready-made role'}
      </h2>
      <RoleCatalog
        families={data?.families ?? []}
        selectedId={familyId}
        onSelect={pickRole}
        action={(f) => (
          <>
            <Link to={`/app/library/${f.id}`} className="btn btn-ghost btn-sm">
              Preview
            </Link>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => pickRole(f)}>
              {familyId === f.id ? 'Chosen' : 'Choose'}
            </button>
          </>
        )}
        empty={
          <p className="muted">
            No ready-made role matches.{' '}
            <a href="#top" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
              Paste your job description
            </a>{' '}
            and AI builds one for this exact role.
          </p>
        }
      />
      <p className="small muted">
        Not listed? <Link to="/app/library#generate">Have AI write a scenario for any role</Link>.
      </p>

      {family && (
        <>
          <h2 className="section-title" id="activities">
            2. Choose the activities for {family.name}
          </h2>
          <p className="muted small">
            All activities share one scenario, so candidates build on what they've already seen. A situation-change
            activity needs the decision it follows.{' '}
            <Link to={`/app/library/${family.id}?currency=${currency}`}>Preview the full content and answer key</Link>
          </p>
          <div className="activity-list">
            {family.stages.map((s) => {
              const on = selected.has(s.id);
              const parent = s.dependsOn ? family.stages.find((p) => p.id === s.dependsOn) : null;
              return (
                <label key={s.id} className={`card activity ${on ? 'selected' : ''}`}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => setSelected(toggle(family.stages, selected, s.id))}
                  />
                  <div>
                    <div className="activity-head">
                      <strong>{s.title}</strong>
                      <KindBadge kind={s.kind} />
                      {s.thinkAloud && <span className="badge badge-think">Think aloud</span>}
                      <span className="small muted">
                        {formatMinutes(s.timeLimitSec)}
                        {!s.scored && ' · not scored'}
                      </span>
                    </div>
                    <p className="small muted">{s.summary}</p>
                    {parent && <p className="small muted">Includes "{parent.title}", which it follows.</p>}
                  </div>
                </label>
              );
            })}
          </div>

          <form className="card form-card" onSubmit={create}>
            <h2 className="section-title">3. Name it</h2>
            <p className="small muted">
              {chosen.length} activities · about {minutes} minutes for the candidate
            </p>
            <label className="field">
              <span>Job title candidates will see</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} />
            </label>
            {family.fixedCurrency ? (
              <p className="small muted">This scenario's amounts are written in {family.fixedCurrency}.</p>
            ) : (
              <label className="field">
                <span>Currency used in the scenario</span>
                <select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
                  <option value="INR">Indian rupee (₹)</option>
                  <option value="USD">US dollar ($)</option>
                </select>
              </label>
            )}
            {family.generated && (
              <p className="small muted">
                AI wrote this scenario. Check the preview and answer key before inviting candidates.
              </p>
            )}
            {!hasScored && <p className="small error-text">Pick at least one scored activity.</p>}
            <ErrorNote error={error} />
            <button className="btn btn-primary" disabled={busy || !title.trim() || !hasScored}>
              {busy ? 'Creating…' : 'Create assessment'}
            </button>
          </form>
        </>
      )}
    </>
  );
}

/** The fastest start: paste a job description and AI builds the whole assessment. */
function FromJdCard() {
  const navigate = useNavigate();
  const [roleTitle, setRoleTitle] = useState('');
  const [jd, setJd] = useState('');
  const [currency, setCurrency] = useState<Currency>('INR');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ready = roleTitle.trim().length > 0 && jd.trim().length >= 200;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { id } = await api.post<{ id: string }>('/api/generations', {
        roleTitle,
        description: jd,
        currency,
        source: 'jd',
      });
      navigate(`/app/new/from-jd/${id}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <form className="card jd-form" onSubmit={submit}>
      <div className="jd-form-head">
        <span className="jd-badge">
          <Icon name="sparkle" size={13} filled /> Fastest
        </span>
        <h2>Paste your job description</h2>
        <p className="muted">
          AI turns it into a full assessment for this exact role: a realistic scenario with numbers, think-aloud
          questions, a decision, a critique with planted mistakes, an AI-allowed task, and the answer key. You check it
          before anyone sees it.
        </p>
      </div>
      <div className="jd-form-row">
        <label className="field">
          <span>Job title</span>
          <input
            value={roleTitle}
            onChange={(e) => setRoleTitle(e.target.value)}
            maxLength={120}
            placeholder="e.g. Performance Marketing Manager"
            required
          />
        </label>
        <label className="field">
          <span>Currency for amounts</span>
          <select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
            <option value="INR">Indian rupee (₹)</option>
            <option value="USD">US dollar ($)</option>
          </select>
        </label>
      </div>
      <label className="field">
        <span>Job description</span>
        <textarea
          value={jd}
          onChange={(e) => setJd(e.target.value)}
          rows={8}
          maxLength={15000}
          placeholder="Paste the whole job post: responsibilities, requirements, seniority. Benefits and boilerplate are fine; they're ignored."
          required
        />
      </label>
      <div className="jd-form-foot">
        <span className="small muted">
          {jd.trim().length < 200
            ? `${Math.max(0, 200 - jd.trim().length)} more characters needed`
            : 'Takes 3 to 6 minutes'}
        </span>
        <ErrorNote error={error} />
        <button className="btn btn-primary" disabled={busy || !ready}>
          {busy ? 'Starting…' : 'Build my assessment'}
        </button>
      </div>
    </form>
  );
}
