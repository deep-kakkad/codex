import { hasNotableSignals } from './signals';
import type { AnswerSummary, Delivery, RoleFamily, StageContext, StageDef, StageSignals } from './types';

export interface ResponseForScript {
  stageId: string;
  text: string | null;
  choiceId: string | null;
  aiTranscript: string | null;
  reflection: string | null;
  hasVoice: boolean;
  voiceSec: number | null;
  closedReason: 'submitted' | 'timeout' | null;
  signals: StageSignals | null;
}

export interface ProbeSection {
  stageId: string;
  stageTitle: string;
  priority: boolean;
  reasons: string[];
  answer: AnswerSummary;
  questions: string[];
}

export interface VerificationScript {
  opening: string[];
  identity: string[];
  probes: ProbeSection[];
  closing: string[];
}

const EXCERPT_CHARS = 220;
const QUESTIONS_PER_STAGE = 2;

export function excerpt(text: string | null | undefined, max = EXCERPT_CHARS): string {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > max * 0.6 ? lastSpace : max)}…`;
}

export function summarizeAnswer(stage: StageDef, response: ResponseForScript | undefined): AnswerSummary {
  const text = response?.text ?? '';
  const choiceId = response?.choiceId ?? undefined;
  return {
    excerpt: excerpt(text),
    choiceId,
    choiceLabel: stage.choices?.find((c) => c.id === choiceId)?.label,
    hasText: text.trim().length > 0,
    hasVoice: Boolean(response?.hasVoice),
    voiceSec: response?.voiceSec ?? undefined,
    timedOut: response?.closedReason === 'timeout',
  };
}

function answerLength(response: ResponseForScript) {
  return (response.text?.length ?? 0) + (response.reflection?.length ?? 0);
}

/**
 * Builds a 10–15 minute call script from the candidate's own answers.
 * Real-time prompters and proxy candidates struggle with rapid follow-ups on
 * specifics, so this call, not detection software, is the security layer.
 */
export function buildVerificationScript(
  family: RoleFamily,
  ctx: StageContext,
  candidate: { name: string; idName: string | null },
  responses: ResponseForScript[],
  /** Reviewer reads of think-aloud recordings, by stage. */
  concerns: Record<string, Delivery> = {},
): VerificationScript {
  const byStage = new Map(responses.map((r) => [r.stageId, r]));

  const identity: string[] = [
    `Ask the candidate to hold a government photo ID up to the camera. The name should match "${candidate.idName ?? candidate.name}", which they entered before starting.`,
  ];
  if (candidate.idName && normalise(candidate.idName) !== normalise(candidate.name)) {
    identity.push(
      `They were invited as "${candidate.name}" but entered "${candidate.idName}" as their ID name. Ask about it; it is often a nickname or a surname order.`,
    );
  }

  const warmup = family.stages.find((stage) => stage.kind === 'warmup');
  if (warmup) {
    const response = byStage.get(warmup.id);
    const answer = summarizeAnswer(warmup, response);
    const said = answer.hasVoice
      ? 'Listen to their warm-up voice note before the call; the voice on the call should match.'
      : answer.hasText
        ? `Their warm-up answer: "${answer.excerpt}"`
        : 'They skipped the warm-up.';
    identity.push(`${said} Ask one spontaneous question about it.`);
  }

  const probes: ProbeSection[] = [];
  for (const stage of family.stages) {
    if (!stage.scored) continue;
    const response = byStage.get(stage.id);
    if (!response) continue;
    const answer = summarizeAnswer(stage, response);
    const reasons: string[] = [];
    if (response.signals && hasNotableSignals(stage.kind, response.signals, answerLength(response))) {
      reasons.push('Integrity signals on this answer: ask them to rebuild the reasoning live.');
    }
    if (answer.timedOut && !answer.hasText && !answer.hasVoice) {
      reasons.push('They ran out of time without answering: give them a second chance live.');
    }
    if (concerns[stage.id] === 'read') {
      reasons.push('A reviewer thought the think-aloud sounded read or rehearsed: have them redo the key step live.');
    } else if (concerns[stage.id] === 'unsure') {
      reasons.push('A reviewer was unsure about the think-aloud: ask them to walk through the working again.');
    }
    if (stage.kind === 'past_work') {
      reasons.push('Past-work stories are easy to fabricate asynchronously: dig into specifics.');
    }
    probes.push({
      stageId: stage.id,
      stageTitle: stage.title,
      priority: reasons.length > 0,
      reasons,
      answer,
      questions: stage.followUps(ctx, answer).slice(0, QUESTIONS_PER_STAGE),
    });
  }

  // Priority probes first, otherwise keep the assessment order.
  probes.sort((a, b) => Number(b.priority) - Number(a.priority));

  return {
    opening: [
      'Plan for 10–15 minutes. Tell the candidate you will ask follow-up questions about their own answers and that thinking out loud is welcome.',
      'Keep the pace brisk: a real practitioner can go deeper on their own reasoning without pausing to read.',
    ],
    identity,
    probes,
    closing: [
      'Ask what they would want to know about the role or team.',
      'Record the outcome below straight after the call, while it is fresh.',
    ],
  };
}

function normalise(name: string) {
  return name.toLowerCase().replace(/[^\p{L}]/gu, '');
}
