import type { Recommendation, ReviewScores, RoleFamily } from './types';

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

export function computeScore(family: RoleFamily, scores: ReviewScores): ScoreSummary {
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

/** Keep only well-formed scores for criteria that exist in this role family. */
export function sanitizeScores(family: RoleFamily, input: unknown): ReviewScores {
  const result: ReviewScores = {};
  if (!input || typeof input !== 'object') return result;
  const raw = input as Record<string, unknown>;
  for (const stage of family.stages) {
    const stageScores = raw[stage.id];
    if (!stage.scored || !stageScores || typeof stageScores !== 'object') continue;
    for (const criterion of stage.rubric) {
      const value = (stageScores as Record<string, unknown>)[criterion.id];
      if (isValidScore(value)) {
        (result[stage.id] ??= {})[criterion.id] = value;
      }
    }
  }
  return result;
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}
