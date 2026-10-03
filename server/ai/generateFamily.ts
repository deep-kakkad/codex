import { randomUUID } from 'node:crypto';
import { contentBrand } from '../../shared/roleFamilies/contentBrand';
import { type FamilySpec, SpecError, type SpecStage, parseFamilySpec } from '../../shared/roleFamilies/custom';
import type { Currency, RoleFamily } from '../../shared/types';
import { buildContext, generateVariant } from '../../shared/variants';
import { type CustomFamilyRow, type DB, all, one, run } from '../db';
import { type AiConfig, AiError, type ChatMessage, extractJson } from './client';
import { UsageMeter, meteredAi, saveUsage } from './usage';

export interface GenerationDeps {
  db: DB;
  ai: AiConfig;
  now: () => number;
}

export interface GenerationRequest {
  roleTitle: string;
  /** The recruiter's description of the role, or a pasted job description. */
  description: string;
  currency: Currency;
  source?: 'description' | 'jd';
}

const STALE_RUNNING_MS = 20 * 60 * 1000;
const MAX_AUTO_ATTEMPTS = 2;
const TRIGGER_WAIT_MS = 3000;
const WRITE_TIMEOUT_MS = 9 * 60 * 1000;
const CHECK_TIMEOUT_MS = 3 * 60 * 1000;
/** Background functions stop at 15 minutes; the optional check and revision must fit inside that. */
const TIME_BUDGET_MS = 13 * 60 * 1000;
/** Output budget: a scenario is roughly 10–15k tokens of JSON, plus some thinking. */
const MAX_TOKENS = 28_000;
const REASONING_TOKENS = 4000;

/** A practitioner-written family, rendered into the spec format, as the model's worked example. */
export function exampleSpec(family: RoleFamily, currency: Currency): FamilySpec {
  const variant = generateVariant(family, 20_240_601, currency);
  const ctx = buildContext(variant, currency);
  const answer = { excerpt: '', hasText: true, hasVoice: false, timedOut: false, choiceLabel: 'their option' };
  const stages: SpecStage[] = family.stages
    .filter((s) => s.kind !== 'warmup' && s.kind !== 'past_work')
    .map((s) => {
      const base = {
        id: s.id,
        kind: s.kind as SpecStage['kind'],
        title: s.title,
        summary: s.summary,
        timeLimitSec: s.timeLimitSec,
        thinkAloud: s.thinkAloud ?? false,
        rubric: s.rubric,
        followUps: s.followUps(ctx, answer),
        ...(s.material ? { material: s.material(ctx) } : {}),
        ...(s.choices ? { choices: s.choices } : {}),
      };
      if (s.kind !== 'branch' || !s.dependsOn) {
        return { ...base, prompt: s.prompt(ctx), reviewerGuide: s.reviewerGuide(ctx) };
      }
      const source = family.stages.find((d) => d.id === s.dependsOn)!;
      const branches = Object.fromEntries(
        (source.choices ?? []).map((c) => {
          const branchCtx = buildContext(variant, currency, { [source.id]: c.id });
          return [c.id, { prompt: s.prompt(branchCtx), reviewerGuide: s.reviewerGuide(branchCtx) }];
        }),
      );
      return { ...base, dependsOn: s.dependsOn, branches, prompt: [], reviewerGuide: [] };
    });
  return {
    name: family.name,
    roles: family.roles,
    summary: family.summary,
    currency,
    brief: family.brief(ctx),
    warmups: family.warmups ?? [],
    pastWorkQuestion:
      'Tell us about a piece of content or a campaign you were proud of that did not move the business metric.',
    stages,
  };
}

/** Drops the fields the model should not write (currency is ours; branch stages have no top-level prompt). */
function forPrompt(spec: FamilySpec) {
  const { currency: _currency, ...rest } = spec;
  return {
    ...rest,
    stages: spec.stages.map(({ prompt, reviewerGuide, ...stage }) =>
      stage.kind === 'branch' ? stage : { ...stage, prompt, reviewerGuide },
    ),
  };
}

const CLOSING_CALLOUT = 'The company and numbers are fictional. A calculator is fine.';

