import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CandidateSession } from '../shared/candidateApi';
import type { AiConfig, ChatRequest } from '../server/ai/client';
import type { ReviewQueue } from '../server/ai/queue';
import { type GenerationQueue, exampleSpec } from '../server/ai/generateFamily';
import { contentBrand } from '../shared/roleFamilies/contentBrand';
import { createApp } from '../server/app';
import { SUBMIT_GRACE_MS } from '../server/candidateFlow';
import { localFileStore } from '../server/files';
import { type DB, fromPgPool } from '../server/db';
import { openLocalDb } from '../server/localDb';

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
       responses, audio_parts, ai_reviews, transcripts, verifications, custom_families CASCADE`,
  );
  return sharedPg;
}

let clock = 1_750_000_000_000;
let uploadDir: string;
let app: ReturnType<typeof createApp>['app'];
let reviews: ReviewQueue;
let generations: GenerationQueue;
let ai: FakeAi;

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
  ({ app, reviews, generations } = createApp({
    db: await testDb(),
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
        .send({ idName: 'Asha Rao', consent: true })
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
      .send({ idName: 'Asha Rao', consent: true });
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
      .send({ idName: 'Asha Rao', consent: true });
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
      .send({ idName: 'Asha Rao', consent: true });
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
      .send({ idName: 'Asha Rao', consent: true });
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
      .send({ idName: 'Ravi', consent: true });
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
      .send({ idName: 'Asha Rao', consent: true });
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
      .send({ idName: 'Asha Rao', consent: true });
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
      .send({ idName: 'Asha Rao', consent: true });
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
  it('requires the invited candidate to sign in, then links the invitation to their account', async () => {
    const { candidate, manager, assessmentId } = await setup();
    const token = candidate.token;

    // The invite page can say who invited them without signing in...
    const invite = (
      await request(app)
        .get(`${c(token)}/invite`)
        .expect(200)
    ).body;
    expect(invite).toMatchObject({ orgName: 'Acme', candidateName: 'Asha Rao', email: 'asha@example.com' });
    // ...but nothing else is reachable anonymously.
    await request(app).get(c(token)).expect(401);

    // Someone else's account can't use the link.
    const stranger = request.agent(app);
    await stranger
      .post('/api/candidate/auth/signup')
      .send({ name: 'Eve', email: 'eve@example.com', password: 'candidate-pass' })
      .expect(201);
    const refused = await stranger.get(c(token)).expect(403);
    expect(refused.body.error).toContain('asha@example.com');

    // The invited account sees it on their dashboard and can start.
    const mine = (await as(token).get('/api/candidate/assessments').expect(200)).body.assessments;
    expect(mine).toEqual([expect.objectContaining({ token, title: 'Growth Marketer, Bengaluru', status: 'invited' })]);
    await as(token).get(c(token)).expect(200);
    expect((await stranger.get('/api/candidate/assessments')).body.assessments).toEqual([]);

    // Recruiter and candidate sessions are separate.
    await as(token).get('/api/assessments').expect(401);
    await manager.get(c(token)).expect(401);
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
      .send({ idName: 'Ravi', consent: true });
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
      .send({ idName: 'Asha Rao', consent: true });
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
        .send({ idName: 'Asha', consent: true })
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
      .send({ idName: 'Asha Rao', consent: true });
    await completeAll(ctx.candidate.token, choices);
    return ctx;
  }

  it('reviews a submitted candidate: transcripts, rubric scores, summary and recommendation', async () => {
    const ctx = await setup();
    const token = ctx.candidate.token;
    await as(token)
      .post(`${c(token)}/start`)
      .send({ idName: 'Asha Rao', consent: true });
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
      .send({ idName: 'Asha Rao', consent: true });
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
      .send({ idName: 'Asha Rao', consent: true });
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
    expect(body.families.map((f: { id: string }) => f.id)).toEqual([
      'performance-marketing',
      'content-brand',
      'seo',
      'social-media',
      'customer-support-lead',
    ]);

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
      .send({ idName: 'Ravi', consent: true })
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

  it('records a failure clearly, can be retried, and can be deleted', async () => {
    const manager = await signup();
    ai.invalidSpecs = 2;
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
