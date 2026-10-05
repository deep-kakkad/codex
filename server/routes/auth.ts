import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import QRCode from 'qrcode';
import type { AccountSecurity, LoginResult, Me } from '../../shared/api';
import type { AppDeps } from '../app';
import {
  DUMMY_PASSWORD_HASH,
  SESSION_COOKIE,
  createSession,
  createUser,
  currentUser,
  destroySession,
  randomToken,
  readCookie,
  requireUser,
  setSessionCookie,
  sha256,
  userForSession,
  verifyPassword,
} from '../auth';
import { one, run, type UserRow } from '../db';
import { HttpError, email, str } from '../http';
import { audit, checkThrottle, clearThrottle, clientIp, limits, recordAttempt } from '../security';
import { newRecoveryCodes, newSecret, otpauthUrl, useRecoveryCode, verifyCode } from '../totp';

const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const CHALLENGE_TRIES = 5;

interface SecurityRow extends UserRow {
  totp_secret: string | null;
  totp_pending_secret: string | null;
  totp_last_step: number | null;
  recovery_codes: string | null;
}

const recoveryLeft = (row: SecurityRow) =>
  row.recovery_codes ? (JSON.parse(row.recovery_codes) as string[]).length : 0;

export function authRoutes({ db, now, secureCookies }: AppDeps) {
  const router = Router();
  const signedIn = requireUser(db, now);

  async function startSession(res: Parameters<typeof setSessionCookie>[0], user: UserRow, ip: string, how: string) {
    setSessionCookie(res, await createSession(db, user.id, now()), secureCookies);
    await audit(
      db,
      { orgId: user.org_id, userId: user.id, actor: user.email, action: 'signed in', detail: how, ip },
      now(),
    );
  }

  /** The code from an authenticator app, or one of the recovery codes. Updates what was used. */
  async function checkSecondFactor(user: SecurityRow, code: string): Promise<'app' | 'recovery' | null> {
    if (!user.totp_secret) return null;
    const step = verifyCode(
      user.totp_secret,
      code,
      now(),
      user.totp_last_step === null ? null : Number(user.totp_last_step),
    );
    if (step !== null) {
      await run(db, 'UPDATE users SET totp_last_step = ? WHERE id = ?', step, user.id);
      return 'app';
    }
    const left = useRecoveryCode(user.recovery_codes ? (JSON.parse(user.recovery_codes) as string[]) : [], code);
    if (left) {
      await run(db, 'UPDATE users SET recovery_codes = ? WHERE id = ?', JSON.stringify(left), user.id);
      return 'recovery';
    }
    return null;
  }

  router.get('/me', async (req, res) => {
    const user = await userForSession(db, readCookie(req, SESSION_COOKIE), now());
    const me: Me | null = user
      ? { id: user.id, name: user.name, email: user.email, role: user.role, orgName: user.orgName }
      : null;
    res.json({ user: me });
  });

  router.post('/signup', async (req, res) => {
    const ip = clientIp(req);
    await checkThrottle(db, limits.signup(ip), now());
    const orgName = str(req.body.orgName, 'Company name', { max: 120 });
    const name = str(req.body.name, 'Your name', { max: 120 });
    const address = email(req.body.email);
    const password = str(req.body.password, 'Password', { min: 8, max: 200 });

    if (await one(db, 'SELECT id FROM users WHERE email = ?', address)) {
      throw new HttpError(409, 'An account with this email already exists');
    }
    await recordAttempt(db, limits.signup(ip), now());
    const orgId = randomUUID();
    await run(db, 'INSERT INTO orgs (id, name, created_at) VALUES (?, ?, ?)', orgId, orgName, now());
    let userId: string;
    try {
      userId = await createUser(db, { orgId, name, email: address, password, role: 'manager' }, now());
    } catch (error) {
      // Lost a race for the same email: don't leave an empty workspace behind.
      await run(db, 'DELETE FROM orgs WHERE id = ?', orgId);
      throw error;
    }
    setSessionCookie(res, await createSession(db, userId, now()), secureCookies);
    await audit(db, { orgId, userId, actor: address, action: 'created the workspace', target: orgName, ip }, now());
    res.status(201).json({ ok: true });
  });

  router.post('/login', async (req, res) => {
    const ip = clientIp(req);
    const address = email(req.body.email);
    const password = str(req.body.password, 'Password', { max: 200 });
    const keys = limits.login(address, ip);
    await checkThrottle(db, keys, now());
    const user = await one<SecurityRow>(db, 'SELECT * FROM users WHERE email = ?', address);
    const valid = verifyPassword(password, user?.password_hash ?? DUMMY_PASSWORD_HASH);
    if (!user || !valid) {
      await recordAttempt(db, keys, now());
      throw new HttpError(401, 'Email or password is incorrect');
    }
    await clearThrottle(db, keys[0].key);
    if (user.totp_secret) {
      // The password was right; the authenticator code comes next.
      const challenge = randomToken(24);
      await run(db, 'DELETE FROM login_challenges WHERE expires_at < ?', now());
      await run(
        db,
        'INSERT INTO login_challenges (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
        sha256(challenge),
        user.id,
        now() + CHALLENGE_TTL_MS,
      );
      const result: LoginResult = { ok: true, twoFactor: true, challenge };
      res.json(result);
      return;
    }
    await startSession(res, user, ip, 'password');
    res.json({ ok: true } satisfies LoginResult);
  });

  router.post('/login/verify', async (req, res) => {
    const ip = clientIp(req);
    await checkThrottle(db, limits.twoFactor(ip), now());
    const challenge = str(req.body.challenge, 'Sign-in', { max: 200 });
    const code = str(req.body.code, 'Code', { max: 40 });
    const row = await one<{ user_id: string; expires_at: number; attempts: number }>(
      db,
      'SELECT user_id, expires_at, attempts FROM login_challenges WHERE token_hash = ?',
      sha256(challenge),
    );
    if (!row || row.expires_at < now() || row.attempts >= CHALLENGE_TRIES) {
      if (row) await run(db, 'DELETE FROM login_challenges WHERE token_hash = ?', sha256(challenge));
      throw new HttpError(401, 'This sign-in has expired. Please enter your password again.');
    }
    const user = (await one<SecurityRow>(db, 'SELECT * FROM users WHERE id = ?', row.user_id))!;
    const used = await checkSecondFactor(user, code);
    if (!used) {
      await run(db, 'UPDATE login_challenges SET attempts = attempts + 1 WHERE token_hash = ?', sha256(challenge));
      await recordAttempt(db, limits.twoFactor(ip), now());
      throw new HttpError(401, 'That code didn’t work. Check your authenticator app and try again.');
    }
    await run(db, 'DELETE FROM login_challenges WHERE token_hash = ?', sha256(challenge));
    await startSession(
      res,
      user,
      ip,
      used === 'app' ? 'password and authenticator code' : 'password and recovery code',
    );
    res.json({ ok: true } satisfies LoginResult);
  });

  router.post('/logout', async (req, res) => {
    const token = readCookie(req, SESSION_COOKIE);
    if (token) await destroySession(db, token);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  // Account security ---------------------------------------------------------------

  async function securityOf(userId: string): Promise<AccountSecurity> {
    const row = (await one<SecurityRow>(db, 'SELECT * FROM users WHERE id = ?', userId))!;
    return { twoFactor: Boolean(row.totp_secret), recoveryCodesLeft: recoveryLeft(row) };
  }

  router.get('/security', signedIn, async (_req, res) => {
    res.json(await securityOf(currentUser(res).id));
  });

  router.post('/2fa/setup', signedIn, async (_req, res) => {
    const user = currentUser(res);
    const secret = newSecret();
    await run(db, 'UPDATE users SET totp_pending_secret = ? WHERE id = ?', secret, user.id);
    const url = otpauthUrl(secret, user.email);
    const svg = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
    res.json({ secret, qr: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}` });
  });

  router.post('/2fa/enable', signedIn, async (req, res) => {
    const user = currentUser(res);
    const code = str(req.body.code, 'Code', { max: 20 });
    const row = (await one<SecurityRow>(db, 'SELECT * FROM users WHERE id = ?', user.id))!;
    if (!row.totp_pending_secret) throw new HttpError(409, 'Start the setup again');
    const step = verifyCode(row.totp_pending_secret, code, now(), null);
    if (step === null) throw new HttpError(400, 'That code didn’t work. Check the time on your phone and try again.');
    const { codes, hashes } = newRecoveryCodes();
    await run(
      db,
      `UPDATE users SET totp_secret = totp_pending_secret, totp_pending_secret = NULL, totp_last_step = ?,
         recovery_codes = ? WHERE id = ?`,
      step,
      JSON.stringify(hashes),
      user.id,
    );
    await audit(
      db,
      {
        orgId: user.orgId,
        userId: user.id,
        actor: user.email,
        action: 'turned on two-factor sign-in',
        ip: clientIp(req),
      },
      now(),
    );
    res.json({ recoveryCodes: codes, security: await securityOf(user.id) });
  });

  router.post('/2fa/disable', signedIn, async (req, res) => {
    const user = currentUser(res);
    const password = str(req.body.password, 'Password', { max: 200 });
    const code = str(req.body.code, 'Code', { max: 40 });
    const row = (await one<SecurityRow>(db, 'SELECT * FROM users WHERE id = ?', user.id))!;
    if (!verifyPassword(password, row.password_hash)) throw new HttpError(400, 'That password is incorrect');
    if (!(await checkSecondFactor(row, code))) throw new HttpError(400, 'That code didn’t work');
    await run(
      db,
      'UPDATE users SET totp_secret = NULL, totp_pending_secret = NULL, totp_last_step = NULL, recovery_codes = NULL WHERE id = ?',
      user.id,
    );
    await audit(
      db,
      {
        orgId: user.orgId,
        userId: user.id,
        actor: user.email,
        action: 'turned off two-factor sign-in',
        ip: clientIp(req),
      },
      now(),
    );
    res.json(await securityOf(user.id));
  });

  router.post('/2fa/recovery-codes', signedIn, async (req, res) => {
    const user = currentUser(res);
    const code = str(req.body.code, 'Code', { max: 40 });
    const row = (await one<SecurityRow>(db, 'SELECT * FROM users WHERE id = ?', user.id))!;
    if (!(await checkSecondFactor(row, code))) throw new HttpError(400, 'That code didn’t work');
    const { codes, hashes } = newRecoveryCodes();
    await run(db, 'UPDATE users SET recovery_codes = ? WHERE id = ?', JSON.stringify(hashes), user.id);
    await audit(
      db,
      { orgId: user.orgId, userId: user.id, actor: user.email, action: 'made new recovery codes', ip: clientIp(req) },
      now(),
    );
    res.json({ recoveryCodes: codes, security: await securityOf(user.id) });
  });

  router.post('/sessions/sign-out-others', signedIn, async (req, res) => {
    const user = currentUser(res);
    const token = readCookie(req, SESSION_COOKIE) ?? '';
    const { changes } = await run(
      db,
      'DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?',
      user.id,
      sha256(token),
    );
    await audit(
      db,
      {
        orgId: user.orgId,
        userId: user.id,
        actor: user.email,
        action: 'signed out other devices',
        detail: `${changes} session${changes === 1 ? '' : 's'}`,
        ip: clientIp(req),
      },
      now(),
    );
    res.json({ signedOut: changes });
  });

  return router;
}
