import type { PreviewStage, RoleFamilyPreview, RoleFamilySummary } from './api';
import { totalTimeSec } from './roleFamilies';
import { stageOutline } from './render';
import type { Currency, RoleFamily } from './types';
import { buildContext, generateVariant } from './variants';

/** What the role library shows about a role family. */
export function familySummary(family: RoleFamily): RoleFamilySummary {
  return {
    id: family.id,
    name: family.name,
    roles: family.roles,
    summary: family.summary,
    totalMinutes: Math.round(totalTimeSec(family) / 60),
    stages: stageOutline(family),
    ...(family.generated ? { generated: true } : {}),
    ...(family.catalog ? { catalog: family.catalog } : {}),
    ...(family.fixedCurrency ? { fixedCurrency: family.fixedCurrency } : {}),
  };
}

/** One sample version of a scenario, with every branch and the answer key, for recruiters to preview. */
export function buildPreview(family: RoleFamily, seed: number, currency: Currency): RoleFamilyPreview {
  const variant = generateVariant(family, seed, currency);
  const baseCtx = buildContext(variant, currency);
  const stages: PreviewStage[] = family.stages.map((stage) => {
    const source = stage.dependsOn ? family.stages.find((s) => s.id === stage.dependsOn) : undefined;
    const options = source?.choices?.length ? source.choices : [null];
    return {
      id: stage.id,
      kind: stage.kind,
      title: stage.title,
      timeLimitSec: stage.timeLimitSec,
      scored: stage.scored,
      choices: stage.choices,
      variants: options.map((choice) => {
        const ctx = choice ? buildContext(variant, currency, { [source!.id]: choice.id }) : baseCtx;
        return {
          label: choice ? `If they chose "${choice.label}"` : null,
          prompt: stage.prompt(ctx),
          reviewerGuide: stage.reviewerGuide(ctx),
        };
      }),
      material: stage.material?.(baseCtx) ?? [],
      rubric: stage.rubric,
    };
  });
  return { family: familySummary(family), seed, currency, brief: family.brief(baseCtx), stages };
}
