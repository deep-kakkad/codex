import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { Router } from 'express';
import type { PreviewStage, RoleFamilyPreview, TeamMember } from '../../shared/api';
import { getRoleFamily } from '../../shared/roleFamilies';
import { computeScore, sanitizeScores } from '../../shared/scoring';
import type { Currency, Delivery, RoleFamily } from '../../shared/types';
import { buildContext, generateVariant, randomSeed } from '../../shared/variants';
import type { AppDeps } from '../app';
import { audioParts } from '../candidateFlow';
import { createUser, currentUser, randomToken, requireManager, requireUser } from '../auth';
import { type AssessmentRow, all, one, run, type ResponseRow, type ReviewRow } from '../db';
import { badRequest, conflict, email, notFound, oneOf, optionalText, str } from '../http';
import {
  assessmentSummary,
  candidateList,
  candidateReport,
  familyFor,
  familySummary,
  listFamilies,
  loadAssessment,
  loadCandidate,
} from '../report';

const CURRENCIES = ['INR', 'USD'] as const;
const TIME_MULTIPLIERS = [1, 1.25, 1.5, 2];
const REVIEWABLE = ['submitted', 'reviewed', 'decided'];
const DELIVERIES: Delivery[] = ['natural', 'unsure', 'read'];

/** Keeps delivery reads only for think-aloud stages. */
function sanitizeObservations(family: RoleFamily, input: unknown): Record<string, Delivery> {
  const result: Record<string, Delivery> = {};
  if (!input || typeof input !== 'object') return result;
  for (const stage of family.stages) {
    const value = (input as Record<string, unknown>)[stage.id];
    if (stage.thinkAloud && DELIVERIES.includes(value as Delivery)) result[stage.id] = value as Delivery;
  }
  return result;
}

