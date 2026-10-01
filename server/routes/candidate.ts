import express, { type Request, Router } from 'express';
import type { CandidateSession, InvitePreview } from '../../shared/candidateApi';
import { scaledTimeLimit } from '../../shared/render';
import type { CandidateStatus } from '../../shared/types';
import type { AppDeps } from '../app';
import {
  type CandidateContext,
  type CandidatePhase,
  LIMITS,
  appendAudioChunk,
  type FlowDeps,
  currentPhase,
  loadByToken,
  renderBrief,
  revealNext,
  saveAudio,
  saveDraft,
  start,
  submit,
} from '../candidateFlow';
import { CANDIDATE_COOKIE, type SessionCandidate, candidateForSession, readCookie } from '../auth';
import { run } from '../db';
import { HttpError, badRequest, jsonBody, str } from '../http';

function session(deps: FlowDeps, ctx: CandidateContext, state: CandidatePhase): CandidateSession {
  const minutes = ctx.family.stages.map((stage) => scaledTimeLimit(stage, ctx.candidate.time_multiplier) / 60);
  return {
    serverNow: deps.now(),
    candidate: {
      name: ctx.candidate.name,
      email: ctx.candidate.email,
      linkedToAccount: Boolean(ctx.candidate.account_id),
      status: ctx.candidate.status as CandidateStatus,
      timeMultiplier: ctx.candidate.time_multiplier,
    },
    assessment: {
      title: ctx.assessment.title,
      orgName: ctx.orgName,
      roleFamilyName: ctx.family.name,
      uniqueNumbers: !ctx.family.generated,
      totalMinutes: Math.round(minutes.reduce((a, b) => a + b, 0)),
      outline: ctx.family.stages.map((stage, i) => ({
        kind: stage.kind,
        minutes: Math.round(minutes[i] * 10) / 10,
        thinkAloud: Boolean(stage.thinkAloud),
      })),
    },
    brief: state.phase === 'intro' ? null : renderBrief(ctx),
    state,
  };
}

/**
 * The invite link is the candidate's key: it is a long random secret that
 * only the invited person receives, so it opens the assessment without an
 * account. Accounts are optional. A signed-in candidate with the invited
 * email has the invitation linked to their account on first visit, and from
 * then on it needs that account, so a forwarded link can't be used to read or
 * continue their answers.
 */
async function authorize(deps: AppDeps, ctx: CandidateContext, me: SessionCandidate | null) {
  const { candidate } = ctx;
  if (me && candidate.account_id === me.id) return;
  if (candidate.account_id) {
    throw new HttpError(
      403,
      `This invitation is linked to a candidate account. Log in as ${candidate.email} to continue.`,
    );
  }
  if (me && candidate.email.toLowerCase() === me.email.toLowerCase()) {
    await run(deps.db, 'UPDATE candidates SET account_id = ? WHERE id = ? AND account_id IS NULL', me.id, candidate.id);
    candidate.account_id = me.id;
  }
}

export function candidateRoutes(deps: AppDeps) {
  const router = Router();
  const json = jsonBody('512kb');

  /** Loads the invitation; the link opens it unless an account has claimed it. */
  const load = async (req: Request<{ token: string }>) => {
    const ctx = await loadByToken(deps.db, req.params.token);
    await authorize(deps, ctx, await candidateForSession(deps.db, readCookie(req, CANDIDATE_COOKIE), deps.now()));
    return ctx;
  };

  // Public: enough for the sign-in page to say who invited them.
  router.get('/:token/invite', async (req, res) => {
    const ctx = await loadByToken(deps.db, req.params.token);
    const preview: InvitePreview = {
      orgName: ctx.orgName,
      title: ctx.assessment.title,
      candidateName: ctx.candidate.name,
      email: ctx.candidate.email,
    };
    res.json(preview);
  });

  router.get('/:token', async (req, res) => {
    const ctx = await load(req);
    res.json(session(deps, ctx, await currentPhase(deps, ctx)));
  });

  router.post('/:token/start', json, async (req, res) => {
    const ctx = await load(req);
    if (req.body.consent !== true) throw badRequest('Please confirm you have read how this assessment works');
    const idName = str(req.body.idName, 'Name as it appears on your ID', { max: 120 });
    res.json(session(deps, ctx, await start(deps, ctx, idName)));
  });

  router.post('/:token/next', json, async (req, res) => {
    const ctx = await load(req);
    const index = Number(req.body.index);
    if (!Number.isInteger(index) || index < 0) throw badRequest('Question number is required');
    res.json(session(deps, ctx, await revealNext(deps, ctx, index)));
  });

  router.put('/:token/stages/:stageId/draft', json, async (req, res) => {
    const ctx = await load(req);
    await saveDraft(deps, ctx, req.params.stageId, req.body);
    res.json({ ok: true, serverNow: deps.now() });
  });

  router.post(
    '/:token/stages/:stageId/audio',
    express.raw({ type: ['audio/*'], limit: LIMITS.audioBytes }),
    async (req, res) => {
      const ctx = await load(req);
      await saveAudio(deps, ctx, req.params.stageId, req.body, req.headers['content-type'], Number(req.query.seconds));
      res.json({ ok: true });
    },
  );

  // Think-aloud audio, a few seconds at a time, appended in order.
  router.post('/:token/stages/:stageId/stream', express.raw({ type: ['audio/*'], limit: '4mb' }), async (req, res) => {
    const ctx = await load(req);
    const result = await appendAudioChunk(deps, ctx, req.params.stageId, req.body, req.headers['content-type'], {
      part: Number(req.query.part),
      seq: Number(req.query.seq),
      startMs: Number(req.query.startMs),
      sec: Number(req.query.sec),
    });
    res.json({ ok: true, ...result });
  });

  router.post('/:token/stages/:stageId/submit', json, async (req, res) => {
    const ctx = await load(req);
    res.json(session(deps, ctx, await submit(deps, ctx, req.params.stageId, req.body)));
  });

  return router;
}
