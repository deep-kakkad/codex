import type {
  AssessmentSummary,
  CandidateListItem,
  CandidateReport,
  ReportStage,
  ReviewView,
  RoleFamilySummary,
  StatusCounts,
  VerificationRecord,
} from '../shared/api';
import { ROLE_FAMILIES, getRoleFamily, totalTimeSec } from '../shared/roleFamilies';
import { choicesFrom, scaledTimeLimit, stageOutline } from '../shared/render';
import { computeScore, suggestedRecommendation } from '../shared/scoring';
import { describeSignals, hasNotableSignals } from '../shared/signals';
import type {
  CandidateStageView,
  CandidateStatus,
  Decision,
  Recommendation,
  ReviewScores,
  RoleFamily,
  StageSignals,
} from '../shared/types';
import { buildVerificationScript, type ResponseForScript } from '../shared/verification';
import { buildContext } from '../shared/variants';
import type { SessionUser } from './auth';
import {
  type AssessmentRow,
  type CandidateRow,
  type DB,
  all,
  one,
  type ResponseRow,
  type ReviewRow,
  type VerificationRow,
} from './db';
import { HttpError, notFound } from './http';

export function familySummary(family: RoleFamily): RoleFamilySummary {
  return {
    id: family.id,
    name: family.name,
    roles: family.roles,
    summary: family.summary,
    totalMinutes: Math.round(totalTimeSec(family) / 60),
    stages: stageOutline(family),
  };
}

export function listFamilies(): RoleFamilySummary[] {
  return ROLE_FAMILIES.map(familySummary);
}

export function familyFor(assessment: AssessmentRow): RoleFamily {
  const family = getRoleFamily(assessment.role_family_id);
  if (!family) throw new HttpError(500, `Role family ${assessment.role_family_id} is missing`);
  return family;
}

export function loadAssessment(db: DB, user: SessionUser, id: string): AssessmentRow {
  const assessment = one<AssessmentRow>(db, 'SELECT * FROM assessments WHERE id = ? AND org_id = ?', id, user.orgId);
  if (!assessment) throw notFound('Assessment not found');
  return assessment;
}

export function loadCandidate(db: DB, user: SessionUser, id: string): CandidateRow {
  const candidate = one<CandidateRow>(db, 'SELECT * FROM candidates WHERE id = ? AND org_id = ?', id, user.orgId);
  if (!candidate) throw notFound('Candidate not found');
  return candidate;
}

const EMPTY_COUNTS: StatusCounts = { invited: 0, in_progress: 0, submitted: 0, reviewed: 0, decided: 0 };

