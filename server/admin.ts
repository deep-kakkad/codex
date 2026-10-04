// Operator commands against the database in DATABASE_URL (or a local data
// directory in DATA_DIR). Payments aren't built yet, so plans change here.
//   npm run admin -- costs [days]             what AI cost, per workspace and job
//   npm run admin -- requests                 upgrade requests and current plans
//   npm run admin -- plan <email> <plan> [credits]
//        set the plan of the workspace that <email> belongs to; queues held reviews
//   npm run admin -- leads [days]             work emails left at the end of the guided demo
//   npm run admin -- password <email> <file>  set a recruiter's password to the contents of <file>
//        (read from a file so the password never appears in the shell history or output)
import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';
import { PLAN_NAMES, type PlanId } from '../shared/plans';
import { hashPassword } from './auth';
import { type DB, all, fromNeonHttp, one, run } from './db';
import { openLocalDb } from './localDb';
import { setPlan } from './plans';

const USD_TO_INR = 88;

async function database(): Promise<DB> {
  if (process.env.DATABASE_URL) return fromNeonHttp(neon(process.env.DATABASE_URL));
  if (process.env.DATA_DIR) return openLocalDb(process.env.DATA_DIR);
  console.error('Set DATABASE_URL (production) or DATA_DIR (local) first.');
  process.exit(1);
}

const money = (usd: number) => `$${usd.toFixed(3)} (₹${(usd * USD_TO_INR).toFixed(1)})`;

const [command, ...args] = process.argv.slice(2);
const db = await database();

if (command === 'costs') {
  const days = Number(args[0] ?? 30);
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const rows = await all<{
    org: string;
    kind: string;
    jobs: number;
    failed: number;
    cost: number;
    avg: number;
    max: number;
  }>(
    db,
    `SELECT o.name AS org, u.kind, COUNT(*)::int AS jobs, SUM(1 - u.ok)::int AS failed,
            SUM(u.cost_usd) AS cost, AVG(u.cost_usd) AS avg, MAX(u.cost_usd) AS max
       FROM ai_usage u JOIN orgs o ON o.id = u.org_id
      WHERE u.created_at >= ?
      GROUP BY o.name, u.kind ORDER BY o.name, u.kind`,
    since,
  );
  console.log(`AI cost in the last ${days} days\n`);
  for (const r of rows) {
    console.log(
      `${r.org.padEnd(24)} ${r.kind.padEnd(15)} ${String(r.jobs).padStart(4)} jobs` +
        `${r.failed ? ` (${r.failed} failed)` : ''}  total ${money(r.cost)}  avg ${money(r.avg)}  max ${money(r.max)}`,
    );
  }
  const total = rows.reduce((sum, r) => sum + r.cost, 0);
  console.log(`\nTotal ${money(total)}`);
} else if (command === 'requests') {
  const rows = await all<{
    org: string;
    plan: string;
    credits: number;
    asked: string | null;
    note: string | null;
    who: string | null;
    at: number | null;
  }>(
    db,
    `SELECT o.name AS org, o.plan, o.review_credits AS credits, r.plan AS asked, r.note, u.email AS who, r.created_at AS at
       FROM orgs o
       LEFT JOIN upgrade_requests r ON r.org_id = o.id
       LEFT JOIN users u ON u.id = r.user_id
      ORDER BY r.created_at DESC NULLS LAST, o.created_at DESC`,
  );
  for (const r of rows) {
    const plan = `${PLAN_NAMES[r.plan as PlanId] ?? r.plan}${r.plan === 'payg' ? `, ${r.credits} credits` : ''}`;
    const asked = r.asked
      ? ` → asked for ${r.asked} on ${new Date(r.at!).toISOString().slice(0, 10)} by ${r.who}${r.note ? `: ${r.note}` : ''}`
      : '';
    console.log(`${r.org.padEnd(24)} ${plan}${asked}`);
  }
} else if (command === 'plan') {
  const [email, plan, credits] = args;
  if (!email || !plan || !(plan in PLAN_NAMES)) {
    console.error(`Usage: plan <email> <${Object.keys(PLAN_NAMES).join('|')}> [credits]`);
    process.exit(1);
  }
  const user = await one<{ org_id: string }>(db, 'SELECT org_id FROM users WHERE lower(email) = lower(?)', email);
  if (!user) {
    console.error(`No recruiter with the email ${email}`);
    process.exit(1);
  }
  const unlocked = await setPlan(db, user.org_id, plan as PlanId, credits === undefined ? undefined : Number(credits));
  console.log(
    `Set to ${PLAN_NAMES[plan as PlanId]}. ${unlocked} held review${unlocked === 1 ? '' : 's'} queued; ` +
      'the scheduled sweep starts them within 10 minutes.',
  );
} else if (command === 'leads') {
  const days = Number(args[0] ?? 30);
  const rows = await all<{ email: string; source: string; created_at: number }>(
    db,
    'SELECT email, source, created_at FROM demo_leads WHERE created_at >= ? ORDER BY created_at DESC',
    Date.now() - days * 24 * 60 * 60 * 1000,
  );
  console.log(`${rows.length} demo lead${rows.length === 1 ? '' : 's'} in the last ${days} days\n`);
  for (const r of rows) {
    console.log(
      `${new Date(r.created_at).toISOString().slice(0, 16).replace('T', ' ')}  ${r.source.padEnd(15)} ${r.email}`,
    );
  }
} else if (command === 'password') {
  const [address, file] = args;
  if (!address || !file) {
    console.error('Usage: password <email> <file containing the new password>');
    process.exit(1);
  }
  const password = readFileSync(file, 'utf8').trim();
  if (password.length < 12) {
    console.error('Use a password of at least 12 characters.');
    process.exit(1);
  }
  const user = await one<{ id: string }>(db, 'SELECT id FROM users WHERE lower(email) = lower(?)', address);
  if (!user) {
    console.error(`No recruiter with the email ${address}`);
    process.exit(1);
  }
  await run(db, 'UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(password), user.id);
  // Signed-in browsers keep working only if they know the new password.
  await run(db, 'DELETE FROM sessions WHERE user_id = ?', user.id);
  console.log(`Changed the password for ${address} and signed out its other sessions.`);
} else {
  console.error(
    'Commands: costs [days] | requests | plan <email> <plan> [credits] | leads [days] | password <email> <file>',
  );
  process.exit(1);
}
