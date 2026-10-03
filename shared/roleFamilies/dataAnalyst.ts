import type { Block, RoleFamily, Variant } from '../types';
import { n, s } from '../variants';
import { ADAPTS, FICTIONAL_CALLOUT, NEXT_STEPS, aiAllowedStage, pastWorkStage, warmupStage } from './common';

const COMPANIES = [
  { company: 'Annapurna Foods', product: 'packaged snacks sold through distributors' },
  { company: 'Coolbreeze Appliances', product: 'fans and coolers sold through dealers' },
  { company: 'Sutra Textiles', product: 'home textiles sold to retail stores' },
] as const;

const REGIONS = ['North', 'South', 'East', 'West'] as const;

const OPTIONS = [
  { id: 'corrected', label: 'Send the corrected numbers now, with the caveats stated' },
  { id: 'dashboard', label: 'Send the dashboard numbers now and correct them later' },
  { id: 'wait', label: 'Tell the VP you need until tomorrow to confirm with the data team' },
  { id: 'both', label: 'Send both versions and let the VP choose' },
];

/** Quarterly revenue by region, as the dashboard shows it and after cleaning. */
export function regionMath(v: Variant) {
  return REGIONS.map((region) => {
    const key = region.toLowerCase();
    const q4 = n(v, `${key}Q4`);
    const q1True = n(v, `${key}Q1`);
    const q1Shown = q1True + n(v, `${key}Error`);
    return {
      region,
      q4,
      q1Shown,
      q1True,
      shownGrowth: Math.round((q1Shown / q4 - 1) * 1000) / 10,
      trueGrowth: Math.round((q1True / q4 - 1) * 1000) / 10,
    };
  });
}

