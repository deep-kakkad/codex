// Creates the demo workspace in the local database.
//   npm run seed            (refuses if the demo already exists)
//   npm run seed -- --reset (wipes ./data first)
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedDemo } from './demo';
import { localFileStore } from './files';
import { openLocalDb } from './localDb';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.resolve(process.env.DATA_DIR ?? path.join(root, 'data'));

if (process.argv.includes('--reset')) rmSync(dataDir, { recursive: true, force: true });
mkdirSync(dataDir, { recursive: true });
const db = await openLocalDb(path.join(dataDir, 'pg'));
const created = await seedDemo(db, localFileStore(path.join(dataDir, 'uploads')));
if (!created) {
  console.error('The demo workspace already exists. Run `npm run seed -- --reset` to start fresh.');
  process.exit(1);
}
console.log(`Demo data created in ${dataDir}
  Recruiter: demo@proofwork.test / demo-password
  Candidate: asha.rao@example.com / demo-password (any demo candidate's email works)
Submitted candidates are reviewed by AI when the server starts with OPENROUTER_API_KEY set.`);
