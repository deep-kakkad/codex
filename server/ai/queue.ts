import type { AiReviewResult, AiReviewView } from '../../shared/api';
import { type AiReviewRow, type DB, all, one, run } from '../db';
import { rewardReferrer, reviewCoverage } from '../plans';
import { type ReviewDeps, reviewCandidate } from './review';
import { UsageMeter, meteredAi, saveUsage } from './usage';

/** A review stuck in "running" this long is assumed dead (crash, timeout) and retried. */
export const STALE_RUNNING_MS = 20 * 60 * 1000;
const MAX_AUTO_ATTEMPTS = 3;
const TRIGGER_WAIT_MS = 3000;

export interface ReviewQueue {
  /** Queues an AI review for a submitted candidate (no-op if one is already done). */
  enqueue(candidateId: string): Promise<void>;
  /** Re-queues a review on request, e.g. after a failure. */
  retry(candidateId: string): Promise<void>;
  /** Picks up reviews that were interrupted or never started. */
  resume(): Promise<void>;
  /** Resolves once in-process work is finished (tests, local dev). */
  idle(): Promise<void>;
}

async function markPending(db: DB, candidateId: string, now: number) {
  await run(
    db,
    `INSERT INTO ai_reviews (candidate_id, status, attempts, created_at, updated_at) VALUES (?, 'pending', 0, ?, ?)
     ON CONFLICT (candidate_id) DO UPDATE SET status = 'pending', error = NULL, updated_at = excluded.updated_at`,
    candidateId,
    now,
    now,
  );
}

/**
 * First queueing of a finished candidate's review: pending if the plan covers
 * it, otherwise locked until the plan changes. Returns whether it may run.
 */
async function startOrLock(db: DB, candidateId: string, now: number): Promise<boolean> {
  const candidate = await one<{ org_id: string }>(db, 'SELECT org_id FROM candidates WHERE id = ?', candidateId);
  if (!candidate) return false;
  // Only the first queueing decides how a review is paid for.
  if (await one(db, 'SELECT candidate_id FROM ai_reviews WHERE candidate_id = ?', candidateId)) {
    return (
      (await one<{ status: string }>(db, 'SELECT status FROM ai_reviews WHERE candidate_id = ?', candidateId))!
        .status !== 'locked'
    );
  }
  const coverage = await reviewCoverage(db, candidate.org_id, now);
  await run(
    db,
    `INSERT INTO ai_reviews (candidate_id, status, attempts, covered_by, created_at, updated_at) VALUES (?, ?, 0, ?, ?, ?)
     ON CONFLICT (candidate_id) DO NOTHING`,
    candidateId,
    coverage ? 'pending' : 'locked',
    coverage,
    now,
    now,
  );
  // A referred workspace's first finished candidate earns the referrer its free reviews.
  await rewardReferrer(db, candidate.org_id, now);
  return coverage !== null;
}

/** Pending reviews to (re)start: queued, stuck, or failed with attempts left; plus old submissions. */
async function reviewsToResume(deps: ReviewDeps): Promise<string[]> {
  const now = deps.now();
  await run(
    deps.db,
    "UPDATE ai_reviews SET status = 'pending', updated_at = ? WHERE status = 'running' AND updated_at < ?",
    now,
    now - STALE_RUNNING_MS,
  );
  await run(
    deps.db,
    "UPDATE ai_reviews SET status = 'pending', updated_at = ? WHERE status = 'failed' AND attempts < ?",
    now,
    MAX_AUTO_ATTEMPTS,
  );
  for (const c of await all<{ id: string }>(
    deps.db,
    `SELECT id FROM candidates WHERE status = 'submitted' AND id NOT IN (SELECT candidate_id FROM ai_reviews)`,
  )) {
    await startOrLock(deps.db, c.id, now);
  }
  return (
    await all<{ candidate_id: string }>(deps.db, "SELECT candidate_id FROM ai_reviews WHERE status = 'pending'")
  ).map((r) => r.candidate_id);
}

/**
 * Runs one review if it is still pending. The pending→running update is the
 * claim: of two concurrent triggers, only one gets a row back.
 */
