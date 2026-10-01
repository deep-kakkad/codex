import { PGlite } from '@electric-sql/pglite';
import { type DB, migrationFiles } from './db';

/**
 * In-process Postgres for local development and tests. Applies the same
 * migrations Netlify applies on deploy. Pass a directory to persist data.
 */
export async function openLocalDb(dataDir?: string): Promise<DB> {
  const pg = dataDir ? new PGlite(dataDir) : new PGlite();
  await pg.exec('CREATE TABLE IF NOT EXISTS _local_migrations (name TEXT PRIMARY KEY)');
  const applied = new Set(
    (await pg.query<{ name: string }>('SELECT name FROM _local_migrations')).rows.map((r) => r.name),
  );
  for (const migration of migrationFiles()) {
    if (applied.has(migration.name)) continue;
    await pg.exec(migration.sql);
    await pg.query('INSERT INTO _local_migrations (name) VALUES ($1)', [migration.name]);
  }
  return {
    async query<T>(sql: string, params: unknown[] = []) {
      const result = await pg.query<T>(sql, params);
      return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
    },
  };
}
