import express from 'express';
import type { AiConfig } from './ai/client';
import { type ReviewQueue, createReviewQueue } from './ai/queue';
import type { DB } from './db';
import { errorHandler, jsonBody, notFound } from './http';
import { authRoutes } from './routes/auth';
import { candidateRoutes } from './routes/candidate';
import { candidateAccountRoutes } from './routes/candidateAccount';
import { managerRoutes } from './routes/manager';

export interface AppOptions {
  db: DB;
  uploadDir: string;
  ai: AiConfig;
  now?: () => number;
  secureCookies?: boolean;
}

export interface AppDeps {
  db: DB;
  uploadDir: string;
  now: () => number;
  secureCookies: boolean;
  ai: AiConfig;
  reviews: ReviewQueue;
  onSubmitted: (candidateId: string) => void;
}

/** The JSON API. Serving the web client is handled in index.ts. */
export function createApi(options: AppOptions) {
  const now = options.now ?? Date.now;
  const reviews = createReviewQueue({ db: options.db, uploadDir: options.uploadDir, now, ai: options.ai });
  const deps: AppDeps = {
    db: options.db,
    uploadDir: options.uploadDir,
    now,
    secureCookies: options.secureCookies ?? false,
    ai: options.ai,
    reviews,
    onSubmitted: (candidateId) => reviews.enqueue(candidateId),
  };

  const router = express.Router();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.use('/auth', jsonBody('32kb'), authRoutes(deps));
  router.use('/candidate', jsonBody('32kb'), candidateAccountRoutes(deps));
  router.use('/c', candidateRoutes(deps));
  router.use(jsonBody('256kb'), managerRoutes(deps));
  router.use(() => {
    throw notFound('Unknown API route');
  });
  router.use(errorHandler);
  return { router, reviews };
}

export function createApp(options: AppOptions) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  const { router, reviews } = createApi(options);
  app.use('/api', router);
  return { app, reviews };
}
