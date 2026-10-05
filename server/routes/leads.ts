import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { LEAD_SOURCES } from '../../shared/demo';
import type { AppDeps } from '../app';
import { run } from '../db';
import { email, oneOf } from '../http';
import { checkThrottle, clientIp, limits, recordAttempt } from '../security';

/**
 * The guided demo's "talk to us" form: the one call the static demo makes.
 * No account needed, so each address is limited to a few sends in ten minutes.
 */
export function leadRoutes({ db, now }: AppDeps) {
  const router = Router();

  router.post('/', async (req, res) => {
    const keys = limits.leads(clientIp(req));
    await checkThrottle(db, keys, now());
    await recordAttempt(db, keys, now());

    const address = email(req.body.email, 'Work email');
    const source = oneOf(req.body.source, 'Source', LEAD_SOURCES);
    // Leaving the same email again just moves it to the top of the list.
    await run(
      db,
      `INSERT INTO demo_leads (id, email, source, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (email, source) DO UPDATE SET created_at = excluded.created_at`,
      randomUUID(),
      address,
      source,
      now(),
    );
    res.status(201).json({ ok: true });
  });

  return router;
}
