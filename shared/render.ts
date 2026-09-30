import type { CandidateStageView, RoleFamily, StageContext, StageDef } from './types';

export function scaledTimeLimit(stage: StageDef, timeMultiplier: number): number {
  return Math.round(stage.timeLimitSec * timeMultiplier);
}

/** Everything a candidate may see for one stage. No rubric anchors, no reviewer guide. */
export function renderStageForCandidate(
  stage: StageDef,
  index: number,
  ctx: StageContext,
  timeMultiplier: number,
): CandidateStageView {
  return {
    id: stage.id,
    index,
    kind: stage.kind,
    title: stage.title,
    timeLimitSec: scaledTimeLimit(stage, timeMultiplier),
    voiceMaxSec: stage.voiceMaxSec,
    preferVoice: stage.preferVoice,
    choices: stage.choices,
    prompt: stage.prompt(ctx),
    material: stage.material?.(ctx) ?? [],
    lookingFor: stage.rubric.map((criterion) => criterion.label),
  };
}

/** Choices made so far, so branch stages can resolve their prompt. */
export function choicesFrom(responses: { stageId: string; choiceId: string | null }[]) {
  const choices: Record<string, string | undefined> = {};
  for (const response of responses) {
    if (response.choiceId) choices[response.stageId] = response.choiceId;
  }
  return choices;
}

export function stageOutline(family: RoleFamily) {
  return family.stages.map((stage) => ({
    id: stage.id,
    kind: stage.kind,
    title: stage.title,
    timeLimitSec: stage.timeLimitSec,
    scored: stage.scored,
  }));
}
