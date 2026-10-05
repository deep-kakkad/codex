import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CandidateSession } from '../shared/candidateApi';
import type { AiConfig, ChatRequest } from '../server/ai/client';
import type { ReviewQueue } from '../server/ai/queue';
import { type GenerationQueue, exampleSpec } from '../server/ai/generateFamily';
import { ROLE_FAMILIES } from '../shared/roleFamilies';
import { contentBrand } from '../shared/roleFamilies/contentBrand';
import { createApp } from '../server/app';
import { SUBMIT_GRACE_MS } from '../server/candidateFlow';
import { localFileStore } from '../server/files';
import { type DB, fromPgPool } from '../server/db';
import { openLocalDb } from '../server/localDb';
import { codeAt, stepAt } from '../server/totp';
import { readFileSync } from 'node:fs';
import { CONTENT_SECURITY_POLICY } from '../server/security';
import { deleteOldRecordings } from '../server/privacy';
import { PRIVACY_NOTICE_VERSION } from '../shared/privacy';

/**
 * PGlite by default. Set TEST_DATABASE_URL to run against a real Postgres
 * (already migrated): every table is emptied before each test.
 */
let sharedPg: DB | null = null;
async function testDb(): Promise<DB> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return openLocalDb();
  if (!sharedPg) {
    const { default: pg } = await import('pg');
    sharedPg = fromPgPool(new pg.Pool({ connectionString: url, max: 4 }));
  }
  await sharedPg.query(
    `TRUNCATE orgs, users, sessions, candidate_accounts, candidate_sessions, assessments, candidates,
       responses, audio_parts, ai_reviews, transcripts, verifications, custom_families, candidate_stars,
       review_notes, score_overrides, ai_usage, upgrade_requests, candidate_extras, demo_leads,
       login_challenges, auth_throttle, audit_log, error_events, review_charges, data_deletions CASCADE`,
  );
  return sharedPg;
}

let clock = 1_750_000_000_000;
let uploadDir: string;
let app: ReturnType<typeof createApp>['app'];
let reviews: ReviewQueue;
let generations: GenerationQueue;
let ai: FakeAi;
let db: DB;

/** Stands in for OpenRouter: deterministic replies, and a record of every call. */
interface FakeAi extends AiConfig {
  calls: ChatRequest[];
  delivery: 'natural' | 'unsure' | 'read';
  score: number;
  brokenJsonOnce: boolean;
  /** Scenario writer replies that are invalid before a valid one. */
  invalidSpecs: number;
  /** What the scenario checker reports on the first draft. */
  specIssues: string[];
}

/** A valid scenario as the model would write it, for a made-up role. */
function generatedSpec(name: string) {
  const { currency: _currency, ...spec } = exampleSpec(contentBrand, 'USD');
  return { ...spec, name, roles: ['Field Sales Executive'] };
}

function createFakeAi(): FakeAi {
  const fake: FakeAi = {
    reviewModel: 'test/review',
    audioModel: 'test/audio',
    calls: [],
    delivery: 'natural',
    score: 3,
    brokenJsonOnce: false,
    invalidSpecs: 0,
    specIssues: [],
    client: {
      async chat(req) {
        fake.calls.push(req);
        req.onUsage?.({ model: req.model, promptTokens: 1000, completionTokens: 200, costUsd: 0.002 });
        if (fake.brokenJsonOnce) {
          fake.brokenJsonOnce = false;
          return 'Sure! Here is my assessment, not JSON.';
        }
        const system = String(req.messages[0].content);
        const user = req.messages[1].content;
        if (req.model === fake.audioModel) {
          return JSON.stringify({
            transcript: 'So the dashboards claim more orders than the store [pause] wait, that is the over-count.',
            delivery: fake.delivery,
            reasons: 'Test delivery.',
          });
        }
        if (system.startsWith('You write assessment scenarios')) {
          if (fake.invalidSpecs > 0) {
            fake.invalidSpecs--;
            return JSON.stringify({ ...generatedSpec('Broken'), stages: [] });
          }
          const revised = req.messages.some((m) => String(m.content).startsWith('A reviewer found'));
          return JSON.stringify(generatedSpec(revised ? 'Field Sales (revised)' : 'Field Sales'));
        }
        if (system.startsWith('You check assessment scenarios')) {
          return JSON.stringify({ issues: fake.specIssues });
        }
        if (system.startsWith('You check a job candidate')) {
          return JSON.stringify({
            findings: [
              {
                stageId: 'first-read',
                kind: 'ai_like',
                strength: 'strong',
                quote: 'In conclusion',
                why: 'Reads like a chatbot summary.',
                ask: 'Walk me through it.',
              },
              { stageId: 'not-a-stage', kind: 'ai_like', strength: 'strong', quote: 'x', why: 'Ignored.' },
            ],
          });
        }
        if (system.startsWith('You prepare a hiring manager')) {
          return JSON.stringify({
            questions: Array.from({ length: 5 }, (_, i) => ({
              stageId: i === 0 ? 'first-read' : null,
              question: `Question ${i + 1}?`,
              why: 'Tests ownership.',
              listenFor: 'Specific numbers.',
              redFlags: 'Generic answers.',
            })),
          });
        }
        if (system.startsWith('You draft a short email')) {
          const decision = String(user).match(/Decision: (\w+)/)?.[1];
          return JSON.stringify({ subject: `About your application (${decision})`, body: 'Hi Asha, thank you.' });
        }
        if (system.startsWith('You write the overall')) {
          return (
            '```json\n' +
            JSON.stringify({
              summary: 'Solid reasoning.',
              strengths: ['Uses the numbers'],
              concerns: ['Vague on risk'],
              withAndWithoutAi: 'Similar with and without AI.',
              probes: ['Walk me through break-even again.'],
            }) +
            '\n```'
          );
        }
        const rubric = String(user).split('## Rubric')[1] ?? '';
        const ids = [...rubric.matchAll(/^- ([\w-]+): /gm)].map((m) => m[1]);
        return JSON.stringify({
          criteria: Object.fromEntries(
            ids.map((id) => [id, { score: fake.score, evidence: '"quote"', rationale: 'why' }]),
          ),
          summary: 'Answer summary.',
        });
      },
    },
  };
  return fake;
}

beforeEach(async () => {
  clock = 1_750_000_000_000;
  uploadDir = mkdtempSync(path.join(tmpdir(), 'proofwork-test-'));
  ai = createFakeAi();
  db = await testDb();
  ({ app, reviews, generations } = createApp({
    db,
    files: localFileStore(uploadDir),
    now: () => clock,
    ai,
  }));
  agents.clear();
});

afterEach(async () => {
  await reviews.idle();
  await generations.idle();
  rmSync(uploadDir, { recursive: true, force: true });
});

// Candidate accounts: one signed-in agent per invitation token.
const agents = new Map<string, ReturnType<typeof request.agent>>();
const as = (token: string) => {
  const agent = agents.get(token);
  if (!agent) throw new Error('No candidate account for this invitation');
  return agent;
};

async function candidateAccount(token: string, emailAddress: string, name = 'Asha Rao') {
  const agent = request.agent(app);
  const res = await agent
    .post('/api/candidate/auth/signup')
    .send({ name, email: emailAddress, password: 'candidate-pass' });
  if (res.status === 409) {
    await agent.post('/api/candidate/auth/login').send({ email: emailAddress, password: 'candidate-pass' }).expect(200);
  } else {
    expect(res.status).toBe(201);
  }
  agents.set(token, agent);
  return agent;
}

async function signup(orgName = 'Acme', emailAddress = 'maya@acme.test') {
  const agent = request.agent(app);
  await agent
    .post('/api/auth/signup')
    .send({ orgName, name: 'Maya', email: emailAddress, password: 'correct-horse' })
    .expect(201);
  return agent;
}

async function setup(roleFamilyId = 'performance-marketing') {
  const manager = await signup();
  const { body: created } = await manager
    .post('/api/assessments')
    .send({ title: 'Growth Marketer, Bengaluru', roleFamilyId, currency: 'INR' })
    .expect(201);
  const { body: invited } = await manager
    .post(`/api/assessments/${created.id}/candidates`)
    .send({ name: 'Asha Rao', email: 'asha@example.com' })
    .expect(201);
  await candidateAccount(invited.candidate.token, 'asha@example.com');
  return { manager, assessmentId: created.id as string, candidate: invited.candidate as { id: string; token: string } };
}

const c = (token: string) => `/api/c/${token}`;

async function answerCurrent(token: string, session: CandidateSession, extra: Record<string, unknown> = {}) {
  if (session.state.phase !== 'stage') throw new Error(`Expected a stage, got ${session.state.phase}`);
  const stage = session.state.stage;
  const body: Record<string, unknown> = {
    text: `My answer to ${stage.title}`,
    signals: { tabHidden: 0 },
    ...extra,
  };
  if (stage.choices && !body.choiceId) body.choiceId = stage.choices[0].id;
  const res = await as(token)
    .post(`${c(token)}/stages/${stage.id}/submit`)
    .send(body)
    .expect(200);
  return res.body as CandidateSession;
}

/** Reveals and answers every remaining stage, from wherever the candidate is. */
async function completeAll(token: string, choices: Record<string, string> = {}) {
  let session = (await as(token).get(c(token)).expect(200)).body as CandidateSession;
  while (session.state.phase !== 'done') {
    if (session.state.phase === 'ready') {
      session = (
        await as(token)
          .post(`${c(token)}/next`)
          .send({ index: session.state.next.index })
          .expect(200)
      ).body;
    }
    if (session.state.phase !== 'stage') throw new Error(`Unexpected phase ${session.state.phase}`);
    const choiceId = choices[session.state.stage.id];
    session = await answerCurrent(token, session, choiceId ? { choiceId } : {});
  }
  return session;
}

describe('auth', () => {
  it('signs up, reports the current user and rejects bad passwords', async () => {
    const agent = await signup();
    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body.user).toMatchObject({ name: 'Maya', role: 'manager', orgName: 'Acme' });

    await request(app)
      .post('/api/auth/login')
      .send({ email: 'maya@acme.test', password: 'wrong-password' })
      .expect(401);
    await request(app).post('/api/auth/login').send({ email: 'maya@acme.test', password: 'correct-horse' }).expect(200);
    await request(app).get('/api/assessments').expect(401);
  });

  it('answers malformed or non-JSON bodies with 400, not 500', async () => {
    await request(app).post('/api/auth/login').type('form').send('email=a@b.co&password=x').expect(400);
    await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{bad json').expect(400);
    await request(app).post('/api/auth/signup').send([1, 2]).expect(400);
  });

  it('rejects duplicate emails', async () => {
    await signup();
    await request(app)
      .post('/api/auth/signup')
      .send({ orgName: 'Other', name: 'X', email: 'maya@acme.test', password: 'correct-horse' })
      .expect(409);
  });
});

