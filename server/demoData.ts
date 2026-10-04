/**
 * Writes the role content the static demo needs into web/src/demo/content, so the
 * browser never imports role families (and their answer keys).
 *
 * - library.json: what the role library shows about every role.
 * - previews/<id>.json: one sample version of each role. Answer keys and rubrics
 *   are kept only for the roles the demo's sample candidates are reviewed on,
 *   which their reports show anyway.
 * - candidate.json: what a candidate sees in the short candidate demo.
 *
 * Run `npm run demo-data` after changing a role family; a test checks the files are current.
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PreviewStage, RoleFamilyPreview, RoleFamilySummary } from '../shared/api';
import { choiceKey, type DemoCandidateData } from '../shared/demo';
import { familySummary, buildPreview } from '../shared/library';
import { renderStageForCandidate } from '../shared/render';
import { ROLE_FAMILIES, getRoleFamily } from '../shared/roleFamilies';
import type { Block, CandidateStageView, Currency } from '../shared/types';
import { buildContext, generateVariant } from '../shared/variants';

export const DEMO_DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../web/src/demo/content');

/** Roles with sample candidates in the demo: their full answer key is already in those reports. */
export const FULL_PREVIEW_FAMILIES = ['performance-marketing', 'customer-support-lead'];
export const PREVIEW_SEED = 20_240_611;

/** The candidate demo: a short version of a real assessment with timers halved. */
export const CANDIDATE_DEMO = {
  familyId: 'performance-marketing',
  stageIds: ['first-read', 'budget-cut', 'two-weeks-later', 'founder-update'],
  timeMultiplier: 0.5,
  seed: 20_240_611,
  currency: 'INR' as Currency,
};

export const HIDDEN_GUIDE: Block[] = [
  {
    type: 'callout',
    tone: 'info',
    text: 'The answer key and rubric are hidden in the demo. Start free to see them for every role.',
  },
];

function stripAnswerKey(preview: RoleFamilyPreview): RoleFamilyPreview {
  const stages: PreviewStage[] = preview.stages.map((stage) => ({
    ...stage,
    variants: stage.variants.map((variant) => ({ ...variant, reviewerGuide: HIDDEN_GUIDE })),
    rubric: [],
  }));
  return { ...preview, stages };
}

function candidateData(): DemoCandidateData {
  const base = getRoleFamily(CANDIDATE_DEMO.familyId)!;
  const family = { ...base, stages: base.stages.filter((s) => CANDIDATE_DEMO.stageIds.includes(s.id)) };
  const { seed, currency, timeMultiplier } = CANDIDATE_DEMO;
  const variant = generateVariant(family, seed, currency);
  // Every combination of earlier decisions, including running out of time without choosing.
  let combos: Record<string, string | undefined>[] = [{}];
  const stages = family.stages.map((stage, index) => {
    const views: Record<string, CandidateStageView> = {};
    for (const choices of combos) {
      views[choiceKey(choices)] = renderStageForCandidate(
        stage,
        index,
        buildContext(variant, currency, choices),
        timeMultiplier,
      );
    }
    if (stage.choices?.length) {
      combos = combos.flatMap((choices) => [
        choices,
        ...stage.choices!.map((choice) => ({ ...choices, [stage.id]: choice.id })),
      ]);
    }
    return {
      id: stage.id,
      kind: stage.kind,
      thinkAloud: Boolean(stage.thinkAloud),
      timeLimitSec: views[''].timeLimitSec,
      views,
    };
  });
  return { familyName: family.name, timeMultiplier, brief: family.brief(buildContext(variant, currency)), stages };
}

/** Every demo data file, by path relative to DEMO_DATA_DIR. */
export function buildDemoData(): Record<string, unknown> {
  const files: Record<string, unknown> = {};
  const library: RoleFamilySummary[] = ROLE_FAMILIES.map(familySummary);
  files['library.json'] = library;
  for (const family of ROLE_FAMILIES) {
    const full = FULL_PREVIEW_FAMILIES.includes(family.id);
    const preview = (currency: Currency) => {
      const p = buildPreview(family, PREVIEW_SEED, currency);
      return full ? p : stripAnswerKey(p);
    };
    files[`previews/${family.id}.json`] = { INR: preview('INR'), USD: preview('USD') };
  }
  files['candidate.json'] = candidateData();
  return files;
}

export function writeDemoData() {
  rmSync(path.join(DEMO_DATA_DIR, 'previews'), { recursive: true, force: true });
  for (const [file, data] of Object.entries(buildDemoData())) {
    const full = path.join(DEMO_DATA_DIR, file);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, `${JSON.stringify(data)}\n`);
  }
  return readdirSync(path.join(DEMO_DATA_DIR, 'previews')).length;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const previews = writeDemoData();
  console.log(`Wrote the demo's role data: library, ${previews} previews and the candidate demo.`);
}
