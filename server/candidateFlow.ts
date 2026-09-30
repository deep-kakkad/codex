import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getRoleFamily } from '../shared/roleFamilies';
import { choicesFrom, renderStageForCandidate, scaledTimeLimit } from '../shared/render';
import { sanitizeSignals } from '../shared/signals';
import type { CandidateDraft, CandidatePhaseView } from '../shared/candidateApi';
import type { Block, CandidateStageView, RoleFamily, Variant } from '../shared/types';
import { buildContext } from '../shared/variants';
import { type AssessmentRow, type CandidateRow, type DB, all, one, run, type ResponseRow, transaction } from './db';
import { HttpError, badRequest, conflict, notFound, optionalText } from './http';

/** Accept a submission this long after the timer hits zero (slow uploads, flaky networks). */
export const SUBMIT_GRACE_MS = 60_000;

export const LIMITS = {
  text: 20_000,
  aiTranscript: 100_000,
  reflection: 5_000,
  audioBytes: 20 * 1024 * 1024,
};

export interface FlowDeps {
  db: DB;
  now: () => number;
  uploadDir: string;
}

export type Draft = CandidateDraft;
export type CandidatePhase = CandidatePhaseView;

export interface CandidateContext {
  candidate: CandidateRow;
  assessment: AssessmentRow;
  family: RoleFamily;
  orgName: string;
  variant: Variant;
}

export function loadByToken(db: DB, token: string): CandidateContext {
  const candidate = one<CandidateRow>(db, 'SELECT * FROM candidates WHERE token = ?', token);
  if (!candidate) throw notFound('This assessment link is not valid');
  const assessment = one<AssessmentRow>(db, 'SELECT * FROM assessments WHERE id = ?', candidate.assessment_id)!;
  const family = getRoleFamily(assessment.role_family_id);
  if (!family) throw new HttpError(500, 'Assessment content is missing');
  const org = one<{ name: string }>(db, 'SELECT name FROM orgs WHERE id = ?', candidate.org_id)!;
  return { candidate, assessment, family, orgName: org.name, variant: JSON.parse(candidate.variant_json) };
}

export function responsesFor(db: DB, candidateId: string): ResponseRow[] {
  return all<ResponseRow>(db, 'SELECT * FROM responses WHERE candidate_id = ? ORDER BY stage_index', candidateId);
}

function parseDraft(json: string | null): Draft | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as Draft;
  } catch {
    return null;
  }
}

function closeAsTimeout(db: DB, response: ResponseRow) {
  const draft = parseDraft(response.draft_json) ?? {};
  run(
    db,
    `UPDATE responses
        SET closed_reason = 'timeout', submitted_at = deadline_at,
            text = ?, choice_id = ?, ai_transcript = ?, reflection = ?
      WHERE id = ? AND closed_reason IS NULL`,
    draft.text ?? null,
    draft.choiceId ?? null,
    draft.aiTranscript ?? null,
    draft.reflection ?? null,
    response.id,
  );
}

/**
 * Works out where the candidate is. Stages whose time (plus grace) has run
 * out are closed with the last autosaved draft; when every stage is closed
 * the attempt is marked as submitted.
 */
export function currentPhase(deps: FlowDeps, ctx: CandidateContext): CandidatePhase {
  const { db } = deps;
  const status = ctx.candidate.status;
  if (status === 'invited') return { phase: 'intro' };
  if (status !== 'in_progress') return { phase: 'done' };

  const now = deps.now();
  const byStage = new Map(responsesFor(db, ctx.candidate.id).map((r) => [r.stage_id, r]));

  for (const [index, stage] of ctx.family.stages.entries()) {
    const response = byStage.get(stage.id);
    if (!response) {
      return {
        phase: 'ready',
        next: {
          index,
          kind: stage.kind,
          timeLimitSec: scaledTimeLimit(stage, ctx.candidate.time_multiplier),
        },
      };
    }
    if (response.closed_reason) continue;
    if (now > response.deadline_at + SUBMIT_GRACE_MS) {
      closeAsTimeout(db, response);
      continue;
    }
    return {
      phase: 'stage',
      stage: JSON.parse(response.prompt_json) as CandidateStageView,
      deadlineAt: response.deadline_at,
      draft: parseDraft(response.draft_json),
      audio: response.audio_path ? { sec: response.audio_sec } : null,
    };
  }

  run(
    db,
    "UPDATE candidates SET status = 'submitted', submitted_at = ? WHERE id = ? AND status = 'in_progress'",
    now,
    ctx.candidate.id,
  );
  ctx.candidate.status = 'submitted';
  return { phase: 'done' };
}

export function renderBrief(ctx: CandidateContext): Block[] {
  return ctx.family.brief(buildContext(ctx.variant, ctx.assessment.currency));
}

export function start(deps: FlowDeps, ctx: CandidateContext, idName: string): CandidatePhase {
  if (ctx.candidate.status !== 'invited') return currentPhase(deps, ctx);
  run(
    deps.db,
    "UPDATE candidates SET status = 'in_progress', id_name = ?, started_at = ? WHERE id = ? AND status = 'invited'",
    idName,
    deps.now(),
    ctx.candidate.id,
  );
  ctx.candidate.status = 'in_progress';
  return currentPhase(deps, ctx);
}

/**
 * Reveals the next stage and starts its timer. Candidates ask for a position,
 * not a stage id, so nothing about upcoming questions is ever sent early.
 */
