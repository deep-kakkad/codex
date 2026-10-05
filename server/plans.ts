import { randomBytes, randomUUID } from 'node:crypto';
import type { PlanView, ReferralView } from '../shared/api';
import {
  type BillingCycle,
  type Coverage,
  MONTHLY_REVIEWS,
  PLAN_NAMES,
  type PlanId,
  REFERRAL_CAP,
  REFERRAL_REVIEWS,
  TRIAL_REVIEWS,
} from '../shared/plans';
import { type DB, one, run } from './db';

interface OrgPlanRow {
  plan: PlanId;
  review_credits: number;
  bonus_reviews: number;
  billing_cycle: BillingCycle;
  paid_until: number | null;
}

async function orgPlan(db: DB, orgId: string): Promise<OrgPlanRow> {
  return (
    (await one<OrgPlanRow>(
      db,
      'SELECT plan, review_credits, bonus_reviews, billing_cycle, paid_until FROM orgs WHERE id = ?',
      orgId,
    )) ?? { plan: 'trial', review_credits: 0, bonus_reviews: 0, billing_cycle: 'monthly', paid_until: null }
  );
}

/** Reviews this workspace has started that were paid for in the given ways, optionally since a time. */
async function reviewsCovered(db: DB, orgId: string, by: Coverage[], since = 0): Promise<number> {
  const row = await one<{ count: number }>(
    db,
    `SELECT COUNT(*)::int AS count FROM ai_reviews r JOIN candidates c ON c.id = r.candidate_id
      WHERE c.org_id = ? AND r.status <> 'locked' AND COALESCE(r.covered_by, 'plan') = ANY(?) AND r.created_at >= ?`,
    orgId,
    by,
    since,
  );
  return row?.count ?? 0;
}

