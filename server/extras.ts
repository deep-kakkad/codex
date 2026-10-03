import type {
  CandidateReport,
  DecisionEmailDraft,
  IntegrityItem,
  IntegrityReport,
  IntegrityVerdict,
  InterviewKit,
  InterviewKitQuestion,
} from '../shared/api';
import type { Decision } from '../shared/types';
import { type AiConfig, AiError, extractJson } from './ai/client';
import { UsageMeter, type UsageKind, meteredAi, saveUsage } from './ai/usage';
import { type DB, one, run } from './db';

/** The report without the extras built from it. */
export type ReportCore = Omit<CandidateReport, 'integrity' | 'interviewKit' | 'decisionEmail'>;

type ExtraKind = 'interview_kit' | 'integrity' | 'decision_email';

export interface ExtrasDeps {
  db: DB;
  ai: AiConfig;
  now: () => number;
}

export async function storedExtra<T>(db: DB, candidateId: string, kind: ExtraKind): Promise<T | null> {
  const row = await one<{ payload_json: string }>(
    db,
    'SELECT payload_json FROM candidate_extras WHERE candidate_id = ? AND kind = ?',
    candidateId,
    kind,
  );
  return row ? (JSON.parse(row.payload_json) as T) : null;
}

async function saveExtra(db: DB, candidateId: string, kind: ExtraKind, payload: unknown, now: number) {
  await run(
    db,
    `INSERT INTO candidate_extras (candidate_id, kind, payload_json, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (candidate_id, kind) DO UPDATE SET payload_json = excluded.payload_json, created_at = excluded.created_at`,
    candidateId,
    kind,
    JSON.stringify(payload),
    now,
  );
}

/** One AI call for an extra, with its cost recorded against the workspace. */
async function askJson<T>(
  deps: ExtrasDeps,
  usage: { orgId: string; kind: UsageKind; refId: string },
  system: string,
  user: string,
  maxTokens: number,
): Promise<T> {
  const meter = new UsageMeter();
  const client = meteredAi(deps.ai, meter).client;
  if (!client) throw new AiError('AI is not configured on this server');
  let ok = false;
  try {
    const reply = await client.chat({
      model: deps.ai.reviewModel,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      maxTokens,
    });
    const parsed = extractJson<T>(reply);
    ok = true;
    return parsed;
  } finally {
    await saveUsage(deps.db, { ...usage, meter, ok, now: deps.now() });
  }
}

const text = (value: unknown, max = 600) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

