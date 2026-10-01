import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import type { PreviewStage, RoleFamilyPreview, TeamMember } from '../../shared/api';
import { getRoleFamily } from '../../shared/roleFamilies';
import type { Currency } from '../../shared/types';
import { buildContext, generateVariant, randomSeed } from '../../shared/variants';
import type { AppDeps } from '../app';
import { audioParts } from '../candidateFlow';
import { createUser, currentUser, randomToken, requireManager, requireUser } from '../auth';
import { type AssessmentRow, all, one, run, type ResponseRow } from '../db';
import { familyFor, resolveSelection } from '../families';
import { readChunks } from '../files';
import { badRequest, conflict, email, notFound, oneOf, optionalText, str } from '../http';
import {
  assessmentSummary,
  candidateList,
  candidateReport,
  familySummary,
  listFamilies,
  loadAssessment,
  loadCandidate,
} from '../report';

const CURRENCIES = ['INR', 'USD'] as const;
const TIME_MULTIPLIERS = [1, 1.25, 1.5, 2];
const REVIEWABLE = ['submitted', 'reviewed', 'decided'];
export function managerRoutes(deps: AppDeps) {
  const { db, now } = deps;
  const router = Router();
  router.use(requireUser(db, now));

  // Role library ----------------------------------------------------------

  router.get('/role-families', async (_req, res) => {
    res.json({ families: listFamilies() });
  });

  router.get('/role-families/:id/preview', async (req, res) => {
    const family = getRoleFamily(req.params.id);
    if (!family) throw notFound('Role family not found');
    const currency: Currency = req.query.currency === 'USD' ? 'USD' : 'INR';
    const requestedSeed = Number(req.query.seed);
    const seed = Number.isInteger(requestedSeed) && requestedSeed >= 0 ? requestedSeed : randomSeed();
    const variant = generateVariant(family, seed, currency);
    const baseCtx = buildContext(variant, currency);

    const stages: PreviewStage[] = family.stages.map((stage) => {
      const source = stage.dependsOn ? family.stages.find((s) => s.id === stage.dependsOn) : undefined;
      const options = source?.choices?.length ? source.choices : [null];
      return {
        id: stage.id,
        kind: stage.kind,
        title: stage.title,
        timeLimitSec: stage.timeLimitSec,
        scored: stage.scored,
        choices: stage.choices,
        variants: options.map((choice) => {
          const ctx = choice ? buildContext(variant, currency, { [source!.id]: choice.id }) : baseCtx;
          return {
            label: choice ? `If they chose "${choice.label}"` : null,
            prompt: stage.prompt(ctx),
            reviewerGuide: stage.reviewerGuide(ctx),
          };
        }),
        material: stage.material?.(baseCtx) ?? [],
        rubric: stage.rubric,
      };
    });

    const preview: RoleFamilyPreview = {
      family: familySummary(family),
      seed,
      currency,
      brief: family.brief(baseCtx),
      stages,
    };
    res.json(preview);
  });

  // Assessments -------------------------------------------------------------

  router.get('/assessments', async (_req, res) => {
    const user = currentUser(res);
    const rows = await all<AssessmentRow>(
      db,
      'SELECT * FROM assessments WHERE org_id = ? AND archived = 0 ORDER BY created_at DESC',
      user.orgId,
    );
    res.json({ assessments: await Promise.all(rows.map((row) => assessmentSummary(db, row))) });
  });

  router.post('/assessments', async (req, res) => {
    const user = requireManager(res);
    const family = getRoleFamily(str(req.body.roleFamilyId, 'Role family'));
    if (!family) throw badRequest('Unknown role family');
    const title = str(req.body.title, 'Title', { max: 120 });
    const currency = oneOf(req.body.currency, 'Currency', CURRENCIES);
    const stageIds = resolveSelection(family, req.body.stageIds);
    const id = randomUUID();
    await run(
      db,
      `INSERT INTO assessments
         (id, org_id, role_family_id, role_family_version, title, currency, created_by, created_at, stage_ids_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      user.orgId,
      family.id,
      family.version,
      title,
      currency,
      user.id,
      now(),
      JSON.stringify(stageIds),
    );
    res.status(201).json({ id });
  });

  router.get('/assessments/:id', async (req, res) => {
    const user = currentUser(res);
    const assessment = await loadAssessment(db, user, req.params.id);
    res.json({
      assessment: await assessmentSummary(db, assessment),
      family: familySummary(familyFor(assessment)),
      candidates: await candidateList(db, assessment),
    });
  });

  router.post('/assessments/:id/candidates', async (req, res) => {
    const user = requireManager(res);
    const assessment = await loadAssessment(db, user, req.params.id);
    const family = familyFor(assessment);
    const name = str(req.body.name, 'Candidate name', { max: 120 });
    const address = email(req.body.email, 'Candidate email');
    const multiplier = req.body.timeMultiplier === undefined ? 1 : Number(req.body.timeMultiplier);
    if (!TIME_MULTIPLIERS.includes(multiplier)) throw badRequest('Extra time must be 1, 1.25, 1.5 or 2');

    const seed = randomSeed();
    const variant = generateVariant(family, seed, assessment.currency);
    const id = randomUUID();
    await run(
      db,
      `INSERT INTO candidates (id, org_id, assessment_id, name, email, token, seed, variant_json, time_multiplier, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      user.orgId,
      assessment.id,
      name,
      address,
      randomToken(),
      seed,
      JSON.stringify(variant),
      multiplier,
      now(),
    );
    const created = (await candidateList(db, assessment)).find((c) => c.id === id);
    res.status(201).json({ candidate: created });
  });

  // Candidates --------------------------------------------------------------

  router.get('/candidates/:id', async (req, res) => {
    const user = currentUser(res);
    res.json(await candidateReport(db, await loadCandidate(db, user, req.params.id)));
  });

  router.get('/candidates/:id/audio/:stageId', async (req, res) => {
    const user = currentUser(res);
    const candidate = await loadCandidate(db, user, req.params.id);
    const response = await one<ResponseRow>(
      db,
      'SELECT * FROM responses WHERE candidate_id = ? AND stage_id = ?',
      candidate.id,
      req.params.stageId,
    );
    if (!response) throw notFound('No recording for this question');
    let audio: Buffer | null = null;
    let mime = response.audio_mime;
    if (req.query.part !== undefined) {
      const part = (await audioParts(db, response.id)).find((p) => p.part === Number(req.query.part));
      if (part) audio = await readChunks(deps.files, part.path, part.chunks);
      mime = part?.mime ?? null;
    } else if (response.audio_path) {
      audio = await deps.files.get(response.audio_path);
    }
    if (!audio?.length) throw notFound('No recording for this question');
    res.set('Cache-Control', 'private, max-age=3600');
    res.type(mime ?? 'application/octet-stream').send(audio);
  });

  // Re-runs a failed (or any) AI review, e.g. after fixing the API key.
  router.post('/candidates/:id/ai-review', async (req, res) => {
    const user = currentUser(res);
    const candidate = await loadCandidate(db, user, req.params.id);
    if (!REVIEWABLE.includes(candidate.status)) throw conflict('The candidate has not finished yet');
    await deps.reviews.retry(candidate.id);
    res.status(202).json(await candidateReport(db, await loadCandidate(db, user, candidate.id)));
  });

  router.put('/candidates/:id/verification', async (req, res) => {
    const user = currentUser(res);
    const candidate = await loadCandidate(db, user, req.params.id);
    if (!REVIEWABLE.includes(candidate.status)) throw conflict('The candidate has not finished yet');
    const identity =
      req.body.identity == null
        ? null
        : oneOf(req.body.identity, 'Identity check', ['verified', 'not_verified', 'not_checked'] as const);
    const consistency =
      req.body.consistency == null
        ? null
        : oneOf(req.body.consistency, 'Consistency', ['consistent', 'partly', 'inconsistent'] as const);
    const notes = optionalText(req.body.notes, 'Notes', 10_000) ?? '';
    await run(
      db,
      `INSERT INTO verifications (candidate_id, interviewer_id, identity, consistency, notes, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (candidate_id) DO UPDATE SET
         interviewer_id = excluded.interviewer_id,
         identity = excluded.identity,
         consistency = excluded.consistency,
         notes = excluded.notes,
         updated_at = excluded.updated_at`,
      candidate.id,
      user.id,
      identity,
      consistency,
      notes,
      now(),
    );
    res.json(await candidateReport(db, await loadCandidate(db, user, candidate.id)));
  });

  router.put('/candidates/:id/decision', async (req, res) => {
    const user = requireManager(res);
    const candidate = await loadCandidate(db, user, req.params.id);
    if (!REVIEWABLE.includes(candidate.status)) throw conflict('The candidate has not finished yet');
    if (req.body.decision == null) {
      const hasReview = await one<{ id: string }>(
        db,
        'SELECT id FROM reviews WHERE candidate_id = ? AND submitted_at IS NOT NULL LIMIT 1',
        candidate.id,
      );
      await run(
        db,
        'UPDATE candidates SET decision = NULL, status = ? WHERE id = ?',
        hasReview ? 'reviewed' : 'submitted',
        candidate.id,
      );
    } else {
      const decision = oneOf(req.body.decision, 'Decision', ['advance', 'hold', 'reject'] as const);
      await run(db, "UPDATE candidates SET decision = ?, status = 'decided' WHERE id = ?", decision, candidate.id);
    }
    res.json(await candidateReport(db, await loadCandidate(db, user, candidate.id)));
  });

  // Team -------------------------------------------------------------------

  router.get('/team', async (_req, res) => {
    const user = currentUser(res);
    const members = await all<{
      id: string;
      name: string;
      email: string;
      role: 'manager' | 'reviewer';
      created_at: number;
    }>(db, 'SELECT id, name, email, role, created_at FROM users WHERE org_id = ? ORDER BY created_at', user.orgId);
    const team: TeamMember[] = members.map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      role: m.role,
      createdAt: m.created_at,
    }));
    res.json({ team });
  });

  router.post('/team', async (req, res) => {
    const user = requireManager(res);
    const id = await createUser(
      db,
      {
        orgId: user.orgId,
        name: str(req.body.name, 'Name', { max: 120 }),
        email: email(req.body.email),
        password: str(req.body.password, 'Temporary password', { min: 8, max: 200 }),
        // Every teammate is a recruiter; AI does the reviewing.
        role: 'manager',
      },
      now(),
    );
    res.status(201).json({ id });
  });

  return router;
}
