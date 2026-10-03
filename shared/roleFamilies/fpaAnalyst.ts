import type { Block, RoleFamily, Variant } from '../types';
import { n, s } from '../variants';
import { ADAPTS, FICTIONAL_CALLOUT, NEXT_STEPS, aiAllowedStage, pastWorkStage, warmupStage } from './common';

const COMPANIES = [
  { company: 'Cloudnest', product: 'accounting software for small businesses', unitNoun: 'paid subscriptions' },
  { company: 'Homeglow', product: 'smart lighting kits online', unitNoun: 'kits sold' },
  { company: 'Pulse Fitness', product: 'gym memberships across 30 centres', unitNoun: 'memberships sold' },
] as const;

const OPTIONS = [
  { id: 'keep', label: 'Keep the annual budget; assume the shortfall is caught up later in the year' },
  { id: 'runrate', label: 'Cut the revenue forecast to the current run rate and keep costs as budgeted' },
  { id: 'both', label: 'Cut revenue to the run rate and move the delayed hiring and marketing into later quarters' },
  { id: 'scenarios', label: 'Show the CFO three scenarios (low, base, high) instead of one number' },
];

/** The quarter in money units (₹ lakh or $ thousand), worked out from the variant. */
export function fpaMath(v: Variant) {
  const revB = n(v, 'unitsB') * n(v, 'priceB');
  const revA = n(v, 'unitsA') * n(v, 'priceA');
  const gm = n(v, 'grossMarginPct') / 100;
  const payB = n(v, 'payrollB');
  const payA = payB - n(v, 'delayedHires') * n(v, 'hireMonthly') * n(v, 'monthsDelayed');
  const mktB = n(v, 'marketingB');
  const mktA = Math.round(mktB * n(v, 'marketingSpentPct')) / 100;
  const ebitdaB = revB * gm - payB - mktB;
  const ebitdaA = revA * gm - payA - mktA;
  return {
    revB,
    revA,
    revVar: revA - revB,
    volumeEffect: (n(v, 'unitsA') - n(v, 'unitsB')) * n(v, 'priceB'),
    priceEffect: (n(v, 'priceA') - n(v, 'priceB')) * n(v, 'unitsA'),
    payB,
    payA,
    mktB,
    mktA,
    ebitdaB,
    ebitdaA,
  };
}

