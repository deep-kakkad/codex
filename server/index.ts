import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createApi } from './app';
import { openDb } from './db';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isProduction = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT ?? 3000);
const dataDir = path.resolve(process.env.DATA_DIR ?? path.join(root, 'data'));
const uploadDir = path.join(dataDir, 'uploads');
mkdirSync(uploadDir, { recursive: true });

const db = openDb(path.join(dataDir, 'proofwork.db'));
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY ?? 'loopback');
app.use(
  '/api',
  createApi({ db, uploadDir, secureCookies: isProduction && process.env.INSECURE_COOKIES !== '1' }),
);

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
