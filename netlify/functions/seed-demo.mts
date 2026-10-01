import type { Config } from '@netlify/functions';
import { backgroundFunctionQueue } from '../../server/ai/queue';
import { seedDemo } from '../../server/demo';
import { REVIEW_PATH, runtime, siteUrl } from '../lib/runtime';

// Creates the demo workspace when DEMO_SEED=1 (the API starts this on its
// first cold start). Seeding is idempotent, then the submitted demo
// candidates are queued for AI review.
export default async () => {
  if (process.env.DEMO_SEED !== '1') return;
  const deps = runtime();
  const created = await seedDemo(deps.db, deps.files);
  if (created) await backgroundFunctionQueue(deps, `${siteUrl()}${REVIEW_PATH}`).resume();
};

export const config: Config = { background: true, path: '/internal/seed-demo' };
