import type { ScoreOverride } from '../shared/api';
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

export { adjustedScores } from '../shared/scoring';
