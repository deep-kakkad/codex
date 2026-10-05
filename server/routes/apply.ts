import { Router } from 'express';
import type { ApplyPreview } from '../../shared/api';
import { familySummary } from '../../shared/library';
import type { AppDeps } from '../app';
import { type AssessmentRow, one } from '../db';
import { familyFor } from '../families';
import { HttpError, badRequest, email, notFound, str } from '../http';
import { createCandidate } from '../invites';
import { audit, checkThrottle, clientIp, limits, recordAttempt } from '../security';

/** Applications one assessment takes through its public link in a day, so a leaked link can't flood it. */
export const MAX_APPLICATIONS_PER_DAY = 300;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The public apply link: anyone with it can put themselves forward, and gets
 * their own private assessment link, as if the team had invited them.
 */
export function applyRoutes({ db, now }: AppDeps) {
  const router = Router();

  async function openAssessment(token: string) {
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(token)) throw notFound('This apply link is not valid');
    const assessment = await one<AssessmentRow & { org_name: string }>(
      db,
      `SELECT a.*, o.name AS org_name FROM assessments a JOIN orgs o ON o.id = a.org_id
        WHERE a.apply_token = ? AND a.archived = 0`,
      token,
    );
    if (!assessment) throw notFound('This apply link is not valid');
    if (!assessment.apply_open) {
      throw new HttpError(410, `${assessment.org_name} isn’t taking applications through this link any more.`);
    }
    return assessment;
  }

  router.get('/:token', async (req, res) => {
    const assessment = await openAssessment(req.params.token);
    const family = familySummary(await familyFor(db, assessment));
    const preview: ApplyPreview = {
      orgName: assessment.org_name,
      title: assessment.title,
      roleFamilyName: family.name,
      totalMinutes: family.totalMinutes,
      questions: family.stages.length,
      thinkAloud: family.stages.some((s) => s.thinkAloud),
      aiAllowed: family.stages.some((s) => s.kind === 'ai_allowed'),
    };
    res.json(preview);
  });

  router.post('/:token', async (req, res) => {
    const ip = clientIp(req);
    await checkThrottle(db, limits.apply(ip), now());
    // A field people never see: only bots fill it in.
    if (req.body.website) throw badRequest('Something went wrong. Please try again.');
    const assessment = await openAssessment(req.params.token);
    const name = str(req.body.name, 'Your name', { max: 120 });
    const address = email(req.body.email, 'Your email');
    await recordAttempt(db, limits.apply(ip), now());

    const already = await one(
      db,
      'SELECT id FROM candidates WHERE assessment_id = ? AND lower(email) = lower(?)',
      assessment.id,
      address,
    );
    if (already) {
      throw new HttpError(
        409,
        `You’ve already applied with ${address}. Use the private link you were given then, or contact ${assessment.org_name}.`,
      );
    }
    const today = await one<{ n: number }>(
      db,
      "SELECT COUNT(*)::int AS n FROM candidates WHERE assessment_id = ? AND source = 'applied' AND created_at >= ?",
      assessment.id,
      now() - DAY_MS,
    );
    if ((today?.n ?? 0) >= MAX_APPLICATIONS_PER_DAY) {
      throw new HttpError(429, 'This assessment has had a lot of applications today. Please try again tomorrow.');
    }

    const family = await familyFor(db, assessment);
    const { token } = await createCandidate(
      db,
      assessment,
      family,
      { name, email: address, multiplier: 1, source: 'applied' },
      now(),
    );
    await audit(
      db,
      {
        orgId: assessment.org_id,
        actor: 'Apply link',
        action: 'received an application from',
        target: name,
        detail: assessment.title,
        ip,
      },
      now(),
    );
    res.status(201).json({ token });
  });

  return router;
}
