import type { Block, Choice, Criterion, Currency, RoleFamily, StageDef, StageKind } from '../types';
import { pastWorkStage, warmupStage } from './common';

/**
 * An AI-generated role family. Unlike the hand-written families it is static:
 * every candidate sees the same numbers, because a generated scenario has no
 * generator code to vary them safely. The warm-up and past-work stages come
 * from the shared helpers; the model writes everything in between.
 */
export type SpecStageKind = Extract<StageKind, 'scenario' | 'decision' | 'branch' | 'critique' | 'ai_allowed'>;

export interface SpecBranch {
  prompt: Block[];
  reviewerGuide: Block[];
}

export interface SpecStage {
  id: string;
  kind: SpecStageKind;
  title: string;
  summary: string;
  timeLimitSec: number;
  thinkAloud?: boolean;
  prompt: Block[];
  material?: Block[];
  reviewerGuide: Block[];
  rubric: Criterion[];
  followUps: string[];
  /** Decision stages: the options. */
  choices?: Choice[];
  /** Branch stages: the decision this follows, and what happens for each of its choices. */
  dependsOn?: string;
  branches?: Record<string, SpecBranch>;
}

export interface FamilySpec {
  name: string;
  roles: string[];
  summary: string;
  currency: Currency;
  brief: Block[];
  warmups: string[];
  pastWorkQuestion: string;
  stages: SpecStage[];
}

export class SpecError extends Error {
  constructor(public issues: string[]) {
    super(`The generated scenario is invalid: ${issues.slice(0, 5).join('; ')}${issues.length > 5 ? '; …' : ''}`);
  }
}

const KINDS: SpecStageKind[] = ['scenario', 'decision', 'branch', 'critique', 'ai_allowed'];
const RESERVED_IDS = ['warmup', 'past-work'];
const ID = /^[a-z][a-z0-9-]{1,39}$/;
const TIME_LIMITS = { min: 120, max: 900 };

type Issues = string[];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(issues: Issues, where: string, value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim()) {
    issues.push(`${where} must be non-empty text`);
    return '';
  }
  if (value.length > max) issues.push(`${where} is longer than ${max} characters`);
  return value.trim();
}

function texts(issues: Issues, where: string, value: unknown, min: number, max: number, maxLength: number): string[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    issues.push(`${where} must be a list of ${min}–${max} items`);
    return [];
  }
  return value.map((item, i) => text(issues, `${where}[${i}]`, item, maxLength));
}

function block(issues: Issues, where: string, value: unknown): Block | null {
  if (!isObject(value)) {
    issues.push(`${where} must be an object`);
    return null;
  }
  switch (value.type) {
    case 'p':
    case 'h':
      return { type: value.type, text: text(issues, `${where}.text`, value.text, 2000) };
    case 'callout':
      return { type: 'callout', text: text(issues, `${where}.text`, value.text, 2000) };
    case 'quote': {
      const quote: Block = { type: 'quote', text: text(issues, `${where}.text`, value.text, 3000) };
      if (typeof value.cite === 'string' && value.cite.trim()) quote.cite = value.cite.trim().slice(0, 200);
      return quote;
    }
    case 'list':
      return {
        type: 'list',
        items: texts(issues, `${where}.items`, value.items, 1, 12, 1000),
        ...(value.ordered === true ? { ordered: true } : {}),
      };
    case 'table': {
      const columns = texts(issues, `${where}.columns`, value.columns, 2, 8, 120);
      if (!Array.isArray(value.rows) || value.rows.length < 1 || value.rows.length > 20) {
        issues.push(`${where}.rows must have 1–20 rows`);
        return null;
      }
      const rows = value.rows.map((row, i) => {
        const cells = Array.isArray(row) ? row.map((cell) => (typeof cell === 'number' ? String(cell) : cell)) : row;
        const result = texts(issues, `${where}.rows[${i}]`, cells, columns.length, columns.length, 200);
        return result;
      });
      const table: Block = { type: 'table', columns, rows };
      if (typeof value.caption === 'string' && value.caption.trim()) table.caption = value.caption.trim().slice(0, 200);
      return table;
    }
    default:
      issues.push(`${where}.type must be one of p, h, list, table, quote, callout`);
      return null;
  }
}

function blocks(issues: Issues, where: string, value: unknown, min = 1, max = 20): Block[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    issues.push(`${where} must be a list of ${min}–${max} blocks`);
    return [];
  }
  return value.map((b, i) => block(issues, `${where}[${i}]`, b)).filter((b): b is Block => b !== null);
}

