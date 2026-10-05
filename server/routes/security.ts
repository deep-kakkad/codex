import { Router } from 'express';
import type { AuditEvent } from '../../shared/api';
import type { AppDeps } from '../app';
import { currentUser, requireManager, requireUser } from '../auth';
import { optionalText, str } from '../http';
import { auditForOrg, checkThrottle, clientIp, limits, recordAttempt, recordError } from '../security';

/** Errors from people's browsers, so problems show up in the admin console. */
export function clientErrorRoutes({ db, now }: AppDeps) {
  const router = Router();
  router.post('/', async (req, res) => {
    const keys = limits.clientErrors(clientIp(req));
    await checkThrottle(db, keys, now());
    await recordAttempt(db, keys, now());
    await recordError(
      db,
      {
        source: 'browser',
        message: str(req.body.message, 'Message', { max: 2000 }),
        detail: optionalText(req.body.stack, 'Stack', 8000),
        path: optionalText(req.body.path, 'Path', 500),
      },
      now(),
    );
    res.status(204).end();
  });
  return router;
}

/** A workspace's activity log, for its managers. */
export function auditRoutes({ db, now }: AppDeps) {
  const router = Router();
  router.get('/', requireUser(db, now), async (_req, res) => {
    requireManager(res);
    const rows = await auditForOrg(db, currentUser(res).orgId, 200);
    const events: AuditEvent[] = rows.map((r) => ({
      id: r.id,
      actor: r.actor,
      action: r.action,
      target: r.target,
      detail: r.detail,
      createdAt: Number(r.created_at),
    }));
    res.json({ events });
  });
  return router;
}
