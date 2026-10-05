import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { type DB, all, one, run } from './db';
import { HttpError } from './http';

/**
 * The visitor's address. Netlify sets x-nf-client-connection-ip itself, so a
 * client can't forge it the way it can prepend to X-Forwarded-For.
 */
export function clientIp(req: Request): string {
  const netlify = req.headers['x-nf-client-connection-ip'];
  return (typeof netlify === 'string' && netlify) || req.ip || 'unknown';
}

// Throttling ----------------------------------------------------------------------

export interface Limit {
  /** e.g. "login:email:a@b.com" or "login:ip:1.2.3.4" */
  key: string;
  /** Failures allowed inside the window before further tries are refused. */
  max: number;
  windowMs: number;
}

const MINUTE = 60 * 1000;

export const limits = {
  login: (address: string, ip: string): Limit[] => [
    { key: `login:email:${address}`, max: 8, windowMs: 15 * MINUTE },
    { key: `login:ip:${ip}`, max: 30, windowMs: 15 * MINUTE },
  ],
  candidateLogin: (address: string, ip: string): Limit[] => [
    { key: `clogin:email:${address}`, max: 8, windowMs: 15 * MINUTE },
    { key: `clogin:ip:${ip}`, max: 30, windowMs: 15 * MINUTE },
  ],
  twoFactor: (ip: string): Limit[] => [{ key: `2fa:ip:${ip}`, max: 15, windowMs: 15 * MINUTE }],
  signup: (ip: string): Limit[] => [{ key: `signup:ip:${ip}`, max: 10, windowMs: 60 * MINUTE }],
  leads: (ip: string): Limit[] => [{ key: `leads:ip:${ip}`, max: 5, windowMs: 10 * MINUTE }],
  clientErrors: (ip: string): Limit[] => [{ key: `errors:ip:${ip}`, max: 20, windowMs: 10 * MINUTE }],
  apply: (ip: string): Limit[] => [{ key: `apply:ip:${ip}`, max: 10, windowMs: 60 * MINUTE }],
};

/** Refuses with 429 when any key has used up its failures inside its window. */
export async function checkThrottle(db: DB, keys: Limit[], now: number) {
  for (const limit of keys) {
    const row = await one<{ failures: number; window_start: number }>(
      db,
      'SELECT failures, window_start FROM auth_throttle WHERE key = ?',
      limit.key,
    );
    if (!row || now - row.window_start >= limit.windowMs || row.failures < limit.max) continue;
    const minutes = Math.max(1, Math.ceil((row.window_start + limit.windowMs - now) / MINUTE));
    throw new HttpError(429, `Too many attempts. Please try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`);
  }
}

/** Counts one failure (or, for sign-ups and forms, one use) against each key. */
export async function recordAttempt(db: DB, keys: Limit[], now: number) {
  for (const limit of keys) {
    await run(
      db,
      `INSERT INTO auth_throttle (key, failures, window_start) VALUES (?, 1, ?)
       ON CONFLICT (key) DO UPDATE SET
         failures = CASE WHEN auth_throttle.window_start <= ? THEN 1 ELSE auth_throttle.failures + 1 END,
         window_start = CASE WHEN auth_throttle.window_start <= ? THEN excluded.window_start ELSE auth_throttle.window_start END`,
      limit.key,
      now,
      now - limit.windowMs,
      now - limit.windowMs,
    );
  }
}

export async function clearThrottle(db: DB, key: string) {
  await run(db, 'DELETE FROM auth_throttle WHERE key = ?', key);
}

// Audit log -------------------------------------------------------------------------

export interface AuditEntry {
  orgId: string | null;
  userId?: string | null;
  /** Who did it: an email address, "candidate" or "system". */
  actor: string;
  action: string;
  /** What it was done to, in words: a candidate's name, a plan, an email. */
  target?: string | null;
  detail?: string | null;
  ip?: string | null;
}

export async function audit(db: DB, entry: AuditEntry, now: number) {
  await run(
    db,
    `INSERT INTO audit_log (id, org_id, user_id, actor, action, target, detail, ip, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    randomUUID(),
    entry.orgId,
    entry.userId ?? null,
    entry.actor,
    entry.action,
    entry.target ?? null,
    entry.detail ?? null,
    entry.ip ?? null,
    now,
  );
}

export interface AuditRow {
  id: string;
  org_id: string | null;
  actor: string;
  action: string;
  target: string | null;
  detail: string | null;
  ip: string | null;
  created_at: number;
}

export function auditForOrg(db: DB, orgId: string, limit = 100) {
  return all<AuditRow>(
    db,
    `SELECT id, org_id, actor, action, target, detail, ip, created_at
       FROM audit_log WHERE org_id = ? ORDER BY created_at DESC LIMIT ?`,
    orgId,
    limit,
  );
}

// Error log ---------------------------------------------------------------------------

export async function recordError(
  db: DB,
  error: { source: 'server' | 'browser'; message: string; detail?: string | null; path?: string | null },
  now: number,
) {
  await run(
    db,
    'INSERT INTO error_events (id, source, message, detail, path, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    randomUUID(),
    error.source,
    error.message.slice(0, 500),
    error.detail?.slice(0, 4000) ?? null,
    error.path?.slice(0, 300) ?? null,
    now,
  );
}

// Response headers ----------------------------------------------------------------------

/**
 * Sent with every page. Mirrored in netlify.toml (a test keeps the two equal).
 * The microphone is allowed on our own pages only, for think-aloud answers.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(self), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
};
