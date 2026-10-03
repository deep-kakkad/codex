import type { Block, RoleFamily, Variant } from '../types';
import { n, s } from '../variants';
import { ADAPTS, FICTIONAL_CALLOUT, NEXT_STEPS, aiAllowedStage, pastWorkStage, warmupStage } from './common';

const COMPANIES = [
  { company: 'Saraswati Foods', business: 'packaged foods maker' },
  { company: 'Vistara Electricals', business: 'wires and switches maker' },
  { company: 'Kaveri Home Products', business: 'kitchen appliances maker' },
] as const;

const YEARS = ['FY21', 'FY22', 'FY23', 'FY24'] as const;

const OPTIONS = [
  { id: 'buy', label: 'Buy: the growth is real and the stock is cheap' },
  { id: 'hold', label: 'Hold: good growth, some questions' },
  { id: 'sell', label: 'Sell or avoid: the cash flow and governance signs are too serious' },
  { id: 'wait', label: 'No rating until you have spoken to management' },
];

/** Four years of the company's numbers, in ₹ crore or $ million. */
export function equityMath(v: Variant) {
  return YEARS.map((year, i) => {
    const revenue = n(v, `rev${i}`);
    const ebitda = Math.round(revenue * n(v, 'margin')) / 100;
    return {
      year,
      revenue,
      ebitda,
      ocf: Math.round(ebitda * n(v, `ocf${i}`)) / 100,
      receivableDays: n(v, `recv${i}`),
      relatedPct: n(v, `related${i}`),
      pledgePct: n(v, `pledge${i}`),
    };
  });
}