const WRITER_SYSTEM = `You write assessment scenarios for Proofwork, a hiring tool. A candidate works through one realistic, fictional company situation, one question at a time, each with a timer. Some questions record them thinking aloud. One question allows any AI tool. AI then scores every answer against your answer key and rubric, and a recruiter decides.

What makes a good scenario:
- One fictional company with concrete, internally consistent numbers in the brief (a table plus a few findings). Check your arithmetic: totals must add up, percentages must match the figures they describe.
- Answers must depend on this data. A generic answer, or one an AI chatbot would give without the brief, should score low. Put the key insight in the numbers, not in the question.
- Questions build on each other: a first-read diagnosis (think aloud), a decision with 3–4 genuinely defensible options (think aloud), a situation change for EACH option that tests whether they adapt, a critique of a plausible piece of work by someone else, and an AI-allowed task.
- The critique contains 3–4 planted problems that are only visible using the brief (a number it contradicts, an audience or constraint it ignores) plus one decoy that is fine. The reviewer guide names each planted problem with the exact numbers, and says that flagging the decoy is a negative signal.
- The AI-allowed task is one where an AI assistant's default answer makes a predictable mistake unless the candidate gives it the scenario's context. The reviewer guide says what that mistake is.
- Reviewer guides are answer keys: what strong answers notice, with exact figures, and what weak answers do.
- Rubrics: 2–3 criteria per stage, weight 2 for the most important, and four behavioural anchors from 1 (weak) to 4 (excellent). Anchors describe what the answer does, not adjectives.
- Follow-ups are 2 questions for a short live call that check the candidate really owns their answer.
- End the brief with the callout "${CLOSING_CALLOUT}" Every candidate sees exactly the same scenario.
- Plain, direct English. Short sentences. No jargon the role would not use. Fictional company and people only; no real brands.
- Write amounts in {CURRENCY}. Use **double asterisks** for bold; nothing else is formatted.
- Time limits: 240–420 seconds for most questions, 420–600 for the critique and the AI-allowed task.

Output a single JSON object, no commentary, matching the example's structure exactly:
- Block types: {"type":"p","text"}, {"type":"h","text"}, {"type":"list","items":[...],"ordered"?:true}, {"type":"table","columns":[...],"rows":[[...]],"caption"?}, {"type":"quote","text","cite"?}, {"type":"callout","text"}.
- Stage kinds: "scenario", "decision" (with "choices"), "branch" (with "dependsOn" naming the decision and "branches": one {"prompt","reviewerGuide"} per choice id, and no top-level prompt or reviewerGuide), "critique" (with "material" holding the work to critique), "ai_allowed".
- Stage ids and choice ids are lowercase slugs. Do not include a warm-up or a past-work stage; give "warmups" (3 short spontaneous questions) and "pastWorkQuestion" (one question about a real past situation) instead.`;

const CHECKER_SYSTEM = `You check assessment scenarios written for a hiring tool before a recruiter sees them. Find only real problems that would make the assessment unfair or wrong:
- arithmetic that does not add up, or numbers in the answer key that differ from the brief;
- a planted problem in the critique that the brief does not actually support, or a decoy that is actually wrong;
- an answer key that rewards something the question did not ask, or misses the obvious insight in the data;
- a branch situation that does not follow from the option it belongs to;
- content that is discriminatory, unsafe, names a real company, or would need specialist knowledge the role does not need.

Return JSON only: {"issues": ["...", "..."]}, each issue one sentence naming the stage and what to change. Return {"issues": []} if it is sound. Do not report style preferences.`;

function writerRequest(request: GenerationRequest): ChatMessage[] {
  const example = forPrompt(exampleSpec(contentBrand, request.currency));
  // Generated scenarios are the same for every candidate, so the example must not say otherwise.
  example.brief = example.brief.map((b) => (b.type === 'callout' ? { type: 'callout', text: CLOSING_CALLOUT } : b));
  return [
    {
      role: 'system',
      content: WRITER_SYSTEM.replace('{CURRENCY}', request.currency === 'INR' ? 'Indian rupees (₹)' : 'US dollars ($)'),
    },
    {
      role: 'user',
      content: [
        `## Example (a practitioner-written scenario for a different role, in the exact format)`,
        JSON.stringify(example),
        '',
        `## The role to write for`,
        `Title: ${request.roleTitle}`,
        ...(request.source === 'jd'
          ? [
              `The job description as posted. Build the scenario around the day-to-day responsibilities and the skills that separate a strong hire, at the seniority it describes. Ignore benefits, company boilerplate and legal text.`,
              '<job_description>',
              request.description,
              '</job_description>',
            ]
          : [`What the recruiter says about it:`, request.description]),
        '',
        'Write a new scenario for this role in the same JSON format. Make it as specific to this role as the example is to content marketing.',
      ].join('\n'),
    },
  ];
}

