import { neon } from '@neondatabase/serverless';
import { aiConfigFromEnv } from '../../server/ai/client';
import type { ReviewDeps } from '../../server/ai/review';
import { type DB, fromNeonHttp } from '../../server/db';
import { netlifyBlobStore } from '../../server/files';

/** Path of the background function that runs one AI review (must match its config). */
export const REVIEW_PATH = '/internal/review';

/** Path of the background function that writes one AI-generated scenario. */
export const GENERATE_PATH = '/internal/generate-family';

/** The site's own URL, so functions can start the review background function. */
export function siteUrl() {
  return process.env.URL || process.env.DEPLOY_PRIME_URL || process.env.DEPLOY_URL || '';
}

let deps: ReviewDeps | null = null;

/**
 * Postgres on Neon, over HTTP (no connection pool to exhaust from many
 * function instances). Migrations are applied with `npm run migrate`.
 */
function database(): DB {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  return fromNeonHttp(neon(url) as unknown as Parameters<typeof fromNeonHttp>[0]);
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