describe('candidate flow', () => {
  it('reveals one question at a time and never leaks reviewer material', async () => {
    const { candidate } = await setup();
    const intro = (await as(candidate.token).get(c(candidate.token)).expect(200)).body as CandidateSession;
    expect(intro.state.phase).toBe('intro');
    expect(intro.brief).toBeNull();

    await as(candidate.token)
      .post(`${c(candidate.token)}/start`)
      .send({ idName: 'Asha Rao' })
      .expect(400);
    const started = (
      await as(candidate.token)
        .post(`${c(candidate.token)}/start`)
        .send({ idName: 'Asha Rao', consent: true, privacy: true })
        .expect(200)
    ).body as CandidateSession;
    expect(started.state).toMatchObject({ phase: 'ready', next: { index: 0, kind: 'warmup' } });
    // Nothing about an upcoming question is sent before it opens.
    expect(JSON.stringify(started.state)).not.toMatch(/title|warm-?up question|prompt/i);
    expect(started.brief?.length).toBeGreaterThan(0);

    // Cannot skip ahead.
    await as(candidate.token)
      .post(`${c(candidate.token)}/next`)
      .send({ index: 1 })
      .expect(409);

    const warmup = (
      await as(candidate.token)
        .post(`${c(candidate.token)}/next`)
        .send({ index: 0 })
        .expect(200)
    ).body;
    expect(warmup.state.phase).toBe('stage');
    const raw = JSON.stringify(warmup);
    expect(raw).not.toContain('reviewerGuide');
    expect(raw).not.toContain('anchors');
    expect(raw).not.toContain('first-read');

    // Revealing the same stage twice is idempotent and keeps the deadline.
    clock += 5_000;
    const again = (
      await as(candidate.token)
        .post(`${c(candidate.token)}/next`)
        .send({ index: 0 })
        .expect(200)
    ).body;
    expect(again.state.deadlineAt).toBe(warmup.state.deadlineAt);

    // Empty answers are rejected unless time ran out.
    await as(candidate.token)
      .post(`${c(candidate.token)}/stages/warmup/submit`)
      .send({})
      .expect(400);
    const next = await answerCurrent(candidate.token, warmup);
    expect(next.state).toMatchObject({ phase: 'ready', next: { index: 1 } });
  });

  it('resolves the branch prompt from the earlier decision', async () => {
    const { candidate } = await setup();
    await as(candidate.token)
      .post(`${c(candidate.token)}/start`)
      .send({ idName: 'Asha Rao', consent: true, privacy: true });
    let session: CandidateSession | undefined;
    for (const [index, stageId] of ['warmup', 'first-read', 'budget-cut'].entries()) {
      session = (
        await as(candidate.token)
          .post(`${c(candidate.token)}/next`)
          .send({ index })
          .expect(200)
      ).body;
      session = await answerCurrent(
        candidate.token,
        session!,
        stageId === 'budget-cut' ? { choiceId: 'influencers' } : {},
      );
    }
    const branch = (
      await as(candidate.token)
        .post(`${c(candidate.token)}/next`)
        .send({ index: 3 })
        .expect(200)
    ).body as CandidateSession;
    if (branch.state.phase !== 'stage') throw new Error('expected stage');
    expect(JSON.stringify(branch.state.stage.prompt)).toContain('Cancel all the contracts');
  });

  it('requires a choice on decision stages', async () => {
    const { candidate } = await setup();
    await as(candidate.token)
      .post(`${c(candidate.token)}/start`)
      .send({ idName: 'Asha Rao', consent: true, privacy: true });
    for (const index of [0, 1]) {
      const s = (
        await as(candidate.token)
          .post(`${c(candidate.token)}/next`)
          .send({ index })
      ).body;
      await answerCurrent(candidate.token, s);
    }
    await as(candidate.token)
      .post(`${c(candidate.token)}/next`)
      .send({ index: 2 })
      .expect(200);
    await as(candidate.token)
      .post(`${c(candidate.token)}/stages/budget-cut/submit`)
      .send({ text: 'Cut Meta' })
      .expect(400);
    await as(candidate.token)
      .post(`${c(candidate.token)}/stages/budget-cut/submit`)
      .send({ text: 'Cut Meta', choiceId: 'not-a-choice' })
      .expect(400);
  });

  it('closes a stage with the autosaved draft once time and grace run out', async () => {
    const { candidate, manager } = await setup();
    await as(candidate.token)
      .post(`${c(candidate.token)}/start`)
      .send({ idName: 'Asha Rao', consent: true, privacy: true });
    const warmup = (
      await as(candidate.token)
        .post(`${c(candidate.token)}/next`)
        .send({ index: 0 })
    ).body as CandidateSession;
    if (warmup.state.phase !== 'stage') throw new Error('expected stage');

    await as(candidate.token)
      .put(`${c(candidate.token)}/stages/warmup/draft`)
      .send({ text: 'half an answer' })
      .expect(200);

    clock = warmup.state.deadlineAt + SUBMIT_GRACE_MS + 1;
    await as(candidate.token)
      .post(`${c(candidate.token)}/stages/warmup/submit`)
      .send({ text: 'too late' })
      .expect(409);
    const after = (await as(candidate.token).get(c(candidate.token))).body as CandidateSession;
    expect(after.state).toMatchObject({ phase: 'ready', next: { index: 1 } });

    const report = (await manager.get(`/api/candidates/${candidate.id}`).expect(200)).body;
    expect(report.stages[0].response).toMatchObject({ closedReason: 'timeout', text: 'half an answer' });
  });

  it('accepts a submission inside the grace window and records the overtime', async () => {
    const { candidate, manager } = await setup();
    await as(candidate.token)
      .post(`${c(candidate.token)}/start`)
      .send({ idName: 'Asha Rao', consent: true, privacy: true });
    const warmup = (
      await as(candidate.token)
        .post(`${c(candidate.token)}/next`)
        .send({ index: 0 })
    ).body as CandidateSession;
    if (warmup.state.phase !== 'stage') throw new Error('expected stage');
    clock = warmup.state.deadlineAt + 20_000;
    await as(candidate.token)
      .post(`${c(candidate.token)}/stages/warmup/submit`)
      .send({ text: 'just in time', timedOut: true })
      .expect(200);
    const report = (await manager.get(`/api/candidates/${candidate.id}`)).body;
    expect(report.stages[0].response).toMatchObject({ closedReason: 'timeout', overtimeSec: 20, text: 'just in time' });
  });

  it('scales timers for candidates with extra time', async () => {
    const { manager, assessmentId } = await setup();
    const { body } = await manager
      .post(`/api/assessments/${assessmentId}/candidates`)
      .send({ name: 'Ravi', email: 'ravi@example.com', timeMultiplier: 1.5 })
      .expect(201);
    await candidateAccount(body.candidate.token, 'ravi@example.com', 'Ravi');
    await as(body.candidate.token)
      .post(`${c(body.candidate.token)}/start`)
      .send({ idName: 'Ravi', consent: true, privacy: true });
    const s = (
      await as(body.candidate.token)
        .post(`${c(body.candidate.token)}/next`)
        .send({ index: 0 })
    ).body;
    expect(s.state.stage.timeLimitSec).toBe(180);
    expect(s.state.deadlineAt - s.serverNow).toBe(180_000);
  });

  it('stores voice notes and serves them only to the right org', async () => {
    const { candidate, manager } = await setup();
    await as(candidate.token)
      .post(`${c(candidate.token)}/start`)
      .send({ idName: 'Asha Rao', consent: true, privacy: true });
    await as(candidate.token)
      .post(`${c(candidate.token)}/next`)
      .send({ index: 0 });
    await as(candidate.token)
      .post(`${c(candidate.token)}/stages/warmup/audio?seconds=12`)
      .set('Content-Type', 'audio/webm')
      .send(Buffer.from('fake-audio-bytes'))
      .expect(200);
    await as(candidate.token)
      .post(`${c(candidate.token)}/stages/warmup/audio`)
      .set('Content-Type', 'text/plain')
      .send('nope')
      .expect(400);
    // A voice note alone is a valid answer.
    await as(candidate.token)
      .post(`${c(candidate.token)}/stages/warmup/submit`)
      .send({})
      .expect(200);

    const report = (await manager.get(`/api/candidates/${candidate.id}`)).body;
    expect(report.stages[0].response.audio[0].sec).toBe(12);
    const audio = await manager.get(report.stages[0].response.audio[0].url).expect(200);
    expect(audio.headers['content-type']).toContain('audio/webm');

    const outsider = await signup('Other Co', 'eve@other.test');
    await outsider.get(report.stages[0].response.audio[0].url).expect(404);
    await outsider.get(`/api/candidates/${candidate.id}`).expect(404);
  });

  it('marks the attempt submitted after the last stage', async () => {
    const { candidate, manager, assessmentId } = await setup();
    await as(candidate.token)
      .post(`${c(candidate.token)}/start`)
      .send({ idName: 'Asha Rao', consent: true, privacy: true });
    const final = await completeAll(candidate.token);
    expect(final.state.phase).toBe('done');
    const detail = (await manager.get(`/api/assessments/${assessmentId}`)).body;
    expect(['submitted', 'reviewed']).toContain(detail.candidates[0].status);
    await reviews.idle();
    expect((await manager.get(`/api/assessments/${assessmentId}`)).body.candidates[0].status).toBe('reviewed');
  });
});

