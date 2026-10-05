import { Router } from 'express';
import type { CandidateAssessmentItem } from '../../shared/candidateApi';
import type { CandidateStatus } from '../../shared/types';
import type { AppDeps } from '../app';
import { checkThrottle, clearThrottle, clientIp, limits, recordAttempt } from '../security';
import {
  CANDIDATE_COOKIE,
  DUMMY_PASSWORD_HASH,
  candidateForSession,
  createCandidateAccount,
  createCandidateSession,
  destroyCandidateSession,
  readCookie,
  requireCandidate,
  setSessionCookie,
  verifyPassword,
} from '../auth';
import { type CandidateAccountRow, all, one, run } from '../db';
import { HttpError, email, str } from '../http';

/** Sign-up, login and the "my assessments" list for candidate accounts. */
export function candidateAccountRoutes({ db, now, secureCookies }: AppDeps) {
  const router = Router();

  router.get('/auth/me', async (req, res) => {
    res.json({ candidate: await candidateForSession(db, readCookie(req, CANDIDATE_COOKIE), now()) });
  });

  router.post('/auth/signup', async (req, res) => {
    const id = await createCandidateAccount(
      db,
      {
        name: str(req.body.name, 'Your name', { max: 120 }),
        email: email(req.body.email),
        password: str(req.body.password, 'Password', { min: 8, max: 200 }),
      },
      now(),
    );
    setSessionCookie(res, await createCandidateSession(db, id, now()), secureCookies, CANDIDATE_COOKIE);
    res.status(201).json({ ok: true });
  });

  router.post('/auth/login', async (req, res) => {
    const address = email(req.body.email);
    const password = str(req.body.password, 'Password', { max: 200 });
    const keys = limits.candidateLogin(address, clientIp(req));
    await checkThrottle(db, keys, now());
    const account = await one<CandidateAccountRow>(db, 'SELECT * FROM candidate_accounts WHERE email = ?', address);
    const valid = verifyPassword(password, account?.password_hash ?? DUMMY_PASSWORD_HASH);
    if (!account || !valid) {
      await recordAttempt(db, keys, now());
      throw new HttpError(401, 'Email or password is incorrect');
    }
    await clearThrottle(db, keys[0].key);
    setSessionCookie(res, await createCandidateSession(db, account.id, now()), secureCookies, CANDIDATE_COOKIE);
    res.json({ ok: true });
  });

  router.post('/auth/logout', async (req, res) => {
    const token = readCookie(req, CANDIDATE_COOKIE);
    if (token) await destroyCandidateSession(db, token);
    res.clearCookie(CANDIDATE_COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  // Deletes the account itself. Answers belong to each assessment and are deleted there.
  router.post('/auth/delete-account', async (req, res) => {
    const me = await requireCandidate(db, req, now());
    const password = str(req.body.password, 'Password', { max: 200 });
    const account = (await one<CandidateAccountRow>(db, 'SELECT * FROM candidate_accounts WHERE id = ?', me.id))!;
    if (!verifyPassword(password, account.password_hash)) throw new HttpError(400, 'That password is incorrect');
    await run(db, 'UPDATE candidates SET account_id = NULL WHERE account_id = ?', me.id);
    await run(db, 'DELETE FROM candidate_accounts WHERE id = ?', me.id);
    res.clearCookie(CANDIDATE_COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  // Invitations sent to this email, plus ones already claimed by the account.
  router.get('/assessments', async (req, res) => {
    const me = await requireCandidate(db, req, now());
    const rows = await all<{
      token: string;
      status: CandidateStatus;
      created_at: number;
      submitted_at: number | null;
      title: string;
      org_name: string;
    }>(
      db,
      `SELECT c.token, c.status, c.created_at, c.submitted_at, a.title, o.name AS org_name
         FROM candidates c
         JOIN assessments a ON a.id = c.assessment_id
         JOIN orgs o ON o.id = c.org_id
        WHERE c.account_id = ? OR (c.account_id IS NULL AND lower(c.email) = ?)
        ORDER BY c.created_at DESC`,
      me.id,
      me.email.toLowerCase(),
    );
    const assessments: CandidateAssessmentItem[] = rows.map((r) => ({
      token: r.token,
      title: r.title,
      orgName: r.org_name,
      // Candidates see whether they've finished, not how they were assessed.
      status: r.status === 'invited' ? 'invited' : r.status === 'in_progress' ? 'in_progress' : 'submitted',
      invitedAt: r.created_at,
      submittedAt: r.submitted_at,
    }));
    res.json({ assessments });
  });

  return router;
}
