import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CandidateSession } from '../shared/candidateApi';
import { createApp } from '../server/app';
import { SUBMIT_GRACE_MS } from '../server/candidateFlow';
import { openDb } from '../server/db';

let clock = 1_750_000_000_000;
let uploadDir: string;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  clock = 1_750_000_000_000;
  uploadDir = mkdtempSync(path.join(tmpdir(), 'proofwork-test-'));
  app = createApp({ db: openDb(':memory:'), uploadDir, now: () => clock });
});

afterEach(() => {
  rmSync(uploadDir, { recursive: true, force: true });
});

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
  const res = await request(app)
    .post(`${c(token)}/stages/${stage.id}/submit`)
    .send(body)
    .expect(200);
  return res.body as CandidateSession;
}

/** Reveals and answers every remaining stage. */
async function completeAll(token: string, choices: Record<string, string> = {}) {
  let session = (await request(app).get(c(token)).expect(200)).body as CandidateSession;
  const stageIds = [
    'warmup',
    'first-read',
    'budget-cut',
    'two-weeks-later',
    'agency-plan',
    'founder-update',
    'real-decision',
  ];
  for (const stageId of stageIds) {
    if (session.state.phase === 'done') break;
    session = (
      await request(app)
        .post(`${c(token)}/next`)
        .send({ index: stageIds.indexOf(stageId) })
        .expect(200)
    ).body;
    session = await answerCurrent(token, session, choices[stageId] ? { choiceId: choices[stageId] } : {});
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
    const intro = (await request(app).get(c(candidate.token)).expect(200)).body as CandidateSession;
    expect(intro.state.phase).toBe('intro');
    expect(intro.brief).toBeNull();

    await request(app)
      .post(`${c(candidate.token)}/start`)
      .send({ idName: 'Asha Rao' })
      .expect(400);
    const started = (
      await request(app)
        .post(`${c(candidate.token)}/start`)
        .send({ idName: 'Asha Rao', consent: true })
        .expect(200)
    ).body as CandidateSession;
    expect(started.state).toMatchObject({ phase: 'ready', next: { index: 0, kind: 'warmup' } });
    // Nothing about an upcoming question is sent before it opens.
    expect(JSON.stringify(started.state)).not.toMatch(/title|warm-?up question|prompt/i);
    expect(started.brief?.length).toBeGreaterThan(0);

    // Cannot skip ahead.
    await request(app)
      .post(`${c(candidate.token)}/next`)
      .send({ index: 1 })
      .expect(409);

    const warmup = (
      await request(app)
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
      await request(app)
        .post(`${c(candidate.token)}/next`)
        .send({ index: 0 })
        .expect(200)
    ).body;
    expect(again.state.deadlineAt).toBe(warmup.state.deadlineAt);

    // Empty answers are rejected unless time ran out.
    await request(app)
      .post(`${c(candidate.token)}/stages/warmup/submit`)
      .send({})
      .expect(400);
    const next = await answerCurrent(candidate.token, warmup);
    expect(next.state).toMatchObject({ phase: 'ready', next: { index: 1 } });
  });

  it('resolves the branch prompt from the earlier decision', async () => {
    const { candidate } = await setup();
    await request(app)
      .post(`${c(candidate.token)}/start`)
      .send({ idName: 'Asha Rao', consent: true });
    let session: CandidateSession | undefined;
    for (const [index, stageId] of ['warmup', 'first-read', 'budget-cut'].entries()) {
      session = (
        await request(app)
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
      await request(app)
        .post(`${c(candidate.token)}/next`)
        .send({ index: 3 })
        .expect(200)
    ).body as CandidateSession;
    if (branch.state.phase !== 'stage') throw new Error('expected stage');
    expect(JSON.stringify(branch.state.stage.prompt)).toContain('Cancel all the contracts');
  });

  it('requires a choice on decision stages', async () => {
    const { candidate } = await setup();
    await request(app)
      .post(`${c(candidate.token)}/start`)
      .send({ idName: 'Asha Rao', consent: true });
    for (const index of [0, 1]) {
      const s = (
        await request(app)
          .post(`${c(candidate.token)}/next`)
          .send({ index })
      ).body;
      await answerCurrent(candidate.token, s);
    }
    await request(app)
      .post(`${c(candidate.token)}/next`)
      .send({ index: 2 })
      .expect(200);
    await request(app)
      .post(`${c(candidate.token)}/stages/budget-cut/submit`)
      .send({ text: 'Cut Meta' })
      .expect(400);
    await request(app)
      .post(`${c(candidate.token)}/stages/budget-cut/submit`)
      .send({ text: 'Cut Meta', choiceId: 'not-a-choice' })
      .expect(400);
  });

  it('closes a stage with the autosaved draft once time and grace run out', async () => {
    const { candidate, manager } = await setup();
    await request(app)
      .post(`${c(candidate.token)}/start`)
      .send({ idName: 'Asha Rao', consent: true });
    const warmup = (
      await request(app)
        .post(`${c(candidate.token)}/next`)
        .send({ index: 0 })
    ).body as CandidateSession;
    if (warmup.state.phase !== 'stage') throw new Error('expected stage');

    await request(app)
      .put(`${c(candidate.token)}/stages/warmup/draft`)
      .send({ text: 'half an answer' })
      .expect(200);

    clock = warmup.state.deadlineAt + SUBMIT_GRACE_MS + 1;
    await request(app)
      .post(`${c(candidate.token)}/stages/warmup/submit`)
      .send({ text: 'too late' })
      .expect(409);
    const after = (await request(app).get(c(candidate.token))).body as CandidateSession;
    expect(after.state).toMatchObject({ phase: 'ready', next: { index: 1 } });

    const report = (await manager.get(`/api/candidates/${candidate.id}`).expect(200)).body;
    expect(report.stages[0].response).toMatchObject({ closedReason: 'timeout', text: 'half an answer' });
  });

  it('accepts a submission inside the grace window and records the overtime', async () => {
    const { candidate, manager } = await setup();
    await request(app)
      .post(`${c(candidate.token)}/start`)
      .send({ idName: 'Asha Rao', consent: true });
    const warmup = (
      await request(app)
        .post(`${c(candidate.token)}/next`)
        .send({ index: 0 })
    ).body as CandidateSession;
    if (warmup.state.phase !== 'stage') throw new Error('expected stage');
    clock = warmup.state.deadlineAt + 20_000;
    await request(app)
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
    await request(app)
      .post(`${c(body.candidate.token)}/start`)
      .send({ idName: 'Ravi', consent: true });
    const s = (
      await request(app)
        .post(`${c(body.candidate.token)}/next`)
        .send({ index: 0 })
    ).body;
    expect(s.state.stage.timeLimitSec).toBe(180);
    expect(s.state.deadlineAt - s.serverNow).toBe(180_000);
  });

  it('stores voice notes and serves them only to the right org', async () => {
    const { candidate, manager } = await setup();
    await request(app)
      .post(`${c(candidate.token)}/start`)
      .send({ idName: 'Asha Rao', consent: true });
    await request(app)
      .post(`${c(candidate.token)}/next`)
      .send({ index: 0 });
    await request(app)
      .post(`${c(candidate.token)}/stages/warmup/audio?seconds=12`)
      .set('Content-Type', 'audio/webm')
      .send(Buffer.from('fake-audio-bytes'))
      .expect(200);
    await request(app)
      .post(`${c(candidate.token)}/stages/warmup/audio`)
      .set('Content-Type', 'text/plain')
      .send('nope')
      .expect(400);
    // A voice note alone is a valid answer.
    await request(app)
      .post(`${c(candidate.token)}/stages/warmup/submit`)
      .send({})
      .expect(200);

    const report = (await manager.get(`/api/candidates/${candidate.id}`)).body;
    expect(report.stages[0].response.audioSec).toBe(12);
    const audio = await manager.get(report.stages[0].response.audioUrl).expect(200);
    expect(audio.headers['content-type']).toContain('audio/webm');

    const outsider = await signup('Other Co', 'eve@other.test');
    await outsider.get(report.stages[0].response.audioUrl).expect(404);
    await outsider.get(`/api/candidates/${candidate.id}`).expect(404);
  });

  it('marks the attempt submitted after the last stage', async () => {
    const { candidate, manager, assessmentId } = await setup();
    await request(app)
      .post(`${c(candidate.token)}/start`)
      .send({ idName: 'Asha Rao', consent: true });
    const final = await completeAll(candidate.token);
    expect(final.state.phase).toBe('done');
    const detail = (await manager.get(`/api/assessments/${assessmentId}`)).body;
    expect(detail.candidates[0].status).toBe('submitted');
  });
});