export function assessmentSummary(db: DB, assessment: AssessmentRow): AssessmentSummary {
  const family = familyFor(assessment);
  const counts = { ...EMPTY_COUNTS };
  for (const row of all<{ status: CandidateStatus; count: number }>(
    db,
    'SELECT status, COUNT(*) AS count FROM candidates WHERE assessment_id = ? GROUP BY status',
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

function toReviewView(family: RoleFamily, row: ReviewRow & { reviewer_name: string }): ReviewView {
  const scores = JSON.parse(row.scores_json) as ReviewScores;
  const summary = computeScore(family, scores);
  return {
    reviewerId: row.reviewer_id,
    reviewerName: row.reviewer_name,
    scores,
    notes: row.notes,
    recommendation: row.recommendation as Recommendation | null,
    submittedAt: row.submitted_at,
    overall: summary.overall,
    byStage: summary.byStage,
  };
}

function reviewsFor(db: DB, family: RoleFamily, candidateId: string): ReviewView[] {
  return all<ReviewRow & { reviewer_name: string }>(
    db,
    `SELECT r.*, u.name AS reviewer_name FROM reviews r JOIN users u ON u.id = r.reviewer_id
      WHERE r.candidate_id = ? ORDER BY r.updated_at`,
    candidateId,
  ).map((row) => toReviewView(family, row));
}

function average(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  if (!present.length) return null;
  return Math.round((present.reduce((a, b) => a + b, 0) / present.length) * 10) / 10;
}

function parseSignals(json: string | null): StageSignals | null {
  return json ? (JSON.parse(json) as StageSignals) : null;
}

function answerChars(response: ResponseRow) {
  return (response.text?.length ?? 0) + (response.reflection?.length ?? 0);
}

export function candidateList(db: DB, user: SessionUser, assessment: AssessmentRow): CandidateListItem[] {
  const family = familyFor(assessment);
  const kindOf = new Map(family.stages.map((s) => [s.id, s.kind]));
  const candidates = all<CandidateRow>(
    db,
    'SELECT * FROM candidates WHERE assessment_id = ? ORDER BY created_at DESC',
    assessment.id,
  );
  return candidates.map((candidate) => {
    const reviews = reviewsFor(db, family, candidate.id);
    const mine = reviews.find((r) => r.reviewerId === user.id) ?? null;
    const submitted = reviews.filter((r) => r.submittedAt !== null);
    const canSeeTeam = mine?.submittedAt != null;
    const responses = all<ResponseRow>(db, 'SELECT * FROM responses WHERE candidate_id = ?', candidate.id);
    const verification = one<VerificationRow>(db, 'SELECT * FROM verifications WHERE candidate_id = ?', candidate.id);
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
      myScore: mine?.overall ?? null,
      teamScore: canSeeTeam ? average(submitted.map((r) => r.overall)) : null,
      reviewCount: submitted.length,
      notableSignals: responses.filter((r) =>
        hasNotableSignals(kindOf.get(r.stage_id) ?? 'scenario', parseSignals(r.signals_json), answerChars(r)),
      ).length,
      verification: verification ? { identity: verification.identity, consistency: verification.consistency } : null,
      decision: candidate.decision as Decision | null,
    };
  });
}

export function candidateReport(db: DB, user: SessionUser, candidate: CandidateRow): CandidateReport {
  const assessment = one<AssessmentRow>(db, 'SELECT * FROM assessments WHERE id = ?', candidate.assessment_id)!;
  const family = familyFor(assessment);
  const variant = JSON.parse(candidate.variant_json);
  const responses = all<ResponseRow>(
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

  const stages: ReportStage[] = family.stages.map((stage, index) => {
    const response = byStage.get(stage.id);
    const shown = response ? (JSON.parse(response.prompt_json) as CandidateStageView) : null;
    const signals = response ? parseSignals(response.signals_json) : null;
    return {
      id: stage.id,
      index,
      kind: stage.kind,
      title: stage.title,
      scored: stage.scored,
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
            audioUrl: response.audio_path ? `/api/candidates/${candidate.id}/audio/${stage.id}` : null,
            audioSec: response.audio_sec,
            signals,
            signalNotes: response.closed_reason ? describeSignals(stage.kind, signals, answerChars(response)) : [],
          }
        : null,
    };
  });

  const reviews = reviewsFor(db, family, candidate.id);
  const myReview = reviews.find((r) => r.reviewerId === user.id) ?? null;
  const othersSubmitted = reviews.filter((r) => r.reviewerId !== user.id && r.submittedAt !== null);
  // Blind review: other people's scores stay hidden until you commit your own,
  // so the first reviewer's numbers don't anchor everyone else.
  const canSeeOthers = myReview?.submittedAt != null;
  const submittedOveralls = reviews.filter((r) => r.submittedAt !== null).map((r) => r.overall);

  const scriptResponses: ResponseForScript[] = responses.map((r) => ({
    stageId: r.stage_id,
    text: r.text,
    choiceId: r.choice_id,
    aiTranscript: r.ai_transcript,
    reflection: r.reflection,
    hasVoice: Boolean(r.audio_path),
    voiceSec: r.audio_sec,
    closedReason: r.closed_reason,
    signals: parseSignals(r.signals_json),
  }));
  const verificationRow = one<VerificationRow & { interviewer_name: string }>(
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
    myReview,
    otherReviews: canSeeOthers ? othersSubmitted : [],
    hiddenReviews: canSeeOthers ? 0 : othersSubmitted.length,
    teamScore: canSeeOthers ? average(submittedOveralls) : null,
    suggestedRecommendation: suggestedRecommendation(myReview?.overall ?? null),
    verification: {
      script: buildVerificationScript(
        family,
        ctx,
        { name: candidate.name, idName: candidate.id_name },
        scriptResponses,
      ),
      record,
    },
  };
}
