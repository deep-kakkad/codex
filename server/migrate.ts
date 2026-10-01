// Applies netlify/database/migrations/*.sql to the Neon database in
// DATABASE_URL, each once, in order. Uses Neon's HTTP API (port 443), so it
// works where outbound Postgres connections are blocked.
//   DATABASE_URL=postgres://... npm run migrate
import { neon } from '@neondatabase/serverless';
import { migrationFiles } from './db';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Set DATABASE_URL to the database to migrate.');
  process.exit(1);
}
const sql = neon(url);

/** Our migrations are plain DDL: statements end with a semicolon at the end of a line. */
function statements(source: string): string[] {
  return source
    .replace(/^\s*--.*$/gm, '')
    .split(/;\s*$/m)
    .map((s) => s.trim())
    .filter(Boolean);
}

await sql.query(
  'CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())',
);
const applied = new Set(((await sql.query('SELECT name FROM _migrations')) as { name: string }[]).map((r) => r.name));
for (const migration of migrationFiles()) {
  if (applied.has(migration.name)) continue;
  // One HTTP transaction per migration: all of it applies, or none.
  await sql.transaction([
    ...statements(migration.sql).map((statement) => sql.query(statement)),
    sql.query('INSERT INTO _migrations (name) VALUES ($1)', [migration.name]),
  ]);
  console.log(`Applied ${migration.name}`);
}
console.log('Database is up to date.');