function rubric(issues: Issues, where: string, value: unknown): Criterion[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 4) {
    issues.push(`${where} must have 1–4 criteria`);
    return [];
  }
  const ids = new Set<string>();
  return value.map((raw, i) => {
    const at = `${where}[${i}]`;
    if (!isObject(raw)) {
      issues.push(`${at} must be an object`);
      return { id: `c${i}`, label: '', weight: 1, anchors: ['', '', '', ''] };
    }
    const id = typeof raw.id === 'string' && ID.test(raw.id) ? raw.id : '';
    if (!id) issues.push(`${at}.id must be a lowercase slug`);
    if (ids.has(id)) issues.push(`${at}.id "${id}" is repeated`);
    ids.add(id);
    if (raw.weight !== 1 && raw.weight !== 2) issues.push(`${at}.weight must be 1 or 2`);
    const anchors = texts(issues, `${at}.anchors`, raw.anchors, 4, 4, 400);
    return {
      id,
      label: text(issues, `${at}.label`, raw.label, 80),
      weight: raw.weight === 2 ? 2 : 1,
      anchors: [anchors[0] ?? '', anchors[1] ?? '', anchors[2] ?? '', anchors[3] ?? ''],
    };
  });
}

function choices(issues: Issues, where: string, value: unknown): Choice[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 5) {
    issues.push(`${where} must have 2–5 options`);
    return [];
  }
  const ids = new Set<string>();
  return value.map((raw, i) => {
    const at = `${where}[${i}]`;
    const id = isObject(raw) && typeof raw.id === 'string' && ID.test(raw.id) ? raw.id : '';
    if (!id) issues.push(`${at}.id must be a lowercase slug`);
    if (ids.has(id)) issues.push(`${at}.id "${id}" is repeated`);
    ids.add(id);
    return { id, label: text(issues, `${at}.label`, isObject(raw) ? raw.label : undefined, 160) };
  });
}

function stage(issues: Issues, raw: unknown, index: number, earlier: SpecStage[]): SpecStage | null {
  const where = `stages[${index}]`;
  if (!isObject(raw)) {
    issues.push(`${where} must be an object`);
    return null;
  }
  const id = typeof raw.id === 'string' && ID.test(raw.id) && !RESERVED_IDS.includes(raw.id) ? raw.id : '';
  if (!id) issues.push(`${where}.id must be a lowercase slug other than ${RESERVED_IDS.join(' or ')}`);
  if (earlier.some((s) => s.id === id)) issues.push(`${where}.id "${id}" is repeated`);
  const kind = KINDS.includes(raw.kind as SpecStageKind) ? (raw.kind as SpecStageKind) : null;
  if (!kind) {
    issues.push(`${where}.kind must be one of ${KINDS.join(', ')}`);
    return null;
  }
  const timeLimitSec = typeof raw.timeLimitSec === 'number' ? Math.round(raw.timeLimitSec) : NaN;
  if (!(timeLimitSec >= TIME_LIMITS.min && timeLimitSec <= TIME_LIMITS.max)) {
    issues.push(`${where}.timeLimitSec must be between ${TIME_LIMITS.min} and ${TIME_LIMITS.max}`);
  }
  const result: SpecStage = {
    id,
    kind,
    title: text(issues, `${where}.title`, raw.title, 80),
    summary: text(issues, `${where}.summary`, raw.summary, 300),
    timeLimitSec: Number.isFinite(timeLimitSec) ? timeLimitSec : TIME_LIMITS.min,
    // The AI-allowed task keeps the candidate's AI conversation instead of a recording.
    thinkAloud: kind !== 'ai_allowed' && raw.thinkAloud === true,
    prompt: [],
    reviewerGuide: [],
    rubric: rubric(issues, `${where}.rubric`, raw.rubric),
    followUps: texts(issues, `${where}.followUps`, raw.followUps, 1, 4, 300),
  };
  if (raw.material !== undefined && raw.material !== null) {
    result.material = blocks(issues, `${where}.material`, raw.material);
  }
  if (kind === 'decision') result.choices = choices(issues, `${where}.choices`, raw.choices);

  if (kind === 'branch') {
    const source = earlier.find((s) => s.id === raw.dependsOn && s.kind === 'decision');
    if (!source) {
      issues.push(`${where}.dependsOn must name an earlier decision stage`);
      return result;
    }
    result.dependsOn = source.id;
    result.branches = {};
    const branches = isObject(raw.branches) ? raw.branches : {};
    for (const choice of source.choices ?? []) {
      const branch = branches[choice.id];
      const at = `${where}.branches.${choice.id}`;
      if (!isObject(branch)) {
        issues.push(`${at} is missing: every option of "${source.id}" needs its own situation`);
        continue;
      }
      result.branches[choice.id] = {
        prompt: blocks(issues, `${at}.prompt`, branch.prompt),
        reviewerGuide: blocks(issues, `${at}.reviewerGuide`, branch.reviewerGuide),
      };
    }
  } else {
    result.prompt = blocks(issues, `${where}.prompt`, raw.prompt);
    result.reviewerGuide = blocks(issues, `${where}.reviewerGuide`, raw.reviewerGuide);
  }
  if (kind === 'critique' && !result.material?.length) issues.push(`${where}.material must hold the work to critique`);
  return result;
}

