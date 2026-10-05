import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { type DB, all } from './db';

/**
 * Nightly copies of the database, kept for two weeks, independent of the
 * database provider's own restore window. Short-lived security rows
 * (sessions, sign-in challenges, throttle counters) are left out.
 */
export const BACKUP_DAYS = 14;
const SKIP = new Set([
  'sessions',
  'candidate_sessions',
  'login_challenges',
  'auth_throttle',
  '_migrations',
  '_local_migrations',
]);

export interface BackupStore {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  list(): Promise<string[]>;
  delete(key: string): Promise<void>;
}

export interface Backup {
  version: 1;
  createdAt: number;
  tables: Record<string, Record<string, unknown>[]>;
}

async function tableNames(db: DB) {
  const rows = await all<{ table_name: string }>(
    db,
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`,
  );
  return rows.map((r) => r.table_name).filter((name) => !SKIP.has(name));
}

export async function dumpDatabase(db: DB, now: number): Promise<Backup> {
  const tables: Backup['tables'] = {};
  for (const name of await tableNames(db)) tables[name] = await all(db, `SELECT * FROM "${name}"`);
  return { version: 1, createdAt: now, tables };
}

export const backupKey = (now: number) => `${new Date(now).toISOString().slice(0, 10)}.json.gz`;

/** Writes today's copy and deletes copies older than BACKUP_DAYS. Returns the new key. */
export async function runBackup(db: DB, store: BackupStore, now: number) {
  const key = backupKey(now);
  await store.put(key, gzipSync(JSON.stringify(await dumpDatabase(db, now))));
  const oldest = backupKey(now - BACKUP_DAYS * 24 * 60 * 60 * 1000);
  for (const existing of await store.list()) if (existing < oldest) await store.delete(existing);
  return key;
}

export function readBackup(data: Buffer): Backup {
  const backup = JSON.parse(gunzipSync(data).toString('utf8')) as Backup;
  if (backup.version !== 1) throw new Error('Unknown backup format');
  return backup;
}

/** Parents before children, following the foreign keys. */
async function insertOrder(db: DB, names: string[]) {
  const edges = await all<{ child: string; parent: string }>(
    db,
    `SELECT c.relname AS child, p.relname AS parent
       FROM pg_constraint k
       JOIN pg_class c ON c.oid = k.conrelid
       JOIN pg_class p ON p.oid = k.confrelid
      WHERE k.contype = 'f'`,
  );
  const ordered: string[] = [];
  const visit = (name: string, seen: Set<string>) => {
    if (ordered.includes(name) || seen.has(name)) return;
    seen.add(name);
    for (const e of edges) if (e.child === name && e.parent !== name) visit(e.parent, seen);
    ordered.push(name);
  };
  for (const name of names) visit(name, new Set());
  return ordered.filter((name) => names.includes(name));
}

/** Loads a backup into an empty, migrated database (a fresh one, never the live one). */
export async function restoreDatabase(db: DB, backup: Backup) {
  const existing = await all<{ n: number }>(db, 'SELECT COUNT(*)::int AS n FROM orgs');
  if (existing[0].n > 0) throw new Error('Restore only into an empty database: this one already has workspaces.');
  const names = Object.keys(backup.tables);
  let rows = 0;
  for (const name of await insertOrder(db, names)) {
    for (const row of backup.tables[name]) {
      const columns = Object.keys(row);
      await db.query(
        `INSERT INTO "${name}" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})`,
        columns.map((c) => row[c]),
      );
      rows += 1;
    }
  }
  return rows;
}

/** Backups in a folder, for local runs. */
export function localBackupStore(dir: string): BackupStore {
  mkdirSync(dir, { recursive: true });
  return {
    async put(key, data) {
      writeFileSync(path.join(dir, key), data);
    },
    async get(key) {
      try {
        return readFileSync(path.join(dir, path.basename(key)));
      } catch {
        return null;
      }
    },
    async list() {
      return readdirSync(dir)
        .filter((f) => f.endsWith('.json.gz'))
        .sort();
    },
    async delete(key) {
      rmSync(path.join(dir, path.basename(key)), { force: true });
    },
  };
}

/** Backups in Netlify Blobs, next to the recordings. */
export function netlifyBackupStore(): BackupStore {
  const store = async () => (await import('@netlify/blobs')).getStore({ name: 'backups', consistency: 'strong' });
  return {
    async put(key, data) {
      await (await store()).set(key, new Uint8Array(data).buffer);
    },
    async get(key) {
      const value = await (await store()).get(key, { type: 'arrayBuffer' });
      return value ? Buffer.from(value) : null;
    },
    async list() {
      const { blobs } = await (await store()).list();
      return blobs.map((b) => b.key).sort();
    },
    async delete(key) {
      await (await store()).delete(key);
    },
  };
}
