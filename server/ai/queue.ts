import type { AiReviewView } from '../../shared/api';
import { type AiReviewRow, type DB, all, one, run } from '../db';
import { type ReviewDeps, reviewCandidate } from './review';

const MAX_AUTO_ATTEMPTS = 3;

export interface ReviewQueue {
  /** Queues an AI review for a submitted candidate (no-op if one is done or queued). */
  enqueue(candidateId: string): void;
  /** Re-queues a failed review on request. */
  retry(candidateId: string): void;
  /** Picks up reviews interrupted by a restart. */
  resume(): void;
  /** Resolves once the queue is empty (tests, graceful shutdown). */
  idle(): Promise<void>;
}

function upsertPending(db: DB, candidateId: string, now: number) {
  run(
    db,
    `INSERT INTO ai_reviews (candidate_id, status, attempts, created_at, updated_at) VALUES (?, 'pending', 0, ?, ?)
     ON CONFLICT (candidate_id) DO UPDATE SET status = 'pending', error = NULL, updated_at = excluded.updated_at`,
    candidateId,
    now,
    now,
  );
}

/** Reviews run one at a time in the background so a burst of submissions can't flood the AI provider. */
export function createReviewQueue(deps: ReviewDeps): ReviewQueue {
  const queued = new Set<string>();
  let chain: Promise<void> = Promise.resolve();

  async function process(candidateId: string) {
    const { db, now } = deps;
    run(
      db,
      "UPDATE ai_reviews SET status = 'running', attempts = attempts + 1, updated_at = ? WHERE candidate_id = ?",
      now(),
      candidateId,
    );
    try {
      const result = await reviewCandidate(deps, candidateId);
      run(
        db,
        `UPDATE ai_reviews SET status = 'done', result_json = ?, models = ?, error = NULL, updated_at = ?
          WHERE candidate_id = ?`,
        JSON.stringify(result),
        `${result.models.review}, ${result.models.audio}`,
        now(),
        candidateId,
      );
      run(db, "UPDATE candidates SET status = 'reviewed' WHERE id = ? AND status = 'submitted'", candidateId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`AI review failed for ${candidateId}: ${message}`);
      run(
        db,
        "UPDATE ai_reviews SET status = 'failed', error = ?, updated_at = ? WHERE candidate_id = ?",
        message.slice(0, 1000),
        now(),
        candidateId,
      );
    }
  }

  function schedule(candidateId: string) {
    if (queued.has(candidateId)) return;
    queued.add(candidateId);
    chain = chain.then(() => process(candidateId)).finally(() => queued.delete(candidateId));
  }

  return {
    enqueue(candidateId) {
      const existing = one<AiReviewRow>(deps.db, 'SELECT * FROM ai_reviews WHERE candidate_id = ?', candidateId);
      if (existing?.status === 'done') return;
      if (!existing) upsertPending(deps.db, candidateId, deps.now());
      schedule(candidateId);
    },
    retry(candidateId) {
      upsertPending(deps.db, candidateId, deps.now());
      schedule(candidateId);
    },
    resume() {
      const rows = all<AiReviewRow>(
        deps.db,
        `SELECT * FROM ai_reviews WHERE status IN ('pending', 'running')
            OR (status = 'failed' AND attempts < ?)`,
        MAX_AUTO_ATTEMPTS,
      );
      for (const row of rows) schedule(row.candidate_id);
      // Submissions from before AI review existed.
      for (const c of all<{ id: string }>(
        deps.db,
        `SELECT id FROM candidates WHERE status = 'submitted' AND id NOT IN (SELECT candidate_id FROM ai_reviews)`,
      )) {
        this.enqueue(c.id);
      }
    },
    async idle() {
      let current: Promise<void>;
      do {
        current = chain;
        await current;
      } while (current !== chain);
    },
  };
}

export function aiReviewView(db: DB, candidateId: string): AiReviewView | null {
  const row = one<AiReviewRow>(db, 'SELECT * FROM ai_reviews WHERE candidate_id = ?', candidateId);
  if (!row) return null;
  return {
    status: row.status,
    attempts: row.attempts,
    error: row.error,
    updatedAt: row.updated_at,
    result: row.result_json ? JSON.parse(row.result_json) : null,
  };
}