describe('think-aloud', () => {
  /** Starts the candidate and opens the first think-aloud question (first-read). */
  async function openThinkAloud() {
    const ctx = await setup();
    const token = ctx.candidate.token;
    await as(token)
      .post(`${c(token)}/start`)
      .send({ idName: 'Asha Rao', consent: true, privacy: true });
    const warmup = (
      await as(token)
        .post(`${c(token)}/next`)
        .send({ index: 0 })
    ).body;
    await answerCurrent(token, warmup);
    const stage = (
      await as(token)
        .post(`${c(token)}/next`)
        .send({ index: 1 })
        .expect(200)
    ).body as CandidateSession;
    return { ...ctx, token, stage };
  }

  const chunk = (token: string, query: string, body: string, stageId = 'first-read') =>
    as(token)
      .post(`${c(token)}/stages/${stageId}/stream?${query}`)
      .set('Content-Type', 'audio/webm;codecs=opus')
      .send(Buffer.from(body));

  it('is flagged on the stage and announced before the question opens', async () => {
    const { token, stage } = await openThinkAloud();
    if (stage.state.phase !== 'stage') throw new Error('expected stage');
    expect(stage.state.stage.thinkAloud).toBe(true);
    expect(stage.assessment.outline.filter((s) => s.thinkAloud)).toHaveLength(3);
    const ready = (await as(token).get(c(token))).body;
    expect(ready.assessment.outline[1].thinkAloud).toBe(true);
  });

  it('appends chunks in order, accepts retries and refuses gaps', async () => {
    const { token, candidate, manager } = await openThinkAloud();
    await chunk(token, 'part=0&seq=1&startMs=900&sec=4', 'late').expect(409);
    await chunk(token, 'part=0&seq=0&startMs=900&sec=4', 'AAA').expect(200);
    await chunk(token, 'part=0&seq=0&startMs=900&sec=4', 'AAA').expect(200); // retry
    await chunk(token, 'part=0&seq=2&startMs=900&sec=12', 'CCC').expect(409); // gap
    await chunk(token, 'part=0&seq=1&startMs=900&sec=8.4', 'BBB').expect(200);
    await chunk(token, 'part=2&seq=0&startMs=0&sec=1', 'X').expect(409); // must be part 1 next
    await as(token)
      .post(`${c(token)}/stages/first-read/stream?part=0&seq=2&sec=9`)
      .set('Content-Type', 'text/plain')
      .send('nope')
      .expect(400);

    // A reload mid-question reports the saved audio and continues as part 1.
    const reloaded = (await as(token).get(c(token))).body as CandidateSession;
    if (reloaded.state.phase !== 'stage') throw new Error('expected stage');
    expect(reloaded.state.audio).toEqual({ sec: 8.4, parts: 1 });
    await chunk(token, 'part=1&seq=0&startMs=30000&sec=3', 'DDD').expect(200);

    // Audio alone is a valid think-aloud answer.
    await as(token)
      .post(`${c(token)}/stages/first-read/submit`)
      .send({})
      .expect(200);

    const report = (await manager.get(`/api/candidates/${candidate.id}`)).body;
    const response = report.stages[1].response;
    expect(report.stages[1].thinkAloud).toBe(true);
    expect(response.audio).toEqual([
      { url: `/api/candidates/${candidate.id}/audio/first-read?part=0`, startMs: 900, sec: 8.4 },
      { url: `/api/candidates/${candidate.id}/audio/first-read?part=1`, startMs: 30000, sec: 3 },
    ]);
    const first = await manager.get(response.audio[0].url).buffer(true).expect(200);
    expect(first.body.toString()).toBe('AAABBB');
    expect(first.headers['content-type']).toContain('audio/webm');
  });

  it('only streams on think-aloud questions, and only while the question is open', async () => {
    const { token, stage } = await openThinkAloud();
    await chunk(token, 'part=0&seq=0&startMs=0&sec=1', 'A', 'warmup').expect(400);
    await as(token)
      .post(`${c(token)}/stages/first-read/audio?seconds=3`)
      .set('Content-Type', 'audio/webm')
      .send(Buffer.from('x'))
      .expect(400);
    if (stage.state.phase !== 'stage') throw new Error('expected stage');
    clock = stage.state.deadlineAt + SUBMIT_GRACE_MS + 1;
    await chunk(token, 'part=0&seq=0&startMs=0&sec=1', 'A').expect(409);
  });

  it('keeps the scratchpad timeline, including when time runs out', async () => {
    const { token, candidate, manager } = await openThinkAloud();
    const scratch = [
      { t: 20_000, text: 'AOV x margin' },
      { t: 5_000, text: 'reported' },
      { t: -5, text: 'clamped' },
      { t: 'bad', text: 'dropped' },
    ];
    await as(token)
      .put(`${c(token)}/stages/first-read/draft`)
      .send({ text: 'AOV x margin', scratch })
      .expect(200);
    const s = (await as(token).get(c(token))).body as CandidateSession;
    if (s.state.phase !== 'stage') throw new Error('expected stage');
    clock = s.state.deadlineAt + SUBMIT_GRACE_MS + 1;
    await as(token).get(c(token)).expect(200); // closes the stage from the draft

    const report = (await manager.get(`/api/candidates/${candidate.id}`)).body;
    expect(report.stages[1].response.closedReason).toBe('timeout');
    expect(report.stages[1].response.scratch).toEqual([
      { t: 0, text: 'clamped' },
      { t: 5_000, text: 'reported' },
      { t: 20_000, text: 'AOV x margin' },
    ]);
  });

  it('asks for audio or typed working before submitting', async () => {
    const { token } = await openThinkAloud();
    const res = await as(token)
      .post(`${c(token)}/stages/first-read/submit`)
      .send({})
      .expect(400);
    expect(res.body.error).toMatch(/Talk through your answer/);
  });
});

describe('candidate accounts', () => {
  it('opens from the invite link alone, without an account', async () => {
    const manager = await signup();
    const { body: created } = await manager
      .post('/api/assessments')
      .send({ title: 'Growth Marketer', roleFamilyId: 'performance-marketing', currency: 'INR' })
      .expect(201);
    const { body: invited } = await manager
      .post(`/api/assessments/${created.id}/candidates`)
      .send({ name: 'Ravi Kumar', email: 'ravi@example.com' })
      .expect(201);
    const link = request.agent(app);
    const token = invited.candidate.token;

    const intro = (await link.get(c(token)).expect(200)).body as CandidateSession;
    expect(intro.candidate).toMatchObject({ email: 'ravi@example.com', linkedToAccount: false });
    expect(intro.assessment.uniqueNumbers).toBe(true);
    await link
      .post(`${c(token)}/start`)
      .send({ idName: 'Ravi Kumar', consent: true, privacy: true })
      .expect(200);
    // A fresh browser with the same link picks up where they left off.
    const resumed = (await request(app).get(c(token)).expect(200)).body as CandidateSession;
    expect(resumed.state.phase).toBe('ready');

    // Signed in as someone else, the link still works but is not claimed by that account.
    const stranger = request.agent(app);
    await stranger
      .post('/api/candidate/auth/signup')
      .send({ name: 'Eve', email: 'eve@example.com', password: 'candidate-pass' })
      .expect(201);
    await stranger.get(c(token)).expect(200);
    expect((await stranger.get('/api/candidate/assessments')).body.assessments).toEqual([]);

    // Creating an account with the invited email afterwards lists it on their dashboard.
    const later = request.agent(app);
    await later
      .post('/api/candidate/auth/signup')
      .send({ name: 'Ravi Kumar', email: 'ravi@example.com', password: 'candidate-pass' })
      .expect(201);
    const mine = (await later.get('/api/candidate/assessments').expect(200)).body.assessments;
    expect(mine).toEqual([expect.objectContaining({ token, status: 'in_progress' })]);
  });

  it('keeps an invitation private once a candidate account has claimed it', async () => {
    const { candidate, manager, assessmentId } = await setup();
    const token = candidate.token;

    // The invite page can say who invited them.
    const invite = (
      await request(app)
        .get(`${c(token)}/invite`)
        .expect(200)
    ).body;
    expect(invite).toMatchObject({ orgName: 'Acme', candidateName: 'Asha Rao', email: 'asha@example.com' });

    // Opening it while signed in with the invited email links it to that account...
    const mine = (await as(token).get('/api/candidate/assessments').expect(200)).body.assessments;
    expect(mine).toEqual([expect.objectContaining({ token, title: 'Growth Marketer, Bengaluru', status: 'invited' })]);
    const session = (await as(token).get(c(token)).expect(200)).body as CandidateSession;
    expect(session.candidate.linkedToAccount).toBe(true);

    // ...after which the link alone, or another account, can't open it.
    const refused = await request(app).get(c(token)).expect(403);
    expect(refused.body.error).toContain('asha@example.com');
    const stranger = request.agent(app);
    await stranger
      .post('/api/candidate/auth/signup')
      .send({ name: 'Eve', email: 'eve@example.com', password: 'candidate-pass' })
      .expect(201);
    await stranger.get(c(token)).expect(403);

    // Recruiter and candidate sessions are separate.
    await as(token).get('/api/assessments').expect(401);
    await manager.get(c(token)).expect(403);
    await manager.get(`/api/assessments/${assessmentId}`).expect(200);
  });

  it('logs candidates in and out, and rejects duplicates and bad passwords', async () => {
    const agent = request.agent(app);
    await agent
      .post('/api/candidate/auth/signup')
      .send({ name: 'Ravi', email: 'Ravi@Example.com', password: 'candidate-pass' })
      .expect(201);
    expect((await agent.get('/api/candidate/auth/me')).body.candidate).toMatchObject({ email: 'ravi@example.com' });
    await agent.post('/api/candidate/auth/logout').expect(200);
    expect((await agent.get('/api/candidate/auth/me')).body.candidate).toBeNull();
    await agent
      .post('/api/candidate/auth/login')
      .send({ email: 'ravi@example.com', password: 'nope-nope' })
      .expect(401);
    await agent
      .post('/api/candidate/auth/login')
      .send({ email: 'ravi@example.com', password: 'candidate-pass' })
      .expect(200);
    await request(app)
      .post('/api/candidate/auth/signup')
      .send({ name: 'R', email: 'ravi@example.com', password: 'candidate-pass' })
      .expect(409);
  });
});

describe('drop-off analytics', () => {
  it('counts how far candidates get, timeouts and stalled candidates', async () => {
    const { manager, assessmentId, candidate } = await setup();
    // A second candidate who starts and stalls on question 2.
    const { body } = await manager
      .post(`/api/assessments/${assessmentId}/candidates`)
      .send({ name: 'Ravi', email: 'ravi@example.com' })
      .expect(201);
    const ravi = body.candidate.token;
    await candidateAccount(ravi, 'ravi@example.com', 'Ravi');
    await as(ravi)
      .post(`${c(ravi)}/start`)
      .send({ idName: 'Ravi', consent: true, privacy: true });
    const w = (
      await as(ravi)
        .post(`${c(ravi)}/next`)
        .send({ index: 0 })
    ).body;
    await answerCurrent(ravi, w);
    const fr = (
      await as(ravi)
        .post(`${c(ravi)}/next`)
        .send({ index: 1 })
    ).body as CandidateSession;
    if (fr.state.phase !== 'stage') throw new Error('expected stage');

    // Asha finishes everything.
    await as(candidate.token)
      .post(`${c(candidate.token)}/start`)
      .send({ idName: 'Asha Rao', consent: true, privacy: true });
    await completeAll(candidate.token);

    // Two days pass: Ravi's open question times out and he counts as stalled there.
    clock += 2 * 24 * 60 * 60 * 1000;
    await as(ravi).get(c(ravi));

    const funnel = (await manager.get(`/api/assessments/${assessmentId}/funnel`).expect(200)).body;
    expect(funnel).toMatchObject({ invited: 2, started: 2, finished: 1, stalledBeforeFirst: 0 });
    expect(funnel.stages[0]).toMatchObject({ id: 'warmup', reached: 2, submitted: 2, timedOut: 0 });
    expect(funnel.stages[1]).toMatchObject({ id: 'first-read', reached: 2, submitted: 1, timedOut: 1, stalledHere: 1 });
    expect(funnel.stages[2]).toMatchObject({ id: 'budget-cut', reached: 1, stalledHere: 0 });
    expect(typeof funnel.stages[1].medianTimeSec).toBe('number');

    const outsider = await signup('Other Co', 'eve@other.test');
    await outsider.get(`/api/assessments/${assessmentId}/funnel`).expect(404);
  });
});

describe('activity selection', () => {
  it('builds the assessment from the chosen activities only', async () => {
    const manager = await signup();
    await manager
      .post('/api/assessments')
      .send({ title: 'x', roleFamilyId: 'performance-marketing', currency: 'INR', stageIds: ['nope'] })
      .expect(400);
    await manager
      .post('/api/assessments')
      .send({ title: 'x', roleFamilyId: 'performance-marketing', currency: 'INR', stageIds: ['warmup'] })
      .expect(400);

    // Choosing the situation change pulls in the decision it follows.
    const { body } = await manager
      .post('/api/assessments')
      .send({
        title: 'Growth lead',
        roleFamilyId: 'performance-marketing',
        currency: 'USD',
        stageIds: ['two-weeks-later', 'agency-plan'],
      })
      .expect(201);
    const detail = (await manager.get(`/api/assessments/${body.id}`)).body;
    expect(detail.family.stages.map((s: { id: string }) => s.id)).toEqual([
      'budget-cut',
      'two-weeks-later',
      'agency-plan',
    ]);
    expect(detail.family.stages[0]).toMatchObject({ thinkAloud: true, summary: expect.any(String) });

    const { body: invited } = await manager
      .post(`/api/assessments/${body.id}/candidates`)
      .send({ name: 'Asha', email: 'asha@example.com' })
      .expect(201);
    const token = invited.candidate.token;
    await candidateAccount(token, 'asha@example.com');
    const session = (
      await as(token)
        .post(`${c(token)}/start`)
        .send({ idName: 'Asha', consent: true, privacy: true })
        .expect(200)
    ).body as CandidateSession;
    expect(session.assessment.outline.map((o) => o.kind)).toEqual(['decision', 'branch', 'critique']);
    const first = (
      await as(token)
        .post(`${c(token)}/next`)
        .send({ index: 0 })
        .expect(200)
    ).body as CandidateSession;
    if (first.state.phase !== 'stage') throw new Error('expected stage');
    expect(first.state.stage.id).toBe('budget-cut');
  });
});

