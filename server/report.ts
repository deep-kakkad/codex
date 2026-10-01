import type {
  AssessmentSummary,
  CandidateListItem,
  CandidateReport,
  ReportStage,
  RoleFamilySummary,
  StatusCounts,
  VerificationRecord,
} from '../shared/api';
import { totalTimeSec } from '../shared/roleFamilies';
import { choicesFrom, scaledTimeLimit, stageOutline } from '../shared/render';
import { describeSignals, hasNotableSignals } from '../shared/signals';
import type {
  CandidateStageView,
  CandidateStatus,
  Decision,
  Delivery,
  RoleFamily,
  ScratchSnapshot,
  StageSignals,
} from '../shared/types';
import { buildVerificationScript, type ResponseForScript } from '../shared/verification';
import { buildContext } from '../shared/variants';
import type { SessionUser } from './auth';
import { audioParts } from './candidateFlow';
import { aiReviewView } from './ai/queue';
import { adjustedScores, overridesFor } from './overrides';
import { familyFor } from './families';
import { type AssessmentRow, type CandidateRow, type DB, all, one, type ResponseRow, type VerificationRow } from './db';
import { notFound } from './http';

export function familySummary(family: RoleFamily): RoleFamilySummary {
  return {
    id: family.id,
    name: family.name,
    roles: family.roles,
    summary: family.summary,
    totalMinutes: Math.round(totalTimeSec(family) / 60),
    stages: stageOutline(family),
    ...(family.generated ? { generated: true } : {}),
    ...(family.fixedCurrency ? { fixedCurrency: family.fixedCurrency } : {}),
  };
}

export async function loadAssessment(db: DB, user: SessionUser, id: string): Promise<AssessmentRow> {
  const assessment = await one<AssessmentRow>(
    db,
    'SELECT * FROM assessments WHERE id = ? AND org_id = ?',
    id,
    user.orgId,
  );
  if (!assessment) throw notFound('Assessment not found');
  return assessment;
}

export async function loadCandidate(db: DB, user: SessionUser, id: string): Promise<CandidateRow> {
  const candidate = await one<CandidateRow>(db, 'SELECT * FROM candidates WHERE id = ? AND org_id = ?', id, user.orgId);
  if (!candidate) throw notFound('Candidate not found');
  return candidate;
}

const EMPTY_COUNTS: StatusCounts = { invited: 0, in_progress: 0, submitted: 0, reviewed: 0, decided: 0 };

export async function assessmentSummary(db: DB, assessment: AssessmentRow): Promise<AssessmentSummary> {
  const family = await familyFor(db, assessment);
  const counts = { ...EMPTY_COUNTS };
  for (const row of await all<{ status: CandidateStatus; count: number }>(
    db,
    'SELECT status, COUNT(*)::int AS count FROM candidates WHERE assessment_id = ? GROUP BY status',
    assessment.id,
  )) {
    counts[row.status] = row.count;
  }
  return {
    id: assessment.id,
    title: assessment.title,
    roleFamilyId: family.id,
    roleFamilyName: family.name,
    currency: assessment.currency,
    createdAt: assessment.created_at,
    candidateCount: Object.values(counts).reduce((a, b) => a + b, 0),
    counts,
  };
}

async function audioFor(db: DB, candidateId: string, stageId: string, response: ResponseRow) {
  const base = `/api/candidates/${candidateId}/audio/${stageId}`;
  if (response.audio_path) return [{ url: base, startMs: null, sec: response.audio_sec }];
  return (await audioParts(db, response.id)).map((p) => ({
    url: `${base}?part=${p.part}`,
    startMs: p.start_ms,
    sec: p.sec,
  }));
}

function parseScratch(json: string | null): ScratchSnapshot[] {
  return json ? (JSON.parse(json) as ScratchSnapshot[]) : [];
}

function parseSignals(json: string | null): StageSignals | null {
  return json ? (JSON.parse(json) as StageSignals) : null;
}

function answerChars(response: ResponseRow) {
  return (response.text?.length ?? 0) + (response.reflection?.length ?? 0);
}

export async function candidateList(db: DB, assessment: AssessmentRow): Promise<CandidateListItem[]> {
  const family = await familyFor(db, assessment);
  const kindOf = new Map(family.stages.map((s) => [s.id, s.kind]));
  const candidates = await all<CandidateRow>(
    db,
    'SELECT * FROM candidates WHERE assessment_id = ? ORDER BY created_at DESC',
    assessment.id,
  );
  return Promise.all(
    candidates.map(async (candidate) => {
      const ai = await aiReviewView(db, candidate.id);
      const responses = await all<ResponseRow>(db, 'SELECT * FROM responses WHERE candidate_id = ?', candidate.id);
      const verification = await one<VerificationRow>(
        db,
        'SELECT * FROM verifications WHERE candidate_id = ?',
        candidate.id,
      );
      return {
        id: candidate.id,
        name: candidate.name,
        email: candidate.email,
        token: candidate.token,
        status: candidate.status as CandidateStatus,
        timeMultiplier: candidate.time_multiplier,
        createdAt: candidate.created_at,
        startedAt: candidate.started_at,
        submittedAt: candidate.submitted_at,
        aiScore: ai?.result?.overall ?? null,
        aiStatus: ai?.status ?? null,
        aiRecommendation: ai?.result?.recommendation ?? null,
        adjustedScore:
          adjustedScores(family, ai?.result ?? null, await overridesFor(db, candidate.id))?.overall ?? null,
        notableSignals: responses.filter((r) =>
          hasNotableSignals(kindOf.get(r.stage_id) ?? 'scenario', parseSignals(r.signals_json), answerChars(r)),
        ).length,
        verification: verification ? { identity: verification.identity, consistency: verification.consistency } : null,
        decision: candidate.decision as Decision | null,
      };
    }),
  );
}

