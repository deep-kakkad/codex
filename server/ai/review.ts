import type { AiCriterionScore, AiReviewResult, AiStageReview } from '../../shared/api';
import { choicesFrom } from '../../shared/render';
import { computeScore, isValidScore, suggestedRecommendation } from '../../shared/scoring';
import { describeSignals } from '../../shared/signals';
import { blocksToText } from '../../shared/text';
import type {
  CandidateStageView,
  Delivery,
  ReviewScores,
  RoleFamily,
  StageDef,
  StageSignals,
  Variant,
} from '../../shared/types';
import { STAGE_KIND_LABEL } from '../../shared/types';
import { buildContext } from '../../shared/variants';
import { audioParts } from '../candidateFlow';
import {
  type AssessmentRow,
  type CandidateRow,
  type DB,
  all,
  one,
  type ResponseRow,
  run,
  type TranscriptRow,
} from '../db';
import { familyFor } from '../families';
import { type FileStore, readChunks } from '../files';
import { type AiClient, type AiConfig, AiError, type ChatMessage, type ContentPart, extractJson } from './client';

export interface ReviewDeps {
  db: DB;
  files: FileStore;
  now: () => number;
  ai: AiConfig;
}

const DELIVERIES: Delivery[] = ['natural', 'unsure', 'read'];
const AUDIO_FORMATS: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
};

// Prompts ------------------------------------------------------------------

const TRANSCRIBE_PROMPT = `You are transcribing a job candidate's spoken answer to a practical assessment question.

1. Transcribe it verbatim. Keep fillers, restarts and self-corrections. Mark pauses longer than about 3 seconds as [pause].
2. Judge the delivery:
   - "natural": sounds like someone reasoning live (working things out, pauses, corrections, partial sentences).
   - "read": sounds like reading prepared or generated text aloud (even cadence, complete polished sentences, no visible working).
   - "unsure": neither is clear, or there is too little speech.
   Never consider accent, grammar, fluency, nervousness or confidence. Non-native and nervous speakers are normal.

Reply with JSON only: {"transcript": "...", "delivery": "natural" | "unsure" | "read", "reasons": "one sentence"}
If there is no speech, use an empty transcript and "unsure".`;

function stageSystemPrompt(family: RoleFamily) {
  return `You are an experienced ${family.name} hiring assessor. You score one answer from a practical, scenario-based assessment against a fixed rubric.

Rules:
- Score every criterion from 1 to 4 using its anchors. Pick the anchor that best matches the evidence; if it falls between two, pick the lower.
- Base scores only on what the candidate actually said or wrote. Quote short verbatim evidence (under 30 words). If there is no evidence for a criterion, score 1 and say so.
- Spoken answers are transcripts of thinking aloud. Hesitations, restarts and corrections are normal and must not be penalised. Never judge accent, grammar, fluency or confidence.
- The reviewer guide is the answer key. The scenario numbers are unique to this candidate.
- On AI-allowed questions, AI use is expected: judge how well they used it, not whether they did.

Reply with JSON only, exactly this shape:
{"criteria": {"<criterion id>": {"score": 1, "evidence": "...", "rationale": "..."}}, "summary": "one or two sentences on this answer"}`;
}

const SUMMARY_SYSTEM = `You write the overall assessment of a job candidate from per-question reviews of a practical, scenario-based assessment. A recruiter reads it to decide whether to move forward.

Rules:
- Stick to the evidence in the reviews. Be specific and concise.
- Compare how they worked on their own (especially think-aloud questions) with the question where AI was allowed: what AI added, whether they gave it the real context, and whether they caught its mistakes. If there was no AI-allowed question, say so briefly.
- Integrity signals (tab switches, pastes) and delivery judgements are weak hints. Never treat them as proof; turn doubts into questions for the live call.
- Never mention or infer protected characteristics, accent or fluency.

Reply with JSON only:
{"summary": "3-4 sentences", "strengths": ["..."], "concerns": ["..."], "withAndWithoutAi": "2-3 sentences", "probes": ["3 to 5 specific questions for a 10-15 minute live call, built on their own answers"]}`;