describe('AI review', () => {
  async function finishedCandidate(choices: Record<string, string> = {}) {
    const ctx = await setup();
    await as(ctx.candidate.token)
      .post(`${c(ctx.candidate.token)}/start`)
      .send({ idName: 'Asha Rao', consent: true, privacy: true });
    await completeAll(ctx.candidate.token, choices);
    return ctx;
  }

  it('reviews a submitted candidate: transcripts, rubric scores, summary and recommendation', async () => {
    const ctx = await setup();
    const token = ctx.candidate.token;
    await as(token)
      .post(`${c(token)}/start`)
      .send({ idName: 'Asha Rao', consent: true, privacy: true });
    await as(token)
      .post(`${c(token)}/next`)
      .send({ index: 0 });
    await as(token)
      .post(`${c(token)}/stages/warmup/submit`)
      .send({ text: 'warm-up' });
    // Think-aloud audio on the first read.
    await as(token)
      .post(`${c(token)}/next`)
      .send({ index: 1 });
    await as(token)
      .post(`${c(token)}/stages/first-read/stream?part=0&seq=0&startMs=500&sec=4`)
      .set('Content-Type', 'audio/webm')
      .send(Buffer.from('audio-bytes'))
      .expect(200);
    await as(token)
      .post(`${c(token)}/stages/first-read/submit`)
      .send({})
      .expect(200);
    await completeAll(token);
    await reviews.idle();

    const report = (await ctx.manager.get(`/api/candidates/${ctx.candidate.id}`)).body;
    expect(report.candidate.status).toBe('reviewed');
    const review = report.aiReview;
    expect(review).toMatchObject({ status: 'done', attempts: 1, error: null });
    expect(review.result).toMatchObject({
      overall: 3,
      recommendation: 'advance',
      summary: 'Solid reasoning.',
      probes: ['Walk me through break-even again.'],
      models: { review: 'test/review', audio: 'test/audio' },
    });
    const firstRead = review.result.stages.find((s: { stageId: string }) => s.stageId === 'first-read');
    expect(firstRead.transcript).toContain('over-count');
    expect(firstRead.delivery).toEqual({ label: 'natural', reasons: 'Test delivery.' });
    expect(Object.keys(firstRead.criteria)).toEqual(['numbers', 'skepticism', 'priority']);
    expect(firstRead.criteria.numbers.evidence).toBe('quote');

    // The audio went to the audio model, scoring to the review model, and the
    // scoring prompt carried the transcript and the answer key.
    const audioCalls = ai.calls.filter((call) => call.model === 'test/audio');
    expect(audioCalls).toHaveLength(1);
    const firstReadPrompt = ai.calls.find(
      (call) => call.model === 'test/review' && String(call.messages[1].content).includes('## Question: First read'),
    )!;
    expect(String(firstReadPrompt.messages[1].content)).toContain('over-count');
    expect(String(firstReadPrompt.messages[1].content)).toContain('Reviewer guide');

    const list = (await ctx.manager.get(`/api/assessments/${ctx.assessmentId}`)).body.candidates[0];
    expect(list).toMatchObject({ aiScore: 3, aiStatus: 'done', aiRecommendation: 'advance' });
  });

  it('moves audio that sounded read to the top of the verification call', async () => {
    ai.delivery = 'read';
    const ctx = await setup();
    const token = ctx.candidate.token;
    await as(token)
      .post(`${c(token)}/start`)
      .send({ idName: 'Asha Rao', consent: true, privacy: true });
    await as(token)
      .post(`${c(token)}/next`)
      .send({ index: 0 });
    await as(token)
      .post(`${c(token)}/stages/warmup/submit`)
      .send({ text: 'hi' });
    await as(token)
      .post(`${c(token)}/next`)
      .send({ index: 1 });
    await as(token)
      .post(`${c(token)}/stages/first-read/stream?part=0&seq=0&startMs=0&sec=4`)
      .set('Content-Type', 'audio/webm')
      .send(Buffer.from('a'));
    await as(token)
      .post(`${c(token)}/stages/first-read/submit`)
      .send({});
    await completeAll(token);
    await reviews.idle();
    const report = (await ctx.manager.get(`/api/candidates/${ctx.candidate.id}`)).body;
    const probe = report.verification.script.probes[0];
    expect(probe.stageId).toBe('first-read');
    expect(probe.reasons.join(' ')).toMatch(/read or rehearsed/);
  });

  it('repairs a non-JSON reply once', async () => {
    ai.brokenJsonOnce = true;
    const ctx = await finishedCandidate();
    await reviews.idle();
    const report = (await ctx.manager.get(`/api/candidates/${ctx.candidate.id}`)).body;
    expect(report.aiReview.status).toBe('done');
  });

  it('records a failure clearly and can be retried', async () => {
    const realClient = ai.client;
    ai.client = null;
    const ctx = await finishedCandidate();
    await reviews.idle();
    let report = (await ctx.manager.get(`/api/candidates/${ctx.candidate.id}`)).body;
    expect(report.aiReview).toMatchObject({ status: 'failed', result: null });
    expect(report.aiReview.error).toMatch(/OPENROUTER_API_KEY/);
    expect(report.candidate.status).toBe('submitted');

    ai.client = realClient;
    await ctx.manager.post(`/api/candidates/${ctx.candidate.id}/ai-review`).expect(202);
    await reviews.idle();
    report = (await ctx.manager.get(`/api/candidates/${ctx.candidate.id}`)).body;
    expect(report.aiReview).toMatchObject({ status: 'done', attempts: 2 });
  });

  it('refuses an out-of-range score from the model', async () => {
    ai.score = 7;
    const ctx = await finishedCandidate();
    await reviews.idle();
    const report = (await ctx.manager.get(`/api/candidates/${ctx.candidate.id}`)).body;
    expect(report.aiReview.status).toBe('failed');
    expect(report.aiReview.error).toMatch(/No valid score/);
  });

  it('lets recruiters disagree with an AI score, keeping both', async () => {
    const ctx = await finishedCandidate();
    await reviews.idle();
    const url = `/api/candidates/${ctx.candidate.id}/overrides`;

    await ctx.manager.put(url).send({ stageId: 'first-read', criterionId: 'numbers', score: 4 }).expect(400); // no reason
    await ctx.manager
      .put(url)
      .send({ stageId: 'first-read', criterionId: 'nope', score: 4, note: 'x'.repeat(5) })
      .expect(400);
    await ctx.manager
      .put(url)
      .send({ stageId: 'first-read', criterionId: 'numbers', score: 9, note: 'too high' })
      .expect(400);

    const report = (
      await ctx.manager
        .put(url)
        .send({ stageId: 'first-read', criterionId: 'numbers', score: 4, note: 'Quantified the over-count live.' })
        .expect(200)
    ).body;
    expect(report.overrides).toEqual([
      expect.objectContaining({
        stageId: 'first-read',
        criterionId: 'numbers',
        aiScore: 3,
        score: 4,
        userName: 'Maya',
      }),
    ]);
    // first-read: numbers counts ×2 → (4·2 + 3 + 3) / 4 = 3.5; everything else stays 3.
    expect(report.adjusted.byStage['first-read']).toBe(3.5);
    expect(report.adjusted.overall).toBeGreaterThan(report.aiReview.result.overall);
    expect(
      report.aiReview.result.stages.find((s: { stageId: string }) => s.stageId === 'first-read').criteria.numbers.score,
    ).toBe(3);

    const list = (await ctx.manager.get(`/api/assessments/${ctx.assessmentId}`)).body.candidates[0];
    expect(list.adjustedScore).toBe(report.adjusted.overall);

    const cleared = (await ctx.manager.delete(`${url}/first-read/numbers`).expect(200)).body;
    expect(cleared.overrides).toEqual([]);
    expect(cleared.adjusted).toBeNull();

    const outsider = await signup('Other Co', 'eve@other.test');
    await outsider
      .put(url)
      .send({ stageId: 'first-read', criterionId: 'numbers', score: 1, note: 'nope nope' })
      .expect(404);
  });

  it('refuses an override before the AI has scored', async () => {
    const ai2 = ai.client;
    ai.client = null;
    const ctx = await finishedCandidate();
    await reviews.idle();
    await ctx.manager
      .put(`/api/candidates/${ctx.candidate.id}/overrides`)
      .send({ stageId: 'first-read', criterionId: 'numbers', score: 4, note: 'too early' })
      .expect(409);
    ai.client = ai2;
  });

  it('starts only after the last answer, and not before', async () => {
    const ctx = await setup();
    await ctx.manager.post(`/api/candidates/${ctx.candidate.id}/ai-review`).expect(409);
    expect((await ctx.manager.get(`/api/candidates/${ctx.candidate.id}`)).body.aiReview).toBeNull();
  });
});

describe('verification', () => {
  it('builds a verification script from the candidate answers and records the outcome', async () => {
    const { candidate, manager } = await setup();
    await as(candidate.token)
      .post(`${c(candidate.token)}/start`)
      .send({ idName: 'Asha Rao', consent: true, privacy: true });
    await completeAll(candidate.token, { 'budget-cut': 'search' });

    const report = (await manager.get(`/api/candidates/${candidate.id}`)).body;
    const script = report.verification.script;
    expect(script.identity[0]).toContain('Asha Rao');
    expect(script.probes[0].stageId).toBe('real-decision');
    const cut = script.probes.find((p: { stageId: string }) => p.stageId === 'budget-cut');
    expect(cut.questions[0]).toContain('Google Search');
    expect(cut.answer.excerpt).toContain('My answer to The budget cut');

    await manager.put(`/api/candidates/${candidate.id}/verification`).send({ identity: 'bogus' }).expect(400);
    const saved = (
      await manager
        .put(`/api/candidates/${candidate.id}/verification`)
        .send({ identity: 'verified', consistency: 'consistent', notes: 'Rebuilt the ROAS maths live' })
        .expect(200)
    ).body;
    expect(saved.verification.record).toMatchObject({ identity: 'verified', interviewerName: 'Maya' });
  });
});

describe('role library', () => {
  it('previews every branch of a role family with a chosen seed', async () => {
    const manager = await signup();
    const { body } = await manager.get('/api/role-families').expect(200);
    expect(body.families.map((f: { id: string }) => f.id)).toEqual(ROLE_FAMILIES.map((f) => f.id));
    // Every ready-made role carries its catalogue filters.
    expect(body.families.every((f: { catalog?: { function: string } }) => f.catalog?.function)).toBe(true);

    const preview = (
      await manager.get('/api/role-families/customer-support-lead/preview?seed=5&currency=USD').expect(200)
    ).body;
    expect(preview.seed).toBe(5);
    const branch = preview.stages.find((s: { id: string }) => s.id === 'midday');
    expect(branch.variants).toHaveLength(4);
    const critique = preview.stages.find((s: { id: string }) => s.id === 'draft-reply');
    expect(JSON.stringify(critique.material)).toContain('$');
    expect(JSON.stringify(critique.material)).not.toContain('₹');
  });
});

