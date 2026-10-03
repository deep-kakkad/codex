import type { Block, Criterion, Rng, StageContext, StageDef } from '../types';
import { s } from '../variants';

/** The unscored 45-second warm-up every role family opens with. */
export function warmupStage(): StageDef {
  return {
    id: 'warmup',
    kind: 'warmup',
    title: 'Warm-up',
    summary: 'A 45-second spontaneous answer. Not scored; gives a voice sample to compare with later recordings.',
    timeLimitSec: 120,
    voiceMaxSec: 45,
    preferVoice: true,
    scored: false,
    prompt: (ctx) => [
      { type: 'p', text: s(ctx.variant, 'warmup') },
      { type: 'p', text: 'Keep it under 45 seconds. This one is not scored; it just gets you talking.' },
    ],
    reviewerGuide: () => [
      {
        type: 'p',
        text: 'Not scored. On the verification call, listen for the same voice and ask a related question to check it is the same person.',
      },
    ],
    rubric: [],
    followUps: () => ['Ask them to say a little more about the example they gave in the warm-up.'],
  };
}

/** A real story from their career, scored for specificity and ownership, verified live. */
export function pastWorkStage(options: { id: string; title: string; summary: string; question: string }): StageDef {
  return {
    id: options.id,
    kind: 'past_work',
    title: options.title,
    summary: options.summary,
    timeLimitSec: 240,
    voiceMaxSec: 150,
    preferVoice: true,
    scored: true,
    prompt: () => [
      {
        type: 'p',
        text: `**${options.question}** What did you see, what did you do, and what would you do differently?`,
      },
      { type: 'p', text: 'Specifics such as numbers and timelines matter more than polish.' },
    ],
    reviewerGuide: () => [
      {
        type: 'p',
        text: 'Async answers here are easy to fabricate. Score specificity now, then verify on the call: rich detail that stays consistent under "why?" follow-ups is the signal.',
      },
    ],
    rubric: [
      {
        id: 'specificity',
        label: 'Specificity',
        weight: 1,
        anchors: [
          'Hypothetical or generic.',
          'A real situation, few specifics.',
          'Concrete metrics, timeline and their own role.',
          'Rich detail: what they saw, options considered and what happened next.',
        ],
      },
      {
        id: 'ownership',
        label: 'Ownership and learning',
        weight: 1,
        anchors: [
          'Blames others or circumstances.',
          'Takes some ownership; lesson is generic.',
          'Clear ownership with a specific lesson.',
          'Clear ownership, and shows how the lesson changed what they do now.',
        ],
      },
    ],
    followUps: () => [
      'What exact number or signal told you it was not working?',
      'Who disagreed with you at the time, and what did they argue?',
      'What did you do the following week?',
    ],
  };
}

/** Rubric shared by every AI-allowed task: judgment, accuracy and a usable result. */
export const AI_ALLOWED_INTRO =
  'Use any AI tool you like for this one. We are assessing how you use it, not whether you do.';

export const AI_ALLOWED_STEPS = [
  'Paste your final answer.',
  'Paste your full AI conversation, or write "none".',
  'In 2–3 lines, say what you kept, changed or rejected from the AI and why.',
];

/** "Judgment with AI": the same first criterion on every AI-allowed task. */
const AI_JUDGMENT: Criterion = {
  id: 'judgment',
  label: 'Judgment with AI',
  weight: 2,
  anchors: [
    'Pasted output unchanged, errors kept.',
    'Light edits; did not give the AI the real context.',
    'Gave the AI the scenario context and fixed its mistakes.',
    'Used AI deliberately and rejected weak suggestions with reasons.',
  ],
};

/**
 * An AI-allowed task: any tool may be used, and the candidate submits the
 * result, the conversation and what they changed. `accuracy` scores the
 * role-specific facts; `usable` whether the result could be used as is.
 */
export function aiAllowedStage(options: {
  id: string;
  title: string;
  summary: string;
  task: (ctx: StageContext) => Block[];
  guide: (ctx: StageContext) => Block[];
  accuracy: Criterion;
  usable: Criterion;
  followUps?: string[];
  timeLimitSec?: number;
}): StageDef {
  return {
    id: options.id,
    kind: 'ai_allowed',
    title: options.title,
    summary: options.summary,
    timeLimitSec: options.timeLimitSec ?? 540,
    voiceMaxSec: 0,
    preferVoice: false,
    scored: true,
    prompt: (ctx) => [
      { type: 'p', text: AI_ALLOWED_INTRO },
      ...options.task(ctx),
      { type: 'list', ordered: true, items: AI_ALLOWED_STEPS },
    ],
    reviewerGuide: options.guide,
    rubric: [AI_JUDGMENT, options.accuracy, options.usable],
    followUps: () =>
      options.followUps ?? [
        'What did the AI get wrong in its first attempt?',
        'Which part of your final answer did you write yourself, and why?',
      ],
  };
}

/** The four-step anchor scale used for "concrete next steps" across roles. */
export const NEXT_STEPS: Criterion = {
  id: 'action',
  label: 'Concrete next steps',
  weight: 1,
  anchors: [
    'No action.',
    'Vague actions.',
    'Specific actions in a sensible order.',
    'Specific actions with owners, timing and a success check.',
  ],
};

/** Adapting when the situation changes, scored the same way in every role. */
export const ADAPTS: Criterion = {
  id: 'adapt',
  label: 'Adapts to the new situation',
  weight: 2,
  anchors: [
    'Ignores or dismisses the new problem.',
    'Acknowledges it, with a thin response.',
    'Addresses the new problem directly and changes course where needed.',
    'Addresses it, fixes the root cause and prevents a repeat.',
  ],
};

/** Shuffles a list with the scenario's random source, so tables differ per candidate. */
export function shuffled<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Rounds to a "nice" number for a scenario: to the nearest `step`. */
export const roundTo = (value: number, step: number) => Math.round(value / step) * step;

export const FICTIONAL_CALLOUT =
  'The company and numbers are fictional, and every candidate gets a slightly different version. A calculator is fine.';
