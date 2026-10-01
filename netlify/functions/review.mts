import type { Config } from '@netlify/functions';
import { processReview } from '../../server/ai/queue';
import { runtime } from '../lib/runtime';

// Runs one AI review in the background (up to 15 minutes). The body only
// names a candidate; processReview does nothing unless that review is pending.
export default async (req: Request) => {
  const { candidateId } = (await req.json().catch(() => ({}))) as { candidateId?: unknown };
  if (typeof candidateId !== 'string' || !candidateId) return;
  await processReview(runtime(), candidateId);
};

export const config: Config = { background: true, path: '/internal/review' };
