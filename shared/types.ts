// Core domain types shared by the server and the web client.

export type Currency = 'INR' | 'USD';

/**
 * Content is authored as structured blocks rather than free-form HTML so the
 * same scenario renders identically for candidates, reviewers and previews.
 * Inline `**bold**` is supported inside text.
 */
export type Block =
  | { type: 'p'; text: string }
  | { type: 'h'; text: string }
  | { type: 'list'; items: string[]; ordered?: boolean }
  | { type: 'table'; columns: string[]; rows: string[][]; caption?: string }
  | { type: 'quote'; text: string; cite?: string }
  | { type: 'callout'; text: string; tone?: 'info' | 'warn' };

/**
 * warmup      short spontaneous answer; unscored, gives the interviewer a voice sample
 * scenario    open question about the scenario, answered under a time box
 * decision    candidate must commit to one option and justify it
 * branch      the situation changes depending on an earlier decision
 * critique    find the flaws in a plausible plan whose mistakes only show given the scenario
 * ai_allowed  any AI tool may be used; candidate submits the transcript and is graded on judgment
 * past_work   a real decision from their career, verified live on the call
 */
export type StageKind = 'warmup' | 'scenario' | 'decision' | 'branch' | 'critique' | 'ai_allowed' | 'past_work';

export const STAGE_KIND_LABEL: Record<StageKind, string> = {
  warmup: 'Warm-up',
  scenario: 'Scenario',
  decision: 'Decision',
  branch: 'Situation change',
  critique: 'Critique',
  ai_allowed: 'AI allowed',
  past_work: 'Your experience',
};

export type Variant = Record<string, string | number>;

export interface Formatter {
  money: (n: number) => string;
  num: (n: number) => string;
  pct: (n: number) => string;
  x: (n: number) => string;
}

export interface StageContext {
  variant: Variant;
  fmt: Formatter;
  currency: Currency;
  /** stageId -> choiceId for decision stages the candidate has already answered. */
  choices: Record<string, string | undefined>;
}

export interface Criterion {
  id: string;
  label: string;
  weight: number;
  /** Behavioural anchors for scores 1..4. */
  anchors: [string, string, string, string];
}

export interface Choice {
  id: string;
  label: string;
}

export interface AnswerSummary {
  excerpt: string;
  choiceId?: string;
  choiceLabel?: string;
  hasText: boolean;
  hasVoice: boolean;
  voiceSec?: number;
  timedOut: boolean;
}

export interface StageDef {
  id: string;
  kind: StageKind;
  title: string;
  timeLimitSec: number;
  voiceMaxSec: number;
  preferVoice: boolean;
  /**
   * Think-aloud: audio records from the moment the question opens until it is
   * submitted, next to a scratchpad. Reviewers hear the working, not a
   * rehearsed answer.
   */
  thinkAloud?: boolean;
  scored: boolean;
  choices?: Choice[];
  /** For branch stages: the decision stage whose answer changes this prompt. */
  dependsOn?: string;
  prompt: (ctx: StageContext) => Block[];
  /** Material to work with, e.g. the plan to critique. */
  material?: (ctx: StageContext) => Block[];
  /** Answer key and calibration notes. Never sent to candidates. */
  reviewerGuide: (ctx: StageContext) => Block[];
  rubric: Criterion[];
  /** Questions for the live verification call, built on the candidate's own answer. */
  followUps: (ctx: StageContext, answer: AnswerSummary) => string[];
}

export interface Rng {
  next: () => number;
  int: (min: number, max: number) => number;
  pick: <T>(items: readonly T[]) => T;
}

export interface RoleFamily {
  id: string;
  version: number;
  name: string;
  roles: string[];
  summary: string;
  generate: (rng: Rng, currency: Currency) => Variant;
  brief: (ctx: StageContext) => Block[];
  stages: StageDef[];
  /** Warm-up prompts; one is picked per candidate. */
  warmups?: string[];
}

/** What a candidate is allowed to see for a stage. */
export interface CandidateStageView {
  id: string;
  index: number;
  kind: StageKind;
  title: string;
  timeLimitSec: number;
  voiceMaxSec: number;
  preferVoice: boolean;
  thinkAloud: boolean;
  choices?: Choice[];
  prompt: Block[];
  material: Block[];
  lookingFor: string[];
}

export interface StageSignals {
  tabHidden: number;
  hiddenMs: number;
  pasteCount: number;
  pasteChars: number;
  largestPaste: number;
  keystrokes: number;
}

export const EMPTY_SIGNALS: StageSignals = {
  tabHidden: 0,
  hiddenMs: 0,
  pasteCount: 0,
  pasteChars: 0,
  largestPaste: 0,
  keystrokes: 0,
};

/** stageId -> criterionId -> score (1..4) */
export type ReviewScores = Record<string, Record<string, number>>;

/** A scratchpad state, `t` ms after the question opened. */
export interface ScratchSnapshot {
  t: number;
  text: string;
}

/** A reviewer's read of how a think-aloud recording sounded. */
export type Delivery = 'natural' | 'unsure' | 'read';

export type Recommendation = 'advance' | 'hold' | 'reject';
export type CandidateStatus = 'invited' | 'in_progress' | 'submitted' | 'reviewed' | 'decided';
export type Decision = 'advance' | 'hold' | 'reject';