// Helpers --------------------------------------------------------------------

async function askJson<T>(
  client: AiClient,
  model: string,
  system: string,
  user: string | ContentPart[],
  maxTokens: number,
) {
  const messages: ChatMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
  const first = await client.chat({ model, messages, maxTokens });
  try {
    return extractJson<T>(first);
  } catch {
    // One repair attempt: show the model its own reply and ask for valid JSON.
    const second = await client.chat({
      model,
      maxTokens,
      messages: [
        ...messages,
        { role: 'assistant', content: first },
        { role: 'user', content: 'That was not valid JSON. Reply again with the JSON object only.' },
      ],
    });
    return extractJson<T>(second);
  }
}

interface Recording {
  part: number;
  mime: string;
  read: () => Promise<Buffer>;
}

async function recordingsFor(db: DB, files: FileStore, response: ResponseRow): Promise<Recording[]> {
  if (response.audio_path) {
    const key = response.audio_path;
    return [
      {
        part: 0,
        mime: response.audio_mime ?? 'audio/webm',
        read: async () => (await files.get(key)) ?? Buffer.alloc(0),
      },
    ];
  }
  return (await audioParts(db, response.id)).map((p) => ({
    part: p.part,
    mime: p.mime,
    read: () => readChunks(files, p.path, p.chunks),
  }));
}

async function transcribe(deps: ReviewDeps, client: AiClient, response: ResponseRow): Promise<TranscriptRow[]> {
  const rows: TranscriptRow[] = [];
  for (const recording of await recordingsFor(deps.db, deps.files, response)) {
    const cached = await one<TranscriptRow>(
      deps.db,
      'SELECT * FROM transcripts WHERE response_id = ? AND part = ?',
      response.id,
      recording.part,
    );
    if (cached) {
      rows.push(cached);
      continue;
    }
    const audio = await recording.read();
    if (!audio.length) continue;
    const data = audio.toString('base64');
    const reply = await askJson<{ transcript?: unknown; delivery?: unknown; reasons?: unknown }>(
      client,
      deps.ai.audioModel,
      'You transcribe audio accurately and reply with JSON only.',
      [
        { type: 'text', text: TRANSCRIBE_PROMPT },
        { type: 'input_audio', input_audio: { data, format: AUDIO_FORMATS[recording.mime] ?? 'webm' } },
      ],
      4000,
    );
    const row: TranscriptRow = {
      response_id: response.id,
      part: recording.part,
      transcript: typeof reply.transcript === 'string' ? reply.transcript : '',
      delivery: DELIVERIES.includes(reply.delivery as Delivery) ? (reply.delivery as string) : 'unsure',
      delivery_reasons: typeof reply.reasons === 'string' ? reply.reasons : null,
      model: deps.ai.audioModel,
      created_at: deps.now(),
    };
    await run(
      deps.db,
      `INSERT INTO transcripts (response_id, part, transcript, delivery, delivery_reasons, model, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (response_id, part) DO UPDATE SET transcript = excluded.transcript,
         delivery = excluded.delivery, delivery_reasons = excluded.delivery_reasons, model = excluded.model`,
      row.response_id,
      row.part,
      row.transcript,
      row.delivery,
      row.delivery_reasons,
      row.model,
      row.created_at,
    );
    rows.push(row);
  }
  return rows;
}

/** The most cautious delivery across parts: read > unsure > natural. */
function combinedDelivery(rows: TranscriptRow[]): AiStageReview['delivery'] {
  if (!rows.length) return null;
  const rank = (d: string | null) => DELIVERIES.indexOf((d as Delivery) ?? 'unsure');
  const worst = rows.reduce((a, b) => (rank(b.delivery) > rank(a.delivery) ? b : a));
  return { label: (worst.delivery as Delivery) ?? 'unsure', reasons: worst.delivery_reasons ?? '' };
}