describe('AI-generated scenarios', () => {
  const describeRole =
    'Field sales for a B2B payments startup. They visit 8–10 small merchants a day, pitch card machines and need to read a territory report.';

  async function generate(manager: ReturnType<typeof request.agent>, currency = 'USD') {
    const { body } = await manager
      .post('/api/generations')
      .send({ roleTitle: 'Field Sales Executive', description: describeRole, currency })
      .expect(201);
    await generations.idle();
    return body.id as string;
  }

  it('writes a scenario that the organisation can preview, hire with and review', async () => {
    const manager = await signup();
    const id = await generate(manager);
    const { body: status } = await manager.get(`/api/generations/${id}`).expect(200);
    expect(status).toMatchObject({ status: 'done', name: 'Field Sales', error: null, currency: 'USD' });

    const { body: library } = await manager.get('/api/role-families').expect(200);
    const family = library.families.find((f: { id: string }) => f.id === id);
    expect(family).toMatchObject({ generated: true, fixedCurrency: 'USD', name: 'Field Sales' });
    expect(family.stages[0].id).toBe('warmup');
    expect(family.stages.at(-1).id).toBe('past-work');

    // The preview ignores a requested currency: the amounts are written in USD.
    const { body: preview } = await manager.get(`/api/role-families/${id}/preview?currency=INR`).expect(200);
    expect(preview.currency).toBe('USD');
    expect(preview.stages.find((s: { kind: string }) => s.kind === 'branch').variants.length).toBeGreaterThan(1);

    const { body: created } = await manager
      .post('/api/assessments')
      .send({ title: 'Field Sales, Pune', roleFamilyId: id, currency: 'INR' })
      .expect(201);
    const { body: detail } = await manager.get(`/api/assessments/${created.id}`).expect(200);
    expect(detail.assessment).toMatchObject({ currency: 'USD', roleFamilyName: 'Field Sales' });

    const { body: invited } = await manager
      .post(`/api/assessments/${created.id}/candidates`)
      .send({ name: 'Ravi', email: 'ravi@example.com' })
      .expect(201);
    const token = invited.candidate.token;
    await candidateAccount(token, 'ravi@example.com', 'Ravi');
    await as(token)
      .post(`${c(token)}/start`)
      .send({ idName: 'Ravi', consent: true, privacy: true })
      .expect(200);
    const done = await completeAll(token);
    expect(done.state.phase).toBe('done');
    await reviews.idle();
    const { body: report } = await manager.get(`/api/candidates/${invited.candidate.id}`).expect(200);
    expect(report.aiReview.status).toBe('done');

    // In use, so it can't be deleted.
    await manager.delete(`/api/generations/${id}`).expect(409);
  });

  it('is private to the organisation that generated it', async () => {
    const id = await generate(await signup());
    const other = await signup('Other', 'lee@other.test');
    await other.get(`/api/role-families/${id}/preview`).expect(404);
    await other.get(`/api/generations/${id}`).expect(404);
    const { body } = await other.get('/api/role-families').expect(200);
    expect(body.families.some((f: { id: string }) => f.id === id)).toBe(false);
    await other.post('/api/assessments').send({ title: 'X', roleFamilyId: id, currency: 'USD' }).expect(400);
  });

  it('repairs invalid output once and revises the draft when the check finds problems', async () => {
    const manager = await signup();
    ai.invalidSpecs = 1;
    ai.specIssues = ['The critique decoy is actually wrong.'];
    const id = await generate(manager);
    const { body } = await manager.get(`/api/generations/${id}`).expect(200);
    expect(body).toMatchObject({ status: 'done', name: 'Field Sales (revised)' });
    const writerCalls = ai.calls.filter((call) => String(call.messages[0].content).startsWith('You write assessment'));
    expect(writerCalls).toHaveLength(3);
    expect(String(writerCalls[1].messages.at(-1)!.content)).toMatch(/stages must be a list/);
  });

  it('starts a fresh draft when a draft and its repair both fail', async () => {
    const manager = await signup();
    ai.invalidSpecs = 2;
    const id = await generate(manager);
    expect((await manager.get(`/api/generations/${id}`).expect(200)).body.status).toBe('done');
    const writerCalls = ai.calls.filter((call) => String(call.messages[0].content).startsWith('You write assessment'));
    // Draft, failed repair, fresh draft.
    expect(writerCalls).toHaveLength(3);
  });

  it('records a failure clearly, can be retried, and can be deleted', async () => {
    const manager = await signup();
    ai.invalidSpecs = 4;
    const id = await generate(manager);
    const { body: failed } = await manager.get(`/api/generations/${id}`).expect(200);
    expect(failed.status).toBe('failed');
    expect(failed.error).toMatch(/invalid/);
    const { body: library } = await manager.get('/api/role-families').expect(200);
    expect(library.families.some((f: { id: string }) => f.id === id)).toBe(false);

    await manager.post(`/api/generations/${id}/retry`).expect(200);
    await generations.idle();
    expect((await manager.get(`/api/generations/${id}`).expect(200)).body.status).toBe('done');
    await manager.post(`/api/generations/${id}/retry`).expect(409);

    await manager.delete(`/api/generations/${id}`).expect(200);
    await manager.get(`/api/generations/${id}`).expect(404);
  });

  it('validates the request', async () => {
    const manager = await signup();
    await manager
      .post('/api/generations')
      .send({ roleTitle: 'Field Sales', description: 'Too short', currency: 'USD' })
      .expect(400);
    await manager
      .post('/api/generations')
      .send({ roleTitle: 'Field Sales', description: describeRole, currency: 'EUR' })
      .expect(400);
  });
});

describe('review page collaboration', () => {
  /** Two finished, AI-reviewed candidates on one assessment, scored differently. */
  async function reviewedPair() {
    const ctx = await setup();
    await as(ctx.candidate.token)
      .post(`${c(ctx.candidate.token)}/start`)
      .send({ idName: 'Asha Rao', consent: true, privacy: true });
    await completeAll(ctx.candidate.token);
    await reviews.idle();
    ai.score = 2;
    clock += 60_000; // invited a minute later, so the order is well defined
    const { body: invited } = await ctx.manager
      .post(`/api/assessments/${ctx.assessmentId}/candidates`)
      .send({ name: 'Vikram Shah', email: 'vikram@example.com' })
      .expect(201);
    const second = invited.candidate as { id: string; token: string };
    await candidateAccount(second.token, 'vikram@example.com', 'Vikram Shah');
    await as(second.token)
      .post(`${c(second.token)}/start`)
      .send({ idName: 'Vikram Shah', consent: true, privacy: true });
    await completeAll(second.token);
    await reviews.idle();
    return { ...ctx, second };
  }

  async function teammate(manager: ReturnType<typeof request.agent>) {
    await manager
      .post('/api/team')
      .send({ name: 'Lee', email: 'lee@acme.test', password: 'teammate-pass' })
      .expect(201);
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: 'lee@acme.test', password: 'teammate-pass' }).expect(200);
    return agent;
  }

  it('ranks a candidate against the pool and links to the neighbouring candidates', async () => {
    const { manager, candidate, second } = await reviewedPair();
    const first = (await manager.get(`/api/candidates/${candidate.id}`).expect(200)).body;
    expect(first.benchmark).toMatchObject({ rank: 1, of: 2 });
    expect(first.benchmark.overallAverage).toBeCloseTo(2.5, 5);
    expect(first.benchmark.byStage['first-read']).toBeCloseTo(2.5, 5);
    const other = (await manager.get(`/api/candidates/${second.id}`).expect(200)).body;
    expect(other.benchmark).toMatchObject({ rank: 2, of: 2 });

    // Newest first, as on the assessment page.
    expect(other.siblings).toMatchObject({ index: 1, total: 2, prev: null, next: { id: candidate.id } });
    expect(first.siblings).toMatchObject({ index: 2, total: 2, prev: { id: second.id }, next: null });
    // The decision question's follow-up says which question it depends on.
    const branch = first.stages.find((s: { kind: string }) => s.kind === 'branch');
    expect(branch.dependsOn).toBe('budget-cut');
  });

  it('keeps a personal watch list', async () => {
    const { manager, candidate, assessmentId } = await reviewedPair();
    await manager.put(`/api/candidates/${candidate.id}/star`).send({ starred: true }).expect(200);
    expect((await manager.get(`/api/candidates/${candidate.id}`)).body.starred).toBe(true);
    const list = (await manager.get(`/api/assessments/${assessmentId}`)).body.candidates;
    expect(list.filter((x: { starred: boolean }) => x.starred).map((x: { id: string }) => x.id)).toEqual([
      candidate.id,
    ]);

    // Stars are per person.
    const lee = await teammate(manager);
    expect((await lee.get(`/api/candidates/${candidate.id}`)).body.starred).toBe(false);

    await manager.put(`/api/candidates/${candidate.id}/star`).send({ starred: false }).expect(200);
    expect((await manager.get(`/api/candidates/${candidate.id}`)).body.starred).toBe(false);
    await manager.put(`/api/candidates/${candidate.id}/star`).send({ starred: 'yes' }).expect(400);
  });

  it('shares teammates’ notes, each removable only by its author', async () => {
    const { manager, candidate } = await reviewedPair();
    const lee = await teammate(manager);
    const posted = (
      await lee
        .post(`/api/candidates/${candidate.id}/notes`)
        .send({ body: 'Strong on the numbers; ask about Q4 on the call.', lean: 'advance' })
        .expect(201)
    ).body;
    expect(posted.notes).toEqual([expect.objectContaining({ userName: 'Lee', lean: 'advance', mine: true })]);
    const seen = (await manager.get(`/api/candidates/${candidate.id}`)).body.notes;
    expect(seen).toEqual([expect.objectContaining({ userName: 'Lee', mine: false })]);

    await manager.delete(`/api/candidates/${candidate.id}/notes/${seen[0].id}`).expect(404);
    await lee.post(`/api/candidates/${candidate.id}/notes`).send({ body: 'x', lean: 'maybe' }).expect(400);
    await lee.post(`/api/candidates/${candidate.id}/notes`).send({ body: '' }).expect(400);
    const after = (await lee.delete(`/api/candidates/${candidate.id}/notes/${seen[0].id}`).expect(200)).body;
    expect(after.notes).toEqual([]);

    // Another organisation can't add notes.
    const other = await signup('Other', 'sam@other.test');
    await other.post(`/api/candidates/${candidate.id}/notes`).send({ body: 'hi' }).expect(404);
  });

  it('clears a decision back to reviewed', async () => {
    const { manager, candidate } = await reviewedPair();
    await manager.put(`/api/candidates/${candidate.id}/decision`).send({ decision: 'advance' }).expect(200);
    const cleared = (await manager.put(`/api/candidates/${candidate.id}/decision`).send({ decision: null }).expect(200))
      .body;
    expect(cleared.candidate).toMatchObject({ decision: null, status: 'reviewed' });
  });
});