export const fpaAnalyst: RoleFamily = {
  id: 'fpa-analyst',
  version: 1,
  name: 'Financial Analyst (FP&A)',
  roles: ['FP&A Analyst', 'Financial Analyst', 'Finance Business Partner', 'Senior Financial Analyst'],
  catalog: {
    function: 'Finance',
    seniority: ['Mid', 'Senior'],
    industries: ['SaaS', 'D2C & e-commerce', 'Any'],
    skills: ['Numbers', 'Analysis', 'Communication'],
    keywords: [
      'FP&A',
      'budgeting',
      'forecasting',
      'variance analysis',
      'financial planning',
      'MIS',
      'business finance',
    ],
  },
  summary:
    'Profit beat the budget, so the CEO is happy, but revenue missed: split the miss into price and volume, see that the cost savings are only timing, reforecast the year, and catch the errors in a junior’s reforecast.',

  warmups: [
    'Tell us about a budget you have managed, at work or at home. What surprised you?',
    'How would you explain "profit" versus "cash" to a friend?',
    'What is one number you would want to see every week if you ran a business?',
  ],

  generate(rng, currency) {
    const inr = currency === 'INR';
    const co = rng.pick(COMPANIES);
    const unitsB = rng.int(120, 160) * 100;
    // Units on plan; the miss is price. Ranges keep the profit beat (from delayed costs) bigger than the margin lost.
    const unitsA = Math.round(unitsB * rng.pick([1.0, 1.01]));
    const priceB = inr ? rng.pick([0.024, 0.028, 0.032]) : rng.pick([0.03, 0.035, 0.04]); // per unit, in lakh / thousand
    const discountPct = rng.pick([8, 9, 10]);
    const priceA = Math.round(priceB * (1 - discountPct / 100) * 100000) / 100000;
    const revB = unitsB * priceB;
    const grossMarginPct = rng.pick([60, 65, 70]);
    const payrollB = Math.round(revB * rng.pick([0.28, 0.3, 0.32]));
    const marketingB = Math.round(revB * rng.pick([0.16, 0.18, 0.2]));
    const delayedHires = rng.int(6, 9);
    // Two months of the late hires' pay is 15–20% of the quarter's payroll budget.
    const hireMonthly = Math.round(((payrollB * rng.pick([0.15, 0.18, 0.2])) / (delayedHires * 2)) * 100) / 100;
    return {
      ...co,
      unit: inr ? '₹ lakh' : '$ thousand',
      unitsB,
      unitsA,
      priceB,
      priceA,
      discountPct,
      grossMarginPct,
      payrollB,
      marketingB,
      marketingSpentPct: rng.pick([65, 68, 70]),
      delayedHires,
      hireMonthly,
      monthsDelayed: 2,
      quarterLabel: rng.pick(['Q1', 'Q2']),
      oneOffDeal: Math.round(revB * rng.pick([0.05, 0.06]) * 10) / 10,
      annualFactor: 4,
    };
  },

  brief(ctx) {
    const v = ctx.variant;
    const m = fpaMath(v);
    const f = (x: number) => ctx.fmt.num(x);
    const unit = s(v, 'unit');
    const priceFmt = (p: number) => (unit.startsWith('₹') ? ctx.fmt.money(p * 100000) : ctx.fmt.money(p * 1000));
    return [
      {
        type: 'p',
        text: `You're the FP&A analyst at **${s(v, 'company')}**, which sells ${s(v, 'product')}. ${s(v, 'quarterLabel')} has just closed. The CEO says: "Profit beat the budget, great quarter." The CFO asks you for the real story before the board pack goes out.`,
      },
      {
        type: 'table',
        caption: `${s(v, 'quarterLabel')}: budget against actual (${unit})`,
        columns: ['Line', 'Budget', 'Actual', 'Difference'],
        rows: [
          [
            s(v, 'unitNoun').charAt(0).toUpperCase() + s(v, 'unitNoun').slice(1),
            f(n(v, 'unitsB')),
            f(n(v, 'unitsA')),
            f(n(v, 'unitsA') - n(v, 'unitsB')),
          ],
          ['Average price', priceFmt(n(v, 'priceB')), priceFmt(n(v, 'priceA')), `−${n(v, 'discountPct')}%`],
          ['Revenue', f(m.revB), f(m.revA), f(m.revVar)],
          ['Gross margin', `${n(v, 'grossMarginPct')}%`, `${n(v, 'grossMarginPct')}%`, '0'],
          ['Payroll', f(m.payB), f(m.payA), f(m.payA - m.payB)],
          ['Marketing', f(m.mktB), f(m.mktA), f(m.mktA - m.mktB)],
          [
            'EBITDA (profit before interest, tax and depreciation)',
            f(m.ebitdaB),
            f(m.ebitdaA),
            `+${f(m.ebitdaA - m.ebitdaB)}`,
          ],
        ],
      },
      { type: 'h', text: 'Notes from the business' },
      {
        type: 'list',
        items: [
          `Sales ran a ${n(v, 'discountPct')}% launch offer all quarter to hit unit targets.`,
          `${n(v, 'delayedHires')} budgeted hires joined two months late; they are all on board now.`,
          'Marketing paused two campaigns while the agency was replaced; the new agency starts next month with the full budget.',
        ],
      },
      { type: 'callout', text: FICTIONAL_CALLOUT },
    ];
  },

  stages: [
    warmupStage(),
    {
      id: 'variance',
      kind: 'scenario',
      title: 'Was it really a good quarter?',
      summary:
        'Explain a profit beat that hides a revenue miss: split price and volume, and see the cost savings are timing. Think aloud.',
      timeLimitSec: 360,
      voiceMaxSec: 150,
      preferVoice: true,
      thinkAloud: true,
      scored: true,
      prompt: () => [
        {
          type: 'p',
          text: '**Explain the quarter to the CFO in numbers.** Why did revenue miss, why did profit beat, and will the beat last?',
        },
      ],
      reviewerGuide: (ctx) => {
        const v = ctx.variant;
        const m = fpaMath(v);
        const f = (x: number) => ctx.fmt.num(x);
        return [
          {
            type: 'list',
            items: [
              `**Revenue miss ${f(m.revVar)}** is almost all price: volume effect ≈ ${f(m.volumeEffect)}, price effect ≈ ${f(m.priceEffect)} (the ${n(v, 'discountPct')}% offer). Units were on plan.`,
              `**Profit beat ${f(m.ebitdaA - m.ebitdaB)}** comes from spending less: payroll ${f(m.payA - m.payB)} (hires late) and marketing ${f(m.mktA - m.mktB)} (campaigns paused).`,
              '**Both savings are timing and will reverse:** the hires are on board now, and the new agency starts with the full budget. The price cut, if it continues, is permanent.',
            ],
          },
          {
            type: 'p',
            text: 'Strong answers say this was not a good quarter underneath: the business sold the same volume at a lower price, and profit only looks better because spending was delayed. Weak answers agree with the CEO.',
          },
        ];
      },
      rubric: [
        {
          id: 'decomposition',
          label: 'Splits the revenue miss',
          weight: 2,
          anchors: [
            'No explanation of the miss.',
            'Blames "lower sales" generally.',
            'Shows it is price, not volume.',
            'Shows the price and volume effects with numbers.',
          ],
        },
        {
          id: 'timing',
          label: 'Sees the savings are timing',
          weight: 1,
          anchors: [
            'Calls the beat good news.',
            'Hints at it.',
            'Says hiring and marketing savings will reverse.',
            'Says so and sizes what it means next quarter.',
          ],
        },
        {
          id: 'message',
          label: 'Clear message to the CFO',
          weight: 1,
          anchors: [
            'Confusing.',
            'Correct but long.',
            'Clear and short.',
            'Clear, with the one question the CFO should ask Sales.',
          ],
        },
      ],
      followUps: () => [
        'What would you ask the Sales head about the launch offer?',
        'If the offer ends, what happens to units, in your view?',
      ],
    },
    {
      id: 'reforecast',
      kind: 'decision',
      title: 'Reforecast the year',
      summary: 'Choose how to reforecast after the quarter. Tests forecasting judgement. Think aloud.',
      timeLimitSec: 360,
      voiceMaxSec: 150,
      preferVoice: true,
      thinkAloud: true,
      scored: true,
      choices: OPTIONS,
      prompt: () => [
        {
          type: 'p',
          text: "**How do you reforecast the rest of the year?** Pick one, show roughly what it does to annual revenue and profit, and say what you're assuming about the discount.",
        },
      ],
      reviewerGuide: (ctx) => {
        const m = fpaMath(ctx.variant);
        const f = (x: number) => ctx.fmt.num(x);
        return [
          {
            type: 'p',
            text: `If the discount continues, revenue runs about ${f(-m.revVar)} a quarter below budget. The delayed costs come back (and marketing may catch up). Cutting revenue and re-timing costs is the most accurate single forecast; scenarios are strong if each has clear assumptions and the CFO still gets a recommended base case. Keeping the budget assumes a catch-up nobody has a plan for. Cutting revenue but leaving costs untouched ignores the timing shift.`,
          },
        ];
      },
      rubric: [
        {
          id: 'judgement',
          label: 'Sound forecast',
          weight: 2,
          anchors: [
            'Keeps the budget without reasons.',
            'Adjusts one side only.',
            'Adjusts revenue and costs with stated assumptions.',
            'Does that and names the assumption that matters most (the discount).',
          ],
        },
        {
          id: 'maths',
          label: 'Rough numbers',
          weight: 1,
          anchors: [
            'None.',
            'Wrong or unexplained.',
            'Reasonable annual impact.',
            'Reasonable and quarter by quarter.',
          ],
        },
      ],
      followUps: (_ctx, answer) => [
        `You chose "${answer.choiceLabel ?? 'your approach'}". What would the CEO push back on?`,
        'Which single assumption would you check every month?',
      ],
    },
    {
      id: 'cfo-reacts',
      kind: 'branch',
      title: 'The CFO and CEO react',
      summary: 'Pushback on their reforecast. Tests holding a position with numbers.',
      timeLimitSec: 300,
      voiceMaxSec: 120,
      preferVoice: true,
      scored: true,
      dependsOn: 'reforecast',
      prompt: (ctx) => {
        const v = ctx.variant;
        const byChoice: Record<string, Block[]> = {
          keep: [
            {
              type: 'p',
              text: `Next quarter, the discount continued, the hires were paid in full and the new agency spent its whole budget. Profit missed the budget badly. The CFO asks why the forecast didn't warn them.`,
            },
            { type: 'p', text: '**What do you say and do?**' },
          ],
          runrate: [
            {
              type: 'p',
              text: 'The CEO looks at your forecast: "Revenue is down but costs are the same, so profit collapses? That\'s too gloomy for the board." The CFO asks you to check it.',
            },
            { type: 'p', text: '**What do you do?**' },
          ],
          both: [
            {
              type: 'p',
              text: `The Sales head insists the ${n(v, 'discountPct')}% offer ends this month and prices will recover fully, so your revenue cut is "too pessimistic". The CEO wants to use the Sales view.`,
            },
            { type: 'p', text: '**What do you do?**' },
          ],
          scenarios: [
            {
              type: 'p',
              text: 'The CFO says: "Three numbers confuse the board. Which one do I present?" The low and high cases are far apart.',
            },
            { type: 'p', text: '**What do you do?**' },
          ],
        };
        return byChoice[ctx.choices.reforecast ?? 'both'] ?? byChoice.both;
      },
      reviewerGuide: (ctx) => {
        const guides: Record<string, string> = {
          keep: 'Owning it: explain plainly that the cost savings were timing and the discount continued, and reforecast now with clear assumptions. Weak: blames the business.',
          runrate:
            'The CEO has a point: costs should be re-timed too, not left as budgeted. Strong: correct that, but hold firm that revenue is lower if the discount continues. Weak: caves on revenue.',
          both: 'Strong: test the Sales claim (what happens to units when the offer ends? is it in writing?), keep a base case with a clearly labelled upside if prices recover, and track it monthly. Weak: adopts the Sales view without evidence.',
          scenarios:
            'Strong: recommend the base case with the key assumption stated, and keep the others as sensitivity. Weak: makes the CFO choose.',
        };
        const choice = ctx.choices.reforecast ?? 'both';
        return [
          { type: 'p', text: `They chose **${OPTIONS.find((o) => o.id === choice)?.label ?? choice}**.` },
          { type: 'p', text: guides[choice] ?? guides.both },
        ];
      },
      rubric: [ADAPTS, NEXT_STEPS],
      followUps: () => [
        'How would you stop the board being surprised next quarter?',
        'Who owns the forecast: Finance or the business?',
      ],
    },
    {
      id: 'review-reforecast',
      kind: 'critique',
      title: "Check a junior's reforecast",
      summary:
        'A reforecast that annualises a quarter with a one-off deal in it, mislabels a variance and drops the delayed costs. Think aloud.',
      timeLimitSec: 420,
      voiceMaxSec: 180,
      preferVoice: false,
      thinkAloud: true,
      scored: true,
      prompt: () => [
        {
          type: 'p',
          text: 'A junior analyst sends you this reforecast summary. **Find the errors, worst first, and say how much each one throws the forecast off.**',
        },
      ],
      material: (ctx) => {
        const v = ctx.variant;
        const m = fpaMath(v);
        const f = (x: number) => ctx.fmt.num(x);
        return [
          { type: 'h', text: `Reforecast summary (${s(v, 'unit')})` },
          {
            type: 'list',
            items: [
              `Full-year revenue = this quarter's revenue × ${n(v, 'annualFactor')} = ${f(m.revA * n(v, 'annualFactor'))}. (This quarter included a one-off bulk order of ${n(v, 'oneOffDeal')}.)`,
              `Full-year payroll = this quarter's payroll × ${n(v, 'annualFactor')} = ${f(m.payA * n(v, 'annualFactor'))}.`,
              `Revenue variance this quarter: ${f(m.revVar)}, shown as **favourable**.`,
              "Marketing for the rest of the year kept at this quarter's level.",
              'Source: the ledger as of the close date; reviewed by the controller.',
            ],
          },
        ];
      },
      reviewerGuide: (ctx) => {
        const v = ctx.variant;
        const f = (x: number) => ctx.fmt.num(x);
        return [
          { type: 'p', text: 'Planted problems:' },
          {
            type: 'list',
            items: [
              `**Annualising a quarter with a one-off in it:** the ${n(v, 'oneOffDeal')} bulk order shouldn't repeat, so revenue is overstated by about ${f(n(v, 'oneOffDeal') * (n(v, 'annualFactor') - 1))} for the remaining quarters.`,
              `**Payroll annualised from an artificially low quarter:** the ${n(v, 'delayedHires')} late hires are on board now, so the remaining quarters cost more than this one.`,
              "**Marketing kept at the paused level** ignores the new agency's full budget.",
              '**A revenue shortfall labelled "favourable"**: it\'s unfavourable. A sign error like this misleads anyone skimming.',
            ],
          },
          { type: 'p', text: 'Decoy: the source and review note are fine.' },
        ];
      },
      rubric: [
        {
          id: 'critical',
          label: 'Catches the errors',
          weight: 2,
          anchors: [
            'Misses most errors.',
            'Catches one or two.',
            'Catches the one-off and the cost timing.',
            'Catches all four.',
          ],
        },
        {
          id: 'size',
          label: 'Sizes them',
          weight: 1,
          anchors: [
            'No sizing.',
            'Says "overstated".',
            'Sizes the biggest error.',
            'Sizes each and the combined effect on profit.',
          ],
        },
        {
          id: 'severity',
          label: 'Orders by impact',
          weight: 1,
          anchors: ['Decoy first.', 'Unexplained.', 'Sensible order.', 'Ordered by size of error, explained.'],
        },
      ],
      followUps: () => [
        'How would you teach the junior to avoid annualising one-offs?',
        'What checks would you add before a forecast goes to the CFO?',
      ],
    },
    aiAllowedStage({
      id: 'board-commentary',
      title: 'Board pack commentary (AI allowed)',
      summary: 'Write the quarter commentary for the board pack with AI. Catches spin and arithmetic errors.',
      task: () => [
        {
          type: 'p',
          text: 'Write the commentary for the board pack (under 180 words): revenue against budget and why, profit against budget and why, and what it means for the rest of the year.',
        },
      ],
      guide: (ctx) => {
        const m = fpaMath(ctx.variant);
        const f = (x: number) => ctx.fmt.num(x);
        return [
          {
            type: 'p',
            text: `Should say: revenue ${f(m.revVar)} against budget, driven by price (the ${n(ctx.variant, 'discountPct')}% offer) not volume; EBITDA +${f(m.ebitdaA - m.ebitdaB)} from delayed hiring and paused marketing, which reverse.`,
          },
          {
            type: 'p',
            text: 'AI drafts typically lead with "EBITDA ahead of budget" as good news and miscalculate percentages. Did the candidate keep it candid and check the maths?',
          },
        ];
      },
      accuracy: {
        id: 'accuracy',
        label: 'Accurate and candid',
        weight: 1,
        anchors: [
          'Spin or wrong numbers.',
          'Accurate but buries the point.',
          'Accurate and candid.',
          'Candid, with what to watch next quarter.',
        ],
      },
      usable: {
        id: 'usable',
        label: 'Board-ready',
        weight: 1,
        anchors: [
          'Long or jargon-heavy.',
          'Usable with edits.',
          'Clear and tight.',
          'A director would understand it in one read.',
        ],
      },
    }),
    pastWorkStage({
      id: 'forecast-miss',
      title: 'A forecast that missed',
      summary: 'A real forecast or budget that turned out wrong. Checks specificity and ownership.',
      question: 'Tell us about a forecast or budget you worked on that turned out wrong.',
    }),
  ],
};
