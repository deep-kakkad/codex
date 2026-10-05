import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { type CandidateAccountRow, type DB, one, run, type UserRow } from './db';
import { HttpError } from './http';

export const SESSION_COOKIE = 'pw_session';
export const CANDIDATE_COOKIE = 'pw_candidate';
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

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export async function createSession(db: DB, userId: string, now: number): Promise<string> {
  const token = randomToken(32);
  const expiresAt = now + SESSION_TTL_MS;
  await run(db, 'DELETE FROM sessions WHERE expires_at < ?', now);
  await run(
    db,
    'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
    sha256(token),
    userId,
    expiresAt,
  );
  return token;
}

export async function destroySession(db: DB, token: string) {
  await run(db, 'DELETE FROM sessions WHERE token_hash = ?', sha256(token));
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

export function setSessionCookie(res: Response, token: string, secure: boolean, name = SESSION_COOKIE) {
  res.cookie(name, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: SESSION_TTL_MS,
    path: '/',
  });
}

export async function userForSession(db: DB, token: string | undefined, now: number): Promise<SessionUser | null> {
  if (!token) return null;
  const row = await one<UserRow & { org_name: string; expires_at: number }>(
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
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = await userForSession(db, readCookie(req, SESSION_COOKIE), now());
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

export async function createUser(
  db: DB,
  input: { orgId: string; name: string; email: string; password: string; role: 'manager' | 'reviewer' },
  now: number,
): Promise<string> {
  const existing = await one<{ id: string }>(db, 'SELECT id FROM users WHERE email = ?', input.email);
  if (existing) throw new HttpError(409, 'An account with this email already exists');
  const id = randomUUID();
  await run(
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

// Candidate accounts ---------------------------------------------------------

export interface SessionCandidate {
  id: string;
  name: string;
  email: string;
}

export async function createCandidateSession(db: DB, accountId: string, now: number): Promise<string> {
  const token = randomToken(32);
  await run(db, 'DELETE FROM candidate_sessions WHERE expires_at < ?', now);
  await run(
    db,
    'INSERT INTO candidate_sessions (token_hash, account_id, expires_at) VALUES (?, ?, ?)',
    sha256(token),
    accountId,
    now + SESSION_TTL_MS,
  );
  return token;
}

export async function destroyCandidateSession(db: DB, token: string) {
  await run(db, 'DELETE FROM candidate_sessions WHERE token_hash = ?', sha256(token));
}

export async function candidateForSession(
  db: DB,
  token: string | undefined,
  now: number,
): Promise<SessionCandidate | null> {
  if (!token) return null;
  const row = await one<CandidateAccountRow & { expires_at: number }>(
    db,
    `SELECT a.*, s.expires_at FROM candidate_sessions s JOIN candidate_accounts a ON a.id = s.account_id
      WHERE s.token_hash = ?`,
    sha256(token),
  );
  if (!row || row.expires_at < now) return null;
  return { id: row.id, name: row.name, email: row.email };
}

export async function requireCandidate(db: DB, req: Request, now: number): Promise<SessionCandidate> {
  const candidate = await candidateForSession(db, readCookie(req, CANDIDATE_COOKIE), now);
  if (!candidate) throw new HttpError(401, 'Please log in to your candidate account');
  return candidate;
}

export async function createCandidateAccount(
  db: DB,
  input: { name: string; email: string; password: string },
  now: number,
): Promise<string> {
  if (await one(db, 'SELECT id FROM candidate_accounts WHERE email = ?', input.email)) {
    throw new HttpError(409, 'A candidate account with this email already exists');
  }
  const id = randomUUID();
  await run(
    db,
    'INSERT INTO candidate_accounts (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)',
    id,
    input.name,
    input.email,
    hashPassword(input.password),
    now,
  );
  return id;
}
