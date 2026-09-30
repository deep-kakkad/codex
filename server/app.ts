import express from 'express';
import type { DB } from './db';
import { errorHandler, jsonBody, notFound } from './http';
import { authRoutes } from './routes/auth';
import { candidateRoutes } from './routes/candidate';
import { managerRoutes } from './routes/manager';

export interface AppOptions {
  db: DB;
  uploadDir: string;
  now?: () => number;
  secureCookies?: boolean;
}

export interface AppDeps {
  db: DB;
  uploadDir: string;
  now: () => number;
  secureCookies: boolean;
}

/** The JSON API. Serving the web client is handled in index.ts. */
export function createApi(options: AppOptions) {
  const deps: AppDeps = {
    db: options.db,
    uploadDir: options.uploadDir,
    now: options.now ?? Date.now,
    secureCookies: options.secureCookies ?? false,
  };

  const api = express.Router();
  api.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  api.use('/auth', jsonBody('32kb'), authRoutes(deps));
  api.use('/c', candidateRoutes(deps));
  api.use(jsonBody('256kb'), managerRoutes(deps));
  api.use(() => {
    throw notFound('Unknown API route');
  });
  api.use(errorHandler);
  return api;
}

export function createApp(options: AppOptions) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use('/api', createApi(options));
  return app;
}
