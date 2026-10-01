import type { StageDef } from '../types';
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
