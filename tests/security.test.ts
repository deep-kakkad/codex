import { describe, expect, it } from 'vitest';
import { gzipSync } from 'node:zlib';
import { dumpDatabase, readBackup, restoreDatabase, runBackup, type BackupStore } from '../server/backup';
import { run } from '../server/db';
import { openLocalDb } from '../server/localDb';
import { base32Encode, codeAt, newRecoveryCodes, useRecoveryCode, verifyCode } from '../server/totp';

describe('authenticator codes', () => {
  // RFC 6238, appendix B (SHA-1), last six digits.
  const secret = base32Encode(Buffer.from('12345678901234567890'));
  it('matches the RFC test vectors', () => {
    expect(codeAt(secret, Math.floor(59 / 30))).toBe('287082');
    expect(codeAt(secret, Math.floor(1111111109 / 30))).toBe('081804');
    expect(codeAt(secret, Math.floor(2000000000 / 30))).toBe('279037');
  });

  it('allows one step of drift and refuses a code used before', () => {
    const now = 1111111109 * 1000;
    expect(verifyCode(secret, '081804', now, null)).toBe(Math.floor(1111111109 / 30));
    expect(verifyCode(secret, '081 804', now + 30_000, null)).not.toBeNull();
    expect(verifyCode(secret, '081804', now + 90_000, null)).toBeNull();
    expect(verifyCode(secret, '081804', now, Math.floor(1111111109 / 30))).toBeNull();
    expect(verifyCode(secret, 'abcdef', now, null)).toBeNull();
  });

  it('uses each recovery code once', () => {
    const { codes, hashes } = newRecoveryCodes();
    const left = useRecoveryCode(hashes, codes[3])!;
    expect(left).toHaveLength(9);
    expect(useRecoveryCode(left, codes[3])).toBeNull();
  });
});

describe('backups', () => {
  it('restores a copy into an empty database, and keeps two weeks', async () => {
    const source = await openLocalDb();
    await run(source, "INSERT INTO orgs (id, name, created_at) VALUES ('o1', 'Acme', 1)");
    await run(
      source,
      "INSERT INTO users (id, org_id, name, email, password_hash, role, created_at) VALUES ('u1', 'o1', 'Maya', 'm@a.test', 'x', 'manager', 1)",
    );
    await run(source, "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ('t', 'u1', 9)");
    const backup = await dumpDatabase(source, 5);
    expect(backup.tables.users).toHaveLength(1);
    expect(backup.tables.sessions).toBeUndefined();

    const target = await openLocalDb();
    expect(await restoreDatabase(target, readBackup(gzipSync(JSON.stringify(backup))))).toBeGreaterThanOrEqual(2);
    const { rows } = await target.query<{ email: string }>('SELECT email FROM users');
    expect(rows).toEqual([{ email: 'm@a.test' }]);
    await expect(restoreDatabase(target, backup)).rejects.toThrow(/empty database/);

    const files = new Map<string, Buffer>();
    const store: BackupStore = {
      put: async (k, d) => void files.set(k, d),
      get: async (k) => files.get(k) ?? null,
      list: async () => [...files.keys()].sort(),
      delete: async (k) => void files.delete(k),
    };
    const day = 24 * 60 * 60 * 1000;
    const start = Date.UTC(2026, 0, 1);
    for (let d = 0; d < 20; d++) await runBackup(source, store, start + d * day);
    const kept = await store.list();
    expect(kept).toHaveLength(15);
    expect(kept[0]).toBe('2026-01-06.json.gz');
    expect(kept.at(-1)).toBe('2026-01-20.json.gz');
  });
});