describe('plans, costs and AI extras', () => {
  const begin = (token: string) =>
    as(token)
      .post(`${c(token)}/start`)
      .send({ idName: 'Test Person', consent: true, privacy: true })
      .expect(200);
  /** An assessment with `count` candidates who all finished. */
  async function finishedPool(count: number, manager?: ReturnType<typeof request.agent>, prefix = 'p') {
    manager ??= await signup();
    const { body: created } = await manager
      .post('/api/assessments')
      .send({ title: 'Growth Marketer', roleFamilyId: 'performance-marketing', currency: 'INR' })
      .expect(201);
    const people = Array.from({ length: count }, (_, i) => ({
      name: `Person ${i}`,
      email: `${prefix}${i}@example.com`,
    }));
    const { body: bulk } = await manager
      .post(`/api/assessments/${created.id}/candidates/bulk`)
      .send({ people })
      .expect(201);
    for (const [i, cand] of (bulk.created as { token: string }[]).entries()) {
      await candidateAccount(cand.token, `${prefix}${i}@example.com`, `Person ${i}`);
      await begin(cand.token);
      await completeAll(cand.token);
    }
    await reviews.idle();
    return { manager, assessmentId: created.id as string, candidates: bulk.created as { id: string }[] };
  }

  it('reviews five candidates free, then holds reviews until the plan changes', async () => {
    const { manager, assessmentId, candidates } = await finishedPool(6);
    const { body: detail } = await manager.get(`/api/assessments/${assessmentId}`).expect(200);
    const statuses = (detail.candidates as { aiStatus: string }[]).map((x) => x.aiStatus).sort();
    expect(statuses).toEqual(['done', 'done', 'done', 'done', 'done', 'locked']);
    const { body: plan } = await manager.get('/api/plan').expect(200);
    expect(plan).toMatchObject({ plan: 'trial', included: 5, used: 5, locked: 1 });

    // Re-running a held review doesn't get around the trial.
    const held = candidates.find((x) =>
      detail.candidates.find((d: { id: string; aiStatus: string }) => d.id === x.id && d.aiStatus === 'locked'),
    )!;
    await manager.post(`/api/candidates/${held.id}/ai-review`).expect(202);
    await reviews.idle();
    expect((await manager.get(`/api/candidates/${held.id}`)).body.aiReview.status).toBe('locked');

    const { body: asked } = await manager.post('/api/plan/upgrade-request').send({ plan: 'starter' }).expect(201);
    expect(asked.upgradeRequest).toMatchObject({ plan: 'starter' });
    await manager.post('/api/plan/upgrade-request').send({ plan: 'enterprise' }).expect(400);

    const { setPlan } = await import('../server/plans');
    const org = (await db.query<{ id: string }>("SELECT id FROM orgs WHERE name = 'Acme'")).rows[0];
    expect(await setPlan(db, org.id, 'starter')).toBe(1);
    await reviews.resume();
    await reviews.idle();
    expect((await manager.get(`/api/candidates/${held.id}`)).body.aiReview.status).toBe('done');
    expect((await manager.get('/api/plan')).body).toMatchObject({ plan: 'starter', included: 40, used: 6, locked: 0 });
  });

  it('gives both teams free reviews for a referral, the referrer once a candidate finishes', async () => {
    const referrer = await signup();
    const { body: link } = await referrer.get('/api/referral').expect(200);
    expect(link).toMatchObject({ joined: 0, rewarded: 0, rewardEach: 10, cap: 20 });
    expect(link.code).toMatch(/^[a-z0-9]{8}$/);
    expect((await referrer.get('/api/referral')).body.code).toBe(link.code);

    const friend = request.agent(app);
    await friend
      .post('/api/auth/signup')
      .send({ orgName: 'Friend Co', name: 'Lee', email: 'lee@friend.test', password: 'correct-horse', ref: link.code })
      .expect(201);
    expect((await friend.get('/api/plan')).body).toMatchObject({ plan: 'trial', bonusReviews: 10 });
    expect((await referrer.get('/api/plan')).body.bonusReviews).toBe(0);
    expect((await referrer.get('/api/referral')).body).toMatchObject({ joined: 1, rewarded: 0 });

    // Six finish: five on the trial, one from the referral bonus; the referrer is rewarded once.
    await finishedPool(6, friend, 'f');
    expect((await friend.get('/api/plan')).body).toMatchObject({ used: 5, locked: 0, bonusReviews: 9 });
    expect((await referrer.get('/api/plan')).body.bonusReviews).toBe(10);
    expect((await referrer.get('/api/referral')).body).toMatchObject({ joined: 1, rewarded: 1 });

    // A made-up code is ignored.
    await request(app)
      .post('/api/auth/signup')
      .send({ orgName: 'Other', name: 'Ola', email: 'ola@other.test', password: 'correct-horse', ref: 'zzzzzzzz' })
      .expect(201);
    expect((await referrer.get('/api/referral')).body.joined).toBe(1);
  });

  it('asks for yearly billing and counts reviews beyond a monthly plan as extras', async () => {
    const manager = await signup();
    const { body: asked } = await manager
      .post('/api/plan/upgrade-request')
      .send({ plan: 'growth', billing: 'annual' })
      .expect(201);
    expect(asked.upgradeRequest).toMatchObject({ plan: 'growth', billing: 'annual' });
    // Pay as you go is always prepaid.
    clock += 1000;
    const { body: payg } = await manager
      .post('/api/plan/upgrade-request')
      .send({ plan: 'payg', billing: 'annual' })
      .expect(201);
    expect(payg.upgradeRequest.billing).toBe('monthly');

    const { setPlan, reviewCoverage } = await import('../server/plans');
    const org = (await db.query<{ id: string }>("SELECT id FROM orgs WHERE name = 'Acme'")).rows[0];
    await setPlan(db, org.id, 'starter', { billing: 'annual', paidUntil: clock + 365 * 864e5, now: clock });
    const { body: plan } = await manager.get('/api/plan').expect(200);
    expect(plan).toMatchObject({ plan: 'starter', billing: 'annual', included: 40, upgradeRequest: null });
    expect(plan.paidUntil).toBeGreaterThan(clock);
    await db.query('UPDATE orgs SET bonus_reviews = 1 WHERE id = $1', [org.id]);
    // Pretend the month's allowance is spent: the next review uses the bonus, then becomes an extra.
    const { MONTHLY_REVIEWS } = await import('../shared/plans');
    const realStarter = MONTHLY_REVIEWS.starter;
    MONTHLY_REVIEWS.starter = 0;
    try {
      expect(await reviewCoverage(db, org.id, clock)).toBe('bonus');
      expect(await reviewCoverage(db, org.id, clock)).toBe('extra');
    } finally {
      MONTHLY_REVIEWS.starter = realStarter;
    }
  });

  it('spends a pay-as-you-go credit per review and holds the rest', async () => {
    const manager = await signup();
    const { setPlan } = await import('../server/plans');
    const org = (await db.query<{ id: string }>("SELECT id FROM orgs WHERE name = 'Acme'")).rows[0];
    await setPlan(db, org.id, 'payg', { credits: 1 });
    const { body: created } = await manager
      .post('/api/assessments')
      .send({ title: 'Growth Marketer', roleFamilyId: 'performance-marketing', currency: 'INR' })
      .expect(201);
    const { body: bulk } = await manager
      .post(`/api/assessments/${created.id}/candidates/bulk`)
      .send({
        people: [
          { name: 'A', email: 'a@example.com' },
          { name: 'B', email: 'b@example.com' },
        ],
      })
      .expect(201);
    for (const [i, cand] of (bulk.created as { token: string }[]).entries()) {
      await candidateAccount(cand.token, `${'ab'[i]}@example.com`);
      await begin(cand.token);
      await completeAll(cand.token);
    }
    await reviews.idle();
    expect((await manager.get('/api/plan')).body).toMatchObject({ plan: 'payg', credits: 0, locked: 1 });
  });

  it('records what each review cost', async () => {
    const { candidates } = await finishedPool(1);
    const usage = (
      await db.query<{ kind: string; calls: number; cost_usd: number; ok: number }>('SELECT * FROM ai_usage')
    ).rows;
    expect(usage).toHaveLength(1);
    expect(usage[0]).toMatchObject({ kind: 'review', ok: 1 });
    expect(usage[0].calls).toBeGreaterThan(1);
    expect(usage[0].cost_usd).toBeCloseTo(usage[0].calls * 0.002);
    const review = (
      await db.query<{ cost_usd: number }>('SELECT cost_usd FROM ai_reviews WHERE candidate_id = $1', [
        candidates[0].id,
      ])
    ).rows[0];
    expect(review.cost_usd).toBeCloseTo(usage[0].cost_usd);
  });

  it('invites many people at once and reports the rows it skipped', async () => {
    const { manager, assessmentId } = await setup();
    const { body } = await manager
      .post(`/api/assessments/${assessmentId}/candidates/bulk`)
      .send({
        timeMultiplier: 1.5,
        people: [
          { name: 'Ravi', email: 'ravi@example.com' },
          { name: 'Ravi again', email: 'RAVI@example.com' },
          { name: 'Asha', email: 'asha@example.com' },
          { name: 'No email', email: 'not-an-email' },
          { name: '', email: 'blank@example.com' },
        ],
      })
      .expect(201);
    expect(body.created).toHaveLength(1);
    expect(body.created[0]).toMatchObject({ name: 'Ravi', timeMultiplier: 1.5, status: 'invited' });
    expect(body.skipped.map((x: { reason: string }) => x.reason)).toEqual([
      'Already invited to this assessment',
      'Already invited to this assessment',
      expect.stringContaining('mail'),
      expect.stringContaining('Name'),
    ]);
    await manager.post(`/api/assessments/${assessmentId}/candidates/bulk`).send({ people: [] }).expect(400);
  });

  it('checks the writing, builds an interview kit and drafts the decision email', async () => {
    const { manager, candidates } = await finishedPool(1);
    const id = candidates[0].id;
    const before = (await manager.get(`/api/candidates/${id}`)).body;
    expect(before.integrity).toMatchObject({ verdict: 'clean', aiChecked: false });
    expect(before.interviewKit).toBeNull();

    const { body: checked } = await manager.post(`/api/candidates/${id}/integrity-check`).expect(200);
    expect(checked.integrity.aiChecked).toBe(true);
    expect(checked.integrity.items).toEqual([
      expect.objectContaining({ stageId: 'first-read', level: 'strong', source: 'writing', quote: 'In conclusion' }),
    ]);
    expect(checked.integrity.verdict).toBe('question');

    const { body: kit } = await manager.post(`/api/candidates/${id}/interview-kit`).expect(200);
    expect(kit.interviewKit.questions).toHaveLength(5);
    expect(kit.interviewKit.questions[0]).toMatchObject({ stageId: 'first-read', listenFor: 'Specific numbers.' });

    await manager.post(`/api/candidates/${id}/decision-email`).expect(409);
    await manager.put(`/api/candidates/${id}/decision`).send({ decision: 'reject' }).expect(200);
    const { body: drafted } = await manager.post(`/api/candidates/${id}/decision-email`).expect(200);
    expect(drafted.decisionEmail).toMatchObject({
      decision: 'reject',
      ai: true,
      subject: 'About your application (reject)',
    });
    // A different decision makes the old draft stale.
    const { body: changed } = await manager
      .put(`/api/candidates/${id}/decision`)
      .send({ decision: 'advance' })
      .expect(200);
    expect(changed.decisionEmail).toBeNull();

    const kinds = (await db.query<{ kind: string }>('SELECT kind FROM ai_usage ORDER BY created_at')).rows.map(
      (r) => r.kind,
    );
    expect(kinds).toEqual(expect.arrayContaining(['review', 'integrity', 'interview_kit', 'decision_email']));
  });

  it('needs the finished review before AI extras', async () => {
    const { manager, candidate } = await setup();
    await manager.post(`/api/candidates/${candidate.id}/interview-kit`).expect(409);
    await manager.post(`/api/candidates/${candidate.id}/integrity-check`).expect(409);
  });

  it('writes a scenario from a pasted job description', async () => {
    const manager = await signup();
    const jd = `About us: we are a fast-growing payments company. ${'Responsibilities: visit merchants, read the weekly territory report, decide where to spend time. '.repeat(4)}Benefits: health cover.`;
    await manager
      .post('/api/generations')
      .send({ roleTitle: 'Field Sales Executive', description: 'too short', currency: 'INR', source: 'jd' })
      .expect(400);
    const { body } = await manager
      .post('/api/generations')
      .send({ roleTitle: 'Field Sales Executive', description: jd, currency: 'INR', source: 'jd' })
      .expect(201);
    await generations.idle();
    const { body: status } = await manager.get(`/api/generations/${body.id}`).expect(200);
    expect(status).toMatchObject({ status: 'done', source: 'jd' });
    const writer = ai.calls.find((call) => String(call.messages[0].content).startsWith('You write assessment'))!;
    expect(String(writer.messages[1].content)).toContain('<job_description>');
    const usage = (await db.query<{ kind: string }>('SELECT kind FROM ai_usage')).rows;
    expect(usage.map((u) => u.kind)).toContain('generation');
  });
});