export const equityResearch: RoleFamily = {
  id: 'equity-research',
  version: 1,
  name: 'Equity Research Analyst',
  roles: ['Equity Research Analyst', 'Investment Analyst', 'Research Associate', 'Buy-side Analyst'],
  catalog: {
    function: 'Finance',
    seniority: ['Entry', 'Mid', 'Senior'],
    industries: ['Fintech', 'Services'],
    skills: ['Analysis', 'Numbers', 'Judgement', 'Writing'],
    keywords: [
      'equity research',
      'investment analyst',
      'stock',
      'valuation',
      'financial statements',
      'CFA',
      'buy side',
      'sell side',
    ],
  },
  summary:
    'A fast-growing listed company that looks cheap: find the red flags in its cash flow, receivables and promoter pledges, make a call, and fix a junior’s valuation built on a one-off gain.',

  warmups: [
    'What is a company you would never invest in, and why?',
    'Tell us about a time a number looked too good to be true.',
    'What is one thing most investors get wrong, in your view?',
  ],

  generate(rng, currency) {
    const inr = currency === 'INR';
    const co = rng.pick(COMPANIES);
    const growth = rng.pick([1.22, 1.25, 1.28]);
    const rev0 = inr ? rng.int(38, 52) * 10 : rng.int(46, 62);
    const out: Record<string, number> = {};
    YEARS.forEach((_, i) => {
      out[`rev${i}`] = Math.round(rev0 * growth ** i * (inr ? 1 : 10)) / (inr ? 1 : 10);
    });
    const ocfPct = [rng.int(78, 85), rng.int(55, 64), rng.int(28, 36), rng.int(4, 12)];
    const recv = [rng.int(42, 48), rng.int(55, 62), rng.int(72, 80), rng.int(94, 104)];
    const related = [rng.int(4, 7), rng.int(10, 13), rng.int(17, 21), rng.int(25, 30)];
    const pledge = [rng.int(2, 5), rng.int(8, 12), rng.int(19, 25), rng.int(34, 42)];
    YEARS.forEach((_, i) => {
      out[`ocf${i}`] = ocfPct[i];
      out[`recv${i}`] = recv[i];
      out[`related${i}`] = related[i];
      out[`pledge${i}`] = pledge[i];
    });
    return {
      ...co,
      ...out,
      unit: inr ? '₹ crore' : '$ million',
      margin: rng.int(15, 18),
      pe: rng.int(14, 18),
      peerPe: rng.int(32, 40),
      bigPeerPe: rng.int(55, 65),
      oneOffGain: Math.round(out.rev3 * rng.pick([0.03, 0.04])),
      warrantsPct: rng.int(7, 10),
      stockMove: rng.pick([10, 12, 15]),
      dropPct: rng.int(18, 26),
      riseAfterSell: rng.int(20, 30),
    };
  },

  brief(ctx) {
    const v = ctx.variant;
    const rows = equityMath(v);
    const unit = s(v, 'unit');
    const f = (x: number) => (unit.startsWith('₹') ? ctx.fmt.num(x) : x.toFixed(1));
    return [
      {
        type: 'p',
        text: `You're an equity research analyst covering **${s(v, 'company')}**, a listed ${s(v, 'business')}. The stock trades at **${n(v, 'pe')}× earnings**, against ${n(v, 'peerPe')}× for its listed peers. Your fund manager asks for a recommendation by Friday.`,
      },
      {
        type: 'table',
        caption: `Key numbers (${unit} unless shown)`,
        columns: ['Measure', ...YEARS],
        rows: [
          ['Revenue', ...rows.map((r) => f(r.revenue))],
          ['EBITDA', ...rows.map((r) => f(r.ebitda))],
          ['Operating cash flow', ...rows.map((r) => f(r.ocf))],
          ['Receivable days', ...rows.map((r) => String(r.receivableDays))],
          ['Sales to related parties', ...rows.map((r) => `${r.relatedPct}%`)],
          ['Promoter shares pledged', ...rows.map((r) => `${r.pledgePct}%`)],
        ],
      },
      {
        type: 'list',
        items: [
          'In FY24 the statutory auditor resigned mid-term, citing "insufficient information to complete our review of certain transactions". A new auditor was appointed within a week.',
          'Management on the last earnings call: "Best year in our history. Growth will continue at 25%."',
        ],
      },
      { type: 'callout', text: FICTIONAL_CALLOUT },
    ];
  },

  stages: [
    warmupStage(),
    {
      id: 'red-flags',
      kind: 'scenario',
      title: 'What worries you?',
      summary:
        'Read four years of numbers: profits growing while cash flow vanishes, receivables doubling, rising related-party sales and pledges. Think aloud.',
      timeLimitSec: 360,
      voiceMaxSec: 150,
      preferVoice: true,
      thinkAloud: true,
      scored: true,
      prompt: () => [
        {
          type: 'p',
          text: '**What story do the numbers tell, and what worries you most?** Rank your concerns and say what each could mean.',
        },
      ],
      reviewerGuide: (ctx) => {
        const v = ctx.variant;
        const rows = equityMath(v);
        return [
          { type: 'p', text: "The pattern: reported profits grow, but cash doesn't come in." },
          {
            type: 'list',
            items: [
              `**Cash conversion collapsed:** operating cash flow fell from ${n(v, 'ocf0')}% of EBITDA to ${n(v, 'ocf3')}%.`,
              `**Receivable days more than doubled** (${rows[0].receivableDays} → ${rows[3].receivableDays}): sales booked but not collected.`,
              `**Related-party sales** grew from ${rows[0].relatedPct}% to ${rows[3].relatedPct}%: possibly sales to friendly parties to inflate revenue.`,
              `**Promoter pledging** ${rows[0].pledgePct}% → ${rows[3].pledgePct}% and an **auditor resigning** over specific transactions.`,
            ],
          },
          {
            type: 'p',
            text: 'Together these are classic signs of revenue quality or governance problems. The low P/E is likely a warning, not a bargain. Weak answers focus on growth and the cheap multiple.',
          },
        ];
      },
      rubric: [
        {
          id: 'flags',
          label: 'Finds the red flags',
          weight: 2,
          anchors: [
            'Focuses on growth and the cheap P/E.',
            'Notices one concern.',
            'Links cash flow, receivables and related-party sales.',
            'Links all of them plus the auditor and pledges into one story.',
          ],
        },
        {
          id: 'evidence',
          label: 'Uses the numbers',
          weight: 1,
          anchors: [
            'No numbers.',
            'Some numbers.',
            'Specific numbers for each concern.',
            'Numbers plus the trend over the four years.',
          ],
        },
        {
          id: 'meaning',
          label: 'Explains what it could mean',
          weight: 1,
          anchors: [
            'No interpretation.',
            'Vague ("risky").',
            'Plausible explanations.',
            'Explanations with what would confirm or rule each out.',
          ],
        },
      ],
      followUps: () => [
        'What would you ask management first?',
        'Is there an innocent explanation for the receivables? What would prove it?',
      ],
    },
    {
      id: 'rating',
      kind: 'decision',
      title: 'Your recommendation',
      summary: 'Make a call on a cheap stock with red flags. Think aloud.',
      timeLimitSec: 300,
      voiceMaxSec: 150,
      preferVoice: true,
      thinkAloud: true,
      scored: true,
      choices: OPTIONS,
      prompt: () => [
        {
          type: 'p',
          text: '**What do you recommend to the fund manager?** Pick one, give your reasons, and say what would make you change your mind.',
        },
      ],
      reviewerGuide: () => [
        {
          type: 'p',
          text: 'Sell or avoid is the strongest given the cash-flow and governance signals; "no rating until management" is defensible if they say exactly what they need to see and set a deadline. Buy ignores the evidence. Hold can work only with clear conditions. Any choice can score with clear reasoning and specific "change my mind" conditions.',
        },
      ],
      rubric: [
        {
          id: 'call',
          label: 'A call that follows the evidence',
          weight: 2,
          anchors: [
            'A call that ignores the red flags.',
            'A hedged call.',
            'A clear call based on the evidence.',
            'A clear call, sized for risk, based on the evidence.',
          ],
        },
        {
          id: 'conditions',
          label: 'What would change their mind',
          weight: 1,
          anchors: [
            'Nothing.',
            'Vague.',
            'Specific conditions.',
            'Specific, measurable conditions with where to find them.',
          ],
        },
      ],
      followUps: (_ctx, answer) => [
        `You chose "${answer.choiceLabel ?? 'your call'}". How would you defend it if the stock rose 20% next month?`,
        'What is the cost of being wrong on this one?',
      ],
    },
    {
      id: 'month-later',
      kind: 'branch',
      title: 'A month later',
      summary: 'Events after their call. Tests updating views honestly.',
      timeLimitSec: 300,
      voiceMaxSec: 120,
      preferVoice: true,
      scored: true,
      dependsOn: 'rating',
      prompt: (ctx) => {
        const v = ctx.variant;
        const byChoice: Record<string, Block[]> = {
          buy: [
            {
              type: 'p',
              text: `The stock rose ${n(v, 'stockMove')}%, then the new auditor qualified the accounts over related-party receivables. It fell ${n(v, 'dropPct')}% in a day. The fund manager asks what you missed.`,
            },
            { type: 'p', text: '**What do you say and do?**' },
          ],
          hold: [
            {
              type: 'p',
              text: 'On a management call, the CFO says the receivables are from "a new distributor channel with longer credit terms". You find the largest new distributor is owned by the promoter\'s brother-in-law.',
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
          sell: [
            {
              type: 'p',
              text: `The company reported a strong quarter and the stock rose ${n(v, 'riseAfterSell')}%. A client tells the fund manager your call "cost them money", and another analyst publishes a Buy.`,
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
          wait: [
            {
              type: 'p',
              text: "Management agreed to a call, then cancelled twice. They won't share the receivables ageing. The fund manager needs your view by tomorrow.",
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
        };
        return byChoice[ctx.choices.rating ?? 'sell'] ?? byChoice.sell;
      },
      reviewerGuide: (ctx) => {
        const guides: Record<string, string> = {
          buy: 'Owning it: say plainly the signs were there (cash flow, receivables, auditor), cut the rating, and review the process. Weak: blames the auditor or "the market".',
          hold: "The innocent explanation now looks worse: receivables owed by a related party. Strong: move to sell/avoid, explain why, and document it. Weak: accepts management's answer.",
          sell: 'Strong: check whether the quarter changed the cash-flow story (did operating cash flow and receivables improve?); hold the view if not, and explain clearly. Weak: flips because the price rose.',
          wait: 'Refusing to share data is itself a signal. Strong: give a clear negative view now with the reason. Weak: keeps waiting.',
        };
        const choice = ctx.choices.rating ?? 'sell';
        return [
          { type: 'p', text: `They chose **${OPTIONS.find((o) => o.id === choice)?.label ?? choice}**.` },
          { type: 'p', text: guides[choice] ?? guides.sell },
        ];
      },
      rubric: [ADAPTS, NEXT_STEPS],
      followUps: () => [
        'What would make you reverse your view?',
        'What would you check in the next quarterly results first?',
      ],
    },
    {
      id: 'review-valuation',
      kind: 'critique',
      title: "Check a junior's valuation",
      summary: 'A valuation built on a one-off gain, a mismatched peer and ignored dilution. Think aloud.',
      timeLimitSec: 420,
      voiceMaxSec: 180,
      preferVoice: false,
      thinkAloud: true,
      scored: true,
      prompt: () => [
        {
          type: 'p',
          text: 'A junior analyst drafted this valuation. **Find the problems, worst first, and say which way each one pushes the target price.**',
        },
      ],
      material: (ctx) => {
        const v = ctx.variant;
        return [
          { type: 'h', text: 'Valuation (draft)' },
          {
            type: 'list',
            items: [
              `FY24 earnings used as the base, including a ${n(v, 'oneOffGain')} (${s(v, 'unit')}) gain from selling a factory plot.`,
              `Target multiple: average of three peers, one of which is a much larger, debt-free consumer goods leader at ${n(v, 'bigPeerPe')}× earnings.`,
              `Share count: current shares only. (The promoter holds warrants that convert into ${n(v, 'warrantsPct')}% more shares next year.)`,
              'Revenue forecasts: in line with the consensus of other analysts.',
              'Conclusion: 60% upside. Strong Buy.',
            ],
          },
        ];
      },
      reviewerGuide: (ctx) => {
        const v = ctx.variant;
        return [
          { type: 'p', text: 'Planted problems (all push the target too high):' },
          {
            type: 'list',
            items: [
              `**A one-off gain in the base earnings:** the ${n(v, 'oneOffGain')} plot sale won't repeat; value on recurring earnings.`,
              `**A peer that isn't comparable:** a bigger, debt-free leader at ${n(v, 'bigPeerPe')}× inflates the average multiple.`,
              `**Dilution ignored:** warrants add ${n(v, 'warrantsPct')}% more shares, cutting value per share.`,
              "**Ignores the red flags:** a valuation that assumes the reported profits are real while cash isn't coming in.",
            ],
          },
          { type: 'p', text: 'Decoy: using consensus revenue forecasts is fine as a starting point.' },
        ];
      },
      rubric: [
        {
          id: 'critical',
          label: 'Catches the valuation errors',
          weight: 2,
          anchors: [
            'Misses the one-off gain.',
            'Catches one error.',
            'Catches the one-off and the peer or dilution.',
            'Catches all, plus the red flags being ignored.',
          ],
        },
        {
          id: 'direction',
          label: 'Knows which way each pushes',
          weight: 1,
          anchors: ['No direction.', 'Some.', 'Correct direction for each.', 'Direction and rough size for each.'],
        },
        {
          id: 'severity',
          label: 'Orders by impact',
          weight: 1,
          anchors: ['Decoy first.', 'Unexplained.', 'Sensible order.', 'Ordered by effect on value, explained.'],
        },
      ],
      followUps: () => [
        'How would you choose a peer group for this company?',
        'What would you use instead of P/E here, and why?',
      ],
    },
    aiAllowedStage({
      id: 'note',
      title: 'The investment note (AI allowed)',
      summary: 'Write the summary note for the fund manager with AI. Catches hype and invented figures.',
      task: () => [
        {
          type: 'p',
          text: 'Write the summary of your investment note for the fund manager (under 180 words): your call, the three reasons, and the risks to your view.',
        },
      ],
      guide: (ctx) => {
        const rows = equityMath(ctx.variant);
        return [
          {
            type: 'p',
            text: `Should cite: operating cash flow at ${n(ctx.variant, 'ocf3')}% of EBITDA, receivable days ${rows[0].receivableDays} → ${rows[3].receivableDays}, related-party sales ${rows[3].relatedPct}%, pledging ${rows[3].pledgePct}%, the auditor resignation.`,
          },
          {
            type: 'p',
            text: 'AI drafts typically echo management ("strong growth momentum"), praise the low P/E, or invent targets. Did the candidate give the AI the data and keep it evidence-led?',
          },
        ];
      },
      accuracy: {
        id: 'accuracy',
        label: 'Evidence-led and accurate',
        weight: 1,
        anchors: [
          'Hype or invented numbers.',
          'Accurate but misses the key flags.',
          'Accurate, with the key flags.',
          'Accurate, balanced, with what would change the view.',
        ],
      },
      usable: {
        id: 'usable',
        label: 'Fund-manager ready',
        weight: 1,
        anchors: [
          'Long or vague.',
          'Usable with edits.',
          'Clear call, clear reasons.',
          'A fund manager could act on it in one read.',
        ],
      },
    }),
    pastWorkStage({
      id: 'wrong-call',
      title: 'A call you got wrong',
      summary: 'A real investment or analytical call that went wrong. Checks specificity and ownership.',
      question: 'Tell us about an investment or analysis call you got wrong.',
    }),
  ],
};