/** Writes a scenario: draft, repair if invalid, then a quality check and one revision if it finds problems. */
export async function generateFamilySpec(
  deps: GenerationDeps,
  request: GenerationRequest,
): Promise<{ spec: FamilySpec; model: string }> {
  const { client, reviewModel: model } = deps.ai;
  if (!client) throw new AiError('AI is not configured: set OPENROUTER_API_KEY to generate scenarios');
  const started = deps.now();
  const messages = writerRequest(request);

  const write = async (conversation: ChatMessage[]) => {
    const reply = await client.chat({
      model,
      messages: conversation,
      maxTokens: MAX_TOKENS,
      temperature: 0.5,
      timeoutMs: WRITE_TIMEOUT_MS,
      reasoningTokens: REASONING_TOKENS,
    });
    return reply;
  };

  /** Parses a draft; on invalid output, asks once for a corrected version. */
  const draftToSpec = async (conversation: ChatMessage[], reply: string): Promise<FamilySpec> => {
    try {
      return parseFamilySpec(extractJson(reply), request.currency);
    } catch (error) {
      const problems = error instanceof SpecError ? error.issues : [(error as Error).message];
      const repaired = await write([
        ...conversation,
        { role: 'assistant', content: reply },
        {
          role: 'user',
          content: `That JSON has these problems:\n- ${problems.slice(0, 30).join('\n- ')}\n\nReturn the full corrected JSON object only.`,
        },
      ]);
      return parseFamilySpec(extractJson(repaired), request.currency);
    }
  };

  let spec: FamilySpec;
  try {
    spec = await draftToSpec(messages, await write(messages));
  } catch (error) {
    // Now and then a draft and its repair both go wrong (a repair can even run
    // past the token limit); a fresh draft usually comes out fine.
    console.error('Scenario draft failed; writing a fresh one:', (error as Error).message);
    spec = await draftToSpec(messages, await write(messages));
  }
  // A revision takes about as long as the draft; only check if there is time to act on it.
  const draftMs = deps.now() - started;
  if (draftMs * 2.2 > TIME_BUDGET_MS) return { spec, model };

  const checked = await client.chat({
    model,
    messages: [
      { role: 'system', content: CHECKER_SYSTEM },
      { role: 'user', content: JSON.stringify(forPrompt(spec)) },
    ],
    maxTokens: 6000,
    timeoutMs: CHECK_TIMEOUT_MS,
    reasoningTokens: 3000,
  });
  let issues: string[] = [];
  try {
    const parsed = extractJson<{ issues?: unknown }>(checked).issues;
    issues = Array.isArray(parsed) ? parsed.filter((i): i is string => typeof i === 'string').slice(0, 15) : [];
  } catch {
    // The check is a safeguard; an unreadable reply leaves the valid draft as it is.
  }
  if (!issues.length) return { spec, model };

  const revision: ChatMessage[] = [
    ...messages,
    { role: 'assistant', content: JSON.stringify(forPrompt(spec)) },
    {
      role: 'user',
      content: `A reviewer found these problems:\n- ${issues.join('\n- ')}\n\nFix them and return the full corrected JSON object only.`,
    },
  ];
  try {
    spec = await draftToSpec(revision, await write(revision));
  } catch (error) {
    // Keep the valid first draft rather than failing the whole generation.
    console.error('Scenario revision failed; keeping the first draft:', (error as Error).message);
  }
  return { spec, model };
}

// Queueing ---------------------------------------------------------------

