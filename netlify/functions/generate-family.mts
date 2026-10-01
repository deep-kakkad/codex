import type { Config } from '@netlify/functions';
import { processGeneration } from '../../server/ai/generateFamily';
import { runtime } from '../lib/runtime';

// Writes one AI-generated scenario in the background (up to 15 minutes). The
// body only names a generation; nothing happens unless that one is pending.
export default async (req: Request) => {
  const { id } = (await req.json().catch(() => ({}))) as { id?: unknown };
  if (typeof id !== 'string' || !id) return;
  await processGeneration(runtime(), id);
};

export const config: Config = { background: true, path: '/internal/generate-family' };