export function managerRoutes(deps: AppDeps) {
  const { db, now } = deps;
  const router = Router();
  router.use(requireUser(db, now));

  // Role library ----------------------------------------------------------

  router.get('/role-families', (_req, res) => {
    res.json({ families: listFamilies() });
  });

  router.get('/role-families/:id/preview', (req, res) => {
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

  router.get('/assessments', (_req, res) => {
    const user = currentUser(res);
    const rows = all<AssessmentRow>(
      db,
      'SELECT * FROM assessments WHERE org_id = ? AND archived = 0 ORDER BY created_at DESC',
      user.orgId,
    );
    res.json({ assessments: rows.map((row) => assessmentSummary(db, row)) });
  });

  router.post('/assessments', (req, res) => {
    const user = requireManager(res);
    const family = getRoleFamily(str(req.body.roleFamilyId, 'Role family'));
    if (!family) throw badRequest('Unknown role family');
    const title = str(req.body.title, 'Title', { max: 120 });
    const currency = oneOf(req.body.currency, 'Currency', CURRENCIES);
    const id = randomUUID();
    run(
      db,
      `INSERT INTO assessments (id, org_id, role_family_id, role_family_version, title, currency, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      user.orgId,
      family.id,
      family.version,
      title,
      currency,
      user.id,
      now(),
    );
    res.status(201).json({ id });
  });

  router.get('/assessments/:id', (req, res) => {
    const user = currentUser(res);
    const assessment = loadAssessment(db, user, req.params.id);
    res.json({
      assessment: assessmentSummary(db, assessment),
      family: familySummary(familyFor(assessment)),
      candidates: candidateList(db, user, assessment),
    });
  });

  router.post('/assessments/:id/candidates', (req, res) => {
    const user = requireManager(res);
    const assessment = loadAssessment(db, user, req.params.id);
    const family = familyFor(assessment);
    const name = str(req.body.name, 'Candidate name', { max: 120 });
    const address = email(req.body.email, 'Candidate email');
    const multiplier = req.body.timeMultiplier === undefined ? 1 : Number(req.body.timeMultiplier);
    if (!TIME_MULTIPLIERS.includes(multiplier)) throw badRequest('Extra time must be 1, 1.25, 1.5 or 2');

    const seed = randomSeed();
    const variant = generateVariant(family, seed, assessment.currency);
    const id = randomUUID();
    run(
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
    const created = candidateList(db, user, assessment).find((c) => c.id === id);
    res.status(201).json({ candidate: created });
  });

  // Candidates --------------------------------------------------------------

  router.get('/candidates/:id', (req, res) => {
    const user = currentUser(res);
    res.json(candidateReport(db, user, loadCandidate(db, user, req.params.id)));
  });

  router.get('/candidates/:id/audio/:stageId', (req, res) => {
    const user = currentUser(res);
    const candidate = loadCandidate(db, user, req.params.id);
    const response = one<ResponseRow>(
      db,
      'SELECT * FROM responses WHERE candidate_id = ? AND stage_id = ?',
      candidate.id,
      req.params.stageId,
    );
    if (!response) throw notFound('No recording for this question');
    let file = response.audio_path;
    let mime = response.audio_mime;
    if (req.query.part !== undefined) {
      const part = audioParts(db, response.id).find((p) => p.part === Number(req.query.part));
      file = part?.path ?? null;
      mime = part?.mime ?? null;
    }
    if (!file) throw notFound('No recording for this question');
    res.type(mime ?? 'application/octet-stream');
    res.sendFile(path.resolve(deps.uploadDir, file));
  });

  router.put('/candidates/:id/review', (req, res) => {
    const user = currentUser(res);
    const candidate = loadCandidate(db, user, req.params.id);
    if (!REVIEWABLE.includes(candidate.status)) throw conflict('The candidate has not finished yet');
    const family = familyFor(loadAssessment(db, user, candidate.assessment_id));

    const scores = sanitizeScores(family, req.body.scores);
    const notes = optionalText(req.body.notes, 'Notes', 10_000) ?? '';
    const recommendation =
      req.body.recommendation == null
        ? null
        : oneOf(req.body.recommendation, 'Recommendation', ['advance', 'hold', 'reject'] as const);
    const submitting = req.body.submit === true;
    const observations = sanitizeObservations(family, req.body.observations);

    const existing = one<ReviewRow>(
      db,
      'SELECT * FROM reviews WHERE candidate_id = ? AND reviewer_id = ?',
      candidate.id,
      user.id,
    );
    if (submitting) {
      if (!computeScore(family, scores).complete) throw badRequest('Score every criterion before submitting');
      if (!recommendation) throw badRequest('Choose a recommendation before submitting');
    }
    const submittedAt = existing?.submitted_at ?? (submitting ? now() : null);

    run(
      db,
      `INSERT INTO reviews
         (id, candidate_id, reviewer_id, scores_json, observations_json, notes, recommendation, submitted_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (candidate_id, reviewer_id) DO UPDATE SET
         scores_json = excluded.scores_json,
         observations_json = excluded.observations_json,
         notes = excluded.notes,
         recommendation = excluded.recommendation,
         submitted_at = excluded.submitted_at,
         updated_at = excluded.updated_at`,
      existing?.id ?? randomUUID(),
      candidate.id,
      user.id,
      JSON.stringify(scores),
      JSON.stringify(observations),
      notes,
      recommendation,
      submittedAt,
      now(),
    );
    if (submittedAt && candidate.status === 'submitted') {
      run(db, "UPDATE candidates SET status = 'reviewed' WHERE id = ?", candidate.id);
    }
    res.json(candidateReport(db, user, loadCandidate(db, user, candidate.id)));
  });

  router.put('/candidates/:id/verification', (req, res) => {
    const user = currentUser(res);
    const candidate = loadCandidate(db, user, req.params.id);
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
    run(
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
    res.json(candidateReport(db, user, loadCandidate(db, user, candidate.id)));
  });

  router.put('/candidates/:id/decision', (req, res) => {
    const user = requireManager(res);
    const candidate = loadCandidate(db, user, req.params.id);
    if (!REVIEWABLE.includes(candidate.status)) throw conflict('The candidate has not finished yet');
    if (req.body.decision == null) {
      const hasReview = one<{ id: string }>(
        db,
        'SELECT id FROM reviews WHERE candidate_id = ? AND submitted_at IS NOT NULL LIMIT 1',
        candidate.id,
      );
      run(
        db,
        'UPDATE candidates SET decision = NULL, status = ? WHERE id = ?',
        hasReview ? 'reviewed' : 'submitted',
        candidate.id,
      );
    } else {
      const decision = oneOf(req.body.decision, 'Decision', ['advance', 'hold', 'reject'] as const);
      run(db, "UPDATE candidates SET decision = ?, status = 'decided' WHERE id = ?", decision, candidate.id);
    }
    res.json(candidateReport(db, user, loadCandidate(db, user, candidate.id)));
  });

  // Team -------------------------------------------------------------------

  router.get('/team', (_req, res) => {
    const user = currentUser(res);
    const members = all<{ id: string; name: string; email: string; role: 'manager' | 'reviewer'; created_at: number }>(
      db,
      'SELECT id, name, email, role, created_at FROM users WHERE org_id = ? ORDER BY created_at',
      user.orgId,
    );
    const team: TeamMember[] = members.map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      role: m.role,
      createdAt: m.created_at,
    }));
    res.json({ team });
  });

  router.post('/team', (req, res) => {
    const user = requireManager(res);
    const id = createUser(
      db,
      {
        orgId: user.orgId,
        name: str(req.body.name, 'Name', { max: 120 }),
        email: email(req.body.email),
        password: str(req.body.password, 'Temporary password', { min: 8, max: 200 }),
        role: oneOf(req.body.role, 'Role', ['manager', 'reviewer'] as const),
      },
      now(),
    );
    res.status(201).json({ id });
  });

  return router;
}
