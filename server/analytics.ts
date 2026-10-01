import type { AssessmentFunnel } from '../shared/api';
import { scaledTimeLimit } from '../shared/render';
import { type AssessmentRow, type CandidateRow, type DB, all } from './db';
import { familyFor } from './families';

/** A candidate with no activity for this long, mid-assessment, counts as stalled. */
export const STALLED_AFTER_MS = 24 * 60 * 60 * 1000;

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/** Where candidates stop: how many reach, finish and run out of time on each question. */
export async function assessmentFunnel(db: DB, assessment: AssessmentRow, now: number): Promise<AssessmentFunnel> {
  const family = await familyFor(db, assessment);
  const candidates = await all<CandidateRow>(db, 'SELECT * FROM candidates WHERE assessment_id = ?', assessment.id);
  const responses = await all<{
    candidate_id: string;
    stage_id: string;
    revealed_at: number;
    deadline_at: number;
    submitted_at: number | null;
    closed_reason: string | null;
  }>(
    db,
    `SELECT r.candidate_id, r.stage_id, r.revealed_at, r.deadline_at, r.submitted_at, r.closed_reason
       FROM responses r JOIN candidates c ON c.id = r.candidate_id
      WHERE c.assessment_id = ?`,
    assessment.id,
  );

  const lastActivity = new Map<string, number>();
  const furthest = new Map<string, number>();
  const stageIndex = new Map(family.stages.map((s, i) => [s.id, i]));
  for (const r of responses) {
    const at = Math.max(r.revealed_at, r.submitted_at ?? 0);
    lastActivity.set(r.candidate_id, Math.max(lastActivity.get(r.candidate_id) ?? 0, at));
    const index = stageIndex.get(r.stage_id) ?? -1;
    furthest.set(r.candidate_id, Math.max(furthest.get(r.candidate_id) ?? -1, index));
  }

  // Stalled: started, not finished, quiet for a day. Counted at the furthest question they opened
  // (or before the first one, index -1).
  const stalledAt = new Map<number, number>();
  for (const c of candidates) {
    if (c.status !== 'in_progress') continue;
    const last = lastActivity.get(c.id) ?? c.started_at ?? c.created_at;
    if (now - last < STALLED_AFTER_MS) continue;
    const at = furthest.get(c.id) ?? -1;
    stalledAt.set(at, (stalledAt.get(at) ?? 0) + 1);
  }

  return {
    invited: candidates.length,
    started: candidates.filter((c) => c.started_at !== null).length,
    finished: candidates.filter((c) => ['submitted', 'reviewed', 'decided'].includes(c.status)).length,
    stalledBeforeFirst: stalledAt.get(-1) ?? 0,
    stalledAfterHours: STALLED_AFTER_MS / 3_600_000,
    stages: family.stages.map((stage, index) => {
      const here = responses.filter((r) => r.stage_id === stage.id);
      const closed = here.filter((r) => r.closed_reason);
      return {
        id: stage.id,
        title: stage.title,
        kind: stage.kind,
        reached: here.length,
        submitted: closed.filter((r) => r.closed_reason === 'submitted').length,
        timedOut: closed.filter((r) => r.closed_reason === 'timeout').length,
        stalledHere: stalledAt.get(index) ?? 0,
        // Typical limit; candidates with extra time get more.
        timeLimitSec: scaledTimeLimit(stage, 1),
        medianTimeSec: median(
          closed
            .filter((r) => r.submitted_at !== null)
            .map((r) => Math.round((Math.min(r.submitted_at!, r.deadline_at) - r.revealed_at) / 1000)),
        ),
      };
    }),
  };
}
