import { type Request, type Response, Router } from 'express';
import type {
  AdminActivity,
  AdminError,
  AdminLead,
  AdminOverview,
  AdminRequest,
  AdminWorkspace,
} from '../../shared/api';
import { type BillingCycle, EXTRA_REVIEW_INR, PLAN_NAMES, PLAN_OFFERS, type PlanId } from '../../shared/plans';
import type { AppDeps } from '../app';
import { currentUser, requireUser } from '../auth';
import { all, one } from '../db';
import { HttpError, badRequest, notFound, oneOf } from '../http';
import { addBonusReviews, setPlan, startOfMonth } from '../plans';
import { audit, clientIp } from '../security';

const DAY = 24 * 60 * 60 * 1000;
const PLANS = Object.keys(PLAN_NAMES) as PlanId[];
const CYCLES: readonly BillingCycle[] = ['monthly', 'annual'];

/** Workspaces of real customers: not the one people who run Proofwork sign in to. */
const CUSTOMER = `NOT EXISTS (SELECT 1 FROM users ou WHERE ou.org_id = o.id AND ou.operator = 1)`;

/**
 * The admin console's API, for people who run Proofwork. Every request needs an
 * operator account with two-factor sign-in on.
 */
export function adminRoutes({ db, now, backups }: AppDeps) {
  const router = Router();
  router.use(requireUser(db, now));
  router.use(async (_req, res, next) => {
    const user = currentUser(res);
    if (!user.operator) throw new HttpError(403, 'This is only for people who run Proofwork');
    const row = await one<{ totp_secret: string | null }>(db, 'SELECT totp_secret FROM users WHERE id = ?', user.id);
    if (!row?.totp_secret) throw new HttpError(403, 'Turn on two-factor sign-in to open the admin console');
    next();
  });

  const operatorLog = (req: Request, res: Response, orgId: string, action: string, target: string, detail?: string) =>
    audit(
      db,
      { orgId, userId: currentUser(res).id, actor: 'Proofwork', action, target, detail, ip: clientIp(req) },
      now(),
    );

  router.get('/overview', async (_req, res) => {
    const t = now();
    const month = startOfMonth(t);
    const count = async (sql: string, ...params: unknown[]) => (await one<{ n: number }>(db, sql, ...params))?.n ?? 0;
    const reviews = await all<{ covered_by: string; n: number }>(
      db,
      `SELECT rc.covered_by, COUNT(*)::int AS n FROM review_charges rc JOIN orgs o ON o.id = rc.org_id
        WHERE rc.created_at >= ? AND ${CUSTOMER}
        GROUP BY rc.covered_by`,
      month,
    );
    const reviewsThisMonth = { plan: 0, bonus: 0, credit: 0, extra: 0 };
    for (const r of reviews) reviewsThisMonth[r.covered_by as keyof typeof reviewsThisMonth] += r.n;
    const paid = await all<{ plan: PlanId; billing_cycle: BillingCycle }>(
      db,
      `SELECT plan, billing_cycle FROM orgs o WHERE plan IN ('starter', 'growth') AND ${CUSTOMER}`,
    );
    const subscriptions = paid.reduce((sum, o) => {
      const offer = PLAN_OFFERS.find((p) => p.id === o.plan)!;
      return sum + (o.billing_cycle === 'annual' ? (offer.annualInr ?? 0) / 12 : (offer.monthlyInr ?? 0));
    }, 0);
    const signups = await all<{ created_at: number }>(
      db,
      `SELECT created_at FROM orgs o WHERE created_at >= ? AND ${CUSTOMER}`,
      t - 30 * DAY,
    );
    const signupsByDay = Array.from({ length: 30 }, (_, i) => {
      const start =
        Date.UTC(new Date(t).getUTCFullYear(), new Date(t).getUTCMonth(), new Date(t).getUTCDate()) - (29 - i) * DAY;
      return {
        day: new Date(start).toISOString().slice(0, 10),
        count: signups.filter((s) => Number(s.created_at) >= start && Number(s.created_at) < start + DAY).length,
      };
    });
    const overview: AdminOverview = {
      workspaces: await count(`SELECT COUNT(*)::int AS n FROM orgs o WHERE ${CUSTOMER}`),
      newLast7: await count(`SELECT COUNT(*)::int AS n FROM orgs o WHERE created_at >= ? AND ${CUSTOMER}`, t - 7 * DAY),
      newLast30: signups.length,
      activeLast30: await count(
        `SELECT COUNT(DISTINCT c.org_id)::int AS n FROM candidates c JOIN orgs o ON o.id = c.org_id
          WHERE (c.created_at >= ? OR c.submitted_at >= ?) AND ${CUSTOMER}`,
        t - 30 * DAY,
        t - 30 * DAY,
      ),
      candidatesInvitedThisMonth: await count(
        `SELECT COUNT(*)::int AS n FROM candidates c JOIN orgs o ON o.id = c.org_id WHERE c.created_at >= ? AND ${CUSTOMER}`,
        month,
      ),
      candidatesFinishedThisMonth: await count(
        `SELECT COUNT(*)::int AS n FROM candidates c JOIN orgs o ON o.id = c.org_id WHERE c.submitted_at >= ? AND ${CUSTOMER}`,
        month,
      ),
      reviewsThisMonth,
      aiCostThisMonthUsd:
        (
          await one<{ usd: number }>(
            db,
            'SELECT COALESCE(SUM(cost_usd), 0) AS usd FROM ai_usage WHERE created_at >= ?',
            month,
          )
        )?.usd ?? 0,
      estimatedMrrInr: Math.round(subscriptions + reviewsThisMonth.extra * EXTRA_REVIEW_INR),
      leadsLast30: await count('SELECT COUNT(*)::int AS n FROM demo_leads WHERE created_at >= ?', t - 30 * DAY),
      openRequests: await count('SELECT COUNT(*)::int AS n FROM upgrade_requests WHERE handled_at IS NULL'),
      errorsLast7: await count('SELECT COUNT(*)::int AS n FROM error_events WHERE created_at >= ?', t - 7 * DAY),
      signupsByDay,
    };
    res.json(overview);
  });

  router.get('/workspaces', async (_req, res) => {
    const month = startOfMonth(now());
    const rows = await all<{
      id: string;
      name: string;
      created_at: number;
      plan: PlanId;
      billing_cycle: BillingCycle;
      paid_until: number | null;
      review_credits: number;
      bonus_reviews: number;
      referred_by_name: string | null;
      owner: string | null;
      seats: number;
      assessments: number;
      candidates: number;
      reviews_month: number;
      extras_month: number;
      locked: number;
      ai_cost_month: number;
      last_activity: number | null;
      asked_plan: string | null;
      asked_billing: BillingCycle | null;
      asked_at: number | null;
    }>(
      db,
      `SELECT o.id, o.name, o.created_at, o.plan, o.billing_cycle, o.paid_until, o.review_credits, o.bonus_reviews,
              r.name AS referred_by_name,
              (SELECT u.email FROM users u WHERE u.org_id = o.id ORDER BY u.created_at LIMIT 1) AS owner,
              (SELECT COUNT(*)::int FROM users u WHERE u.org_id = o.id) AS seats,
              (SELECT COUNT(*)::int FROM assessments a WHERE a.org_id = o.id) AS assessments,
              (SELECT COUNT(*)::int FROM candidates c WHERE c.org_id = o.id) AS candidates,
              (SELECT COUNT(*)::int FROM review_charges rc WHERE rc.org_id = o.id AND rc.created_at >= ?) AS reviews_month,
              (SELECT COUNT(*)::int FROM review_charges rc
                WHERE rc.org_id = o.id AND rc.covered_by = 'extra' AND rc.created_at >= ?) AS extras_month,
              (SELECT COUNT(*)::int FROM ai_reviews ar JOIN candidates c ON c.id = ar.candidate_id
                WHERE c.org_id = o.id AND ar.status = 'locked') AS locked,
              (SELECT COALESCE(SUM(x.cost_usd), 0) FROM ai_usage x WHERE x.org_id = o.id AND x.created_at >= ?) AS ai_cost_month,
              GREATEST(
                (SELECT MAX(c.created_at) FROM candidates c WHERE c.org_id = o.id),
                (SELECT MAX(c.submitted_at) FROM candidates c WHERE c.org_id = o.id),
                (SELECT MAX(a.created_at) FROM assessments a WHERE a.org_id = o.id)
              ) AS last_activity,
              q.plan AS asked_plan, q.billing_cycle AS asked_billing, q.created_at AS asked_at
         FROM orgs o
         LEFT JOIN orgs r ON r.id = o.referred_by
         LEFT JOIN LATERAL (
           SELECT plan, billing_cycle, created_at FROM upgrade_requests
            WHERE org_id = o.id AND handled_at IS NULL ORDER BY created_at DESC LIMIT 1
         ) q ON TRUE
        WHERE ${CUSTOMER}
        ORDER BY o.created_at DESC`,
      month,
      month,
      month,
    );
    const workspaces: AdminWorkspace[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      createdAt: Number(r.created_at),
      owner: r.owner,
      plan: r.plan,
      billing: r.billing_cycle,
      paidUntil: r.paid_until === null ? null : Number(r.paid_until),
      credits: r.review_credits,
      bonusReviews: r.bonus_reviews,
      referredBy: r.referred_by_name,
      seats: r.seats,
      assessments: r.assessments,
      candidates: r.candidates,
      reviewsThisMonth: r.reviews_month,
      extrasThisMonth: r.extras_month,
      locked: r.locked,
      aiCostThisMonthUsd: Number(r.ai_cost_month),
      lastActivity: r.last_activity === null ? null : Number(r.last_activity),
      askedFor: r.asked_plan
        ? { plan: r.asked_plan, billing: r.asked_billing ?? 'monthly', createdAt: Number(r.asked_at) }
        : null,
    }));
    res.json({ workspaces });
  });

  async function workspace(id: string) {
    const org = await one<{ id: string; name: string }>(
      db,
      `SELECT o.id, o.name FROM orgs o WHERE o.id = ? AND ${CUSTOMER}`,
      id,
    );
    if (!org) throw notFound('No such workspace');
    return org;
  }

  router.put('/workspaces/:id/plan', async (req, res) => {
    const org = await workspace(req.params.id);
    const plan = oneOf(req.body.plan, 'Plan', PLANS);
    const billing =
      plan === 'starter' || plan === 'growth' ? oneOf(req.body.billing ?? 'monthly', 'Billing', CYCLES) : 'monthly';
    const credits = req.body.credits === undefined || req.body.credits === null ? undefined : Number(req.body.credits);
    if (credits !== undefined && (!Number.isInteger(credits) || credits < 0 || credits > 100_000)) {
      throw badRequest('Credits must be a whole number');
    }
    const paidUntil =
      req.body.paidUntil === undefined || req.body.paidUntil === null ? null : Number(req.body.paidUntil);
    if (paidUntil !== null && !Number.isFinite(paidUntil)) throw badRequest('Paid until must be a date');
    const unlocked = await setPlan(db, org.id, plan, { credits, billing, paidUntil, now: now() });
    await operatorLog(
      req,
      res,
      org.id,
      'set the plan to',
      PLAN_NAMES[plan],
      [
        plan === 'starter' || plan === 'growth' ? `billed ${billing === 'annual' ? 'yearly' : 'monthly'}` : null,
        credits !== undefined ? `${credits} credits` : null,
        unlocked ? `${unlocked} waiting review${unlocked === 1 ? '' : 's'} started` : null,
      ]
        .filter(Boolean)
        .join(', ') || undefined,
    );
    res.json({ unlocked });
  });

  router.post('/workspaces/:id/bonus', async (req, res) => {
    const org = await workspace(req.params.id);
    const reviews = Number(req.body.reviews);
    if (!Number.isInteger(reviews) || reviews < 1 || reviews > 1000) throw badRequest('Add between 1 and 1000 reviews');
    const unlocked = await addBonusReviews(db, org.id, reviews, now());
    await operatorLog(req, res, org.id, 'added free reviews', `${reviews}`);
    res.json({ unlocked });
  });

  router.get('/requests', async (_req, res) => {
    const rows = await all<{
      id: string;
      workspace: string;
      org_id: string;
      email: string;
      plan: string;
      billing_cycle: BillingCycle;
      note: string;
      created_at: number;
      handled_at: number | null;
    }>(
      db,
      `SELECT q.id, o.name AS workspace, o.id AS org_id, u.email, q.plan, q.billing_cycle, q.note, q.created_at, q.handled_at
         FROM upgrade_requests q JOIN orgs o ON o.id = q.org_id JOIN users u ON u.id = q.user_id
        ORDER BY q.handled_at IS NOT NULL, q.created_at DESC LIMIT 300`,
    );
    const requests: AdminRequest[] = rows.map((r) => ({
      id: r.id,
      workspace: r.workspace,
      orgId: r.org_id,
      email: r.email,
      plan: r.plan,
      billing: r.billing_cycle,
      note: r.note,
      createdAt: Number(r.created_at),
      handledAt: r.handled_at === null ? null : Number(r.handled_at),
    }));
    res.json({ requests });
  });

  router.get('/leads', async (_req, res) => {
    const rows = await all<{ email: string; source: string; created_at: number }>(
      db,
      'SELECT email, source, created_at FROM demo_leads ORDER BY created_at DESC LIMIT 1000',
    );
    const leads: AdminLead[] = rows.map((r) => ({ email: r.email, source: r.source, createdAt: Number(r.created_at) }));
    res.json({ leads });
  });

  router.get('/errors', async (_req, res) => {
    const rows = await all<{
      message: string;
      source: string;
      count: number;
      last_seen: number;
      path: string | null;
      detail: string | null;
    }>(
      db,
      `SELECT e.message, e.source, COUNT(*)::int AS count, MAX(e.created_at) AS last_seen,
              (SELECT x.path FROM error_events x WHERE x.message = e.message AND x.source = e.source
                ORDER BY x.created_at DESC LIMIT 1) AS path,
              (SELECT x.detail FROM error_events x WHERE x.message = e.message AND x.source = e.source
                ORDER BY x.created_at DESC LIMIT 1) AS detail
         FROM error_events e WHERE e.created_at >= ?
        GROUP BY e.message, e.source ORDER BY MAX(e.created_at) DESC LIMIT 200`,
      now() - 30 * DAY,
    );
    const errors: AdminError[] = rows.map((r) => ({
      message: r.message,
      source: r.source,
      count: r.count,
      lastSeen: Number(r.last_seen),
      path: r.path,
      detail: r.detail,
    }));
    res.json({ errors });
  });

  router.get('/activity', async (_req, res) => {
    const rows = await all<{
      id: string;
      workspace: string | null;
      actor: string;
      action: string;
      target: string | null;
      detail: string | null;
      ip: string | null;
      created_at: number;
    }>(
      db,
      `SELECT l.id, o.name AS workspace, l.actor, l.action, l.target, l.detail, l.ip, l.created_at
         FROM audit_log l LEFT JOIN orgs o ON o.id = l.org_id
        ORDER BY l.created_at DESC LIMIT 300`,
    );
    const events: AdminActivity[] = rows.map((r) => ({ ...r, createdAt: Number(r.created_at) }));
    res.json({ events });
  });

  router.get('/backups', async (_req, res) => {
    res.json({ backups: backups ? (await backups.list()).reverse() : [] });
  });

  router.get('/backups/:key', async (req, res) => {
    if (!backups || !/^\d{4}-\d{2}-\d{2}\.json\.gz$/.test(req.params.key)) throw notFound('No such backup');
    const data = await backups.get(req.params.key);
    if (!data) throw notFound('No such backup');
    await audit(
      db,
      {
        orgId: null,
        userId: currentUser(res).id,
        actor: currentUser(res).email,
        action: 'downloaded a backup',
        target: req.params.key,
        ip: clientIp(req),
      },
      now(),
    );
    res.set('Content-Disposition', `attachment; filename="proofwork-${req.params.key}"`);
    res.type('application/gzip').send(data);
  });

  return router;
}