function joinTranscripts(rows: TranscriptRow[]): string | null {
  if (!rows.length) return null;
  return rows.map((r) => r.transcript).join('\n[the page was reloaded; recording continues]\n');
}

function answerSection(stage: StageDef, response: ResponseRow, transcript: string | null, timeLimitSec: number) {
  const lines: string[] = [];
  const choice = stage.choices?.find((c) => c.id === response.choice_id);
  if (stage.choices) lines.push(`Choice: ${choice?.label ?? '(none made)'}`);
  if (transcript !== null) lines.push(`Spoken answer (transcript):\n${transcript || '(no speech detected)'}`);
  const typedLabel = stage.kind === 'ai_allowed' ? 'Final answer' : stage.thinkAloud ? 'Scratchpad' : 'Typed answer';
  if (response.text) lines.push(`${typedLabel}:\n${response.text}`);
  if (stage.kind === 'ai_allowed') {
    lines.push(`Their AI conversation:\n${response.ai_transcript || '(none given)'}`);
    lines.push(`What they kept, changed or rejected:\n${response.reflection || '(not given)'}`);
  }
  if (!response.text && transcript === null && !choice) lines.push('(No answer was given.)');
  const used =
    response.submitted_at !== null
      ? Math.round((Math.min(response.submitted_at, response.deadline_at) - response.revealed_at) / 1000)
      : null;
  lines.push(
    `Timing: ${used ?? '?'}s used of ${timeLimitSec}s${response.closed_reason === 'timeout' ? '; they ran out of time' : ''}.`,
  );
  return lines.join('\n\n');
}

function sanitizeCriteria(stage: StageDef, raw: unknown): Record<string, AiCriterionScore> {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, Record<string, unknown> | undefined>;
  const result: Record<string, AiCriterionScore> = {};
  for (const criterion of stage.rubric) {
    const item = input[criterion.id] ?? {};
    const score = Math.round(Number(item.score));
    if (!isValidScore(score)) throw new AiError(`No valid score for "${criterion.label}" on "${stage.title}"`);
    result[criterion.id] = {
      score,
      // The page adds its own quote marks.
      evidence: typeof item.evidence === 'string' ? stripQuotes(item.evidence).slice(0, 600) : '',
      rationale: typeof item.rationale === 'string' ? item.rationale.slice(0, 1000) : '',
    };
  }
  return result;
}

