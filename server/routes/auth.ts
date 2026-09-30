import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import type { Me } from '../../shared/api';
import type { AppDeps } from '../app';
import {
  DUMMY_PASSWORD_HASH,
  SESSION_COOKIE,
  createSession,
  createUser,
  destroySession,
  readCookie,
  setSessionCookie,
  userForSession,
  verifyPassword,
} from '../auth';
import { one, run, transaction, type UserRow } from '../db';
import { HttpError, email, str } from '../http';

export function authRoutes({ db, now, secureCookies }: AppDeps) {
  const router = Router();

  router.get('/me', (req, res) => {
    const user = userForSession(db, readCookie(req, SESSION_COOKIE), now());
    const me: Me | null = user
      ? { id: user.id, name: user.name, email: user.email, role: user.role, orgName: user.orgName }
      : null;
    res.json({ user: me });
  });

  router.post('/signup', (req, res) => {
    const orgName = str(req.body.orgName, 'Company name', { max: 120 });
    const name = str(req.body.name, 'Your name', { max: 120 });
    const address = email(req.body.email);
    const password = str(req.body.password, 'Password', { min: 8, max: 200 });

    const userId = transaction(db, () => {
      const orgId = randomUUID();
      run(db, 'INSERT INTO orgs (id, name, created_at) VALUES (?, ?, ?)', orgId, orgName, now());
      return createUser(db, { orgId, name, email: address, password, role: 'manager' }, now());
    });
    setSessionCookie(res, createSession(db, userId, now()), secureCookies);
    res.status(201).json({ ok: true });
  });

  router.post('/login', (req, res) => {
    const address = email(req.body.email);
    const password = str(req.body.password, 'Password', { max: 200 });
    const user = one<UserRow>(db, 'SELECT * FROM users WHERE email = ?', address);
    const valid = verifyPassword(password, user?.password_hash ?? DUMMY_PASSWORD_HASH);
    if (!user || !valid) {
      throw new HttpError(401, 'Email or password is incorrect');
    }
    setSessionCookie(res, createSession(db, user.id, now()), secureCookies);
    res.json({ ok: true });
  });

  router.post('/logout', (req, res) => {
    const token = readCookie(req, SESSION_COOKIE);
    if (token) destroySession(db, token);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  return router;
}