export function startOfMonth(now: number) {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

/** Takes one free review earned by referral, if there is one. */
async function takeBonus(db: DB, orgId: string) {
  const taken = await run(
    db,
    'UPDATE orgs SET bonus_reviews = bonus_reviews - 1 WHERE id = ? AND bonus_reviews > 0',
    orgId,
  );
  return taken.changes > 0;
}

/**
 * What pays for a newly finished candidate's review, or null when nothing
 * does yet and it waits, locked, until the plan changes (the candidate never
 * notices). The plan's own allowance goes first, then referral bonus reviews,
 * then prepaid credits. Paid monthly plans never lock: beyond everything
 * else, a review is a billable extra.
 */
export async function reviewCoverage(db: DB, orgId: string, now: number): Promise<Coverage | null> {
  const { plan } = await orgPlan(db, orgId);
  if (plan === 'pilot') return 'plan';
  if (plan === 'trial') {
    if ((await reviewsCovered(db, orgId, ['plan'])) < TRIAL_REVIEWS) return 'plan';
    return (await takeBonus(db, orgId)) ? 'bonus' : null;
  }
  if (plan === 'payg') {
    if (await takeBonus(db, orgId)) return 'bonus';
    // Taking the credit is the check, so two finishing at once can't share one.
    const taken = await run(
      db,
      'UPDATE orgs SET review_credits = review_credits - 1 WHERE id = ? AND review_credits > 0',
      orgId,
    );
    return taken.changes > 0 ? 'credit' : null;
  }
  const monthly = MONTHLY_REVIEWS[plan] ?? Infinity;
  if ((await reviewsCovered(db, orgId, ['plan'], startOfMonth(now))) < monthly) return 'plan';
  return (await takeBonus(db, orgId)) ? 'bonus' : 'extra';
}

export async function planView(db: DB, orgId: string, now: number): Promise<PlanView> {
  const row = await orgPlan(db, orgId);
  const locked = await one<{ count: number }>(
    db,
    `SELECT COUNT(*)::int AS count FROM ai_reviews r JOIN candidates c ON c.id = r.candidate_id
      WHERE c.org_id = ? AND r.status = 'locked'`,
    orgId,
  );
  const request = await one<{ plan: string; billing_cycle: BillingCycle; created_at: number }>(
    db,
    `SELECT plan, billing_cycle, created_at FROM upgrade_requests
      WHERE org_id = ? AND handled_at IS NULL ORDER BY created_at DESC LIMIT 1`,
    orgId,
  );
  const monthly = MONTHLY_REVIEWS[row.plan] ?? null;
  const included = row.plan === 'trial' ? TRIAL_REVIEWS : monthly;
  const monthStart = startOfMonth(now);
  const used =
    row.plan === 'trial'
      ? await reviewsCovered(db, orgId, ['plan'])
      : await reviewsCovered(db, orgId, ['plan', 'extra'], monthStart);
  const paid = row.plan === 'starter' || row.plan === 'growth';
  return {
    plan: row.plan,
    name: PLAN_NAMES[row.plan],
    included,
    used,
    period: row.plan === 'trial' ? 'trial' : 'month',
    credits: row.plan === 'payg' ? row.review_credits : null,
    locked: locked?.count ?? 0,
    upgradeRequest: request
      ? { plan: request.plan, billing: request.billing_cycle, createdAt: request.created_at }
      : null,
    billing: paid ? row.billing_cycle : 'monthly',
    paidUntil: row.paid_until,
    bonusReviews: row.bonus_reviews,
    extras: paid ? await reviewsCovered(db, orgId, ['extra'], monthStart) : 0,
  };
}

export async function requestUpgrade(
  db: DB,
  entry: { orgId: string; userId: string; plan: string; billing: BillingCycle; note: string; now: number },
) {
  await run(
    db,
    `INSERT INTO upgrade_requests (id, org_id, user_id, plan, billing_cycle, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    randomUUID(),
    entry.orgId,
    entry.userId,
    entry.plan,
    entry.billing,
    entry.note,
    entry.now,
  );
}

/**
 * Moves a workspace to another plan and, if it now covers them, queues the
 * reviews that were waiting. Open upgrade requests count as handled.
 */
export async function setPlan(
  db: DB,
  orgId: string,
  plan: PlanId,
  options: { credits?: number; billing?: BillingCycle; paidUntil?: number | null; now?: number } = {},
): Promise<number> {
  const now = options.now ?? Date.now();
  await run(
    db,
    `UPDATE orgs SET plan = ?, review_credits = COALESCE(?, review_credits), billing_cycle = ?,
       paid_until = ? WHERE id = ?`,
    plan,
    options.credits ?? null,
    options.billing ?? 'monthly',
    options.paidUntil ?? null,
    orgId,
  );
  await run(db, 'UPDATE upgrade_requests SET handled_at = ? WHERE org_id = ? AND handled_at IS NULL', now, orgId);
  return unlockWaiting(db, orgId, now);
}

/** Queues locked reviews for as long as something now pays for them. */
export async function unlockWaiting(db: DB, orgId: string, now: number) {
  let unlocked = 0;
  const waiting = await db.query<{ candidate_id: string }>(
    `SELECT r.candidate_id FROM ai_reviews r JOIN candidates c ON c.id = r.candidate_id
      WHERE c.org_id = $1 AND r.status = 'locked' ORDER BY r.created_at`,
    [orgId],
  );
  for (const { candidate_id } of waiting.rows) {
    const coverage = await reviewCoverage(db, orgId, now);
    if (!coverage) break;
    await run(
      db,
      "UPDATE ai_reviews SET status = 'pending', covered_by = ? WHERE candidate_id = ? AND status = 'locked'",
      coverage,
      candidate_id,
    );
    unlocked++;
  }
  return unlocked;
}

/** Adds free reviews to a workspace and lets any waiting reviews run. */
export async function addBonusReviews(db: DB, orgId: string, reviews: number, now: number) {
  await run(db, 'UPDATE orgs SET bonus_reviews = bonus_reviews + ? WHERE id = ?', reviews, orgId);
  return unlockWaiting(db, orgId, now);
}

// Referrals ------------------------------------------------------------------------

/** The workspace's referral code, made the first time it is asked for. */
export async function referralCode(db: DB, orgId: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const row = await one<{ referral_code: string | null }>(db, 'SELECT referral_code FROM orgs WHERE id = ?', orgId);
    if (row?.referral_code) return row.referral_code;
    const code = randomBytes(6)
      .toString('base64url')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 8);
    if (code.length < 8) continue;
    try {
      await run(db, 'UPDATE orgs SET referral_code = ? WHERE id = ? AND referral_code IS NULL', code, orgId);
    } catch {
      // Another workspace has this code: try again.
    }
  }
  throw new Error('Could not make a referral code');
}

export async function referralView(db: DB, orgId: string): Promise<ReferralView> {
  const code = await referralCode(db, orgId);
  const counts = await one<{ joined: number; rewarded: number }>(
    db,
    `SELECT COUNT(*)::int AS joined, COUNT(referral_rewarded_at)::int AS rewarded FROM orgs WHERE referred_by = ?`,
    orgId,
  );
  return {
    code,
    joined: counts?.joined ?? 0,
    rewarded: counts?.rewarded ?? 0,
    rewardEach: REFERRAL_REVIEWS,
    cap: REFERRAL_CAP,
  };
}

/** The workspace a referral code belongs to, if any. */
export async function referrerFor(db: DB, code: unknown): Promise<string | null> {
  if (typeof code !== 'string' || !/^[a-z0-9]{8}$/.test(code)) return null;
  return (await one<{ id: string }>(db, 'SELECT id FROM orgs WHERE referral_code = ?', code))?.id ?? null;
}

/**
 * The first time a referred workspace has a candidate finish, the workspace
 * that referred it earns its free reviews (up to the cap). Returns the
 * referrer's id when it was rewarded.
 */
export async function rewardReferrer(db: DB, orgId: string, now: number): Promise<string | null> {
  const claimed = await run(
    db,
    'UPDATE orgs SET referral_rewarded_at = ? WHERE id = ? AND referred_by IS NOT NULL AND referral_rewarded_at IS NULL',
    now,
    orgId,
  );
  if (!claimed.changes) return null;
  const { referred_by: referrer } = (await one<{ referred_by: string }>(
    db,
    'SELECT referred_by FROM orgs WHERE id = ?',
    orgId,
  ))!;
  const rewarded = await one<{ n: number }>(
    db,
    'SELECT COUNT(referral_rewarded_at)::int AS n FROM orgs WHERE referred_by = ?',
    referrer,
  );
  if ((rewarded?.n ?? 0) > REFERRAL_CAP) return null;
  await addBonusReviews(db, referrer, REFERRAL_REVIEWS, now);
  return referrer;
}
