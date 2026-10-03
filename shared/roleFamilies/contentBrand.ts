import type { Block, RoleFamily, StageContext } from '../types';
import { n, s } from '../variants';
import { AI_ALLOWED_INTRO, AI_ALLOWED_STEPS, pastWorkStage, warmupStage } from './common';

const COMPANIES = [
  {
    company: 'Ledgerly',
    product: 'invoicing software for small agencies',
    icp: 'owners of agencies with 5–50 staff',
    competitor: 'Paystream',
    differentiator: 'automatic payment reminders',
    listicle: '25 motivational quotes for Monday mornings',
    guide: 'How to chase late invoices without losing the client',
    template: 'Free invoice template (Google Sheets)',
  },
  {
    company: 'Shiftwise',
    product: 'shift scheduling software for clinics',
    icp: 'clinic and practice managers',
    competitor: 'Rosterly',
    differentiator: 'automatic cover requests when someone calls in sick',
    listicle: '30 funny nurse memes for your break',
    guide: 'How to build a fair weekend rota for a small clinic',
    template: 'Free staff rota template (Excel)',
  },
  {
    company: 'Stackroom',
    product: 'inventory software for D2C brands',
    icp: 'operations leads at D2C brands',
    competitor: 'Stockwise',
    differentiator: 'stock-out forecasts for every SKU',
    listicle: '20 inspiring quotes from famous founders',
    guide: 'How to set reorder points without a data team',
    template: 'Free inventory tracker template',
  },
] as const;

const PLAYS = [
  { id: 'bofu', label: 'Mostly comparison and "alternative to" pages' },
  { id: 'guides', label: 'Mostly in-depth how-to guides tied to the product' },
  { id: 'research', label: 'One flagship research report for brand and press' },
  { id: 'refresh', label: 'Refresh and re-optimise the existing top pages' },
];

/** Page rows in the brief: title, sessions, trials. */
const PAGES = ['listicle', 'guide', 'template', 'comparison', 'other'] as const;

function pageTitle(ctx: StageContext, page: (typeof PAGES)[number]) {
  const v = ctx.variant;
  if (page === 'comparison') return `${s(v, 'company')} vs ${s(v, 'competitor')}: an honest comparison`;
  if (page === 'other') return 'All other posts (60+)';
  return s(v, page);
}