export async function candidateReport(db: DB, candidate: CandidateRow): Promise<CandidateReport> {
  const assessment = (await one<AssessmentRow>(db, 'SELECT * FROM assessments WHERE id = ?', candidate.assessment_id))!;
  const family = await familyFor(db, assessment);
  const variant = JSON.parse(candidate.variant_json);
  const responses = await all<ResponseRow>(
    db,
    'SELECT * FROM responses WHERE candidate_id = ? ORDER BY stage_index',
    candidate.id,
  );
  const byStage = new Map(responses.map((r) => [r.stage_id, r]));
  const ctx = buildContext(
    variant,
    assessment.currency,
    choicesFrom(responses.map((r) => ({ stageId: r.stage_id, choiceId: r.choice_id }))),
  );

  const stages: ReportStage[] = [];
  for (const [index, stage] of family.stages.entries()) {
    const response = byStage.get(stage.id);
    const shown = response ? (JSON.parse(response.prompt_json) as CandidateStageView) : null;
    const signals = response ? parseSignals(response.signals_json) : null;
    stages.push({
      id: stage.id,
      index,
      kind: stage.kind,
      title: stage.title,
      scored: stage.scored,
      thinkAloud: Boolean(stage.thinkAloud),
      timeLimitSec: scaledTimeLimit(stage, candidate.time_multiplier),
      shown,
      reviewerGuide: stage.reviewerGuide(ctx),
      rubric: stage.rubric,
      response: response
        ? {
            revealedAt: response.revealed_at,
            deadlineAt: response.deadline_at,
            submittedAt: response.submitted_at,
            closedReason: response.closed_reason,
            timeUsedSec: response.submitted_at
              ? Math.round((Math.min(response.submitted_at, response.deadline_at) - response.revealed_at) / 1000)
              : null,
            overtimeSec: response.submitted_at
              ? Math.max(0, Math.round((response.submitted_at - response.deadline_at) / 1000))
              : 0,
            text: response.text,
            choiceId: response.choice_id,
            choiceLabel: stage.choices?.find((c) => c.id === response.choice_id)?.label ?? null,
            aiTranscript: response.ai_transcript,
            reflection: response.reflection,
            audio: await audioFor(db, candidate.id, stage.id, response),
            scratch: parseScratch(response.scratch_json),
            signals,
            signalNotes: response.closed_reason ? describeSignals(stage.kind, signals, answerChars(response)) : [],
          }
        : null,
    });
  }

  const aiReview = await aiReviewView(db, candidate.id);
  const overrides = await overridesFor(db, candidate.id);

  const scriptResponses: ResponseForScript[] = stages.flatMap((stage) => {
    const r = byStage.get(stage.id);
    if (!r || !stage.response) return [];
    const audio = stage.response.audio;
    return [
      {
        stageId: r.stage_id,
        text: r.text,
        choiceId: r.choice_id,
        aiTranscript: r.ai_transcript,
        reflection: r.reflection,
        hasVoice: audio.length > 0,
        voiceSec: audio.length ? audio.reduce((sum, a) => sum + (a.sec ?? 0), 0) : null,
        closedReason: r.closed_reason,
        signals: parseSignals(r.signals_json),
      },
    ];
  });
  // Think-aloud delivery the AI flagged becomes a priority on the call.
  const concerns: Record<string, Delivery> = {};
  for (const stage of aiReview?.result?.stages ?? []) {
    const label = stage.delivery?.label;
    if (label === 'read' || label === 'unsure') concerns[stage.stageId] = label;
  }
  const verificationRow = await one<VerificationRow & { interviewer_name: string }>(
    db,
    `SELECT v.*, u.name AS interviewer_name FROM verifications v JOIN users u ON u.id = v.interviewer_id
      WHERE v.candidate_id = ?`,
    candidate.id,
  );
  const record: VerificationRecord | null = verificationRow
    ? {
        identity: verificationRow.identity as VerificationRecord['identity'],
        consistency: verificationRow.consistency as VerificationRecord['consistency'],
        notes: verificationRow.notes,
        interviewerName: verificationRow.interviewer_name,
        updatedAt: verificationRow.updated_at,
      }
    : null;

  return {
    candidate: {
      id: candidate.id,
      name: candidate.name,
      email: candidate.email,
      token: candidate.token,
      idName: candidate.id_name,
      status: candidate.status as CandidateStatus,
      timeMultiplier: candidate.time_multiplier,
      createdAt: candidate.created_at,
      startedAt: candidate.started_at,
      submittedAt: candidate.submitted_at,
      decision: candidate.decision as Decision | null,
    },
    assessment: { id: assessment.id, title: assessment.title, currency: assessment.currency },
    family: { id: family.id, name: family.name },
    brief: family.brief(ctx),
    stages,
    aiReview,
    overrides,
    adjusted: adjustedScores(family, aiReview?.result ?? null, overrides),
    verification: {
      script: buildVerificationScript(
        family,
        ctx,
        { name: candidate.name, idName: candidate.id_name },
        scriptResponses,
        concerns,
      ),
      record,
    },
  };
}
