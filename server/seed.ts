// Creates a demo workspace with candidates at different stages.
//   npm run seed            (refuses if the database already has users)
//   npm run seed -- --reset (wipes ./data first)
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getRoleFamily } from '../shared/roleFamilies';
import { computeScore } from '../shared/scoring';
import type { ReviewScores, RoleFamily, Variant } from '../shared/types';
import { createFormatter, generateVariant, n, s } from '../shared/variants';
import { createUser, randomToken } from './auth';
import { type CandidateContext, type FlowDeps, loadByToken, revealNext, start, submit } from './candidateFlow';
import { one, openDb, run } from './db';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.resolve(process.env.DATA_DIR ?? path.join(root, 'data'));

if (process.argv.includes('--reset')) rmSync(dataDir, { recursive: true, force: true });
mkdirSync(path.join(dataDir, 'uploads'), { recursive: true });
const db = openDb(path.join(dataDir, 'proofwork.db'));
if (one(db, 'SELECT id FROM users LIMIT 1')) {
  console.error('The database already has users. Run `npm run seed -- --reset` to start fresh.');
  process.exit(1);
}

let clock = Date.now() - 3 * 24 * 60 * 60 * 1000;
const deps: FlowDeps = { db, now: () => clock, uploadDir: path.join(dataDir, 'uploads') };
const minutes = (m: number) => (clock += m * 60 * 1000);

const orgId = randomUUID();
run(db, 'INSERT INTO orgs (id, name, created_at) VALUES (?, ?, ?)', orgId, 'Demo Co', clock);
const managerId = createUser(
  db,
  { orgId, name: 'Maya Iyer', email: 'demo@proofwork.test', password: 'demo-password', role: 'manager' },
  clock,
);
const reviewerId = createUser(
  db,
  { orgId, name: 'Rohan Mehta', email: 'reviewer@proofwork.test', password: 'demo-password', role: 'reviewer' },
  clock,
);

function createAssessment(familyId: string, title: string) {
  const family = getRoleFamily(familyId)!;
  const id = randomUUID();
  run(
    db,
    `INSERT INTO assessments (id, org_id, role_family_id, role_family_version, title, currency, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, 'INR', ?, ?)`,
    id,
    orgId,
    family.id,
    family.version,
    title,
    managerId,
    clock,
  );
  return { id, family };
}

