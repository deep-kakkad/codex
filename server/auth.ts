import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { type DB, one, run, type UserRow } from './db';
import { HttpError } from './http';

export const SESSION_COOKIE = 'pw_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface SessionUser {
  id: string;
  orgId: string;
  orgName: string;
  name: string;
  email: string;
  role: 'manager' | 'reviewer';
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

// Compared against when the email is unknown, so response time doesn't reveal which emails exist.
export const DUMMY_PASSWORD_HASH = hashPassword(randomBytes(16).toString('hex'));

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length);
  return timingSafeEqual(expected, actual);
}

export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString('base64url');
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export function createSession(db: DB, userId: string, now: number): string {
  const token = randomToken(32);
  const expiresAt = now + SESSION_TTL_MS;
  run(db, 'DELETE FROM sessions WHERE expires_at < ?', now);
  run(db, 'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', sha256(token), userId, expiresAt);
  return token;
}

export function destroySession(db: DB, token: string) {
  run(db, 'DELETE FROM sessions WHERE token_hash = ?', sha256(token));
}

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) {
      try {
        return decodeURIComponent(part.slice(index + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

export function setSessionCookie(res: Response, token: string, secure: boolean) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: SESSION_TTL_MS,
    path: '/',
  });
}

export function userForSession(db: DB, token: string | undefined, now: number): SessionUser | null {
  if (!token) return null;
  const row = one<UserRow & { org_name: string; expires_at: number }>(
    db,
    `SELECT u.*, o.name AS org_name, s.expires_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       JOIN orgs o ON o.id = u.org_id
      WHERE s.token_hash = ?`,
    sha256(token),
  );
  if (!row || row.expires_at < now) return null;
  return {
    id: row.id,
    orgId: row.org_id,
    orgName: row.org_name,
    name: row.name,
    email: row.email,
    role: row.role,
  };
}

export function requireUser(db: DB, now: () => number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = userForSession(db, readCookie(req, SESSION_COOKIE), now());
    if (!user) throw new HttpError(401, 'Please log in');
    res.locals.user = user;
    next();
  };
}

export function currentUser(res: Response): SessionUser {
  const user = res.locals.user as SessionUser | undefined;
  if (!user) throw new HttpError(401, 'Please log in');
  return user;
}

export function requireManager(res: Response): SessionUser {
  const user = currentUser(res);
  if (user.role !== 'manager') throw new HttpError(403, 'Only hiring managers can do this');
  return user;
}

export function createUser(
  db: DB,
  input: { orgId: string; name: string; email: string; password: string; role: 'manager' | 'reviewer' },
  now: number,
): string {
  const existing = one<{ id: string }>(db, 'SELECT id FROM users WHERE email = ?', input.email);
  if (existing) throw new HttpError(409, 'An account with this email already exists');
  const id = randomUUID();
  run(
    db,
    'INSERT INTO users (id, org_id, name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id,
    input.orgId,
    input.name,
    input.email,
    hashPassword(input.password),
    input.role,
    now,
  );
  return id;
}
