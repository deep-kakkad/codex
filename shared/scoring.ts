import type { ReviewScores, RoleFamily } from './types';
import { isValidScore } from './scoreMath';

export {
  adjustedScores,
  computeScore,
  isValidScore,
  type ScoreSummary,
  type ScoredStages,
  suggestedRecommendation,
} from './scoreMath';

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
