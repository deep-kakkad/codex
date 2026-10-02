import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import type { GenerationView, PreviewStage, RoleFamilyPreview, TeamMember } from '../../shared/api';
import type { Currency } from '../../shared/types';
import { buildContext, generateVariant, randomSeed } from '../../shared/variants';
import type { AppDeps } from '../app';
import { audioParts } from '../candidateFlow';
import { createUser, currentUser, randomToken, requireManager, requireUser } from '../auth';
import { type AssessmentRow, type CustomFamilyRow, type DB, all, one, run, type ResponseRow } from '../db';
import { createGeneration } from '../ai/generateFamily';
import { aiReviewView } from '../ai/queue';
import { assessmentFunnel } from '../analytics';
import { familyFor, loadFamily, orgFamilies, resolveSelection } from '../families';
import { readChunks } from '../files';
import { badRequest, conflict, email, notFound, oneOf, optionalText, str } from '../http';
import {
  assessmentSummary,
  candidateList,
  candidateReport,
  familySummary,
  loadAssessment,
  loadCandidate,
} from '../report';

const CURRENCIES = ['INR', 'USD'] as const;
const TIME_MULTIPLIERS = [1, 1.25, 1.5, 2];
const REVIEWABLE = ['submitted', 'reviewed', 'decided'];
/** Generations an organisation can have in flight at once (each is several long AI calls). */
const MAX_ACTIVE_GENERATIONS = 3;