function clip(value: string | null | undefined, max: number) {
  const clean = (value ?? '').trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

/** The candidate's answers, question by question, as the AI extras read them. */
function answersForPrompt(report: ReportCore, opts: { onlyOwnWork?: boolean; max?: number } = {}) {
  const max = opts.max ?? 1500;
  const reviews = new Map((report.aiReview?.result?.stages ?? []).map((s) => [s.stageId, s]));
  return report.stages
    .filter((s) => s.response?.closedReason && !(opts.onlyOwnWork && s.kind === 'ai_allowed'))
    .map((s) => {
      const r = s.response!;
      const review = reviews.get(s.id);
      return [
        `## ${s.title} [id: ${s.id}] (${s.kind}${s.thinkAloud ? ', think-aloud' : ''}${s.kind === 'ai_allowed' ? ', AI allowed' : ''})`,
        r.choiceLabel ? `Chose: ${r.choiceLabel}` : '',
        r.text ? `Written answer:\n${clip(r.text, max)}` : '',
        r.reflection ? `Reflection:\n${clip(r.reflection, max / 2)}` : '',
        review?.transcript ? `Spoken (transcript):\n${clip(review.transcript, max)}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');
}

// Integrity ------------------------------------------------------------------

interface StoredIntegrity {
  findings: IntegrityItem[];
  checkedAt: number;
}

/** Characters a minute that are hard to reach by typing a thought-through answer. */
const FAST_CHARS_PER_MIN = 900;

/** What the browser and the timings show, before any AI looks at the writing. */
function observedItems(report: ReportCore): IntegrityItem[] {
  const items: IntegrityItem[] = [];
  const deliveries = new Map((report.aiReview?.result?.stages ?? []).map((s) => [s.stageId, s.delivery]));
  for (const stage of report.stages) {
    const r = stage.response;
    if (!r?.closedReason || stage.kind === 'ai_allowed') continue;
    const at = { stageId: stage.id, stageTitle: stage.title };
    for (const note of r.signalNotes) {
      items.push({ ...at, level: note.level, source: 'signals', text: note.text });
    }
    const chars = (r.text?.length ?? 0) + (r.reflection?.length ?? 0);
    const pasted = r.signals?.pasteChars ?? 0;
    if (chars >= 600 && r.timeUsedSec && pasted < chars / 4) {
      const perMinute = (chars / r.timeUsedSec) * 60;
      if (perMinute > FAST_CHARS_PER_MIN) {
        items.push({
          ...at,
          level: 'notable',
          source: 'timing',
          text: `Wrote ${chars.toLocaleString('en-US')} characters in ${r.timeUsedSec}s, faster than people usually type a considered answer`,
          ask: `Ask them to talk you through how they wrote their answer to "${stage.title}".`,
        });
      }
    }
    const typed = r.signals?.keystrokes ?? 0;
    if (typed > 0 && chars >= 400) {
      const unexplained = chars - typed - pasted;
      if (unexplained / chars >= 0.5) {
        items.push({
          ...at,
          level: 'info',
          source: 'timing',
          text: `About ${Math.round((unexplained / chars) * 100)}% of the answer was neither typed nor pasted in the box (dictation, autofill, a reload or a tool can each do this)`,
        });
      }
    }
    const delivery = deliveries.get(stage.id);
    if (stage.thinkAloud && delivery?.label === 'read') {
      items.push({
        ...at,
        level: 'notable',
        source: 'delivery',
        text: `The think-aloud sounded read out rather than worked out live. ${delivery.reasons}`.trim(),
        ask: `Ask a follow-up on "${stage.title}" they could not have prepared.`,
      });
    }
  }
  return items;
}

function verdictFor(items: IntegrityItem[]): { verdict: IntegrityVerdict; headline: string } {
  const strong = items.filter((i) => i.level === 'strong').length;
  const notable = items.filter((i) => i.level === 'notable').length;
  if ((strong >= 1 && strong + notable >= 2) || notable >= 3) {
    return {
      verdict: 'likely',
      headline: 'Several signs point to outside help. Check on a live call before deciding.',
    };
  }
  if (strong + notable > 0) {
    const n = strong + notable;
    return { verdict: 'question', headline: `${n} thing${n === 1 ? '' : 's'} worth a question on the call.` };
  }
  return { verdict: 'clean', headline: 'Nothing suggests anyone or anything else did the thinking.' };
}

export function integrityReport(report: ReportCore, stored: StoredIntegrity | null): IntegrityReport {
  const items = [...observedItems(report), ...(stored?.findings ?? [])];
  const order = { strong: 0, notable: 1, info: 2 };
  items.sort((a, b) => order[a.level] - order[b.level]);
  return { ...verdictFor(items), items, aiChecked: Boolean(stored), checkedAt: stored?.checkedAt ?? null };
}

const INTEGRITY_SYSTEM = `You check a job candidate's timed assessment answers for signs that someone or something else did the thinking. AI tools were NOT allowed on the questions shown (the one question that allowed AI is left out).

Look for two things:
1. "ai_like": a written answer that reads like default AI-assistant output: headings and bolded labels in a timed answer, a balanced "on one hand / on the other" structure, polished generic advice that ignores the scenario's specific numbers, phrases such as "In conclusion" or "It's important to note".
2. "mismatch": a think-aloud transcript and the written answer for the same question that don't fit together, e.g. the spoken reasoning never reaches the conclusion the written answer states fluently, or uses different numbers.

Be conservative: good candidates write well, and fluent English is not a signal. Never judge grammar, accent, spelling or language background. Flag only with a short verbatim quote as evidence. "strong" means you would be surprised if the candidate wrote it unaided; otherwise "some".

Reply with JSON only:
{"findings": [{"stageId": "<id>", "kind": "ai_like" | "mismatch", "strength": "some" | "strong", "quote": "verbatim, under 25 words", "why": "one sentence", "ask": "one question for a live call that tests whether they own it"}]}
Return {"findings": []} if nothing stands out.`;

/** Runs the AI writing check and stores what it found. */
export async function runIntegrityCheck(deps: ExtrasDeps, report: ReportCore, orgId: string): Promise<void> {
  const answers = answersForPrompt(report, { onlyOwnWork: true });
  const reply = await askJson<{ findings?: unknown }>(
    deps,
    { orgId, kind: 'integrity', refId: report.candidate.id },
    INTEGRITY_SYSTEM,
    `Role: ${report.family.name}.\n\n${answers}`,
    2500,
  );
  const titles = new Map(report.stages.map((s) => [s.id, s.title]));
  const findings: IntegrityItem[] = (Array.isArray(reply.findings) ? reply.findings : [])
    .slice(0, 8)
    .flatMap((raw): IntegrityItem[] => {
      const f = (raw ?? {}) as Record<string, unknown>;
      const stageId = text(f.stageId, 80);
      const why = text(f.why, 300);
      if (!titles.has(stageId) || !why) return [];
      const ownWork = report.stages.find((s) => s.id === stageId)?.kind !== 'ai_allowed';
      if (!ownWork) return [];
      return [
        {
          stageId,
          stageTitle: titles.get(stageId) ?? null,
          level: f.strength === 'strong' ? 'strong' : 'notable',
          source: f.kind === 'mismatch' ? 'consistency' : 'writing',
          text: why,
          quote: text(f.quote, 240) || undefined,
          ask: text(f.ask, 300) || undefined,
        },
      ];
    });
  await saveExtra(deps.db, report.candidate.id, 'integrity', { findings, checkedAt: deps.now() }, deps.now());
}

// Interview kit -------------------------------------------------------------

const KIT_SYSTEM = `You prepare a hiring manager for a 20-minute follow-up interview with one candidate, using an AI review of their practical, scenario-based assessment.

Write exactly 5 questions:
- Aim each at something worth testing for THIS candidate: a weak or borderline score, a concern, an answer that seemed borrowed, or an integrity flag. At least one should confirm a strength is real.
- Build each question on their own answers and the scenario's specifics (numbers, their choice, what they said), so a stand-in or a prepared script can't answer it.
- One question at a time, in plain words a hiring manager can read out.
- "listenFor": what a strong answer includes, concretely, for this scenario. "redFlags": what a weak or borrowed answer sounds like.
- Never ask about or judge protected characteristics, accent or fluency.

Reply with JSON only:
{"questions": [{"stageId": "<question id, or null for general>", "question": "...", "why": "one sentence: what it tests and why for this candidate", "listenFor": "...", "redFlags": "..."}]}`;

export async function buildInterviewKit(
  deps: ExtrasDeps,
  report: ReportCore,
  integrity: IntegrityReport,
  orgId: string,
): Promise<InterviewKit> {
  const result = report.aiReview?.result;
  if (!result) throw new AiError('The AI review has not finished yet');
  const reviews = result.stages
    .filter((s) => Object.keys(s.criteria).length)
    .map((s) => {
      const title = report.stages.find((x) => x.id === s.stageId)?.title ?? s.stageId;
      const criteria = Object.entries(s.criteria)
        .map(([id, c]) => `- ${id}: ${c.score}/4. ${c.rationale}`)
        .join('\n');
      return `### ${title} [id: ${s.stageId}]: ${result.byStage[s.stageId] ?? '?'} / 4\n${s.summary}\n${criteria}`;
    })
    .join('\n\n');
  const flags = integrity.items
    .filter((i) => i.level !== 'info')
    .map((i) => `- ${i.stageTitle ?? 'General'}: ${i.text}${i.quote ? ` ("${i.quote}")` : ''}`)
    .join('\n');
  const user = [
    `Role: ${report.family.name}. Overall: ${result.overall ?? '?'} / 4.`,
    result.headline ? `Verdict: ${result.headline}` : '',
    `Summary: ${result.summary}`,
    `Strengths:\n${result.strengths.map((s) => `- ${s}`).join('\n')}`,
    `Concerns:\n${result.concerns.map((s) => `- ${s}`).join('\n')}`,
    flags ? `Integrity hints (not proof):\n${flags}` : '',
    `## Scores by question\n${reviews}`,
    `## Their answers\n${answersForPrompt(report, { max: 900 })}`,
  ]
    .filter(Boolean)
    .join('\n\n');
  const reply = await askJson<{ questions?: unknown }>(
    deps,
    { orgId, kind: 'interview_kit', refId: report.candidate.id },
    KIT_SYSTEM,
    user,
    3500,
  );
  const ids = new Set(report.stages.map((s) => s.id));
  const questions: InterviewKitQuestion[] = (Array.isArray(reply.questions) ? reply.questions : [])
    .slice(0, 6)
    .flatMap((raw) => {
      const q = (raw ?? {}) as Record<string, unknown>;
      const question = text(q.question, 500);
      if (!question) return [];
      const stageId = text(q.stageId, 80);
      return [
        {
          stageId: ids.has(stageId) ? stageId : null,
          question,
          why: text(q.why, 300),
          listenFor: text(q.listenFor, 600),
          redFlags: text(q.redFlags, 600),
        },
      ];
    });
  if (!questions.length) throw new AiError('The AI did not return any questions. Try again.');
  const kit: InterviewKit = { questions, createdAt: deps.now() };
  await saveExtra(deps.db, report.candidate.id, 'interview_kit', kit, deps.now());
  return kit;
}

// Decision email ------------------------------------------------------------

const EMAIL_SYSTEM = `You draft a short email from a recruiter to a job candidate about the outcome of their practical assessment. The recruiter will edit it before sending.

By decision:
- advance: invite them to the next step, a conversation; name one or two specific things they did well; include the placeholder [link to book a time].
- hold: be honest that they are still being considered and others are still finishing; name one specific thing they did well; give the placeholder [date] for when they'll hear back.
- reject: say so kindly and clearly in the first two sentences; name one genuine, specific strength; mention one area to develop in general terms; wish them well. Don't give false hope.

Rules: warm, plain and direct; under 150 words in the body. Refer to what they actually did in the scenario, not generic praise. Never mention AI, scores, rubrics, rankings, other candidates, integrity checks, or anything about protected characteristics. Address them by first name. Sign off with the recruiter's name and company.

Reply with JSON only: {"subject": "...", "body": "..."}`;

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}

/** Used when AI is unavailable; the recruiter edits it anyway. */
export function templateEmail(
  decision: Decision,
  info: { candidateName: string; title: string; orgName: string; senderName: string },
): { subject: string; body: string } {
  const hi = `Hi ${firstName(info.candidateName)},`;
  const sign = `Best,\n${info.senderName}\n${info.orgName}`;
  if (decision === 'advance') {
    return {
      subject: `Next step for the ${info.title} role`,
      body: `${hi}\n\nThank you for working through the ${info.title} assessment. We enjoyed reading your answers and would like to talk about them with you.\n\nCould you pick a time that suits you here: [link to book a time]\n\n${sign}`,
    };
  }
  if (decision === 'hold') {
    return {
      subject: `Your ${info.title} application`,
      body: `${hi}\n\nThank you for completing the ${info.title} assessment. We're still hearing from other candidates, so we haven't decided yet. You'll hear from us by [date].\n\n${sign}`,
    };
  }
  return {
    subject: `Your ${info.title} application`,
    body: `${hi}\n\nThank you for the time you put into the ${info.title} assessment. We've decided not to move forward with your application this time.\n\nWe appreciated the care in your answers, and we wish you the best with your search.\n\n${sign}`,
  };
}

export async function draftDecisionEmail(
  deps: ExtrasDeps,
  report: ReportCore,
  info: { orgId: string; orgName: string; senderName: string },
): Promise<DecisionEmailDraft> {
  const decision = report.candidate.decision;
  if (!decision) throw new AiError('Make a decision first');
  const facts = {
    candidateName: report.candidate.name,
    title: report.assessment.title,
    orgName: info.orgName,
    senderName: info.senderName,
  };
  const result = report.aiReview?.result;
  let draft = templateEmail(decision, facts);
  let ai = false;
  if (deps.ai.client && result) {
    try {
      const reply = await askJson<{ subject?: unknown; body?: unknown }>(
        deps,
        { orgId: info.orgId, kind: 'decision_email', refId: report.candidate.id },
        EMAIL_SYSTEM,
        [
          `Decision: ${decision}`,
          `Candidate: ${report.candidate.name}`,
          `Role: ${report.assessment.title} at ${info.orgName}`,
          `Recruiter: ${info.senderName}`,
          `What they did well:\n${result.strengths.map((s) => `- ${s}`).join('\n')}`,
          `Where they were weaker:\n${result.concerns.map((s) => `- ${s}`).join('\n')}`,
          `The scenario they worked on: ${report.family.name}.`,
        ].join('\n\n'),
        1200,
      );
      const subject = text(reply.subject, 160);
      const body = text(reply.body, 3000);
      if (subject && body) {
        draft = { subject, body };
        ai = true;
      }
    } catch (error) {
      // A template is better than no draft at all.
      console.error(`Decision email draft fell back to the template: ${(error as Error).message}`);
    }
  }
  const saved: DecisionEmailDraft = { decision, ...draft, ai, createdAt: deps.now() };
  await saveExtra(deps.db, report.candidate.id, 'decision_email', saved, deps.now());
  return saved;
}

/** The stored extras, attached to a report. */
export async function withExtras(db: DB, core: ReportCore): Promise<CandidateReport> {
  const id = core.candidate.id;
  const integrity = integrityReport(core, await storedExtra<StoredIntegrity>(db, id, 'integrity'));
  const email = await storedExtra<DecisionEmailDraft>(db, id, 'decision_email');
  return {
    ...core,
    integrity,
    interviewKit: await storedExtra<InterviewKit>(db, id, 'interview_kit'),
    // A draft for an earlier decision no longer applies.
    decisionEmail: email && email.decision === core.candidate.decision ? email : null,
  };
}