function invite(assessmentId: string, family: RoleFamily, name: string, email: string, seed: number) {
  const token = randomToken();
  run(
    db,
    `INSERT INTO candidates (id, org_id, assessment_id, name, email, token, seed, variant_json, time_multiplier, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    randomUUID(),
    orgId,
    assessmentId,
    name,
    email,
    token,
    seed,
    JSON.stringify(generateVariant(family, seed, 'INR')),
    clock,
  );
  return token;
}

type Answer = {
  text?: string;
  choiceId?: string;
  aiTranscript?: string;
  reflection?: string;
  minutes: number;
  signals?: Record<string, number>;
};

function take(token: string, answers: (v: Variant) => Answer[], stopAfter?: number) {
  let ctx: CandidateContext = loadByToken(db, token);
  start(deps, ctx, ctx.candidate.name);
  const list = answers(ctx.variant);
  list.slice(0, stopAfter ?? list.length).forEach((answer, index) => {
    ctx = loadByToken(db, token);
    minutes(1);
    revealNext(deps, ctx, index);
    minutes(answer.minutes);
    submit(deps, loadByToken(db, token), ctx.family.stages[index].id, { ...answer, signals: answer.signals ?? {} });
  });
  if (stopAfter !== undefined) {
    minutes(1);
    revealNext(deps, loadByToken(db, token), stopAfter);
  }
}

function review(
  token: string,
  reviewer: string,
  family: RoleFamily,
  pick: (stageId: string, i: number) => number,
  notes: string,
  recommendation: string,
) {
  const candidate = loadByToken(db, token).candidate;
  const scores: ReviewScores = {};
  for (const stage of family.stages) {
    if (!stage.scored) continue;
    scores[stage.id] = Object.fromEntries(stage.rubric.map((c, i) => [c.id, pick(stage.id, i)]));
  }
  if (!computeScore(family, scores).complete) throw new Error('incomplete demo review');
  run(
    db,
    `INSERT INTO reviews (id, candidate_id, reviewer_id, scores_json, notes, recommendation, submitted_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    randomUUID(),
    candidate.id,
    reviewer,
    JSON.stringify(scores),
    notes,
    recommendation,
    clock,
    clock,
  );
  run(db, "UPDATE candidates SET status = 'reviewed' WHERE id = ?", candidate.id);
}

// Performance marketing ------------------------------------------------------

const fmt = createFormatter('INR');
const { id: marketingId, family: marketing } = createAssessment('performance-marketing', 'Growth Marketing Manager');

const strongAnswers = (v: Variant): Answer[] => {
  const rtRoas = ((n(v, 'rtOrders') * n(v, 'aov')) / n(v, 'rtSpend')).toFixed(1);
  const cutAmount = (n(v, 'spend') * n(v, 'cutPct')) / 100;
  const lost = Math.round(cutAmount / (n(v, 'blendedCpa') * 1.3));
  return [
    {
      text: "Swiggy's push notifications. They're written for the exact moment you're hungry and they're funny without trying too hard, so I actually read them.",
      minutes: 1,
    },
    {
      text: `Biggest worry: the dashboards claim ${fmt.num(n(v, 'reportedOrders'))} orders but the store only saw ${fmt.num(n(v, 'orders'))}, so about ${n(v, 'overclaimPct')}% of the credit is double-counted. That makes the ${rtRoas}x on retargeting close to meaningless.\n\nFirst number I'd check: blended CPA (${fmt.money(n(v, 'blendedCpa'))}) against what a first order is actually worth after margin (${fmt.money(n(v, 'aov'))} × ${n(v, 'marginPct')}% = ${fmt.money(n(v, 'breakEvenCpa'))}). If blended CPA is above that we lose money on every first order, and the whole plan depends on the ${n(v, 'repeatPct')}% who come back.`,
      minutes: 4,
    },
    {
      choiceId: 'meta',
      text: `Most of the ${fmt.money(cutAmount)} comes out of Meta prospecting. It's the biggest line and its marginal CPA is worse than its average, so I'd assume ~1.3× blended: that's roughly ${fmt.num(lost)} fewer orders, before any fixes. To claw some back I'd concentrate what's left on the top two ad sets and pause the rest.\n\nRisk: prospecting feeds retargeting and brand search two or three weeks later. Early warning: branded search impressions and retargeting audience size, checked weekly. If either drops more than 15% I'd restore part of the budget.`,
      minutes: 5,
    },
    {
      text: `Not a mistake, but I under-weighted the halo. Brand search and retargeting were harvesting demand that prospecting created, which is exactly what the over-attribution in the first table hinted at.\n\nThis week: restore about a third of the prospecting cut, funded from the lowest-intent generic search terms, and set up a two-week geo holdout on Meta so we measure the halo properly instead of arguing about it.`,
      minutes: 4,
    },
    {
      text: `1) Target ROAS of ${n(v, 'agencyRoas')}x is below break-even. At ${n(v, 'marginPct')}% margin we need ${n(v, 'breakEvenRoas').toFixed(2)}x just to break even on first orders, and platform ROAS is already inflated by ~${n(v, 'overclaimPct')}%. I'd set the floor around ${(n(v, 'breakEvenRoas') * 1.3).toFixed(1)}x platform-reported.\n2) Summing platform ROAS double-counts. Report blended CPA and MER against store orders every week.\n3) The ${n(v, 'discountPct')}% discount cuts gross profit per order by about ${n(v, 'gpDropPct')}%, for volume we only need to hold, not grow.\n\nYouTube awareness won't pay back next month either; park it for a Q4 test. The creative refresh cadence is fine.`,
      minutes: 6,
    },
    {
      text: `Hi! Plan for next month on the new budget of ${fmt.money(n(v, 'newSpend'))}:\n• Most of the cut comes from Meta prospecting; search and retargeting stay.\n• We judge everything on store orders and blended CPA, not the ad dashboards (they over-count by ~${n(v, 'overclaimPct')}%).\n• No sitewide discount: it would eat ~${n(v, 'gpDropPct')}% of profit per order.\nRisk: fewer new customers could shrink brand search in 2–3 weeks. I'm watching it weekly and will flag early if we need to put some budget back.`,
      aiTranscript: `Me: Draft a 150 word WhatsApp update to a D2C founder. Budget cut ${n(v, 'cutPct')}% to ${fmt.money(n(v, 'newSpend'))}. Cutting Meta prospecting. Dashboards over-count orders by ${n(v, 'overclaimPct')}%. Margin ${n(v, 'marginPct')}%.\nAI: Hi [Founder]! Exciting times ahead! 🚀 We're optimising our marketing mix to drive efficient growth. By reallocating budget from Meta to higher-ROAS channels we expect to maintain strong performance while reducing CAC by 20%...\nMe: Remove the hype and emojis. Don't promise a CAC reduction, we have no basis for that. Use bullets. Add the one risk: prospecting cut may shrink brand search.\nAI: Hi! Here's the plan for next month...`,
      reflection:
        'Kept the bullet structure. Rejected the "reduce CAC by 20%" line (made up) and the hype. Added the discount point and the actual budget myself because the AI had them wrong.',
      minutes: 7,
    },
    {
      text: 'At a previous job I moved 30% of our Google budget into a new YouTube campaign in October because view-through conversions looked great. Orders fell about 12% in three weeks. The view-through numbers were mostly people who would have bought anyway. I rolled it back in week four. Now I never scale a channel without a holdout or at least a post-purchase survey.',
      minutes: 3,
    },
  ];
};

const weakAnswers = (v: Variant): Answer[] => [
  { text: 'I like Nike ads because they are inspiring and emotional.', minutes: 1 },
  {
    text: 'I would focus on improving creatives and optimising targeting to bring the CPA down. We should also look at the funnel and conversion rate on the website. Retargeting is performing really well so we should put more budget there.',
    minutes: 3,
  },
  {
    choiceId: 'even',
    text: 'Spreading the cut evenly is the safest option because it reduces risk and keeps all channels running. Orders should drop a bit but we can optimise to make up for it.',
    minutes: 3,
  },
  {
    text: 'I would explain to the founder that data takes time and we should wait another two weeks before making any big changes. Meanwhile we can test new creatives.',
    minutes: 3,
  },
  {
    text: `1. YouTube is expensive and hard to measure, so it may not deliver immediate ROI for ${s(v, 'company')}.\n2. Refreshing creatives every two weeks may be too frequent and can reduce learning for the algorithm.\n3. The discount could affect brand perception in the long run.\n\nOverall the plan needs clearer KPIs, a proper measurement framework and alignment with business goals.`,
    minutes: 2,
    signals: { pasteCount: 1, pasteChars: 412, largestPaste: 412, tabHidden: 2, hiddenMs: 95_000, keystrokes: 14 },
  },
  {
    text: 'Hi, next month we will optimise our marketing mix to drive efficient growth while reducing CAC. We will focus on high-performing channels and continuously test and learn. The main risk is market volatility.',
    aiTranscript: 'none',
    reflection: 'Wrote it myself.',
    minutes: 4,
  },
  {
    text: 'In my last role we had a campaign that did not perform well, so we analysed the data and optimised it, and results improved. I learned that it is important to be data driven.',
    minutes: 2,
  },
];

const ashaToken = invite(marketingId, marketing, 'Asha Rao', 'asha.rao@example.com', 1201);
const vikramToken = invite(marketingId, marketing, 'Vikram Shah', 'vikram.shah@example.com', 88017);
const nehaToken = invite(marketingId, marketing, 'Neha Kulkarni', 'neha.k@example.com', 40533);
invite(marketingId, marketing, 'Arjun Nair', 'arjun.nair@example.com', 7719);

minutes(60);
take(vikramToken, weakAnswers);
minutes(30);
review(
  vikramToken,
  reviewerId,
  marketing,
  (_stage, i) => (i === 0 ? 1 : 2),
  'Generic throughout; missed the break-even ROAS. Agency critique was pasted.',
  'reject',
);
minutes(20 * 60);
take(ashaToken, strongAnswers);
// Neha is mid-assessment right now.
clock = Date.now() - 8 * 60 * 1000;
take(nehaToken, strongAnswers, 2);

// Customer support ------------------------------------------------------------

const { id: supportId, family: support } = createAssessment('customer-support-lead', 'Customer Support Team Lead');
invite(supportId, support, 'Farah Siddiqui', 'farah.s@example.com', 5150);

console.log(`Demo data created in ${dataDir}
  Hiring manager: demo@proofwork.test / demo-password
  Reviewer:       reviewer@proofwork.test / demo-password`);
