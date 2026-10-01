import type { AiReviewResult, ScoreOverride } from '../shared/api';
import { computeScore, suggestedRecommendation } from '../shared/scoring';
import type { ReviewScores, RoleFamily } from '../shared/types';
import { type DB, all } from './db';

export async function overridesFor(db: DB, candidateId: string): Promise<ScoreOverride[]> {
  const rows = await all<{
    stage_id: string;
    criterion_id: string;
    ai_score: number;
    score: number;
    note: string;
    user_name: string;
    updated_at: number;
  }>(
    db,
    `SELECT o.*, u.name AS user_name FROM score_overrides o JOIN users u ON u.id = o.user_id
      WHERE o.candidate_id = ? ORDER BY o.updated_at`,
    candidateId,
  );
  return rows.map((r) => ({
    stageId: r.stage_id,
    criterionId: r.criterion_id,
    aiScore: r.ai_score,
    score: r.score,
    note: r.note,
    userName: r.user_name,
    updatedAt: r.updated_at,
  }));
}

/** The AI's rubric scores with each recruiter override applied; null when there are none. */
export function adjustedScores(family: RoleFamily, result: AiReviewResult | null, overrides: ScoreOverride[]) {
  if (!result || !overrides.length) return null;
  const scores: ReviewScores = {};
  for (const stage of result.stages) {
    for (const [criterionId, c] of Object.entries(stage.criteria))
      (scores[stage.stageId] ??= {})[criterionId] = c.score;
  }
  for (const o of overrides) (scores[o.stageId] ??= {})[o.criterionId] = o.score;
  const summary = computeScore(family, scores);
  return {
    overall: summary.overall,
    byStage: summary.byStage,
    recommendation: suggestedRecommendation(summary.overall),
  };
}
