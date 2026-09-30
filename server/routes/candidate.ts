import express, { Router } from 'express';
import type { CandidateSession } from '../../shared/candidateApi';
import { scaledTimeLimit } from '../../shared/render';
import type { CandidateStatus } from '../../shared/types';
import type { AppDeps } from '../app';
import {
  type CandidateContext,
  type CandidatePhase,
  LIMITS,
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
import { badRequest, jsonBody, str } from '../http';

function session(deps: FlowDeps, ctx: CandidateContext, state: CandidatePhase): CandidateSession {
  const minutes = ctx.family.stages.map((stage) => scaledTimeLimit(stage, ctx.candidate.time_multiplier) / 60);
  return {
    serverNow: deps.now(),
    candidate: {
      name: ctx.candidate.name,
      status: ctx.candidate.status as CandidateStatus,
      timeMultiplier: ctx.candidate.time_multiplier,
    },
    assessment: {
      title: ctx.assessment.title,
      orgName: ctx.orgName,
      roleFamilyName: ctx.family.name,
      totalMinutes: Math.round(minutes.reduce((a, b) => a + b, 0)),
      outline: ctx.family.stages.map((stage, i) => ({ kind: stage.kind, minutes: Math.round(minutes[i] * 10) / 10 })),
    },
    brief: state.phase === 'intro' ? null : renderBrief(ctx),
    state,
  };
}

export function candidateRoutes(deps: AppDeps) {
  const router = Router();
  const json = jsonBody('512kb');

  router.get('/:token', (req, res) => {
    const ctx = loadByToken(deps.db, req.params.token);
    res.json(session(deps, ctx, currentPhase(deps, ctx)));
  });

  router.post('/:token/start', json, (req, res) => {
    const ctx = loadByToken(deps.db, req.params.token);
    if (req.body.consent !== true) throw badRequest('Please confirm you have read how this assessment works');
    const idName = str(req.body.idName, 'Name as it appears on your ID', { max: 120 });
    res.json(session(deps, ctx, start(deps, ctx, idName)));
  });

  router.post('/:token/next', json, (req, res) => {
    const ctx = loadByToken(deps.db, req.params.token);
    const index = Number(req.body.index);
    if (!Number.isInteger(index) || index < 0) throw badRequest('Question number is required');
    res.json(session(deps, ctx, revealNext(deps, ctx, index)));
  });

  router.put('/:token/stages/:stageId/draft', json, (req, res) => {
    const ctx = loadByToken(deps.db, req.params.token);
    saveDraft(deps, ctx, req.params.stageId, req.body);
    res.json({ ok: true, serverNow: deps.now() });
  });

  router.post(
    '/:token/stages/:stageId/audio',
    express.raw({ type: ['audio/*'], limit: LIMITS.audioBytes }),
    (req, res) => {
      const ctx = loadByToken(deps.db, req.params.token);
      saveAudio(deps, ctx, req.params.stageId, req.body, req.headers['content-type'], Number(req.query.seconds));
      res.json({ ok: true });
    },
  );

  router.post('/:token/stages/:stageId/submit', json, (req, res) => {
    const ctx = loadByToken(deps.db, req.params.token);
    res.json(session(deps, ctx, submit(deps, ctx, req.params.stageId, req.body)));
  });

  return router;
}