function stripQuotes(text: string) {
  return text
    .trim()
    .replace(/^["“'‘]+|["”'’]+$/g, '')
    .trim();
}

function stringList(value: unknown, max: number): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string').slice(0, max) : [];
}

// The review ---------------------------------------------------------------------

export async function reviewCandidate(deps: ReviewDeps, candidateId: string): Promise<AiReviewResult> {
  const client = deps.ai.client;
  if (!client) throw new AiError('AI review is not configured. Set OPENROUTER_API_KEY and retry.');
  const candidate = await one<CandidateRow>(deps.db, 'SELECT * FROM candidates WHERE id = ?', candidateId);
  if (!candidate) throw new AiError('Candidate not found');
  const assessment = (await one<AssessmentRow>(
    deps.db,
    'SELECT * FROM assessments WHERE id = ?',
    candidate.assessment_id,
  ))!;
  const family = await familyFor(deps.db, assessment);
  const variant = JSON.parse(candidate.variant_json) as Variant;
  const responses = await all<ResponseRow>(
    deps.db,
    'SELECT * FROM responses WHERE candidate_id = ? ORDER BY stage_index',
    candidateId,
  );
  const ctx = buildContext(
    variant,
    assessment.currency,
    choicesFrom(responses.map((r) => ({ stageId: r.stage_id, choiceId: r.choice_id }))),
  );
  const brief = blocksToText(family.brief(ctx));

  const stages: AiStageReview[] = [];
  for (const stage of family.stages) {
    const response = responses.find((r) => r.stage_id === stage.id);
    if (!response) continue;
    const transcripts = await transcribe(deps, client, response);
    const transcript = joinTranscripts(transcripts);
    const review: AiStageReview = {
      stageId: stage.id,
      criteria: {},
      summary: '',
      transcript,
      delivery: combinedDelivery(transcripts),
    };
    if (stage.scored) {
      const shown = JSON.parse(response.prompt_json) as CandidateStageView;
      const rubric = stage.rubric
        .map(
          (c) =>
            `- ${c.id}: ${c.label}${c.weight > 1 ? ` (counts ×${c.weight})` : ''}\n${c.anchors
              .map((a, i) => `  ${i + 1}: ${a}`)
              .join('\n')}`,
        )
        .join('\n');
      const user = [
        `## Scenario brief (as the candidate saw it)\n${brief}`,
        `## Question: ${stage.title} (${STAGE_KIND_LABEL[stage.kind]}${stage.thinkAloud ? ', think-aloud' : ''})\n${blocksToText(shown.prompt)}${shown.material.length ? `\n\n${blocksToText(shown.material)}` : ''}`,
        `## The candidate's answer\n${answerSection(stage, response, transcript, shown.timeLimitSec)}`,
        `## Reviewer guide (answer key)\n${blocksToText(stage.reviewerGuide(ctx))}`,
        `## Rubric\n${rubric}`,
      ].join('\n\n');
      const reply = await askJson<{ criteria?: unknown; summary?: unknown }>(
        client,
        deps.ai.reviewModel,
        stageSystemPrompt(family),
        user,
        3000,
      );
      review.criteria = sanitizeCriteria(stage, reply.criteria);
      review.summary = typeof reply.summary === 'string' ? reply.summary : '';
    }
    stages.push(review);
  }

  const scores: ReviewScores = {};
  for (const s of stages) {
    if (Object.keys(s.criteria).length) {
      scores[s.stageId] = Object.fromEntries(Object.entries(s.criteria).map(([id, c]) => [id, c.score]));
    }
  }
  const score = computeScore(family, scores);

  const overview = stages
    .map((s) => {
      const stage = family.stages.find((d) => d.id === s.stageId)!;
      const response = responses.find((r) => r.stage_id === s.stageId)!;
      const signals = describeSignals(
        stage.kind,
        response.signals_json ? (JSON.parse(response.signals_json) as StageSignals) : null,
        (response.text?.length ?? 0) + (response.reflection?.length ?? 0),
      );
      return [
        `## ${stage.title} (${STAGE_KIND_LABEL[stage.kind]}${stage.thinkAloud ? ', think-aloud' : ''}${stage.scored ? '' : ', not scored'})`,
        stage.scored ? `Score: ${score.byStage[stage.id] ?? '?'} / 4. ${s.summary}` : '',
        ...Object.entries(s.criteria).map(([id, c]) => `- ${id}: ${c.score}. ${c.rationale}`),
        s.delivery ? `Delivery: ${s.delivery.label} (${s.delivery.reasons})` : '',
        signals.length ? `Integrity signals: ${signals.map((n) => n.text).join('; ')}` : '',
        stage.kind === 'ai_allowed' ? `Their AI conversation:\n${(response.ai_transcript ?? '').slice(0, 6000)}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');
  const summary = await askJson<Record<string, unknown>>(
    client,
    deps.ai.reviewModel,
    SUMMARY_SYSTEM,
    `Role: ${family.name}. Overall rubric score: ${score.overall ?? '?'} / 4.\n\n${overview}`,
    2500,
  );

  return {
    stages,
    overall: score.overall,
    byStage: score.byStage,
    recommendation: suggestedRecommendation(score.overall),
    summary: typeof summary.summary === 'string' ? summary.summary : '',
    strengths: stringList(summary.strengths, 6),
    concerns: stringList(summary.concerns, 6),
    withAndWithoutAi: typeof summary.withAndWithoutAi === 'string' ? summary.withAndWithoutAi : '',
    probes: stringList(summary.probes, 6),
    models: { review: deps.ai.reviewModel, audio: deps.ai.audioModel },
  };
}