async function generationView(db: DB, row: CustomFamilyRow): Promise<GenerationView> {
  const used = await one<{ count: number }>(
    db,
    'SELECT COUNT(*)::int AS count FROM assessments WHERE role_family_id = ?',
    row.id,
  );
  return {
    id: row.id,
    roleTitle: row.role_title,
    description: row.description,
    currency: row.currency,
    status: row.status,
    error: row.error,
    name: row.spec_json ? (JSON.parse(row.spec_json) as { name: string }).name : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    assessmentCount: used?.count ?? 0,
  };
}
export function managerRoutes(deps: AppDeps) {
  const { db, now } = deps;
  const router = Router();
  router.use(requireUser(db, now));

  // Role library ----------------------------------------------------------

  router.get('/role-families', async (_req, res) => {
    const user = currentUser(res);
    res.json({ families: (await orgFamilies(db, user.orgId)).map(familySummary) });
  });

  router.get('/role-families/:id/preview', async (req, res) => {
    const user = currentUser(res);
    const family = await loadFamily(db, user.orgId, req.params.id);
    if (!family) throw notFound('Role family not found');
    const currency: Currency = family.fixedCurrency ?? (req.query.currency === 'USD' ? 'USD' : 'INR');
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

  // AI-generated scenarios ------------------------------------------------

  router.get('/generations', async (_req, res) => {
    const user = currentUser(res);
    const rows = await all<CustomFamilyRow>(
      db,
      'SELECT * FROM custom_families WHERE org_id = ? ORDER BY created_at DESC',
      user.orgId,
    );
    res.json({ generations: await Promise.all(rows.map((row) => generationView(db, row))) });
  });

  router.post('/generations', async (req, res) => {
    const user = requireManager(res);
    const roleTitle = str(req.body.roleTitle, 'Role title', { max: 120 });
    const description = str(req.body.description, 'Role description', { min: 40, max: 4000 });
    const currency = oneOf(req.body.currency, 'Currency', CURRENCIES);
    if (!deps.ai.client) throw conflict('AI is not configured on this server, so scenarios cannot be generated');
    const active = await one<{ count: number }>(
      db,
      "SELECT COUNT(*)::int AS count FROM custom_families WHERE org_id = ? AND status IN ('pending', 'running')",
      user.orgId,
    );
    if ((active?.count ?? 0) >= MAX_ACTIVE_GENERATIONS) {
      throw conflict(`Wait for one of the ${MAX_ACTIVE_GENERATIONS} scenarios being written to finish`);
    }
    const id = await createGeneration(db, now(), user.orgId, user.id, { roleTitle, description, currency });
    await deps.generations.enqueue(id);
    res.status(201).json({ id });
  });

  const loadGeneration = async (orgId: string, id: string) => {
    const row = await one<CustomFamilyRow>(db, 'SELECT * FROM custom_families WHERE id = ? AND org_id = ?', id, orgId);
    if (!row) throw notFound('Scenario not found');
    return row;
  };

  router.get('/generations/:id', async (req, res) => {
    const user = currentUser(res);
    res.json(await generationView(db, await loadGeneration(user.orgId, req.params.id)));
  });

  router.post('/generations/:id/retry', async (req, res) => {
    const user = requireManager(res);
    const row = await loadGeneration(user.orgId, req.params.id);
    if (row.status !== 'failed') throw conflict('Only a failed scenario can be retried');
    await run(
      db,
      "UPDATE custom_families SET status = 'pending', attempts = 0, error = NULL, updated_at = ? WHERE id = ?",
      now(),
      row.id,
    );
    await deps.generations.enqueue(row.id);
    res.json({ ok: true });
  });

  router.delete('/generations/:id', async (req, res) => {
    const user = requireManager(res);
    const row = await loadGeneration(user.orgId, req.params.id);
    if (row.status === 'running') throw conflict('This scenario is still being written');
    const view = await generationView(db, row);
    if (view.assessmentCount) throw conflict('Assessments use this scenario, so it cannot be deleted');
    await run(db, 'DELETE FROM custom_families WHERE id = ?', row.id);
    res.json({ ok: true });
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
    const family = await loadFamily(db, user.orgId, str(req.body.roleFamilyId, 'Role family'));
    if (!family) throw badRequest('Unknown role family');
    const title = str(req.body.title, 'Title', { max: 120 });
    // A generated scenario's amounts are written in one currency.
    const currency = family.fixedCurrency ?? oneOf(req.body.currency, 'Currency', CURRENCIES);
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
      family: familySummary(await familyFor(db, assessment)),
      candidates: await candidateList(db, assessment, user.id),
    });
  });

  router.get('/assessments/:id/funnel', async (req, res) => {
    const user = currentUser(res);
    res.json(await assessmentFunnel(db, await loadAssessment(db, user, req.params.id), now()));
  });

  router.post('/assessments/:id/candidates', async (req, res) => {
    const user = requireManager(res);
    const assessment = await loadAssessment(db, user, req.params.id);
    const family = await familyFor(db, assessment);
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
    const created = (await candidateList(db, assessment, user.id)).find((c) => c.id === id);
    res.status(201).json({ candidate: created });
  });

  // Candidates --------------------------------------------------------------

  router.get('/candidates/:id', async (req, res) => {
    const user = currentUser(res);
    res.json(await candidateReport(db, await loadCandidate(db, user, req.params.id), user.id));
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

  // A recruiter disagrees with one AI score: their score and why.
  router.put('/candidates/:id/overrides', async (req, res) => {
    const user = currentUser(res);
    const candidate = await loadCandidate(db, user, req.params.id);
    const family = await familyFor(db, await loadAssessment(db, user, candidate.assessment_id));
    const stageId = str(req.body.stageId, 'Question');
    const criterionId = str(req.body.criterionId, 'Criterion');
    const stage = family.stages.find((s) => s.id === stageId);
    if (!stage?.rubric.some((c) => c.id === criterionId)) throw badRequest('Unknown question or criterion');
    const score = Number(req.body.score);
    if (!Number.isInteger(score) || score < 1 || score > 4) throw badRequest('Score must be 1, 2, 3 or 4');
    const note = str(req.body.note, 'A reason', { min: 3, max: 2000 });
    const review = await aiReviewView(db, candidate.id);
    const aiScore = review?.result?.stages.find((s) => s.stageId === stageId)?.criteria[criterionId]?.score;
    if (aiScore === undefined) throw conflict('There is no AI score to disagree with yet');
    await run(
      db,
      `INSERT INTO score_overrides (candidate_id, stage_id, criterion_id, user_id, ai_score, score, note, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (candidate_id, stage_id, criterion_id) DO UPDATE SET
         user_id = excluded.user_id, ai_score = excluded.ai_score, score = excluded.score,
         note = excluded.note, updated_at = excluded.updated_at`,
      candidate.id,
      stageId,
      criterionId,
      user.id,
      aiScore,
      score,
      note,
      now(),
    );
    res.json(await candidateReport(db, candidate, user.id));
  });

  router.delete('/candidates/:id/overrides/:stageId/:criterionId', async (req, res) => {
    const user = currentUser(res);
    const candidate = await loadCandidate(db, user, req.params.id);
    await run(
      db,
      'DELETE FROM score_overrides WHERE candidate_id = ? AND stage_id = ? AND criterion_id = ?',
      candidate.id,
      req.params.stageId,
      req.params.criterionId,
    );
    res.json(await candidateReport(db, candidate, user.id));
  });

  // Re-runs a failed (or any) AI review, e.g. after fixing the API key.
  router.post('/candidates/:id/ai-review', async (req, res) => {
    const user = currentUser(res);
    const candidate = await loadCandidate(db, user, req.params.id);
    if (!REVIEWABLE.includes(candidate.status)) throw conflict('The candidate has not finished yet');
    await deps.reviews.retry(candidate.id);
    res.status(202).json(await candidateReport(db, await loadCandidate(db, user, candidate.id), user.id));
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
    res.json(await candidateReport(db, await loadCandidate(db, user, candidate.id), user.id));
  });

  router.put('/candidates/:id/decision', async (req, res) => {
    const user = requireManager(res);
    const candidate = await loadCandidate(db, user, req.params.id);
    if (!REVIEWABLE.includes(candidate.status)) throw conflict('The candidate has not finished yet');
    if (req.body.decision == null) {
      // Back to where it was before the decision: reviewed if the AI review finished.
      const review = await one<{ status: string }>(
        db,
        'SELECT status FROM ai_reviews WHERE candidate_id = ?',
        candidate.id,
      );
      await run(
        db,
        'UPDATE candidates SET decision = NULL, status = ? WHERE id = ?',
        review?.status === 'done' ? 'reviewed' : 'submitted',
        candidate.id,
      );
    } else {
      const decision = oneOf(req.body.decision, 'Decision', ['advance', 'hold', 'reject'] as const);
      await run(db, "UPDATE candidates SET decision = ?, status = 'decided' WHERE id = ?", decision, candidate.id);
    }
    res.json(await candidateReport(db, await loadCandidate(db, user, candidate.id), user.id));
  });

  // A recruiter's personal watch list.
  router.put('/candidates/:id/star', async (req, res) => {
    const user = currentUser(res);
    const candidate = await loadCandidate(db, user, req.params.id);
    if (typeof req.body.starred !== 'boolean') throw badRequest('starred must be true or false');
    if (req.body.starred) {
      await run(
        db,
        'INSERT INTO candidate_stars (user_id, candidate_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING',
        user.id,
        candidate.id,
        now(),
      );
    } else {
      await run(db, 'DELETE FROM candidate_stars WHERE user_id = ? AND candidate_id = ?', user.id, candidate.id);
    }
    res.json({ starred: req.body.starred });
  });

  // Teammates' takes on a candidate. Anyone on the team can add one; only its author can remove it.
  router.post('/candidates/:id/notes', async (req, res) => {
    const user = currentUser(res);
    const candidate = await loadCandidate(db, user, req.params.id);
    const body = str(req.body.body, 'Note', { max: 2000 });
    const lean = req.body.lean == null ? null : oneOf(req.body.lean, 'Lean', ['advance', 'hold', 'reject'] as const);
    await run(
      db,
      'INSERT INTO review_notes (id, candidate_id, user_id, body, lean, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      randomUUID(),
      candidate.id,
      user.id,
      body,
      lean,
      now(),
    );
    res.status(201).json(await candidateReport(db, candidate, user.id));
  });

  router.delete('/candidates/:id/notes/:noteId', async (req, res) => {
    const user = currentUser(res);
    const candidate = await loadCandidate(db, user, req.params.id);
    const removed = await run(
      db,
      'DELETE FROM review_notes WHERE id = ? AND candidate_id = ? AND user_id = ?',
      req.params.noteId,
      candidate.id,
      user.id,
    );
    if (!removed.changes) throw notFound('Note not found');
    res.json(await candidateReport(db, candidate, user.id));
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
