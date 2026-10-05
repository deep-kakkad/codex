import express from 'express';
import type { AiConfig } from './ai/client';
import { type GenerationDeps, type GenerationQueue, inProcessGenerationQueue } from './ai/generateFamily';
import { type ReviewQueue, inProcessQueue } from './ai/queue';
import type { ReviewDeps } from './ai/review';
import type { DB } from './db';
import type { FileStore } from './files';
import { errorHandler, jsonBody, notFound } from './http';
import type { BackupStore } from './backup';
import { adminRoutes } from './routes/admin';
import { authRoutes } from './routes/auth';
import { candidateRoutes } from './routes/candidate';
import { candidateAccountRoutes } from './routes/candidateAccount';
import { leadRoutes } from './routes/leads';
import { auditRoutes, clientErrorRoutes } from './routes/security';
import { SECURITY_HEADERS, recordError } from './security';

// API responses are JSON or audio, never pages; these are the headers that still matter for them.
const API_HEADERS = {
  'X-Content-Type-Options': SECURITY_HEADERS['X-Content-Type-Options'],
  'X-Frame-Options': SECURITY_HEADERS['X-Frame-Options'],
  'Referrer-Policy': SECURITY_HEADERS['Referrer-Policy'],
};
import { managerRoutes } from './routes/manager';

export interface AppOptions {
  db: DB;
  files: FileStore;
  /** Where nightly database copies live, for the admin console's list. */
  backups?: BackupStore;
  ai: AiConfig;
  now?: () => number;
  secureCookies?: boolean;
  /** How reviews run: in this process (default) or handed to a background function. */
  queue?: (deps: ReviewDeps) => ReviewQueue;
  /** How AI scenario generation runs, likewise. */
  generationQueue?: (deps: GenerationDeps) => GenerationQueue;
}

export interface AppDeps {
  db: DB;
  files: FileStore;
  backups: BackupStore | null;
  now: () => number;
  secureCookies: boolean;
  ai: AiConfig;
  reviews: ReviewQueue;
  generations: GenerationQueue;
  onSubmitted: (candidateId: string) => Promise<void>;
}

/** The JSON API. Serving the web client is handled in index.ts. */
export function createApi(options: AppOptions) {
  const now = options.now ?? Date.now;
  const reviewDeps: ReviewDeps = { db: options.db, files: options.files, now, ai: options.ai };
  const reviews = (options.queue ?? inProcessQueue)(reviewDeps);
  const generations = (options.generationQueue ?? inProcessGenerationQueue)({ db: options.db, ai: options.ai, now });
  const deps: AppDeps = {
    db: options.db,
    files: options.files,
    backups: options.backups ?? null,
    now,
    secureCookies: options.secureCookies ?? false,
    ai: options.ai,
    reviews,
    generations,
    onSubmitted: (candidateId) => reviews.enqueue(candidateId),
  };

  const router = express.Router();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set(API_HEADERS);
    next();
  });
  router.use('/auth', jsonBody('32kb'), authRoutes(deps));
  router.use('/candidate', jsonBody('32kb'), candidateAccountRoutes(deps));
  router.use('/c', candidateRoutes(deps));
  router.use('/leads', jsonBody('4kb'), leadRoutes(deps));
  router.use('/client-errors', jsonBody('16kb'), clientErrorRoutes(deps));
  router.use('/audit', auditRoutes(deps));
  router.use('/admin', jsonBody('16kb'), adminRoutes(deps));
  router.use(jsonBody('256kb'), managerRoutes(deps));
  router.use(() => {
    throw notFound('Unknown API route');
  });
  router.use(
    errorHandler((error, req) => {
      const e = error instanceof Error ? error : new Error(String(error));
      void recordError(
        options.db,
        {
          source: 'server',
          message: e.message || 'Unknown error',
          detail: e.stack ?? null,
          path: `${req.method} ${req.originalUrl}`,
        },
        now(),
      ).catch(() => undefined);
    }),
  );
  return { router, reviews, generations };
}

export function createApp(options: AppOptions & { trustProxy?: boolean | string }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', options.trustProxy ?? 'loopback');
  const { router, reviews, generations } = createApi(options);
  app.use('/api', router);
  return { app, reviews, generations };
}