export async function createGeneration(
  db: DB,
  now: number,
  orgId: string,
  userId: string,
  request: GenerationRequest,
): Promise<string> {
  const id = `gen-${randomUUID().slice(0, 8)}`;
  await run(
    db,
    `INSERT INTO custom_families
       (id, org_id, created_by, role_title, description, currency, source, status, attempts, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?)`,
    id,
    orgId,
    userId,
    request.roleTitle,
    request.description,
    request.currency,
    request.source ?? 'description',
    now,
    now,
  );
  return id;
}

/** Runs one generation if it is still pending; the pending→running update is the claim. */
export async function processGeneration(deps: GenerationDeps, id: string): Promise<boolean> {
  const { db, now } = deps;
  const claimed = await run(
    db,
    `UPDATE custom_families SET status = 'running', attempts = attempts + 1, updated_at = ?
      WHERE id = ? AND status = 'pending'`,
    now(),
    id,
  );
  if (!claimed.changes) return false;
  const row = (await one<CustomFamilyRow>(db, 'SELECT * FROM custom_families WHERE id = ?', id))!;
  const meter = new UsageMeter();
  let ok = false;
  try {
    const { spec, model } = await generateFamilySpec(
      { ...deps, ai: meteredAi(deps.ai, meter) },
      {
        roleTitle: row.role_title,
        description: row.description,
        currency: row.currency,
        source: row.source,
      },
    );
    ok = true;
    await run(
      db,
      "UPDATE custom_families SET status = 'done', spec_json = ?, model = ?, error = NULL, updated_at = ? WHERE id = ?",
      JSON.stringify(spec),
      model,
      now(),
      id,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Scenario generation failed for ${id}: ${message}`);
    await run(
      db,
      "UPDATE custom_families SET status = 'failed', error = ?, updated_at = ? WHERE id = ?",
      message.slice(0, 1000),
      now(),
      id,
    );
  }
  await saveUsage(db, { orgId: row.org_id, kind: 'generation', refId: id, meter, ok, now: now() });
  return true;
}

async function generationsToResume(deps: GenerationDeps): Promise<string[]> {
  const now = deps.now();
  await run(
    deps.db,
    "UPDATE custom_families SET status = 'pending', updated_at = ? WHERE status = 'running' AND updated_at < ?",
    now,
    now - STALE_RUNNING_MS,
  );
  // A stuck run counts as an attempt; give up after a couple so a bad request doesn't loop forever.
  await run(
    deps.db,
    "UPDATE custom_families SET status = 'failed', error = 'Generation did not finish. Try again.' WHERE status = 'pending' AND attempts >= ?",
    MAX_AUTO_ATTEMPTS,
  );
  return (await all<{ id: string }>(deps.db, "SELECT id FROM custom_families WHERE status = 'pending'")).map(
    (r) => r.id,
  );
}

export interface GenerationQueue {
  /** Starts a pending generation. */
  enqueue(id: string): Promise<void>;
  /** Picks up generations that were interrupted or never started. */
  resume(): Promise<void>;
  /** Resolves once in-process work is finished (tests, local dev). */
  idle(): Promise<void>;
}

/** Local development and tests: one generation at a time in this process. */
export function inProcessGenerationQueue(deps: GenerationDeps): GenerationQueue {
  let chain: Promise<unknown> = Promise.resolve();
  const schedule = (id: string) => {
    chain = chain.then(() => processGeneration(deps, id)).catch(() => undefined);
  };
  return {
    async enqueue(id) {
      schedule(id);
    },
    async resume() {
      for (const id of await generationsToResume(deps)) schedule(id);
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

/** Netlify: each generation runs in a background function, like AI reviews. */
export function backgroundGenerationQueue(deps: GenerationDeps, triggerUrl: string): GenerationQueue {
  const trigger = async (id: string) => {
    try {
      await fetch(triggerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
        signal: AbortSignal.timeout(TRIGGER_WAIT_MS),
      });
    } catch (error) {
      if ((error as Error).name !== 'TimeoutError') console.error(`Could not start generation ${id}:`, error);
    }
  };
  return {
    enqueue: trigger,
    async resume() {
      for (const id of await generationsToResume(deps)) await trigger(id);
    },
    async idle() {},
  };
}