describe('demo leads', () => {
  it('keeps one row per email and source, and rejects bad input', async () => {
    const send = (body: object) => request(app).post('/api/leads').send(body);
    expect((await send({ email: 'Head@Agency.example', source: 'recruiter-tour' })).status).toBe(201);
    clock += 1000;
    expect((await send({ email: 'head@agency.example', source: 'recruiter-tour' })).status).toBe(201);
    expect((await send({ email: 'not an email', source: 'recruiter-tour' })).status).toBe(400);
    expect((await send({ email: 'a@b.example', source: 'somewhere' })).status).toBe(400);
    const { rows } = await db.query<{ email: string; created_at: number }>('SELECT email, created_at FROM demo_leads');
    expect(rows).toEqual([{ email: 'head@agency.example', created_at: clock }]);
  });

  it('limits how often one address can send', async () => {
    const send = (n: number) =>
      request(app)
        .post('/api/leads')
        .send({ email: `person${n}@example.com`, source: 'candidate-tour' });
    for (let i = 0; i < 5; i++) expect((await send(i)).status).toBe(201);
    expect((await send(5)).status).toBe(429);
  });
});

describe('sign-in security', () => {
  it('slows down password guessing for an address', async () => {
    await signup();
    const guess = () => request(app).post('/api/auth/login').send({ email: 'maya@acme.test', password: 'wrong-guess' });
    for (let i = 0; i < 8; i++) expect((await guess()).status).toBe(401);
    const blocked = await request(app)
      .post('/api/auth/login')
      .send({ email: 'maya@acme.test', password: 'correct-horse' });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toMatch(/try again in 15 minutes/);
    clock += 15 * 60 * 1000;
    await request(app).post('/api/auth/login').send({ email: 'maya@acme.test', password: 'correct-horse' }).expect(200);
  });

  it('asks for an authenticator code once two-factor sign-in is on', async () => {
    const manager = await signup();
    const { body: setupBody } = await manager.post('/api/auth/2fa/setup').expect(200);
    expect(setupBody.qr).toMatch(/^data:image\/svg\+xml;base64,/);
    await manager.post('/api/auth/2fa/enable').send({ code: '000000' }).expect(400);
    const { body: enabled } = await manager
      .post('/api/auth/2fa/enable')
      .send({ code: codeAt(setupBody.secret, stepAt(clock)) })
      .expect(200);
    expect(enabled.recoveryCodes).toHaveLength(10);
    expect(enabled.security).toEqual({ twoFactor: true, recoveryCodesLeft: 10 });

    // The password alone no longer signs in.
    const agent = request.agent(app);
    const { body: first } = await agent
      .post('/api/auth/login')
      .send({ email: 'maya@acme.test', password: 'correct-horse' })
      .expect(200);
    expect(first.twoFactor).toBe(true);
    expect((await agent.get('/api/auth/me')).body.user).toBeNull();
    await agent.post('/api/auth/login/verify').send({ challenge: first.challenge, code: '111111' }).expect(401);
    // The code used to turn it on can't be used again.
    await agent
      .post('/api/auth/login/verify')
      .send({ challenge: first.challenge, code: codeAt(setupBody.secret, stepAt(clock)) })
      .expect(401);
    clock += 30_000;
    await agent
      .post('/api/auth/login/verify')
      .send({ challenge: first.challenge, code: codeAt(setupBody.secret, stepAt(clock)) })
      .expect(200);
    expect((await agent.get('/api/auth/me')).body.user.email).toBe('maya@acme.test');

    // A recovery code works once.
    const phoneless = request.agent(app);
    const login = async () =>
      (await phoneless.post('/api/auth/login').send({ email: 'maya@acme.test', password: 'correct-horse' })).body
        .challenge as string;
    const firstTry = await login();
    await phoneless
      .post('/api/auth/login/verify')
      .send({ challenge: firstTry, code: enabled.recoveryCodes[0].toUpperCase() })
      .expect(200);
    const secondTry = await login();
    await phoneless
      .post('/api/auth/login/verify')
      .send({ challenge: secondTry, code: enabled.recoveryCodes[0] })
      .expect(401);
    expect((await phoneless.get('/api/auth/security')).body.recoveryCodesLeft).toBe(9);

    // Signing out other devices leaves this one signed in.
    const { body: out } = await phoneless.post('/api/auth/sessions/sign-out-others').expect(200);
    expect(out.signedOut).toBe(2);
    expect((await agent.get('/api/auth/me')).body.user).toBeNull();
    expect((await phoneless.get('/api/auth/me')).body.user.email).toBe('maya@acme.test');

    const { body: activity } = await phoneless.get('/api/audit').expect(200);
    const actions = activity.events.map((e: { action: string }) => e.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'created the workspace',
        'turned on two-factor sign-in',
        'signed in',
        'signed out other devices',
      ]),
    );
  });

  it('keeps a workspace activity log of invitations and decisions', async () => {
    const { manager, candidate } = await setup();
    await as(candidate.token)
      .post(`${c(candidate.token)}/start`)
      .send({ idName: 'Asha Rao', consent: true, privacy: true })
      .expect(200);
    await completeAll(candidate.token);
    await manager.put(`/api/candidates/${candidate.id}/decision`).send({ decision: 'advance' }).expect(200);
    const { body } = await manager.get('/api/audit').expect(200);
    expect(body.events.map((e: { action: string; target: string }) => `${e.action} ${e.target}`)).toEqual(
      expect.arrayContaining([
        'created an assessment Growth Marketer, Bengaluru',
        'invited a candidate Asha Rao',
        'decided: advance Asha Rao',
      ]),
    );
    // Another workspace sees none of it.
    const other = await signup('Other Co', 'lee@other.test');
    const { body: theirs } = await other.get('/api/audit').expect(200);
    expect(theirs.events.every((e: { actor: string }) => e.actor === 'lee@other.test')).toBe(true);
  });

  it('records browser errors and sends security headers', async () => {
    const res = await request(app)
      .post('/api/client-errors')
      .send({ message: 'TypeError: x is undefined', stack: 'at Foo', path: '/app' })
      .expect(204);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    const { rows } = await db.query<{ source: string; message: string }>('SELECT source, message FROM error_events');
    expect(rows).toEqual([{ source: 'browser', message: 'TypeError: x is undefined' }]);
  });

  it('sends the same content security policy from Netlify as from the local server', () => {
    const toml = readFileSync(path.resolve(__dirname, '../netlify.toml'), 'utf8');
    expect(toml).toContain(`Content-Security-Policy = "${CONTENT_SECURITY_POLICY}"`);
  });
});

describe('admin console', () => {
  /** An operator login with two-factor sign-in on, like `npm run admin -- operator` makes. */
  async function operator() {
    const agent = await signup('Proofwork team', 'ops@proofwork.test');
    await db.query("UPDATE users SET operator = 1 WHERE email = 'ops@proofwork.test'");
    return agent;
  }
  async function withTwoFactor(agent: ReturnType<typeof request.agent>) {
    const { body } = await agent.post('/api/auth/2fa/setup').expect(200);
    await agent
      .post('/api/auth/2fa/enable')
      .send({ code: codeAt(body.secret, stepAt(clock)) })
      .expect(200);
  }

  it('is only for operators with two-factor sign-in on', async () => {
    const customer = await signup();
    await customer.get('/api/admin/overview').expect(403);
    const ops = await operator();
    expect((await ops.get('/api/auth/me')).body.user.operator).toBe(true);
    expect((await customer.get('/api/auth/me')).body.user.operator).toBeUndefined();
    const { body } = await ops.get('/api/admin/overview').expect(403);
    expect(body.error).toMatch(/two-factor/);
    await withTwoFactor(ops);
    await ops.get('/api/admin/overview').expect(200);
    await request(app).get('/api/admin/overview').expect(401);
  });

  it('shows workspaces and usage, and changes plans', async () => {
    const customer = await signup();
    await customer.post('/api/plan/upgrade-request').send({ plan: 'starter', billing: 'annual' }).expect(201);
    await request(app).post('/api/leads').send({ email: 'cto@lead.test', source: 'recruiter-tour' }).expect(201);
    const ops = await operator();
    await withTwoFactor(ops);

    const { body: overview } = await ops.get('/api/admin/overview').expect(200);
    expect(overview).toMatchObject({ workspaces: 1, newLast7: 1, openRequests: 1, leadsLast30: 1, estimatedMrrInr: 0 });
    expect(overview.signupsByDay).toHaveLength(30);

    const { body: list } = await ops.get('/api/admin/workspaces').expect(200);
    expect(list.workspaces).toHaveLength(1);
    const acme = list.workspaces[0];
    expect(acme).toMatchObject({
      name: 'Acme',
      owner: 'maya@acme.test',
      plan: 'trial',
      askedFor: { plan: 'starter', billing: 'annual' },
    });

    await ops.put(`/api/admin/workspaces/${acme.id}/plan`).send({ plan: 'starter', billing: 'annual' }).expect(200);
    await ops.post(`/api/admin/workspaces/${acme.id}/bonus`).send({ reviews: 5 }).expect(200);
    await ops.post(`/api/admin/workspaces/${acme.id}/bonus`).send({ reviews: 0 }).expect(400);
    expect((await customer.get('/api/plan')).body).toMatchObject({
      plan: 'starter',
      billing: 'annual',
      bonusReviews: 5,
      upgradeRequest: null,
    });
    expect((await ops.get('/api/admin/overview')).body).toMatchObject({ openRequests: 0, estimatedMrrInr: 4166 });
    const { body: requests } = await ops.get('/api/admin/requests').expect(200);
    expect(requests.requests[0].handledAt).not.toBeNull();
    expect((await ops.get('/api/admin/leads')).body.leads).toEqual([
      expect.objectContaining({ email: 'cto@lead.test' }),
    ]);

    // The customer sees what Proofwork changed in their own activity log.
    const { body: activity } = await customer.get('/api/audit').expect(200);
    expect(activity.events.map((e: { actor: string; action: string }) => `${e.actor} ${e.action}`)).toEqual(
      expect.arrayContaining(['Proofwork set the plan to', 'Proofwork added free reviews']),
    );
    const { body: all } = await ops.get('/api/admin/activity').expect(200);
    expect(all.events.length).toBeGreaterThan(3);
    await ops.put('/api/admin/workspaces/not-a-workspace/plan').send({ plan: 'starter' }).expect(404);
  });
});

