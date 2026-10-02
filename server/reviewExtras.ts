import type { Benchmark, CandidateSiblings, ReviewNote } from '../shared/api';
import type { Decision, RoleFamily } from '../shared/types';
import { aiReviewView } from './ai/queue';
import { type DB, all, one } from './db';
import { adjustedScores, overridesFor } from './overrides';

/** Candidates whose answers can be reviewed, in the order the assessment page lists them. */
export const REVIEWABLE_STATUSES = ['submitted', 'reviewed', 'decided'];

export async function isStarred(db: DB, userId: string, candidateId: string): Promise<boolean> {
  return Boolean(
    await one(db, 'SELECT 1 FROM candidate_stars WHERE user_id = ? AND candidate_id = ?', userId, candidateId),
  );
}

export async function starredIds(db: DB, userId: string, assessmentId: string): Promise<Set<string>> {
  const rows = await all<{ candidate_id: string }>(
    db,
    `SELECT s.candidate_id FROM candidate_stars s JOIN candidates c ON c.id = s.candidate_id
      WHERE s.user_id = ? AND c.assessment_id = ?`,
    userId,
    assessmentId,
  );
  return new Set(rows.map((r) => r.candidate_id));
}

export async function notesFor(db: DB, candidateId: string, viewerId: string): Promise<ReviewNote[]> {
  const rows = await all<{
    id: string;
    user_id: string;
    user_name: string;
    body: string;
    lean: Decision | null;
    created_at: number;
  }>(
    db,
    `SELECT n.*, u.name AS user_name FROM review_notes n JOIN users u ON u.id = n.user_id
      WHERE n.candidate_id = ? ORDER BY n.created_at`,
    candidateId,
  );
  return rows.map((r) => ({
    id: r.id,
    userName: r.user_name,
    body: r.body,
    lean: r.lean,
    createdAt: r.created_at,
    mine: r.user_id === viewerId,
  }));
}

/** Previous and next reviewable candidate on the same assessment, for moving through a pool. */
export async function siblingsFor(db: DB, assessmentId: string, candidateId: string): Promise<CandidateSiblings> {
  const rows = await all<{ id: string; name: string }>(
    db,
    `SELECT id, name FROM candidates WHERE assessment_id = ? AND status IN ('submitted', 'reviewed', 'decided')
      ORDER BY created_at DESC, id`,
    assessmentId,
  );
  const index = rows.findIndex((r) => r.id === candidateId);
  if (index === -1) return { index: null, total: rows.length, prev: null, next: null };
  return {
    index: index + 1,
    total: rows.length,
    prev: rows[index - 1] ?? null,
    next: rows[index + 1] ?? null,
  };
}

/**
 * Where this candidate stands among everyone reviewed on the same assessment:
 * rank by overall score (with recruiter changes applied) and the pool's
 * average per question. Null until at least two candidates have scores.
 */
export async function benchmarkFor(
  db: DB,
  family: RoleFamily,
  assessmentId: string,
  candidateId: string,
): Promise<Benchmark | null> {
  const ids = await all<{ id: string }>(
    db,
    `SELECT c.id FROM candidates c JOIN ai_reviews r ON r.candidate_id = c.id
      WHERE c.assessment_id = ? AND r.status = 'done'`,
    assessmentId,
  );
  const pool: { id: string; overall: number; byStage: Record<string, number | null> }[] = [];
  for (const { id } of ids) {
    const result = (await aiReviewView(db, id))?.result ?? null;
    if (!result || result.overall === null) continue;
    const adjusted = adjustedScores(family, result, await overridesFor(db, id));
    pool.push({
      id,
      overall: adjusted?.overall ?? result.overall,
      byStage: adjusted?.byStage ?? result.byStage,
    });
  }
  const me = pool.find((p) => p.id === candidateId);
  if (!me || pool.length < 2) return null;
  const sorted = [...pool].sort((a, b) => b.overall - a.overall);
  const rank = sorted.findIndex((p) => p.overall === me.overall) + 1;
  const average = (values: (number | null | undefined)[]) => {
    const scored = values.filter((v): v is number => typeof v === 'number');
    return scored.length ? Math.round((scored.reduce((a, b) => a + b, 0) / scored.length) * 100) / 100 : null;
  };
  const byStage: Record<string, number | null> = {};
  for (const stage of family.stages)
    if (stage.scored) byStage[stage.id] = average(pool.map((p) => p.byStage[stage.id]));
  return {
    rank,
    of: pool.length,
    overallAverage: average(pool.map((p) => p.overall)),
    byStage,
  };
}