describe('review and verification', () => {
  function fullScores(report: { stages: { id: string; scored: boolean; rubric: { id: string }[] }[] }, value: number) {
    return Object.fromEntries(
      report.stages
        .filter((s) => s.scored)
        .map((s) => [s.id, Object.fromEntries(s.rubric.map((cr) => [cr.id, value]))]),
    );
  }

  it('keeps reviews blind until you submit your own', async () => {
    const { candidate, manager } = await setup();
    await request(app)
      .post(`${c(candidate.token)}/start`)
      .send({ idName: 'Asha Rao', consent: true });
    await completeAll(candidate.token, { 'budget-cut': 'meta' });

    await manager
      .post('/api/team')
      .send({ name: 'Rohan', email: 'rohan@acme.test', password: 'reviewer-pass', role: 'reviewer' })
      .expect(201);
    const reviewer = request.agent(app);
    await reviewer.post('/api/auth/login').send({ email: 'rohan@acme.test', password: 'reviewer-pass' }).expect(200);
    await reviewer
      .post('/api/assessments')
      .send({ title: 'x', roleFamilyId: 'performance-marketing', currency: 'INR' })
      .expect(403);

    const report = (await manager.get(`/api/candidates/${candidate.id}`)).body;
    await manager
      .put(`/api/candidates/${candidate.id}/review`)
      .send({ scores: fullScores(report, 2), recommendation: 'advance', submit: false })
      .expect(200);
    await manager
      .put(`/api/candidates/${candidate.id}/review`)
      .send({ scores: { 'first-read': { numbers: 4 } }, recommendation: 'advance', submit: true })
      .expect(400);
    const submitted = (
      await manager
        .put(`/api/candidates/${candidate.id}/review`)
        .send({ scores: fullScores(report, 4), recommendation: 'advance', notes: 'Strong', submit: true })
        .expect(200)
    ).body;
    expect(submitted.myReview.overall).toBe(4);
    expect(submitted.candidate.status).toBe('reviewed');

    const blind = (await reviewer.get(`/api/candidates/${candidate.id}`)).body;
    expect(blind.otherReviews).toEqual([]);
    expect(blind.hiddenReviews).toBe(1);
    expect(blind.teamScore).toBeNull();

    const reviewed = (
      await reviewer
        .put(`/api/candidates/${candidate.id}/review`)
        .send({ scores: fullScores(report, 2), recommendation: 'hold', submit: true })
        .expect(200)
    ).body;
    expect(reviewed.otherReviews).toHaveLength(1);
    expect(reviewed.teamScore).toBe(3);

    await reviewer.put(`/api/candidates/${candidate.id}/decision`).send({ decision: 'advance' }).expect(403);
    const decided = (
      await manager.put(`/api/candidates/${candidate.id}/decision`).send({ decision: 'advance' }).expect(200)
    ).body;
    expect(decided.candidate).toMatchObject({ status: 'decided', decision: 'advance' });
  });

  it('builds a verification script from the candidate answers and records the outcome', async () => {
    const { candidate, manager } = await setup();
    await request(app)
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

  it('refuses reviews before the candidate finishes', async () => {
    const { candidate, manager } = await setup();
    await manager.put(`/api/candidates/${candidate.id}/review`).send({ scores: {} }).expect(409);
  });
});

describe('role library', () => {
  it('previews every branch of a role family with a chosen seed', async () => {
    const manager = await signup();
    const { body } = await manager.get('/api/role-families').expect(200);
    expect(body.families.map((f: { id: string }) => f.id)).toEqual(['performance-marketing', 'customer-support-lead']);

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
