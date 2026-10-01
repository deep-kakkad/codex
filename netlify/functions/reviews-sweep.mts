import type { Config } from '@netlify/functions';
import { backgroundFunctionQueue } from '../../server/ai/queue';
import { REVIEW_PATH, runtime, siteUrl } from '../lib/runtime';

// Every 10 minutes: restart reviews that got stuck, failed with attempts left,
// or were never started (e.g. a trigger that didn't arrive).
export default async () => {
  await backgroundFunctionQueue(runtime(), `${siteUrl()}${REVIEW_PATH}`).resume();
};

export const config: Config = { schedule: '*/10 * * * *' };
