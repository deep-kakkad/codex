import { useState } from 'react';
import type { PlanView } from '../../../shared/api';
import { EXTRA_REVIEW_PRICE, PLAN_NAMES, PLAN_OFFERS, type PlanId, TRIAL_REVIEWS } from '../../../shared/plans';
import { api, errorMessage } from '../api';
import { useAuth } from '../auth';
import { Icon } from '../components/Icon';
import { ErrorNote } from '../components/ui';
import { formatDate, useApi } from '../hooks';

export function PlanPage() {
  const { user } = useAuth();
  const { data: plan, setData, error } = useApi<PlanView>('/api/plan');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  async function ask(id: string) {
    setBusy(id);
    setSendError(null);
    try {
      setData(await api.post<PlanView>('/api/plan/upgrade-request', { plan: id, note }));
    } catch (e) {
      setSendError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  if (error) return <ErrorNote error={error} />;
  if (!plan) return <p className="muted">Loading…</p>;
  const manager = user?.role === 'manager';
  const share = plan.included ? Math.min(1, plan.used / plan.included) : 0;
  const asked = plan.upgradeRequest;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Plan</h1>
          <p className="muted">You pay for candidates who finish and get reviewed. Invites and drop-outs are free.</p>
        </div>
      </div>

      <section className="card plan-usage">
        <div className="plan-usage-head">
          <div>
            <span className="plan-eyebrow">Current plan</span>
            <h2 className="plan-name">{plan.name}</h2>
          </div>
          {plan.included !== null && (
            <div className="plan-count">
              <span className="num">{plan.used}</span> of {plan.included} reviews used
              {plan.period === 'month' ? ' this month' : ''}
            </div>
          )}
          {plan.credits !== null && (
            <div className="plan-count">
              <span className="num">{plan.credits}</span> review credit{plan.credits === 1 ? '' : 's'} left
            </div>
          )}
        </div>
        {plan.included !== null && (
          <div className="plan-bar" aria-hidden="true">
            <span style={{ width: `${share * 100}%` }} className={share >= 1 ? 'is-full' : ''} />
          </div>
        )}
        {plan.plan === 'trial' && (
          <p className="small muted">
            Your first {TRIAL_REVIEWS} reviewed candidates are free, with every feature. After that, finished candidates
            wait safely until you choose a plan.
          </p>
        )}
        {plan.period === 'month' && plan.included !== null && plan.used > plan.included && (
          <p className="small muted">
            {plan.used - plan.included} extra review{plan.used - plan.included === 1 ? '' : 's'} this month, at{' '}
            {EXTRA_REVIEW_PRICE} each.
          </p>
        )}
        {plan.locked > 0 && (
          <div className="callout callout-warn locked-banner">
            <Icon name="lock" size={16} />
            <span>
              <strong>
                {plan.locked} finished candidate{plan.locked === 1 ? ' is' : 's are'} waiting for a review.
              </strong>{' '}
              {plan.locked === 1 ? 'It runs' : 'They run'} as soon as your plan is set up.
            </span>
          </div>
        )}
      </section>

      {asked && (
        <div className="callout callout-info plan-asked">
          <Icon name="check" size={16} />
          <span>
            You asked for <strong>{PLAN_NAMES[asked.plan as PlanId] ?? asked.plan}</strong> on{' '}
            {formatDate(asked.createdAt)}. We'll email {user?.email} within one working day to set up billing.
          </span>
        </div>
      )}

      <div className="plan-grid">
        {PLAN_OFFERS.map((offer) => {
          const current = plan.plan === offer.id;
          return (
            <section key={offer.id} className={`card plan-card ${offer.id === 'starter' ? 'is-featured' : ''}`}>
              {offer.id === 'starter' && <span className="plan-flag">Most teams start here</span>}
              <h3>{offer.name}</h3>
              <p className="plan-price">
                <span className="num">{offer.price}</span> <span className="muted">{offer.per}</span>
              </p>
              <p className="small muted">{offer.blurb}</p>
              <ul className="plan-features">
                {offer.features.map((f) => (
                  <li key={f}>
                    <Icon name="check" size={14} /> {f}
                  </li>
                ))}
              </ul>
              {current ? (
                <span className="badge">Your plan</span>
              ) : manager ? (
                <button
                  type="button"
                  className={`btn ${offer.id === 'starter' ? 'btn-primary' : 'btn-secondary'}`}
                  disabled={busy !== null}
                  onClick={() => ask(offer.id)}
                >
                  {busy === offer.id ? 'Sending…' : `Choose ${offer.name}`}
                </button>
              ) : null}
            </section>
          );
        })}
      </div>

      {manager && (
        <section className="card plan-note">
          <label className="field">
            <span>Anything we should know? (optional)</span>
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={2000}
              placeholder="e.g. We hire about 20 people a quarter. We'd need a data processing agreement, ATS integration or single sign-on."
            />
          </label>
          <p className="small muted">
            Choosing a plan sends us a request; nothing is charged yet. We set up billing with you by email, then your
            waiting reviews run straight away.
          </p>
          <ErrorNote error={sendError} />
        </section>
      )}
    </>
  );
}
