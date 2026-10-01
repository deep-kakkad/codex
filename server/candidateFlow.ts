import { randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { choicesFrom, renderStageForCandidate, scaledTimeLimit } from '../shared/render';
import { sanitizeScratch } from '../shared/scratch';
import { sanitizeSignals } from '../shared/signals';
import type { CandidateDraft, CandidatePhaseView } from '../shared/candidateApi';
import type { Block, CandidateStageView, RoleFamily, StageDef, Variant } from '../shared/types';
import { buildContext } from '../shared/variants';
import {
  type AssessmentRow,
  type AudioPartRow,
  type CandidateRow,
  type DB,
  all,
  one,
  run,
  type ResponseRow,
  transaction,
} from './db';
import { familyFor } from './families';
import { badRequest, conflict, notFound, optionalText } from './http';

/** Accept a submission this long after the timer hits zero (slow uploads, flaky networks). */
export const SUBMIT_GRACE_MS = 60_000;

export const LIMITS = {
  text: 20_000,
  aiTranscript: 100_000,
  reflection: 5_000,
  audioBytes: 20 * 1024 * 1024,
  /** Per think-aloud part, across all its chunks. */
  streamBytes: 40 * 1024 * 1024,
  /** Reloads mid-question start a new part; cap them. */
  streamParts: 10,
};

export interface FlowDeps {
  db: DB;
  now: () => number;
  uploadDir: string;
  /** Called once when a candidate's last answer closes (queues the AI review). */
  onSubmitted?: (candidateId: string) => void;
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
  const family = familyFor(assessment);
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
            text = ?, choice_id = ?, ai_transcript = ?, reflection = ?, scratch_json = ?
      WHERE id = ? AND closed_reason IS NULL`,
    draft.text ?? null,
    draft.choiceId ?? null,
    draft.aiTranscript ?? null,
    draft.reflection ?? null,
    draft.scratch?.length ? JSON.stringify(draft.scratch) : null,
    response.id,
  );
}

export function audioParts(db: DB, responseId: string): AudioPartRow[] {
  return all<AudioPartRow>(db, 'SELECT * FROM audio_parts WHERE response_id = ? ORDER BY part', responseId);
}

function audioSummary(db: DB, response: ResponseRow) {
  if (response.audio_path) return { sec: response.audio_sec, parts: 1 };
  const parts = audioParts(db, response.id);
  if (!parts.length) return null;
  return { sec: parts.reduce((sum, p) => sum + (p.sec ?? 0), 0), parts: parts.length };
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
          thinkAloud: Boolean(stage.thinkAloud),
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
      audio: audioSummary(db, response),
    };
  }

  const changed = run(
    db,
    "UPDATE candidates SET status = 'submitted', submitted_at = ? WHERE id = ? AND status = 'in_progress'",
    now,
    ctx.candidate.id,
  );
  ctx.candidate.status = 'submitted';
  if (Number(changed.changes) > 0) deps.onSubmitted?.(ctx.candidate.id);
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

/** Latest moment a stage can still accept input, in ms after it opened. */
function stageWindowMs(ctx: CandidateContext, stage: StageDef) {
  return scaledTimeLimit(stage, ctx.candidate.time_multiplier) * 1000 + SUBMIT_GRACE_MS;
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
    scratch: stage.thinkAloud ? sanitizeScratch(input.scratch, stageWindowMs(ctx, stage)) : undefined,
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
  if (stage.thinkAloud) throw badRequest('This question records continuously; use the stream endpoint');
  const mime = audioMime(contentType);
  const extension = AUDIO_TYPES[mime];
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

function audioMime(contentType: string | undefined) {
  const mime = (contentType ?? '').split(';')[0].trim().toLowerCase();
  if (!AUDIO_TYPES[mime]) throw badRequest('Unsupported audio format');
  return mime;
}

export interface StreamChunk {
  part: number;
  seq: number;
  /** When recording started, in ms after the question opened. */
  startMs: number;
  /** Seconds recorded so far in this part. */
  sec: number;
}

/**
 * Appends one chunk of a think-aloud recording. Chunks are uploaded every few
 * seconds while the candidate talks, so a crash or reload loses almost
 * nothing. Retried chunks are accepted idempotently; gaps are refused.
 */
export function appendAudioChunk(
  deps: FlowDeps,
  ctx: CandidateContext,
  stageId: string,
  body: Buffer,
  contentType: string | undefined,
  chunk: StreamChunk,
): { part: number; chunks: number } {
  const stage = stageDef(ctx, stageId);
  if (!stage.thinkAloud) throw badRequest('This question does not record continuously');
  const mime = audioMime(contentType);
  if (!Buffer.isBuffer(body) || body.length === 0) throw badRequest('The audio chunk is empty');
  const { part, seq } = chunk;
  if (!Number.isInteger(part) || part < 0 || part >= LIMITS.streamParts) throw badRequest('Invalid recording part');
  if (!Number.isInteger(seq) || seq < 0) throw badRequest('Invalid chunk number');
  const response = openResponse(deps, ctx, stageId);
  const windowMs = stageWindowMs(ctx, stage);
  const sec = Number.isFinite(chunk.sec) && chunk.sec > 0 ? Math.min(chunk.sec, windowMs / 1000) : null;

  return transaction(deps.db, () => {
    const parts = audioParts(deps.db, response.id);
    const existing = parts.find((p) => p.part === part);
    const dir = path.join(deps.uploadDir, ctx.candidate.id);

    if (!existing) {
      if (seq !== 0) throw conflict('Recording part not started');
      if (part !== parts.length) throw conflict(`Next recording part is ${parts.length}`);
      mkdirSync(dir, { recursive: true });
      const relative = path.join(ctx.candidate.id, `${stageId}.part${part}.${AUDIO_TYPES[mime]}`);
      writeFileSync(path.join(deps.uploadDir, relative), body);
      const startMs = Number.isFinite(chunk.startMs) ? Math.min(Math.max(Math.round(chunk.startMs), 0), windowMs) : 0;
      run(
        deps.db,
        `INSERT INTO audio_parts (response_id, part, path, mime, bytes, chunks, start_ms, sec)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
        response.id,
        part,
        relative,
        mime,
        body.length,
        startMs,
        sec,
      );
      return { part, chunks: 1 };
    }

    if (seq < existing.chunks) return { part, chunks: existing.chunks }; // a retry we already have
    if (seq > existing.chunks) throw conflict(`Missing audio chunk ${existing.chunks}`);
    if (mime !== existing.mime) throw badRequest('Audio format changed mid-recording');
    if (existing.bytes + body.length > LIMITS.streamBytes) throw badRequest('The recording is too large');
    appendFileSync(path.join(deps.uploadDir, existing.path), body);
    run(
      deps.db,
      `UPDATE audio_parts SET bytes = bytes + ?, chunks = chunks + 1, sec = MAX(COALESCE(sec, 0), COALESCE(?, 0))
        WHERE response_id = ? AND part = ?`,
      body.length,
      sec,
      response.id,
      part,
    );
    return { part, chunks: existing.chunks + 1 };
  });
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
  const hasAudio = Boolean(response.audio_path) || audioParts(deps.db, response.id).length > 0;

  if (!timedOut) {
    if (stage.kind === 'decision' && !answer.choiceId) throw badRequest('Choose an option before submitting');
    if (stage.kind === 'ai_allowed' && !hasText) throw badRequest('Paste your final answer before submitting');
    if (!hasText && !hasAudio) {
      throw badRequest(
        stage.thinkAloud
          ? 'Talk through your answer, or type it if your microphone is not working'
          : 'Record a voice note or type an answer before submitting',
      );
    }
  }

  run(
    deps.db,
    `UPDATE responses
        SET text = ?, choice_id = ?, ai_transcript = ?, reflection = ?, scratch_json = ?, signals_json = ?,
            submitted_at = ?, closed_reason = ?
      WHERE id = ? AND closed_reason IS NULL`,
    answer.text ?? null,
    answer.choiceId ?? null,
    answer.aiTranscript ?? null,
    answer.reflection ?? null,
    answer.scratch?.length ? JSON.stringify(answer.scratch) : null,
    JSON.stringify(sanitizeSignals(input.signals)),
    deps.now(),
    timedOut ? 'timeout' : 'submitted',
    response.id,
  );
  return currentPhase(deps, ctx);
}