/** Checks a model's output strictly; anything off is reported so the model can fix it. */
export function parseFamilySpec(raw: unknown, currency: Currency): FamilySpec {
  const issues: Issues = [];
  if (!isObject(raw)) throw new SpecError(['The scenario must be a JSON object']);
  const stages: SpecStage[] = [];
  if (!Array.isArray(raw.stages) || raw.stages.length < 3 || raw.stages.length > 7) {
    issues.push('stages must be a list of 3–7 stages');
  } else {
    raw.stages.forEach((s, i) => {
      const parsed = stage(issues, s, i, stages);
      if (parsed) stages.push(parsed);
    });
    for (const kind of ['scenario', 'decision', 'critique', 'ai_allowed'] as const) {
      if (!stages.some((s) => s.kind === kind)) issues.push(`stages need at least one "${kind}" stage`);
    }
  }
  const spec: FamilySpec = {
    name: text(issues, 'name', raw.name, 60),
    roles: texts(issues, 'roles', raw.roles, 1, 4, 80),
    summary: text(issues, 'summary', raw.summary, 400),
    currency,
    brief: blocks(issues, 'brief', raw.brief, 2, 12),
    warmups: texts(issues, 'warmups', raw.warmups, 2, 4, 300),
    pastWorkQuestion: text(issues, 'pastWorkQuestion', raw.pastWorkQuestion, 300),
    stages,
  };
  if (issues.length) throw new SpecError(issues);
  return spec;
}

const VOICE_MAX: Record<SpecStageKind, number> = {
  scenario: 120,
  decision: 150,
  branch: 120,
  critique: 180,
  ai_allowed: 0,
};

function specStage(spec: SpecStage): StageDef {
  const branchFor = (choices: Record<string, string | undefined>) => {
    const choice = (spec.dependsOn && choices[spec.dependsOn]) || Object.keys(spec.branches ?? {})[0];
    return spec.branches?.[choice] ?? { prompt: [], reviewerGuide: [] };
  };
  return {
    id: spec.id,
    kind: spec.kind,
    title: spec.title,
    summary: spec.summary,
    timeLimitSec: spec.timeLimitSec,
    voiceMaxSec: VOICE_MAX[spec.kind],
    preferVoice: spec.kind !== 'critique' && spec.kind !== 'ai_allowed',
    thinkAloud: spec.thinkAloud || undefined,
    scored: true,
    choices: spec.choices,
    dependsOn: spec.dependsOn,
    prompt: (ctx) => (spec.kind === 'branch' ? branchFor(ctx.choices).prompt : spec.prompt),
    material: spec.material ? () => spec.material! : undefined,
    reviewerGuide: (ctx) => (spec.kind === 'branch' ? branchFor(ctx.choices).reviewerGuide : spec.reviewerGuide),
    rubric: spec.rubric,
    followUps: () => spec.followUps,
  };
}

/** The runtime role family for a stored spec. */
export function familyFromSpec(id: string, spec: FamilySpec): RoleFamily {
  return {
    id,
    version: 1,
    name: spec.name,
    roles: spec.roles,
    summary: spec.summary,
    generated: true,
    fixedCurrency: spec.currency,
    generate: () => ({}),
    brief: () => spec.brief,
    warmups: spec.warmups,
    stages: [
      warmupStage(),
      ...spec.stages.map(specStage),
      pastWorkStage({
        id: 'past-work',
        title: 'A real example',
        summary: 'A real story from their career. Checks specificity and ownership.',
        question: spec.pastWorkQuestion,
      }),
    ],
  };
}
