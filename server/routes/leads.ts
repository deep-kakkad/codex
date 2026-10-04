import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { LEAD_SOURCES } from '../../shared/demo';
import type { AppDeps } from '../app';
import { run } from '../db';
import { HttpError, email, oneOf } from '../http';

const WINDOW_MS = 10 * 60 * 1000;
const PER_WINDOW = 5;

/**
 * The guided demo's "talk to us" form: the one call the static demo makes.
 * No account needed, so each address is limited to a few sends per window.
 */
export function leadRoutes({ db, now }: AppDeps) {
  const router = Router();
  const recent = new Map<string, number[]>();

  router.post('/', async (req, res) => {
    const key = req.ip ?? 'unknown';
    const times = (recent.get(key) ?? []).filter((t) => now() - t < WINDOW_MS);
    if (times.length >= PER_WINDOW) throw new HttpError(429, 'Too many requests. Please try again in a few minutes.');
    recent.set(key, [...times, now()]);

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