export const contentBrand: RoleFamily = {
  id: 'content-brand',
  version: 1,
  name: 'Content & Brand Marketing',
  roles: ['Content Marketing Manager', 'Brand Manager', 'Content Lead'],
  catalog: {
    function: 'Marketing',
    seniority: ['Mid', 'Senior'],
    industries: ['SaaS'],
    skills: ['Writing', 'Analysis', 'Judgement'],
    keywords: ['content marketing', 'brand', 'content strategy', 'editor'],
  },
  summary:
    "A B2B SaaS blog whose traffic doubled while trials stayed flat, a quarter's content bet, and a content brief that contradicts the customer research.",

  warmups: [
    'What is a piece of content you read or watched recently that changed your mind about something? Why did it work?',
    'Which brand do you think has the clearest voice right now, and how can you tell?',
    'What is one content metric you think teams rely on too much, and why?',
  ],

  generate(rng, currency) {
    const inr = currency === 'INR';
    const co = rng.pick(COMPANIES);
    const sessions = rng.int(40, 120) * 1000;
    const share = {
      listicle: rng.int(45, 55),
      guide: rng.int(15, 20),
      template: rng.int(10, 14),
      comparison: rng.int(2, 4),
    };
    const otherShare = 100 - share.listicle - share.guide - share.template - share.comparison;
    // Sign-up rates per 10,000 sessions: the listicle attracts the wrong readers.
    const rate = {
      listicle: rng.int(4, 8),
      guide: rng.int(100, 140),
      template: rng.int(50, 80),
      comparison: rng.int(400, 700),
      other: rng.int(20, 40),
    };
    const pages = { ...share, other: otherShare };
    const row: Record<string, number> = {};
    let trials = 0;
    for (const page of PAGES) {
      const pageSessions = Math.round((sessions * pages[page]) / 100);
      const pageTrials = Math.round((pageSessions * rate[page]) / 10_000);
      row[`${page}Sessions`] = pageSessions;
      row[`${page}Trials`] = pageTrials;
      trials += pageTrials;
    }
    const price = rng.pick(inr ? [2999, 3999, 4999] : [49, 69, 89]);
    const competitorPrice = Math.round(price * rng.pick([0.7, 0.75, 0.8, 0.85]));
    return {
      ...co,
      ...row,
      sessions,
      sessionsBefore: Math.round(sessions * rng.pick([0.45, 0.5, 0.55])),
      trials,
      trialsBefore: Math.round(trials * rng.pick([0.92, 0.96, 1.02])),
      trialToPaidPct: rng.int(12, 20),
      price,
      competitorPrice,
      reasonDifferentiatorPct: rng.int(41, 55),
      reasonIntegrationsPct: rng.int(15, 20),
      reasonPricePct: rng.int(8, 13),
      capacity: 12,
      priceShopperClosePct: rng.int(8, 12),
      normalClosePct: rng.int(20, 26),
      guidesOnPageOne: 3,
      guidesTrialUpPct: rng.int(6, 10),
      researchLinks: rng.int(40, 90),
      researchTrials: rng.int(3, 9),
      refreshTrafficDropPct: rng.int(25, 35),
      refreshTrialsUpPct: rng.int(15, 30),
    };
  },

  brief(ctx) {
    const v = ctx.variant;
    const { fmt } = ctx;
    return [
      {
        type: 'p',
        text: `You've just joined **${s(v, 'company')}**, which sells ${s(v, 'product')}. Its customers are ${s(v, 'icp')}. You lead content and brand; you have one writer and a freelance budget.`,
      },
      {
        type: 'p',
        text: `Blog traffic has grown from ${fmt.num(n(v, 'sessionsBefore'))} to **${fmt.num(n(v, 'sessions'))} sessions a month** in six months. Trials started from the blog went from ${fmt.num(n(v, 'trialsBefore'))} to **${fmt.num(n(v, 'trials'))}** a month. About ${fmt.pct(n(v, 'trialToPaidPct'))} of trials become paying customers at ${fmt.money(n(v, 'price'))} a month.`,
      },
      {
        type: 'table',
        caption: 'Last month, by page',
        columns: ['Page', 'Sessions', 'Trials started', 'Sign-up rate'],
        rows: PAGES.map((page) => {
          const sessions = n(v, `${page}Sessions`);
          const trials = n(v, `${page}Trials`);
          return [
            pageTitle(ctx, page),
            fmt.num(sessions),
            fmt.num(trials),
            `${((trials / Math.max(sessions, 1)) * 100).toFixed(2)}%`,
          ];
        }),
      },
      { type: 'h', text: 'From last quarter’s customer interviews' },
      {
        type: 'list',
        items: [
          `Main reason they chose ${s(v, 'company')}: ${s(v, 'differentiator')} (${fmt.pct(n(v, 'reasonDifferentiatorPct'))}), integrations (${fmt.pct(n(v, 'reasonIntegrationsPct'))}), price (${fmt.pct(n(v, 'reasonPricePct'))}).`,
          `${s(v, 'competitor')} is the competitor prospects mention most. It costs ${fmt.money(n(v, 'competitorPrice'))} a month.`,
        ],
      },
      {
        type: 'callout',
        text: 'The company and numbers are fictional, and every candidate gets a slightly different version. A calculator is fine.',
      },
    ];
  },

  stages: [
    warmupStage(),
    {
      id: 'first-read',
      kind: 'scenario',
      title: 'Traffic up, trials flat',
      summary:
        'Explain to the CEO why traffic doubled but trials did not. Think aloud: shows whether they judge content by intent, not volume.',
      timeLimitSec: 300,
      voiceMaxSec: 120,
      preferVoice: true,
      thinkAloud: true,
      scored: true,
      prompt: (ctx) => [
        {
          type: 'p',
          text: `The CEO says: **"Traffic doubled and trials didn't move. Is the blog a vanity project?"** What do you see in the numbers, and what do you tell them?`,
        },
        {
          type: 'p',
          text: `Refer to specific pages and figures. ${s(ctx.variant, 'company')}'s numbers are on the left.`,
        },
      ],
      reviewerGuide: (ctx) => {
        const v = ctx.variant;
        const { fmt } = ctx;
        return [
          { type: 'p', text: 'Strong answers notice:' },
          {
            type: 'list',
            items: [
              `**The growth is the listicle.** "${s(v, 'listicle')}" brings ${fmt.num(n(v, 'listicleSessions'))} sessions but only ${fmt.num(n(v, 'listicleTrials'))} trials: readers with no buying intent.`,
              `**Intent beats volume.** The comparison page has ${fmt.num(n(v, 'comparisonSessions'))} sessions yet ${fmt.num(n(v, 'comparisonTrials'))} trials, the highest sign-up rate by far; the how-to guide is next.`,
              '**Measurement caveat.** Blog readers may sign up later or via another channel, so check assisted conversions before cutting anything.',
            ],
          },
          {
            type: 'p',
            text: 'A good answer to the CEO concedes the traffic metric was the wrong goal, and proposes measuring trials (and pipeline) per page. Weak answers defend the traffic or give generic "content takes time" reassurance.',
          },
        ];
      },
      rubric: [
        {
          id: 'numbers',
          label: 'Works from the actual numbers',
          weight: 2,
          anchors: [
            'No specific figures.',
            'Quotes figures without connecting them.',
            'Shows the growth comes from low-intent pages, with numbers.',
            'Compares sign-up rates across pages and sizes the opportunity in bottom-funnel content.',
          ],
        },
        {
          id: 'intent',
          label: 'Judges content by intent and outcome',
          weight: 1,
          anchors: [
            'Treats traffic as success.',
            'Mentions conversions vaguely.',
            'Separates high-intent from low-intent content clearly.',
            'Proposes a better success metric and how to measure it, including assisted conversions.',
          ],
        },
        {
          id: 'ceo',
          label: 'Honest, clear message to the CEO',
          weight: 1,
          anchors: [
            'Defensive or vague.',
            'Understandable but hedged.',
            'Direct: admits what is not working and what to change.',
            'Direct, plus a concrete measure of success for next quarter.',
          ],
        },
      ],
      followUps: (ctx) => [
        `If you stopped publishing pieces like "${s(ctx.variant, 'listicle')}" tomorrow, what would you expect to happen to trials, and why?`,
        'How would you check whether blog readers sign up later through another channel?',
      ],
    },
    {
      id: 'quarter-bet',
      kind: 'decision',
      title: "Next quarter's bet",
      summary: "Commit to how the next quarter's 12 pieces are spent and estimate the trial impact. Think aloud.",
      timeLimitSec: 360,
      voiceMaxSec: 150,
      preferVoice: true,
      thinkAloud: true,
      scored: true,
      choices: PLAYS,
      prompt: (ctx) => [
        {
          type: 'p',
          text: `You have capacity for **${n(ctx.variant, 'capacity')} pieces** next quarter. Where does most of it go?`,
        },
        {
          type: 'p',
          text: 'Pick one, then explain why, roughly how many extra trials a month you expect (and how you got that), and the risk you are accepting.',
        },
      ],
      reviewerGuide: () => [
        {
          type: 'p',
          text: 'Any option can score well if the reasoning comes from this data. Comparison pages have the strongest conversion evidence; guides compound more slowly; a research report builds brand but rarely trials in one quarter; refreshing can lift conversion while reducing vanity traffic.',
        },
        {
          type: 'p',
          text: 'Look for an estimate built from the per-page sign-up rates, and a named risk (legal claims on comparison pages, slow ranking, attribution, traffic dropping in the board deck).',
        },
      ],
      rubric: [
        {
          id: 'reasoning',
          label: 'Reasons from this data',
          weight: 2,
          anchors: [
            'Generic content advice.',
            'Plausible but not tied to the numbers.',
            'Uses the sign-up rates and customer research to justify the choice.',
            'Weighs the alternatives, including what is lost by not choosing them.',
          ],
        },
        {
          id: 'estimate',
          label: 'Quantified expectation',
          weight: 1,
          anchors: [
            'No estimate.',
            'A number with no method.',
            'A number built from the page data.',
            'A range with stated assumptions.',
          ],
        },
        {
          id: 'risk',
          label: 'Risk and early signal',
          weight: 1,
          anchors: [
            'No risk named.',
            'Generic risk.',
            'Specific risk of this choice.',
            'Specific risk plus the early signal they would watch.',
          ],
        },
      ],
      followUps: (_ctx, answer) => [
        `You chose "${answer.choiceLabel ?? 'your option'}". What was your second choice, and what would have changed your mind?`,
        'What would you report to the CEO after four weeks to show it is working?',
      ],
    },
    {
      id: 'two-months-later',
      kind: 'branch',
      title: 'Two months later',
      summary: 'The situation changes based on their bet. Tests whether they adapt and explain what happened.',
      timeLimitSec: 300,
      voiceMaxSec: 120,
      preferVoice: true,
      scored: true,
      dependsOn: 'quarter-bet',
      prompt: (ctx) => {
        const v = ctx.variant;
        const { fmt } = ctx;
        const byChoice: Record<string, Block[]> = {
          bofu: [
            {
              type: 'p',
              text: `Comparison pages are bringing trials. But ${s(v, 'competitor')}'s lawyer has emailed about a pricing claim on your comparison page, and Sales says these leads close at ${fmt.pct(n(v, 'priceShopperClosePct'))} versus ${fmt.pct(n(v, 'normalClosePct'))} for other leads.`,
            },
            { type: 'p', text: '**What do you do this week, and what do you tell Sales?**' },
          ],
          guides: [
            {
              type: 'p',
              text: `After eight weeks only ${n(v, 'guidesOnPageOne')} of your new guides rank on page one, and blog trials are up just ${fmt.pct(n(v, 'guidesTrialUpPct'))}. The CEO asks whether to stop.`,
            },
            { type: 'p', text: '**What do you tell the CEO, and what do you change?**' },
          ],
          research: [
            {
              type: 'p',
              text: `The report was covered by two trade publications and earned ${n(v, 'researchLinks')} backlinks, but only ${n(v, 'researchTrials')} trials. The CEO asks if it was worth a quarter.`,
            },
            { type: 'p', text: '**What do you say, and what happens next quarter?**' },
          ],
          refresh: [
            {
              type: 'p',
              text: `After cutting the fluff from top pages, blog traffic is down ${fmt.pct(n(v, 'refreshTrafficDropPct'))} but trials are up ${fmt.pct(n(v, 'refreshTrialsUpPct'))}. The board deck shows a falling traffic line and the CEO is nervous.`,
            },
            { type: 'p', text: '**How do you handle the board deck and the CEO?**' },
          ],
        };
        return byChoice[ctx.choices['quarter-bet'] ?? 'bofu'] ?? byChoice.bofu;
      },
      reviewerGuide: (ctx) => {
        const guides: Record<string, string> = {
          bofu: 'Two issues: legal risk (correct or substantiate the claim fast, keep comparisons factual and dated) and lead quality (agree with Sales on qualification, segment by the differentiator, not price). Weak: ignores the lawyer or argues with Sales.',
          guides:
            'Tests patience with evidence. Strong: explains ranking timelines, checks leading indicators (impressions, positions 4–20), improves internal links and updates the weakest pieces; keeps a small bottom-funnel slice for quick wins. Weak: stops everything or just asks for more time.',
          research:
            'Tests honest attribution. Strong: separates brand outcomes (links, press, branded search) from trials, uses the links to lift commercial pages, and is candid that it was not a trial play. Weak: claims it drove trials or calls it a pure loss.',
          refresh:
            'Tests changing the metric. Strong: reframes the board view around trials and pipeline per session, shows the trade-off with numbers, and agrees a north-star metric with the CEO. Weak: restores fluff to save the chart.',
        };
        const choice = ctx.choices['quarter-bet'] ?? 'bofu';
        return [
          { type: 'p', text: `They chose **${PLAYS.find((p) => p.id === choice)?.label ?? choice}**.` },
          { type: 'p', text: guides[choice] ?? guides.bofu },
        ];
      },
      rubric: [
        {
          id: 'adapt',
          label: 'Adapts to the new information',
          weight: 2,
          anchors: [
            'Ignores or dismisses it.',
            'Acknowledges it with a thin response.',
            'Changes course where the evidence says to.',
            'Changes course in proportion to the evidence and says what would trigger more.',
          ],
        },
        {
          id: 'stakeholders',
          label: 'Handles stakeholders',
          weight: 1,
          anchors: [
            'Defensive or silent.',
            'Informs people late or vaguely.',
            'Clear, honest communication with the right people.',
            'Clear communication that also agrees a better metric or process.',
          ],
        },
        {
          id: 'action',
          label: 'Concrete next steps',
          weight: 1,
          anchors: [
            'No action.',
            'Vague actions.',
            'Specific actions in order.',
            'Specific actions with owners and a success check.',
          ],
        },
      ],
      followUps: () => [
        'If the CEO pushed back on your answer, what data would you bring next time?',
        'Knowing this, would you make the same bet again?',
      ],
    },
    {
      id: 'content-brief',
      kind: 'critique',
      title: "Review a freelancer's brief",
      summary:
        'Critique a content brief that contradicts the customer research and makes a false pricing claim. Think aloud.',
      timeLimitSec: 420,
      voiceMaxSec: 180,
      preferVoice: false,
      thinkAloud: true,
      scored: true,
      prompt: (ctx) => [
        {
          type: 'p',
          text: `A freelancer drafted the brief below for the "${s(ctx.variant, 'company')} vs ${s(ctx.variant, 'competitor')}" page. **Name the three most important problems, most important first, and what you would change.**`,
        },
        { type: 'p', text: 'You do not need to comment on every line.' },
      ],
      material: (ctx) => {
        const v = ctx.variant;
        return [
          { type: 'h', text: `Brief: ${s(v, 'company')} vs ${s(v, 'competitor')}` },
          {
            type: 'list',
            items: [
              '**Audience:** freelancers and students looking for free tools.',
              `**Angle:** position ${s(v, 'company')} as the cheapest option on the market.`,
              '**Key message:** our sleek design and dark mode.',
              '**Format:** include a side-by-side comparison table near the top.',
              '**Call to action:** end with a newsletter sign-up box.',
              '**Length:** about 1,500 words.',
            ],
          },
        ];
      },
      reviewerGuide: (ctx) => {
        const v = ctx.variant;
        const { fmt } = ctx;
        return [
          { type: 'p', text: 'Planted problems:' },
          {
            type: 'list',
            items: [
              `**Wrong audience.** Customers are ${s(v, 'icp')}, not freelancers and students looking for free tools.`,
              `**The pricing claim is false.** ${s(v, 'competitor')} costs ${fmt.money(n(v, 'competitorPrice'))} against ${s(v, 'company')}'s ${fmt.money(n(v, 'price'))}. Publishing it is a legal and trust risk; price is only ${fmt.pct(n(v, 'reasonPricePct'))} of why customers choose ${s(v, 'company')}.`,
              `**It ignores why customers buy.** ${s(v, 'differentiator')} is the reason for ${fmt.pct(n(v, 'reasonDifferentiatorPct'))} of customers; design is not mentioned in the research.`,
              '**Wrong call to action** for a bottom-of-funnel page: it should be a trial or demo, not a newsletter.',
            ],
          },
          {
            type: 'p',
            text: 'The comparison table and length are fine. Ranking them as top problems is a negative signal.',
          },
        ];
      },
      rubric: [
        {
          id: 'flaws',
          label: 'Finds the context-bound problems',
          weight: 2,
          anchors: [
            'Misses the false pricing claim and the audience mismatch.',
            'Finds one of them.',
            'Finds the pricing claim and one other, using the numbers.',
            'Finds the pricing claim, the audience and the missing differentiator, with numbers.',
          ],
        },
        {
          id: 'ranking',
          label: 'Ranks by impact',
          weight: 1,
          anchors: [
            'No ranking, or ranks the table or length highly.',
            'Ranking without reasons.',
            'Sensible ranking with reasons.',
            'Ranking tied to legal risk and trials.',
          ],
        },
        {
          id: 'fixes',
          label: 'Concrete rewrite direction',
          weight: 1,
          anchors: [
            'Criticism only.',
            'Vague fixes.',
            'A specific fix for each problem.',
            'A rewritten angle and CTA grounded in the customer research.',
          ],
        },
      ],
      followUps: (ctx) => [
        `How would you make the comparison with ${s(ctx.variant, 'competitor')} fair and still persuasive?`,
        'Which line in the brief did you think was fine, and why?',
      ],
    },
    {
      id: 'positioning',
      kind: 'ai_allowed',
      title: 'Positioning (AI allowed)',
      summary:
        'Write the comparison page positioning and headlines with any AI tool, and paste the conversation. Shows how they work with AI.',
      timeLimitSec: 540,
      voiceMaxSec: 0,
      preferVoice: false,
      scored: true,
      prompt: (ctx) => [
        { type: 'p', text: AI_ALLOWED_INTRO },
        {
          type: 'p',
          text: `Write a two-sentence positioning statement and three headline options for the "${s(ctx.variant, 'company')} vs ${s(ctx.variant, 'competitor')}" page.`,
        },
        { type: 'list', ordered: true, items: AI_ALLOWED_STEPS },
      ],
      reviewerGuide: (ctx) => [
        {
          type: 'p',
          text: `Check the transcript: did they give the AI the customer research (${s(ctx.variant, 'differentiator')} is the main reason to buy) and the real prices? AI drafts tend to lead with "affordable" or "all-in-one", which is wrong here.`,
        },
        {
          type: 'p',
          text: 'Strong answers lead with the differentiator, avoid unverifiable claims, and write for the real audience.',
        },
      ],
      rubric: [
        {
          id: 'judgment',
          label: 'Judgment with AI',
          weight: 2,
          anchors: [
            'Pasted output unchanged, errors kept.',
            'Light edits; did not give the AI the real context.',
            'Gave the AI the context and fixed its mistakes.',
            'Used AI deliberately and rejected weak suggestions with reasons.',
          ],
        },
        {
          id: 'accuracy',
          label: 'True to the research and the facts',
          weight: 1,
          anchors: [
            'False or generic claims.',
            'Mostly generic.',
            'Leads with the real differentiator; no false claims.',
            'Sharp, specific and fair to the competitor.',
          ],
        },
        {
          id: 'craft',
          label: 'Writing craft',
          weight: 1,
          anchors: [
            'Bland or jargon-heavy.',
            'Serviceable.',
            'Clear and specific headlines.',
            'Distinctive, varied options a team could test.',
          ],
        },
      ],
      followUps: () => ['What did the AI get wrong first time?', 'Which headline would you test first, and how?'],
    },
    pastWorkStage({
      id: 'real-campaign',
      title: 'A real piece of content',
      summary:
        "A real piece of content or campaign that didn't move the business metric. Checks specificity and ownership.",
      question:
        'Tell us about a piece of content or a campaign you were proud of that did not move the business metric.',
    }),
  ],
};