describe('privacy and deletion', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const start = (token: string) =>
    as(token)
      .post(`${c(token)}/start`)
      .send({ idName: 'Asha Rao', consent: true, privacy: true })
      .expect(200);
  const hasFiles = (candidateId: string) => existsSync(path.join(uploadDir, candidateId));
  const count = async (sql: string, id: string) => (await db.query<{ n: number }>(sql, [id])).rows[0].n;

  /** A candidate who recorded a voice note and finished, with the AI review done. */
  async function finished() {
    const ctx = await setup();
    const { token } = ctx.candidate;
    await start(token);
    await as(token)
      .post(`${c(token)}/next`)
      .send({ index: 0 })
      .expect(200);
    await as(token)
      .post(`${c(token)}/stages/warmup/audio?seconds=12`)
      .set('Content-Type', 'audio/webm')
      .send(Buffer.from('fake-audio-bytes'))
      .expect(200);
    await as(token)
      .post(`${c(token)}/stages/warmup/submit`)
      .send({})
      .expect(200);
    await completeAll(token);
    await reviews.idle();
    return ctx;
  }

  it('asks for consent to processing and records which notice was agreed to', async () => {
    const { candidate } = await setup();
    const { token } = candidate;
    const intro = (await as(token).get(c(token)).expect(200)).body as CandidateSession;
    expect(intro.assessment.recordingDays).toBe(180);
    await as(token)
      .post(`${c(token)}/start`)
      .send({ idName: 'Asha Rao', consent: true })
      .expect(400);
    await start(token);
    const { rows } = await db.query<{ consent_at: number; consent_version: string }>(
      'SELECT consent_at, consent_version FROM candidates WHERE id = $1',
      [candidate.id],
    );
    expect(rows[0]).toMatchObject({ consent_at: clock, consent_version: PRIVACY_NOTICE_VERSION });
  });

  it('gives candidates a copy of what they gave, without the hiring team’s review', async () => {
    const { candidate } = await finished();
    const res = await as(candidate.token)
      .get(`${c(candidate.token)}/my-data`)
      .expect(200);
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.body.you).toMatchObject({
      name: 'Asha Rao',
      email: 'asha@example.com',
      consent: { privacyNotice: PRIVACY_NOTICE_VERSION },
    });
    expect(res.body.answers.length).toBeGreaterThan(2);
    expect(res.body.answers[0].recordingSeconds).toBe(12);
    expect(res.body).not.toHaveProperty('aiReview');
    // The link is tied to her account: nobody else can download it.
    await request(app)
      .get(`${c(candidate.token)}/my-data`)
      .expect(403);
  });

  it('lets a candidate withdraw: everything goes, the old link says so, and the review stays counted', async () => {
    const { manager, candidate } = await finished();
    const { token, id } = candidate;
    const used = (await manager.get('/api/plan').expect(200)).body.used;
    expect(used).toBe(1);
    expect(hasFiles(id)).toBe(true);

    await as(token)
      .post(`${c(token)}/erase`)
      .send({})
      .expect(400);
    await as(token)
      .post(`${c(token)}/erase`)
      .send({ confirm: true })
      .expect(200);

    expect(hasFiles(id)).toBe(false);
    for (const table of ['candidates WHERE id', 'responses WHERE candidate_id', 'ai_reviews WHERE candidate_id']) {
      expect(await count(`SELECT COUNT(*)::int AS n FROM ${table} = $1`, id)).toBe(0);
    }
    const gone = await as(token).get(c(token)).expect(410);
    expect(gone.body.error).toMatch(/withdrew and deleted your answers/);
    await manager.get(`/api/candidates/${id}`).expect(404);
    // Deleting data never hands a free review back.
    expect((await manager.get('/api/plan').expect(200)).body.used).toBe(used);

    const { body: activity } = await manager.get('/api/audit').expect(200);
    expect(JSON.stringify(activity)).not.toContain('Asha Rao');
    expect(activity.events[0]).toMatchObject({ actor: 'A candidate', action: 'withdrew and deleted their data from' });
    const { body: privacy } = await manager.get('/api/privacy').expect(200);
    expect(privacy).toMatchObject({ recordingDays: 180, deletionsLastYear: 1, withdrawnLastYear: 1 });
  });

  it('lets the hiring team export or delete a candidate, only in their own workspace', async () => {
    const { manager, candidate } = await finished();
    const other = await signup('Other Co', 'lee@other.test');
    await other.get(`/api/candidates/${candidate.id}/export`).expect(404);
    await other.delete(`/api/candidates/${candidate.id}`).expect(404);

    const { body: exported } = await manager.get(`/api/candidates/${candidate.id}/export`).expect(200);
    expect(exported.candidate).toMatchObject({ name: 'Asha Rao', email: 'asha@example.com' });
    expect(exported.aiReview).toMatchObject({ status: 'done' });
    expect(exported.answers.length).toBeGreaterThan(2);

    await manager.delete(`/api/candidates/${candidate.id}`).expect(200);
    expect(hasFiles(candidate.id)).toBe(false);
    const gone = await as(candidate.token).get(c(candidate.token)).expect(410);
    expect(gone.body.error).toMatch(/hiring team deleted/);
    const { body: activity } = await manager.get('/api/audit').expect(200);
    expect(activity.events[0]).toMatchObject({ actor: 'maya@acme.test', action: 'deleted a candidate’s data from' });
  });

  it('deletes recordings after the workspace’s retention period and keeps the answers', async () => {
    const { manager, candidate } = await finished();
    await manager.put('/api/privacy').send({ recordingDays: 45 }).expect(400);
    await manager.put('/api/privacy').send({ recordingDays: 365 }).expect(200);
    const files = localFileStore(uploadDir);

    clock += 200 * DAY;
    expect(await deleteOldRecordings(db, files, clock)).toBe(0);
    expect(hasFiles(candidate.id)).toBe(true);

    // Two hundred days on, the session has expired.
    await manager.post('/api/auth/login').send({ email: 'maya@acme.test', password: 'correct-horse' }).expect(200);
    await manager.put('/api/privacy').send({ recordingDays: 180 }).expect(200);
    expect(await deleteOldRecordings(db, files, clock)).toBe(1);
    expect(await deleteOldRecordings(db, files, clock)).toBe(0);
    expect(hasFiles(candidate.id)).toBe(false);

    const { body: report } = await manager.get(`/api/candidates/${candidate.id}`).expect(200);
    expect(report.candidate.recordingsDeletedAt).toBe(clock);
    const warmup = report.stages.find((s: { id: string }) => s.id === 'warmup');
    expect(warmup.response.audio).toEqual([]);
    expect(report.aiReview.status).toBe('done');
    await manager.get(`/api/candidates/${candidate.id}/audio/warmup`).expect(404);
    expect((await manager.get('/api/privacy').expect(200)).body.recordingsDeleted).toBe(1);
  });

  it('lets candidates delete their account; their invitation link then works without it', async () => {
    const { candidate } = await setup();
    const agent = as(candidate.token);
    await agent.post('/api/candidate/auth/delete-account').send({ password: 'wrong-password' }).expect(400);
    await start(candidate.token);
    await agent.post('/api/candidate/auth/delete-account').send({ password: 'candidate-pass' }).expect(200);
    expect((await agent.get('/api/candidate/auth/me').expect(200)).body.candidate).toBeNull();
    expect(await count('SELECT COUNT(*)::int AS n FROM candidate_accounts WHERE email = $1', 'asha@example.com')).toBe(
      0,
    );
    await request(app).get(c(candidate.token)).expect(200);
  });
});

describe('public apply link', () => {
  async function withLink() {
    const manager = await signup();
    const { body: created } = await manager
      .post('/api/assessments')
      .send({ title: 'Growth Marketer', roleFamilyId: 'performance-marketing', currency: 'INR' })
      .expect(201);
    const { body: link } = await manager
      .put(`/api/assessments/${created.id}/apply-link`)
      .send({ open: true })
      .expect(200);
    return { manager, assessmentId: created.id as string, token: link.token as string };
  }

  it('lets anyone apply while it is open, and gives them their own link', async () => {
    const { manager, assessmentId, token } = await withLink();
    await request(app).get('/api/apply/not-a-real-link').expect(404);
    const { body: preview } = await request(app).get(`/api/apply/${token}`).expect(200);
    expect(preview).toMatchObject({ orgName: 'Acme', title: 'Growth Marketer', thinkAloud: true });

    await request(app)
      .post(`/api/apply/${token}`)
      .send({ name: 'Bot', email: 'bot@x.com', website: 'spam' })
      .expect(400);
    const { body: applied } = await request(app)
      .post(`/api/apply/${token}`)
      .send({ name: 'Kiran Rao', email: 'kiran@example.com' })
      .expect(201);
    const session = (await request(app).get(c(applied.token)).expect(200)).body as CandidateSession;
    expect(session.candidate).toMatchObject({ name: 'Kiran Rao', email: 'kiran@example.com' });
    // The same person can't apply twice, and nobody learns their link by trying.
    const again = await request(app)
      .post(`/api/apply/${token}`)
      .send({ name: 'Kiran', email: 'KIRAN@example.com' })
      .expect(409);
    expect(JSON.stringify(again.body)).not.toContain(applied.token);

    const { body: detail } = await manager.get(`/api/assessments/${assessmentId}`).expect(200);
    expect(detail.applyLink).toEqual({ open: true, token });
    expect(detail.candidates).toHaveLength(1);
    expect(detail.candidates[0]).toMatchObject({ name: 'Kiran Rao', applied: true });
    const { body: activity } = await manager.get('/api/audit').expect(200);
    expect(activity.events[0]).toMatchObject({ actor: 'Apply link', target: 'Kiran Rao' });
  });

  it('stops taking applications once closed, keeping the same address', async () => {
    const { manager, assessmentId, token } = await withLink();
    const { body: closed } = await manager
      .put(`/api/assessments/${assessmentId}/apply-link`)
      .send({ open: false })
      .expect(200);
    expect(closed).toEqual({ open: false, token });
    await request(app).get(`/api/apply/${token}`).expect(410);
    await request(app).post(`/api/apply/${token}`).send({ name: 'Late', email: 'late@example.com' }).expect(410);
    const { body: reopened } = await manager
      .put(`/api/assessments/${assessmentId}/apply-link`)
      .send({ open: true })
      .expect(200);
    expect(reopened.token).toBe(token);
    // Only the workspace's own managers can change it.
    const other = await signup('Other Co', 'lee@other.test');
    await other.put(`/api/assessments/${assessmentId}/apply-link`).send({ open: false }).expect(404);
  });

  it('slows down one network address sending many applications', async () => {
    const { token } = await withLink();
    for (let i = 0; i < 10; i++) {
      await request(app)
        .post(`/api/apply/${token}`)
        .send({ name: `P ${i}`, email: `p${i}@example.com` })
        .expect(201);
    }
    await request(app).post(`/api/apply/${token}`).send({ name: 'P 10', email: 'p10@example.com' }).expect(429);
  });
});