export async function processReview(deps: ReviewDeps, candidateId: string): Promise<boolean> {
  const { db, now } = deps;
  const claimed = await run(
    db,
    `UPDATE ai_reviews SET status = 'running', attempts = attempts + 1, updated_at = ?
      WHERE candidate_id = ? AND status = 'pending'`,
    now(),
    candidateId,
  );
  if (!claimed.changes) return false;
  const meter = new UsageMeter();
  const org = await one<{ org_id: string }>(db, 'SELECT org_id FROM candidates WHERE id = ?', candidateId);
  let ok = false;
  try {
    const result: AiReviewResult = await reviewCandidate({ ...deps, ai: meteredAi(deps.ai, meter) }, candidateId);
    ok = true;
    await run(
      db,
      `UPDATE ai_reviews SET status = 'done', result_json = ?, models = ?, error = NULL, updated_at = ?,
              cost_usd = COALESCE(cost_usd, 0) + ?
        WHERE candidate_id = ?`,
      JSON.stringify(result),
      `${result.models.review}, ${result.models.audio}`,
      now(),
      meter.costUsd,
      candidateId,
    );
    await run(db, "UPDATE candidates SET status = 'reviewed' WHERE id = ? AND status = 'submitted'", candidateId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`AI review failed for ${candidateId}: ${message}`);
    await run(
      db,
      `UPDATE ai_reviews SET status = 'failed', error = ?, updated_at = ?, cost_usd = COALESCE(cost_usd, 0) + ?
        WHERE candidate_id = ?`,
      message.slice(0, 1000),
      now(),
      meter.costUsd,
      candidateId,
    );
  }
  if (org) await saveUsage(db, { orgId: org.org_id, kind: 'review', refId: candidateId, meter, ok, now: now() });
  return true;
}

/** A re-run never unlocks a review the plan doesn't cover; one never queued is queued under the plan. */
async function reviewMayRetry(db: DB, candidateId: string, now: number): Promise<boolean> {
  const existing = await one<AiReviewRow>(db, 'SELECT status FROM ai_reviews WHERE candidate_id = ?', candidateId);
  if (!existing) return startOrLock(db, candidateId, now);
  return existing.status !== 'locked';
}

/** Local development and tests: reviews run one at a time in this process. */
export function inProcessQueue(deps: ReviewDeps): ReviewQueue {
  let chain: Promise<unknown> = Promise.resolve();
  const schedule = (candidateId: string) => {
    chain = chain.then(() => processReview(deps, candidateId)).catch(() => undefined);
  };
  return {
    async enqueue(candidateId) {
      const existing = await one<AiReviewRow>(deps.db, 'SELECT * FROM ai_reviews WHERE candidate_id = ?', candidateId);
      if (existing?.status === 'done' || existing?.status === 'locked') return;
      if (!existing && !(await startOrLock(deps.db, candidateId, deps.now()))) return;
      schedule(candidateId);
    },
    async retry(candidateId) {
      if (!(await reviewMayRetry(deps.db, candidateId, deps.now()))) return;
      await markPending(deps.db, candidateId, deps.now());
      schedule(candidateId);
    },
    async resume() {
      for (const id of await reviewsToResume(deps)) schedule(id);
    },
    async idle() {
      let current: Promise<unknown>;
      do {
        current = chain;
        await current;
      } while (current !== chain);
    },
  };
}

/**
 * Netlify: a review takes longer than a normal function may run, so each one
 * is handed to a background function (up to 15 minutes). The trigger only
 * carries an id; the background function re-checks the database, so a
 * stray trigger can't do anything a real submission didn't ask for.
 */
export function backgroundFunctionQueue(deps: ReviewDeps, triggerUrl: string): ReviewQueue {
  const trigger = async (candidateId: string) => {
    try {
      // Netlify answers 202 as soon as a background function is queued; don't
      // wait longer than that (local emulators hold the request open).
      await fetch(triggerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateId }),
        signal: AbortSignal.timeout(TRIGGER_WAIT_MS),
      });
    } catch (error) {
      // Timed out waiting is fine; anything else is picked up by the scheduled sweep.
      if ((error as Error).name !== 'TimeoutError')
        console.error(`Could not start the review for ${candidateId}:`, error);
    }
  };
  return {
    async enqueue(candidateId) {
      const existing = await one<AiReviewRow>(deps.db, 'SELECT * FROM ai_reviews WHERE candidate_id = ?', candidateId);
      if (existing?.status === 'done' || existing?.status === 'locked') return;
      if (!existing && !(await startOrLock(deps.db, candidateId, deps.now()))) return;
      await trigger(candidateId);
    },
    async retry(candidateId) {
      if (!(await reviewMayRetry(deps.db, candidateId, deps.now()))) return;
      await markPending(deps.db, candidateId, deps.now());
      await trigger(candidateId);
    },
    async resume() {
      for (const id of await reviewsToResume(deps)) await trigger(id);
    },
    async idle() {},
  };
}

export async function aiReviewView(db: DB, candidateId: string): Promise<AiReviewView | null> {
  const row = await one<AiReviewRow>(db, 'SELECT * FROM ai_reviews WHERE candidate_id = ?', candidateId);
  if (!row) return null;
  return {
    status: row.status,
    attempts: row.attempts,
    error: row.error,
    updatedAt: row.updated_at,
    // A held review shows nothing until the plan covers it.
    result: row.result_json && row.status !== 'locked' ? JSON.parse(row.result_json) : null,
  };
}
