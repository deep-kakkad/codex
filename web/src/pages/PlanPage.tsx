import { useState } from 'react';
import type { PlanView, ReferralView } from '../../../shared/api';
import {
  type BillingCycle,
  EXTRA_REVIEW_PRICE,
  PLAN_NAMES,
  PLAN_OFFERS,
  type PlanId,
  REFERRAL_REVIEWS,
  TRIAL_REVIEWS,
} from '../../../shared/plans';
import { api, errorMessage } from '../api';
import { useAuth } from '../auth';
import { Icon } from '../components/Icon';
import { ErrorNote } from '../components/ui';
import { useDemo } from '../demo/mode';
import { formatDate, useApi } from '../hooks';

export function PlanPage() {
  const { user } = useAuth();
  const demo = useDemo();
  const { data: plan, setData, error } = useApi<PlanView>('/api/plan');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [billing, setBilling] = useState<BillingCycle>('annual');

  async function ask(id: string) {
    setBusy(id);
    setSendError(null);
    try {
      setData(await api.post<PlanView>('/api/plan/upgrade-request', { plan: id, billing, note }));
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
            <h2 className="plan-name">
              {plan.name}
              {(plan.plan === 'starter' || plan.plan === 'growth') && (
                <span className="plan-cycle">{plan.billing === 'annual' ? 'billed yearly' : 'billed monthly'}</span>
              )}
            </h2>
            {plan.paidUntil && <span className="small muted">Paid until {formatDay(plan.paidUntil)}</span>}
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
        {plan.extras > 0 && (
          <p className="small muted">
            {plan.extras} extra review{plan.extras === 1 ? '' : 's'} this month, at {EXTRA_REVIEW_PRICE} each.
          </p>
        )}
        {plan.bonusReviews > 0 && (
          <p className="plan-bonus">
            <Icon name="sparkle" size={14} filled /> {plan.bonusReviews} free review{plan.bonusReviews === 1 ? '' : 's'}{' '}
            from referrals, used once your plan’s run out.
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
            You asked for <strong>{PLAN_NAMES[asked.plan as PlanId] ?? asked.plan}</strong>
            {asked.plan !== 'payg' && (asked.billing === 'annual' ? ', billed yearly,' : ', billed monthly,')} on{' '}
            {formatDate(asked.createdAt)}.{' '}
            {demo
              ? "In the demo nothing is sent. Start free to set up your own account; we'll help you choose a plan."
              : `We'll email ${user?.email} within one working day to set up billing.`}
          </span>
        </div>
      )}

      <div className="plan-billing">
        <div className="segmented" role="radiogroup" aria-label="Billing">
          {(
            [
              ['monthly', 'Monthly'],
              ['annual', 'Yearly'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={billing === value}
              className={billing === value ? 'active' : ''}
              onClick={() => setBilling(value)}
            >
              {label}
              {value === 'annual' && <span className="plan-save">2 months free</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="plan-grid">
        {PLAN_OFFERS.map((offer) => {
          const current = plan.plan === offer.id && (offer.id === 'payg' || plan.billing === billing);
          const yearly = billing === 'annual' && offer.annual;
          return (
            <section key={offer.id} className={`card plan-card ${offer.id === 'starter' ? 'is-featured' : ''}`}>
              {offer.id === 'starter' && <span className="plan-flag">Most teams start here</span>}
              <h3>{offer.name}</h3>
              <p className="plan-price">
                <span className="num">{yearly ? offer.annual!.perMonth : offer.price}</span>{' '}
                <span className="muted">{offer.per}</span>
              </p>
              <p className="plan-price-note small muted">
                {yearly
                  ? `${offer.annual!.price} billed yearly`
                  : offer.annual
                    ? `or ${offer.annual.perMonth} a month billed yearly`
                    : 'Credits last 12 months'}
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

      {manager && !demo && <Referral />}

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

const formatDay = (ts: number) =>
  new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** Give 10 reviews, get 10: the workspace's link and how it is doing. */
function Referral() {
  const { data } = useApi<ReferralView>('/api/referral');
  const [copied, setCopied] = useState(false);
  if (!data) return null;
  const link = `${window.location.origin}/signup?ref=${data.code}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the link is selectable in the box.
    }
  };
  return (
    <section className="card referral-card">
      <div className="referral-copy">
        <span className="plan-eyebrow">Refer a team</span>
        <h2>
          Give {REFERRAL_REVIEWS} reviews, get {REFERRAL_REVIEWS}
        </h2>
        <p className="muted small">
          Teams who sign up with your link start with {REFERRAL_REVIEWS} extra free reviews. When their first candidate
          finishes, you get {REFERRAL_REVIEWS} too, for up to {data.cap} teams.
        </p>
      </div>
      <div className="referral-link">
        <input readOnly value={link} aria-label="Your referral link" onFocus={(e) => e.target.select()} />
        <button type="button" className="btn btn-primary" onClick={copy}>
          <Icon name={copied ? 'check' : 'copy'} size={15} /> {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
      <p className="small muted referral-stats">
        {data.joined === 0
          ? 'No teams have joined with your link yet.'
          : `${data.joined} team${data.joined === 1 ? '' : 's'} joined · ${data.rewarded} earned you ${REFERRAL_REVIEWS} reviews each`}
      </p>
    </section>
  );
}
