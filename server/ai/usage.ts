import { randomUUID } from 'node:crypto';
import { type DB, run } from '../db';
import type { AiClient, AiConfig, AiUsage } from './client';

export type UsageKind = 'review' | 'generation' | 'interview_kit' | 'integrity' | 'decision_email';

/** Adds up what one AI job (a review, a generated scenario, …) cost across its calls. */
export class UsageMeter {
  calls = 0;
  promptTokens = 0;
  completionTokens = 0;
  costUsd = 0;

  add(usage: AiUsage) {
    this.calls++;
    this.promptTokens += usage.promptTokens;
    this.completionTokens += usage.completionTokens;
    this.costUsd += usage.costUsd;
  }
}

/** The same AI settings, with every reply's cost counted on `meter`. */
export function meteredAi(ai: AiConfig, meter: UsageMeter): AiConfig {
  const client = ai.client;
  if (!client) return ai;
  const metered: AiClient = {
    chat: (request) =>
      client.chat({
        ...request,
        onUsage: (usage) => {
          meter.add(usage);
          request.onUsage?.(usage);
        },
      }),
  };
  return { ...ai, client: metered };
}

/** Records one job's cost. Bookkeeping must never break the job, so failures are only logged. */
export async function saveUsage(
  db: DB,
  entry: { orgId: string; kind: UsageKind; refId: string; meter: UsageMeter; ok: boolean; now: number },
) {
  if (!entry.meter.calls) return;
  try {
    await run(
      db,
      `INSERT INTO ai_usage (id, org_id, kind, ref_id, calls, prompt_tokens, completion_tokens, cost_usd, ok, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      randomUUID(),
      entry.orgId,
      entry.kind,
      entry.refId,
      entry.meter.calls,
      entry.meter.promptTokens,
      entry.meter.completionTokens,
      entry.meter.costUsd,
      entry.ok ? 1 : 0,
      entry.now,
    );
  } catch (error) {
    console.error(`Could not record AI usage for ${entry.kind} ${entry.refId}:`, error);
  }
}
