import type { Config } from '@netlify/functions';
import { backgroundGenerationQueue } from '../../server/ai/generateFamily';
import { backgroundFunctionQueue } from '../../server/ai/queue';
import { GENERATE_PATH, REVIEW_PATH, runtime, siteUrl } from '../lib/runtime';

// Every 10 minutes: restart reviews and scenario generations that got stuck,
// failed with attempts left, or were never started (e.g. a trigger that didn't arrive).
export default async () => {
  await backgroundFunctionQueue(runtime(), `${siteUrl()}${REVIEW_PATH}`).resume();
  await backgroundGenerationQueue(runtime(), `${siteUrl()}${GENERATE_PATH}`).resume();
};

export const config: Config = { schedule: '*/10 * * * *' };