export const dataAnalyst: RoleFamily = {
  id: 'data-analyst',
  version: 1,
  name: 'Data Analyst',
  roles: ['Data Analyst', 'Business Intelligence Analyst', 'MIS Analyst', 'Reporting Analyst'],
  catalog: {
    function: 'Data & tech',
    seniority: ['Entry', 'Mid'],
    industries: ['Retail', 'D2C & e-commerce', 'Any'],
    skills: ['Analysis', 'Numbers', 'Communication'],
    keywords: ['BI', 'MIS', 'Excel', 'SQL', 'reporting', 'dashboards', 'Power BI', 'Tableau', 'analytics'],
  },
  summary:
    'A VP needs "which region grew most" for a board deck in an hour: find the double-loaded month and the cancelled order that flip the answer, decide what to send, and catch the maths mistakes in a teammate’s summary.',

  warmups: [
    'What is a number at your last job or college that people believed but you doubted?',
    'How would you explain what an average hides to someone who isn’t into numbers?',
    'Tell us about a spreadsheet or report you were proud of.',
  ],

  generate(rng, currency) {
    const inr = currency === 'INR';
    const co = rng.pick(COMPANIES);
    const base = {
      north: rng.int(440, 520),
      south: rng.int(320, 380),
      east: rng.int(260, 320),
      west: rng.int(360, 420),
    };
    const growth = { north: rng.int(3, 5), south: rng.int(6, 8), east: rng.int(2, 4), west: rng.int(11, 14) };
    const q1 = (k: keyof typeof base) => Math.round(base[k] * (1 + growth[k] / 100));
    const eastFeb = Math.round(q1('east') * rng.pick([0.31, 0.33, 0.35]));
    const cancelled = Math.round(base.north * rng.pick([0.08, 0.09, 0.1]));
    return {
      ...co,
      unit: inr ? '₹ lakh' : '$ thousand',
      northQ4: base.north,
      southQ4: base.south,
      eastQ4: base.east,
      westQ4: base.west,
      northQ1: q1('north'),
      southQ1: q1('south'),
      eastQ1: q1('east'),
      westQ1: q1('west'),
      northError: cancelled,
      southError: 0,
      eastError: eastFeb,
      westError: 0,
      eastFeb,
      cancelled,
      meetingMins: 60,
      aovBefore: inr ? rng.pick([1840, 2160, 2480]) : rng.pick([42, 48, 55]),
      smallRegionAovUp: rng.int(30, 40),
      shareFrom: rng.int(10, 12),
      shareTo: rng.int(15, 17),
      sliceCount: 14,
    };
  },

  brief(ctx) {
    const v = ctx.variant;
    const unit = s(v, 'unit');
    const rows = regionMath(v);
    return [
      {
        type: 'p',
        text: `You're the data analyst at **${s(v, 'company')}**, which makes ${s(v, 'product')}. The VP of Sales messages at 2 pm: **"Which region grew the most from Q4 to Q1? I need it for the board deck by 3."**`,
      },
      {
        type: 'table',
        caption: `Revenue by region from the sales dashboard (${unit})`,
        columns: ['Region', 'Q4', 'Q1', 'Growth'],
        rows: rows.map((r) => [r.region, ctx.fmt.num(r.q4), ctx.fmt.num(r.q1Shown), `${r.shownGrowth.toFixed(1)}%`]),
      },
      { type: 'h', text: 'Notes from the data engineering channel this quarter' },
      {
        type: 'list',
        items: [
          `East moved to a new billing system in February. "The February load might have run twice, still checking." East's February shows ${ctx.fmt.num(n(v, 'eastFeb'))} (${unit}).`,
          `North booked a bulk order of ${ctx.fmt.num(n(v, 'cancelled'))} (${unit}) on 28 March. Finance cancelled it on 3 April; the dashboard only counts bookings, not cancellations.`,
          'West changed its region code from "W1" to "WEST" in January. The mapping was fixed the same week and backfilled.',
        ],
      },
      { type: 'callout', text: FICTIONAL_CALLOUT },
    ];
  },

  stages: [
    warmupStage(),
    {
      id: 'which-region',
      kind: 'scenario',
      title: 'Which region grew most?',
      summary:
        "Answer a VP's question from a dashboard with a double-loaded month and a cancelled order that flip the answer. Think aloud.",
      timeLimitSec: 360,
      voiceMaxSec: 150,
      preferVoice: true,
      thinkAloud: true,
      scored: true,
      prompt: () => [
        {
          type: 'p',
          text: '**Which region really grew the most?** Show your working: what you adjusted, by how much, and how confident you are.',
        },
      ],
      reviewerGuide: (ctx) => {
        const v = ctx.variant;
        const rows = regionMath(v);
        const top = [...rows].sort((a, b) => b.trueGrowth - a.trueGrowth)[0];
        const shownTop = [...rows].sort((a, b) => b.shownGrowth - a.shownGrowth)[0];
        return [
          {
            type: 'p',
            text: `The dashboard says **${shownTop.region}** (${shownTop.shownGrowth.toFixed(1)}%). After cleaning, **${top.region}** grew most (${top.trueGrowth.toFixed(1)}%).`,
          },
          {
            type: 'list',
            items: [
              `East: remove the double-loaded February (${ctx.fmt.num(n(v, 'eastFeb'))}) → Q1 ${ctx.fmt.num(n(v, 'eastQ1'))}, growth ${rows[2].trueGrowth.toFixed(1)}%.`,
              `North: remove the cancelled order (${ctx.fmt.num(n(v, 'cancelled'))}) → Q1 ${ctx.fmt.num(n(v, 'northQ1'))}, growth ${rows[0].trueGrowth.toFixed(1)}%.`,
              `South ${rows[1].trueGrowth.toFixed(1)}% and West ${rows[3].trueGrowth.toFixed(1)}% need no change. The West region-code note is a decoy: it was fixed and backfilled.`,
            ],
          },
          {
            type: 'p',
            text: 'Strong answers adjust both, show the maths, and say the East fix is likely but not yet confirmed. Weak answers repeat the dashboard or "adjust" West.',
          },
        ];
      },
      rubric: [
        {
          id: 'cleaning',
          label: 'Finds and fixes the data problems',
          weight: 2,
          anchors: [
            'Uses the dashboard as is.',
            'Spots one problem.',
            'Fixes East and North correctly.',
            'Fixes both and dismisses the West note with a reason.',
          ],
        },
        {
          id: 'maths',
          label: 'Correct working',
          weight: 1,
          anchors: [
            'No working or wrong maths.',
            'Partly right.',
            'Correct growth figures after cleaning.',
            'Correct and laid out so the VP could check it.',
          ],
        },
        {
          id: 'confidence',
          label: 'States confidence honestly',
          weight: 1,
          anchors: [
            'Presents everything as certain.',
            'Vague caveats.',
            'Says which adjustment is confirmed and which is not.',
            'Says that and what would change the answer.',
          ],
        },
      ],
      followUps: () => [
        'How would you confirm the February load really ran twice?',
        'If the East data turned out fine, would your answer change? Work it out.',
      ],
    },
    {
      id: 'what-to-send',
      kind: 'decision',
      title: 'What do you send at 3 pm?',
      summary:
        "The VP needs a number for the board now; one fix isn't confirmed. Tests judgement under time pressure. Think aloud.",
      timeLimitSec: 300,
      voiceMaxSec: 150,
      preferVoice: true,
      thinkAloud: true,
      scored: true,
      choices: OPTIONS,
      prompt: () => [
        {
          type: 'p',
          text: "It's 2:45 pm. The data team hasn't confirmed the February double-load yet. **What do you send the VP?** Pick one, then write the message (three or four lines).",
        },
      ],
      reviewerGuide: () => [
        {
          type: 'p',
          text: "Sending corrected numbers with a clear caveat is the strongest: a board deck should not carry numbers you know are wrong, and the caveat covers the unconfirmed part. Sending the dashboard numbers knowingly puts wrong numbers in front of the board. Waiting misses the deadline without offering anything. Sending both pushes an analyst's job onto the VP, though it can be defensible with a clear recommendation.",
        },
      ],
      rubric: [
        {
          id: 'judgement',
          label: 'Judgement under time pressure',
          weight: 2,
          anchors: [
            'Sends numbers they know are wrong, or nothing.',
            'A defensible choice, little reasoning.',
            'Protects the board from wrong numbers and meets the deadline.',
            'Does both and makes the uncertainty easy to understand.',
          ],
        },
        {
          id: 'message',
          label: 'The message',
          weight: 1,
          anchors: [
            'Confusing or missing.',
            'Correct but wordy.',
            'Short, clear answer with the caveat.',
            'Clear answer, caveat, and when it will be confirmed.',
          ],
        },
      ],
      followUps: (_ctx, answer) => [
        `You chose "${answer.choiceLabel ?? 'your option'}". What would you do if the VP replied "just give me one number"?`,
        'Who else should know about these data problems?',
      ],
    },
    {
      id: 'next-morning',
      kind: 'branch',
      title: 'The next morning',
      summary: 'Consequences of what they sent. Tests ownership and fixing the root cause.',
      timeLimitSec: 300,
      voiceMaxSec: 120,
      preferVoice: true,
      scored: true,
      dependsOn: 'what-to-send',
      prompt: (ctx) => {
        const byChoice: Record<string, Block[]> = {
          corrected: [
            {
              type: 'p',
              text: 'The data team confirms February ran twice. But the East regional manager is upset: "My bonus is tied to that dashboard. Who changed my numbers?" He has emailed the VP.',
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
          dashboard: [
            {
              type: 'p',
              text: "The deck went to the board saying East grew fastest. The data team has now confirmed February ran twice, so East's growth was overstated. The CFO asks who signed off the numbers.",
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
          wait: [
            {
              type: 'p',
              text: "The VP used the dashboard numbers anyway because nothing arrived by 3 pm. The double-load is now confirmed. The VP asks why you didn't just send your best estimate.",
            },
            { type: 'p', text: '**What do you say and do?**' },
          ],
          both: [
            {
              type: 'p',
              text: 'The VP picked the dashboard version "because it looked better for East". The double-load is now confirmed.',
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
        };
        return byChoice[ctx.choices['what-to-send'] ?? 'corrected'] ?? byChoice.corrected;
      },
      reviewerGuide: (ctx) => {
        const guides: Record<string, string> = {
          corrected:
            "Strong: explain the correction calmly with evidence, don't take it personally, and push to fix the dashboard and its definitions so bonuses use clean data. Weak: backs down or gets defensive.",
          dashboard:
            'Owning it: tell the VP and CFO quickly and plainly, send the corrected numbers, and fix the dashboard. Weak: hides or blames the data team.',
          wait: 'Strong: own that a caveated estimate would have helped, send corrected numbers now, and agree how to handle deadlines next time. Weak: defends waiting.',
          both: 'Strong: tell the VP the dashboard version is now confirmed wrong and send the correction before it spreads; next time give one recommendation. Weak: stays quiet.',
        };
        const choice = ctx.choices['what-to-send'] ?? 'corrected';
        return [
          { type: 'p', text: `They chose **${OPTIONS.find((o) => o.id === choice)?.label ?? choice}**.` },
          { type: 'p', text: guides[choice] ?? guides.corrected },
        ];
      },
      rubric: [ADAPTS, NEXT_STEPS],
      followUps: () => [
        'How would you stop this from happening next quarter?',
        'Who owns the dashboard numbers, in your view?',
      ],
    },
    {
      id: 'review-summary',
      kind: 'critique',
      title: "Check a teammate's summary",
      summary:
        'A summary with an average of averages, percent confused with percentage points, and a 14-slice pie chart. Think aloud.',
      timeLimitSec: 420,
      voiceMaxSec: 180,
      preferVoice: false,
      thinkAloud: true,
      scored: true,
      prompt: () => [
        {
          type: 'p',
          text: 'A teammate wrote this for the monthly review. **Find the problems, worst first, and say what each one gets wrong.**',
        },
      ],
      material: (ctx) => {
        const v = ctx.variant;
        return [
          { type: 'h', text: 'Monthly review: key points' },
          {
            type: 'list',
            items: [
              `**Average order value is up 18%.** We took each region's average order value and averaged the four regions. The small East region's average rose ${n(v, 'smallRegionAovUp')}%; North, our biggest region, was flat.`,
              `**Online share grew 5%**: from ${n(v, 'shareFrom')}% of sales to ${n(v, 'shareTo')}%.`,
              `**Product mix:** see the pie chart with all ${n(v, 'sliceCount')} product categories.`,
              'Data covers every order from 1 to 31 March, pulled on 2 April.',
            ],
          },
        ];
      },
      reviewerGuide: (ctx) => {
        const v = ctx.variant;
        const share = n(v, 'shareTo') - n(v, 'shareFrom');
        return [
          { type: 'p', text: 'Planted problems:' },
          {
            type: 'list',
            items: [
              "**An average of averages.** Each region counts equally, so a small region's jump drags the result up while the biggest region was flat. Average order value must be total revenue ÷ total orders.",
              `**Percent vs percentage points.** ${n(v, 'shareFrom')}% → ${n(v, 'shareTo')}% is ${share} percentage points, or about ${Math.round((share / n(v, 'shareFrom')) * 100)}% growth, not "5%".`,
              `**A ${n(v, 'sliceCount')}-slice pie** is unreadable; a sorted bar chart, or the top few plus "other", works.`,
            ],
          },
          {
            type: 'p',
            text: 'Decoy: the date range and pull date are fine. Calling them the problem is a weak signal.',
          },
        ];
      },
      rubric: [
        {
          id: 'critical',
          label: 'Catches the maths errors',
          weight: 2,
          anchors: [
            'Misses the average of averages.',
            'Catches one maths error.',
            'Catches both maths errors.',
            'Catches both and gives the right way to calculate each.',
          ],
        },
        {
          id: 'communication',
          label: 'Fixes the presentation',
          weight: 1,
          anchors: [
            'Ignores the chart.',
            'Mentions it.',
            'Suggests a better chart.',
            'Better chart and a clearer way to state each point.',
          ],
        },
        {
          id: 'severity',
          label: 'Orders by impact',
          weight: 1,
          anchors: [
            'Decoy first.',
            'Unexplained.',
            'Sensible order.',
            'Ordered by how wrong a decision could go, explained.',
          ],
        },
      ],
      followUps: () => [
        'How would you explain "percentage points" to the sales team?',
        'When is a pie chart the right choice?',
      ],
    },
    aiAllowedStage({
      id: 'vp-email',
      title: 'The note to the VP (AI allowed)',
      summary: 'Write the corrected regional summary with AI. Catches copied dashboard numbers and false precision.',
      task: () => [
        {
          type: 'p',
          text: 'Write the note to the VP (under 150 words) with the corrected regional growth, what you changed and why, and what still needs confirming.',
        },
      ],
      guide: (ctx) => {
        const rows = regionMath(ctx.variant);
        return [
          {
            type: 'p',
            text: `Corrected growth: ${rows.map((r) => `${r.region} ${r.trueGrowth.toFixed(1)}%`).join(', ')}. The East fix is pending confirmation.`,
          },
          {
            type: 'p',
            text: 'AI drafts often recompute from the dashboard table and ignore the notes, or quote numbers to two decimals as if certain. Did the candidate give the AI the notes and check its arithmetic?',
          },
        ];
      },
      accuracy: {
        id: 'accuracy',
        label: 'Correct numbers',
        weight: 1,
        anchors: [
          'Dashboard numbers or wrong maths.',
          'Partly corrected.',
          'Correct after both fixes.',
          'Correct, with the uncertainty stated plainly.',
        ],
      },
      usable: {
        id: 'usable',
        label: 'Board-ready',
        weight: 1,
        anchors: [
          'Long or technical.',
          'Usable with edits.',
          'Short and clear.',
          'The VP could paste the key line into the deck.',
        ],
      },
    }),
    pastWorkStage({
      id: 'bad-data',
      title: 'When the data was wrong',
      summary: 'A real time they found or missed a data problem. Checks specificity and ownership.',
      question: 'Tell us about a time you found, or missed, a problem in data people were relying on.',
    }),
  ],
};
