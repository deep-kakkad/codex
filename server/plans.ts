import { randomUUID } from 'node:crypto';
import type { PlanView } from '../shared/api';
import { MONTHLY_REVIEWS, PLAN_NAMES, type PlanId, TRIAL_REVIEWS } from '../shared/plans';
import { type DB, one, run } from './db';

interface OrgPlanRow {
  plan: PlanId;
  review_credits: number;
}

async function orgPlan(db: DB, orgId: string): Promise<OrgPlanRow> {
  return (
    (await one<OrgPlanRow>(db, 'SELECT plan, review_credits FROM orgs WHERE id = ?', orgId)) ?? {
      plan: 'trial',
      review_credits: 0,
    }
  );
}

/** Reviews this workspace has started (anything but locked), optionally since a time. */
async function reviewsStarted(db: DB, orgId: string, since = 0): Promise<number> {
  const row = await one<{ count: number }>(
    db,
    `SELECT COUNT(*)::int AS count FROM ai_reviews r JOIN candidates c ON c.id = r.candidate_id
      WHERE c.org_id = ? AND r.status <> 'locked' AND r.created_at >= ?`,
    orgId,
    since,
  );
  return row?.count ?? 0;
}

function startOfMonth(now: number) {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

/**
 * Whether a newly finished candidate's review may run now. On the trial and
 * pay-as-you-go, a review the plan doesn't cover waits, locked, until the
 * plan changes; the candidate never notices. Paid monthly plans never lock:
 * reviews beyond the allowance are billed as extras.
 */
export async function mayStartReview(db: DB, orgId: string): Promise<boolean> {
  const { plan } = await orgPlan(db, orgId);
  if (plan === 'trial') return (await reviewsStarted(db, orgId)) < TRIAL_REVIEWS;
  if (plan === 'payg') {
    // Taking the credit is the check, so two finishing at once can't share one.
    const taken = await run(
      db,
      'UPDATE orgs SET review_credits = review_credits - 1 WHERE id = ? AND review_credits > 0',
      orgId,
    );
    return taken.changes > 0;
  }
  return true;
}

export async function planView(db: DB, orgId: string, now: number): Promise<PlanView> {
  const row = await orgPlan(db, orgId);
  const locked = await one<{ count: number }>(
    db,
    `SELECT COUNT(*)::int AS count FROM ai_reviews r JOIN candidates c ON c.id = r.candidate_id
      WHERE c.org_id = ? AND r.status = 'locked'`,
    orgId,
  );
  const request = await one<{ plan: string; created_at: number }>(
    db,
    'SELECT plan, created_at FROM upgrade_requests WHERE org_id = ? ORDER BY created_at DESC LIMIT 1',
    orgId,
  );
  const monthly = MONTHLY_REVIEWS[row.plan] ?? null;
  const included = row.plan === 'trial' ? TRIAL_REVIEWS : monthly;
  const used =
    row.plan === 'trial' ? await reviewsStarted(db, orgId) : await reviewsStarted(db, orgId, startOfMonth(now));
  return {
    plan: row.plan,
    name: PLAN_NAMES[row.plan],
    included,
    used,
    period: row.plan === 'trial' ? 'trial' : 'month',
    credits: row.plan === 'payg' ? row.review_credits : null,
    locked: locked?.count ?? 0,
    upgradeRequest: request ? { plan: request.plan, createdAt: request.created_at } : null,
  };
}

export async function requestUpgrade(
  db: DB,
  entry: { orgId: string; userId: string; plan: string; note: string; now: number },
) {
  await run(
    db,
    'INSERT INTO upgrade_requests (id, org_id, user_id, plan, note, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    randomUUID(),
    entry.orgId,
    entry.userId,
    entry.plan,
    entry.note,
    entry.now,
  );
}

/**
 * Moves a workspace to another plan and, if it now covers them, queues the
 * reviews that were waiting. Used by the operator script once billing is set up.
 */
export async function setPlan(db: DB, orgId: string, plan: PlanId, credits?: number): Promise<number> {
  await run(
    db,
    'UPDATE orgs SET plan = ?, review_credits = COALESCE(?, review_credits) WHERE id = ?',
    plan,
    credits ?? null,
    orgId,
  );
  let unlocked = 0;
  const waiting = await db.query<{ candidate_id: string }>(
    `SELECT r.candidate_id FROM ai_reviews r JOIN candidates c ON c.id = r.candidate_id
      WHERE c.org_id = $1 AND r.status = 'locked' ORDER BY r.created_at`,
    [orgId],
  );
  for (const { candidate_id } of waiting.rows) {
    if (!(await mayStartReview(db, orgId))) break;
    await run(
      db,
      "UPDATE ai_reviews SET status = 'pending' WHERE candidate_id = ? AND status = 'locked'",
      candidate_id,
    );
    unlocked++;
  }
  return unlocked;
}