export function revealNext(deps: FlowDeps, ctx: CandidateContext, index: number): CandidatePhase {
  return transaction(deps.db, () => {
    const phase = currentPhase(deps, ctx);
    // Idempotent: a double click or a retry returns the already-open stage.
    if (phase.phase === 'stage' && phase.stage.index === index) return phase;
    if (phase.phase !== 'ready' || phase.next.index !== index) {
      throw conflict('Questions have to be answered in order');
    }
    const stage = ctx.family.stages[index];

    const previous = responsesFor(deps.db, ctx.candidate.id).map((r) => ({
      stageId: r.stage_id,
      choiceId: r.choice_id,
    }));
    const stageCtx = buildContext(ctx.variant, ctx.assessment.currency, choicesFrom(previous));
    const view = renderStageForCandidate(stage, phase.next.index, stageCtx, ctx.candidate.time_multiplier);
    const now = deps.now();
    run(
      deps.db,
      `INSERT INTO responses (id, candidate_id, stage_id, stage_index, prompt_json, revealed_at, deadline_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      randomUUID(),
      ctx.candidate.id,
      stage.id,
      phase.next.index,
      JSON.stringify(view),
      now,
      now + view.timeLimitSec * 1000,
    );
    return currentPhase(deps, ctx);
  });
}

function openResponse(deps: FlowDeps, ctx: CandidateContext, stageId: string): ResponseRow {
  const phase = currentPhase(deps, ctx);
  if (phase.phase !== 'stage' || phase.stage.id !== stageId) {
    throw conflict('Time ran out for this question. Your last autosaved draft was kept.');
  }
  return one<ResponseRow>(
    deps.db,
    'SELECT * FROM responses WHERE candidate_id = ? AND stage_id = ?',
    ctx.candidate.id,
    stageId,
  )!;
}

function stageDef(ctx: CandidateContext, stageId: string) {
  const stage = ctx.family.stages.find((s) => s.id === stageId);
  if (!stage) throw notFound('Unknown question');
  return stage;
}

function cleanDraft(ctx: CandidateContext, stageId: string, input: Record<string, unknown>): Draft {
  const stage = stageDef(ctx, stageId);
  const choiceId = optionalText(input.choiceId, 'Choice', 100) ?? undefined;
  if (choiceId && !stage.choices?.some((c) => c.id === choiceId)) throw badRequest('Unknown choice');
  return {
    text: optionalText(input.text, 'Answer', LIMITS.text) ?? undefined,
    choiceId,
    aiTranscript: optionalText(input.aiTranscript, 'AI conversation', LIMITS.aiTranscript) ?? undefined,
    reflection: optionalText(input.reflection, 'Reflection', LIMITS.reflection) ?? undefined,
  };
}

export function saveDraft(deps: FlowDeps, ctx: CandidateContext, stageId: string, input: Record<string, unknown>) {
  const response = openResponse(deps, ctx, stageId);
  const draft = cleanDraft(ctx, stageId, input);
  run(deps.db, 'UPDATE responses SET draft_json = ? WHERE id = ?', JSON.stringify(draft), response.id);
}

const AUDIO_TYPES: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
};

export function saveAudio(
  deps: FlowDeps,
  ctx: CandidateContext,
  stageId: string,
  body: Buffer,
  contentType: string | undefined,
  seconds: number,
) {
  const stage = stageDef(ctx, stageId);
  if (stage.voiceMaxSec <= 0) throw badRequest('This question takes a written answer');
  const mime = (contentType ?? '').split(';')[0].trim().toLowerCase();
  const extension = AUDIO_TYPES[mime];
  if (!extension) throw badRequest('Unsupported audio format');
  if (!Buffer.isBuffer(body) || body.length === 0) throw badRequest('The recording is empty');
  const response = openResponse(deps, ctx, stageId);

  const dir = path.join(deps.uploadDir, ctx.candidate.id);
  mkdirSync(dir, { recursive: true });
  const fileName = `${stageId}.${extension}`;
  writeFileSync(path.join(dir, fileName), body);
  const cappedSeconds = Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, stage.voiceMaxSec + 10) : null;
  run(
    deps.db,
    'UPDATE responses SET audio_path = ?, audio_mime = ?, audio_sec = ? WHERE id = ?',
    path.join(ctx.candidate.id, fileName),
    mime,
    cappedSeconds,
    response.id,
  );
}

export function submit(
  deps: FlowDeps,
  ctx: CandidateContext,
  stageId: string,
  input: Record<string, unknown>,
): CandidatePhase {
  const stage = stageDef(ctx, stageId);
  const response = openResponse(deps, ctx, stageId);
  const answer = cleanDraft(ctx, stageId, input);
  const timedOut = input.timedOut === true;
  const hasText = Boolean(answer.text?.trim());
  const hasAudio = Boolean(response.audio_path);

  if (!timedOut) {
    if (stage.kind === 'decision' && !answer.choiceId) throw badRequest('Choose an option before submitting');
    if (stage.kind === 'ai_allowed' && !hasText) throw badRequest('Paste your final answer before submitting');
    if (!hasText && !hasAudio) throw badRequest('Record a voice note or type an answer before submitting');
  }

  run(
    deps.db,
    `UPDATE responses
        SET text = ?, choice_id = ?, ai_transcript = ?, reflection = ?, signals_json = ?,
            submitted_at = ?, closed_reason = ?
      WHERE id = ? AND closed_reason IS NULL`,
    answer.text ?? null,
    answer.choiceId ?? null,
    answer.aiTranscript ?? null,
    answer.reflection ?? null,
    JSON.stringify(sanitizeSignals(input.signals)),
    deps.now(),
    timedOut ? 'timeout' : 'submitted',
    response.id,
  );
  return currentPhase(deps, ctx);
}
