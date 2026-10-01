import { getDatabase } from '@netlify/database';
import { aiConfigFromEnv } from '../../server/ai/client';
import type { ReviewDeps } from '../../server/ai/review';
import { type DB, fromNeonHttp, fromPgPool } from '../../server/db';
import { netlifyBlobStore } from '../../server/files';

/** Path of the background function that runs one AI review (must match its config). */
export const REVIEW_PATH = '/internal/review';

/** The site's own URL, so functions can start the review background function. */
export function siteUrl() {
  return process.env.URL || process.env.DEPLOY_PRIME_URL || process.env.DEPLOY_URL || '';
}

let deps: ReviewDeps | null = null;

function database(): DB {
  const connection = getDatabase();
  return connection.driver === 'serverless'
    ? fromNeonHttp(connection.httpClient as unknown as Parameters<typeof fromNeonHttp>[0])
    : fromPgPool(connection.pool);
}

/** Database, recordings store and AI config, shared by every function in a container. */
export function runtime(): ReviewDeps & { db: DB } {
  deps ??= {
    db: database(),
    files: netlifyBlobStore(),
    ai: aiConfigFromEnv(),
    now: Date.now,
  };
  return deps;
}
