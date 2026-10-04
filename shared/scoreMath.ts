/**
 * Score arithmetic. It needs only which stages count and their rubric weights,
 * so the static demo can use it without any role family content.
 */
import type { AiReviewResult, ScoreOverride } from './api';
import type { Criterion, Recommendation, ReviewScores } from './types';

/** The parts of a role family (or of a candidate report) that scoring reads. */
export interface ScoredStages {
  stages: readonly { id: string; scored: boolean; rubric: readonly Pick<Criterion, 'id' | 'weight'>[] }[];
}

export interface ScoreSummary {
  /** Weighted mean on the 1–4 scale, or null if nothing is scored yet. */
  overall: number | null;
  byStage: Record<string, number | null>;
  scoredCriteria: number;
  totalCriteria: number;
  complete: boolean;
}

export function isValidScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 4;
}

export function computeScore(family: ScoredStages, scores: ReviewScores): ScoreSummary {
  let weighted = 0;
  let weights = 0;
  let scoredCriteria = 0;
  let totalCriteria = 0;
  const byStage: Record<string, number | null> = {};

  for (const stage of family.stages) {
    if (!stage.scored) continue;
    let stageWeighted = 0;
    let stageWeights = 0;
    for (const criterion of stage.rubric) {
      totalCriteria += 1;
      const value = scores[stage.id]?.[criterion.id];
      if (!isValidScore(value)) continue;
      scoredCriteria += 1;
      stageWeighted += value * criterion.weight;
      stageWeights += criterion.weight;
    }
    byStage[stage.id] = stageWeights ? round1(stageWeighted / stageWeights) : null;
    weighted += stageWeighted;
    weights += stageWeights;
  }

  return {
    overall: weights ? round1(weighted / weights) : null,
    byStage,
    scoredCriteria,
    totalCriteria,
    complete: totalCriteria > 0 && scoredCriteria === totalCriteria,
  };
}

/** A starting point for the reviewer, never an automatic decision. */
export function suggestedRecommendation(overall: number | null): Recommendation | null {
  if (overall === null) return null;
  if (overall >= 3) return 'advance';
  if (overall >= 2.3) return 'hold';
  return 'reject';
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

/** The AI's rubric scores with each recruiter override applied; null when there are none. */
export function adjustedScores(family: ScoredStages, result: AiReviewResult | null, overrides: ScoreOverride[]) {
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
