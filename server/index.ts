import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { aiConfigFromEnv } from './ai/client';
import { createApi } from './app';
import { seedDemo } from './demo';
import { type DB, fromPgPool } from './db';
import { localFileStore } from './files';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isProduction = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT ?? 3000);
const dataDir = path.resolve(process.env.DATA_DIR ?? path.join(root, 'data'));
mkdirSync(dataDir, { recursive: true });

// A real Postgres if DATABASE_URL is set (e.g. your Netlify database), otherwise PGlite on disk.
async function openDatabase(): Promise<DB> {
  if (process.env.DATABASE_URL) {
    const { getDatabase } = await import('@netlify/database');
    return fromPgPool(getDatabase({ connectionString: process.env.DATABASE_URL }).pool);
  }
  const { openLocalDb } = await import('./localDb');
  return openLocalDb(path.join(dataDir, 'pg'));
}

const db = await openDatabase();
const files = localFileStore(path.join(dataDir, 'uploads'));
if (process.env.DEMO_SEED === '1' && (await seedDemo(db, files))) console.log('Created the demo workspace.');
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY ?? 'loopback');
const ai = aiConfigFromEnv();
if (!ai.client) console.warn('OPENROUTER_API_KEY is not set: AI reviews will fail until it is.');
const { router, reviews } = createApi({
  db,
  files,
  ai,
  secureCookies: isProduction && process.env.INSECURE_COOKIES !== '1',
});
app.use('/api', router);
await reviews.resume();

if (isProduction) {
  const webDir = path.join(root, 'dist', 'web');
  if (!existsSync(path.join(webDir, 'index.html'))) {
    throw new Error('Web client not built. Run `npm run build` first.');
  }
  app.use(express.static(webDir, { index: false, maxAge: '1h' }));
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    res.sendFile(path.join(webDir, 'index.html'));
  });
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({
    configFile: path.join(root, 'vite.config.ts'),
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}

app.listen(port, () => {
  console.log(`Proofwork running at http://localhost:${port} (${isProduction ? 'production' : 'development'})`);
});
