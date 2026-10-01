// Creates the demo workspace.
//   npm run seed            local database (refuses if the demo already exists)
//   npm run seed -- --reset wipes ./data first
//   npm run seed -- --remote a deployed site: DATABASE_URL (Neon), NETLIFY_SITE_ID and
//                            NETLIFY_AUTH_TOKEN (recordings go to its Blobs)
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';
import { type DB, fromNeonHttp } from './db';
import { seedDemo } from './demo';
import { type FileStore, localFileStore, netlifyBlobStore } from './files';
import { openLocalDb } from './localDb';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.resolve(process.env.DATA_DIR ?? path.join(root, 'data'));
const remote = process.argv.includes('--remote');

let db: DB;
let files: FileStore;
if (remote) {
  const { DATABASE_URL, NETLIFY_SITE_ID, NETLIFY_AUTH_TOKEN } = process.env;
  if (!DATABASE_URL || !NETLIFY_SITE_ID || !NETLIFY_AUTH_TOKEN) {
    console.error('--remote needs DATABASE_URL, NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN.');
    process.exit(1);
  }
  db = fromNeonHttp(neon(DATABASE_URL) as unknown as Parameters<typeof fromNeonHttp>[0]);
  files = netlifyBlobStore('recordings', { siteID: NETLIFY_SITE_ID, token: NETLIFY_AUTH_TOKEN });
} else {
  if (process.argv.includes('--reset')) rmSync(dataDir, { recursive: true, force: true });
  mkdirSync(dataDir, { recursive: true });
  db = await openLocalDb(path.join(dataDir, 'pg'));
  files = localFileStore(path.join(dataDir, 'uploads'));
}

const created = await seedDemo(db, files);
if (!created) {
  console.error(
    remote
      ? 'The demo workspace already exists on that site.'
      : 'The demo workspace already exists. Run `npm run seed -- --reset` to start fresh.',
  );
  process.exit(1);
}
console.log(`Demo data created${remote ? ' on the deployed site' : ` in ${dataDir}`}
  Recruiter: demo@proofwork.test / demo-password
  Candidate: asha.rao@example.com / demo-password (any demo candidate's email works)
Submitted candidates are reviewed by AI when the server starts with OPENROUTER_API_KEY set.`);
