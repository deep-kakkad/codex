import type { Block, RoleFamily, Variant } from '../types';
import { n, s } from '../variants';
import { ADAPTS, FICTIONAL_CALLOUT, NEXT_STEPS, aiAllowedStage, pastWorkStage, warmupStage } from './common';

const APPS = [
  {
    company: 'Basketly',
    product: 'grocery delivery app',
    change: 'a "free delivery above a minimum order" banner on the cart page',
    feature: 'saved shopping lists',
  },
  {
    company: 'Wearwell',
    product: 'fashion shopping app',
    change: 'a one-tap checkout button on product pages',
    feature: 'wishlists',
  },
  {
    company: 'Bookmyroom',
    product: 'hotel booking app',
    change: 'showing the total price with taxes on the search results page',
    feature: 'price alerts',
  },
] as const;

const OPTIONS = [
  { id: 'ship', label: 'Ship it to everyone now' },
  { id: 'rerun', label: 'Fix the split and re-run it for two full weeks' },
  { id: 'partial', label: 'Ship it to 50% of users and keep watching' },
  { id: 'kill', label: 'Stop the test and drop the change' },
];

/** The experiment's headline numbers, worked out from the variant. */
export function experimentMath(v: Variant) {
  const control = n(v, 'controlUsers');
  const treat = n(v, 'treatUsers');
  const cConv = Math.round((control * n(v, 'controlCr')) / 1000);
  const tConv = Math.round((treat * n(v, 'treatCr')) / 1000);
  const cRate = cConv / control;
  const tRate = tConv / treat;
  const cRpv = cRate * n(v, 'controlAov');
  const tRpv = tRate * n(v, 'treatAov');
  return {
    cConv,
    tConv,
    cRatePct: Math.round(cRate * 10000) / 100,
    tRatePct: Math.round(tRate * 10000) / 100,
    lift: Math.round((tRate / cRate - 1) * 1000) / 10,
    treatShare: Math.round((treat / (control + treat)) * 1000) / 10,
    /** Revenue per 100 users: large enough to read in whole rupees or dollars. */
    cRp100: Math.round(cRpv * 100),
    tRp100: Math.round(tRpv * 100),
  };
}

export const productAnalyst: RoleFamily = {
  id: 'product-analyst',
  version: 1,
  name: 'Product Analyst / Associate PM',
  roles: ['Product Analyst', 'Associate Product Manager', 'Growth Analyst', 'Experimentation Analyst'],
  catalog: {
    function: 'Product & design',
    seniority: ['Entry', 'Mid'],
    industries: ['Consumer apps', 'D2C & e-commerce'],
    skills: ['Analysis', 'Numbers', 'Judgement'],
    keywords: ['APM', 'A/B test', 'experimentation', 'product analytics', 'growth analyst', 'metrics'],
  },
  summary:
    'An A/B test the PM wants to ship on Monday: spot the broken user split and the revenue the headline hides, decide what to recommend, and catch a correlation passed off as cause.',

  warmups: [
    'What is a number you track in your own life, and has it ever misled you?',
    'Tell us about a chart or statistic in the news that you didn’t trust, and why.',
    'What makes an analysis useful to the person who asked for it?',
  ],

  generate(rng, currency) {
    const inr = currency === 'INR';
    const app = rng.pick(APPS);
    const total = rng.int(70, 96) * 1000;
    const treatShare = rng.pick([0.468, 0.472, 0.476]);
    const treatUsers = Math.round(total * treatShare);
    const controlCr = rng.pick([28, 31, 34]); // per thousand
    const aov = inr ? rng.pick([640, 820, 1150]) : rng.pick([32, 41, 56]);
    return {
      ...app,
      controlUsers: total - treatUsers,
      treatUsers,
      controlCr,
      treatCr: controlCr + rng.pick([2, 3]),
      controlAov: aov,
      // Smaller baskets more than cancel the extra orders: revenue per user falls.
      treatAov: Math.round(aov * rng.pick([0.85, 0.87, 0.88])),
      testDays: 4,
      saleDay: rng.pick(['Saturday', 'Sunday']),
      pValue: rng.pick(['0.03', '0.04']),
      oldAndroidPct: rng.int(5, 8),
      featureUsersRetention: rng.int(52, 61),
      otherRetention: rng.int(21, 27),
      featureUserShare: rng.int(8, 14),
      meanSession: rng.int(14, 19),
      medianSession: rng.int(4, 6),
      newTestDays: 14,
      rerunLift: rng.pick([1.2, 1.8, 2.4]),
    };
  },

  brief(ctx) {
    const v = ctx.variant;
    const { fmt } = ctx;
    const m = experimentMath(v);
    return [
      {
        type: 'p',
        text: `You're the product analyst at **${s(v, 'company')}**, a ${s(v, 'product')}. The team tested ${s(v, 'change')}. Users were meant to be split **50/50** at random. The test ran for ${n(v, 'testDays')} days, Friday to Monday; ${s(v, 'saleDay')} was a site-wide sale.`,
      },
      {
        type: 'table',
        caption: 'Experiment dashboard',
        columns: ['Measure', 'Control (old)', 'Variant (new)'],
        rows: [
          ['Users', fmt.num(n(v, 'controlUsers')), fmt.num(n(v, 'treatUsers'))],
          ['Orders', fmt.num(m.cConv), fmt.num(m.tConv)],
          ['Conversion', `${m.cRatePct.toFixed(2)}%`, `${m.tRatePct.toFixed(2)}%`],
          ['Average order value', fmt.money(n(v, 'controlAov')), fmt.money(n(v, 'treatAov'))],
          ['Lift in conversion', 'Baseline', `+${m.lift}% (p = ${s(v, 'pValue')})`],
        ],
      },
      {
        type: 'p',
        text: 'The PM writes: "Conversion is up and it\'s significant. Let\'s ship it to everyone on Monday."',
      },
      { type: 'callout', text: FICTIONAL_CALLOUT },
    ];
  },

  stages: [
    warmupStage(),
    {
      id: 'read-test',
      kind: 'scenario',
      title: 'Is this a win?',
      summary:
        'Read an A/B test with a broken 50/50 split, revenue per user that falls, and a short test over a sale weekend. Think aloud.',
      timeLimitSec: 300,
      voiceMaxSec: 120,
      preferVoice: true,
      thinkAloud: true,
      scored: true,
      prompt: () => [
        {
          type: 'p',
          text: '**What do you tell the PM?** Say what in the dashboard worries you, and what you would check before anyone ships.',
        },
      ],
      reviewerGuide: (ctx) => {
        const v = ctx.variant;
        const m = experimentMath(v);
        return [
          { type: 'p', text: 'What a strong analyst sees:' },
          {
            type: 'list',
            items: [
              `**The split is broken.** The variant got ${m.treatShare}% of users, not 50%. On ${ctx.fmt.num(n(v, 'controlUsers') + n(v, 'treatUsers'))} users that is far beyond chance (a sample ratio mismatch), so some users are dropping out of the variant; the result can't be trusted.`,
              `**Revenue per visitor is not up.** Conversion rose, but order value fell (${ctx.fmt.money(n(v, 'controlAov'))} → ${ctx.fmt.money(n(v, 'treatAov'))}): about ${ctx.fmt.money(m.cRp100)} per 100 users in control against ${ctx.fmt.money(m.tRp100)} in the variant.`,
              `**Too short and unrepresentative.** Four days, including a sale day; no full weekly cycle.`,
            ],
          },
          { type: 'p', text: 'A p-value does not fix a broken split. Weak answers accept "significant" and ship.' },
        ];
      },
      rubric: [
        {
          id: 'validity',
          label: 'Checks the test is valid',
          weight: 2,
          anchors: [
            'Accepts the result as it is.',
            'Has a general doubt.',
            'Spots the broken split or the short sale-weekend run.',
            'Spots the broken split and explains why it invalidates the result.',
          ],
        },
        {
          id: 'metric',
          label: 'Looks past the headline metric',
          weight: 1,
          anchors: [
            'Conversion only.',
            'Mentions order value.',
            'Works out revenue per user is flat or down.',
            'Works it out and says which metric should decide.',
          ],
        },
        {
          id: 'advice',
          label: 'Clear advice to the PM',
          weight: 1,
          anchors: [
            'No recommendation.',
            'Hedged.',
            'A clear "not yet" with reasons.',
            'Clear advice plus what would make it a yes.',
          ],
        },
      ],
      followUps: () => [
        'How would you find out why the variant has fewer users?',
        'What would you need to see before you would say "ship it"?',
      ],
    },
    {
      id: 'recommend',
      kind: 'decision',
      title: 'Your recommendation',
      summary: 'Commit to a recommendation with the PM pushing to ship. Think aloud.',
      timeLimitSec: 300,
      voiceMaxSec: 150,
      preferVoice: true,
      thinkAloud: true,
      scored: true,
      choices: OPTIONS,
      prompt: () => [
        {
          type: 'p',
          text: '**What do you recommend?** Pick one, then give the two sentences you would say to the PM.',
        },
      ],
      reviewerGuide: () => [
        {
          type: 'p',
          text: 'Fixing the split and re-running for two full weeks is the strongest: the current data cannot answer the question. Shipping to 50% without fixing assignment keeps the same problem. Shipping to everyone ignores the revenue drop. Dropping the change throws away an idea that might work. Any choice can score with honest reasoning.',
        },
      ],
      rubric: [
        {
          id: 'judgement',
          label: 'Sound recommendation',
          weight: 2,
          anchors: [
            'Ships or kills without engaging with the data.',
            'A defensible choice, thin reasoning.',
            'Choice follows from the split and revenue problems.',
            'Choice follows from them, with the cost of waiting weighed.',
          ],
        },
        {
          id: 'influence',
          label: 'Persuades the PM',
          weight: 1,
          anchors: [
            'Jargon or defensive.',
            'Correct but hard to act on.',
            'Plain, short and convincing.',
            'Convincing and offers a fast path to a real answer.',
          ],
        },
      ],
      followUps: (_ctx, answer) => [
        `You chose "${answer.choiceLabel ?? 'your recommendation'}". What if the PM says the CEO already announced the change?`,
        'How long would you run the re-test, and why that long?',
      ],
    },
    {
      id: 'what-happens',
      kind: 'branch',
      title: 'What happens next',
      summary: 'The consequences of their recommendation. Tests adapting and owning the call.',
      timeLimitSec: 300,
      voiceMaxSec: 120,
      preferVoice: true,
      scored: true,
      dependsOn: 'recommend',
      prompt: (ctx) => {
        const v = ctx.variant;
        const byChoice: Record<string, Block[]> = {
          ship: [
            {
              type: 'p',
              text: `Two weeks after shipping, revenue is down slightly and support reports that ${s(v, 'change')} is broken on older Android phones (${n(v, 'oldAndroidPct')}% of users). Finance asks whether the test "proved" it would work.`,
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
          rerun: [
            {
              type: 'p',
              text: `Engineering found the cause: on older Android phones the variant page failed to load, so those users fell out. After the fix, the re-run shows conversion +${s(v, 'rerunLift')}% (p = 0.21) and revenue per user flat. The PM asks: "So is it a yes or a no?"`,
            },
            { type: 'p', text: '**What do you say?**' },
          ],
          partial: [
            {
              type: 'p',
              text: 'A week later the 50% rollout "looks good" on the dashboard, but the user split is still uneven, and two other teams have started a test on the same page.',
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
          kill: [
            {
              type: 'p',
              text: 'The PM is frustrated: "We spent a sprint on this and you killed it on a technicality." The designer asks whether the idea itself was wrong.',
            },
            { type: 'p', text: '**What do you say and do?**' },
          ],
        };
        return byChoice[ctx.choices.recommend ?? 'rerun'] ?? byChoice.rerun;
      },
      reviewerGuide: (ctx) => {
        const guides: Record<string, string> = {
          ship: 'Owning it: explain plainly that the original test had a broken split and fell in revenue, roll back or fix for older phones, and set up a proper test. Weak: defends the earlier result.',
          rerun:
            'Tests saying "no clear effect" well. Strong: the result is inconclusive and revenue is flat; the change neither clearly helps nor hurts; decide on other grounds (cost, design) or test a bolder version. Weak: calls it a win or a loss.',
          partial:
            'Strong: stop and fix the assignment before reading anything, and coordinate the overlapping tests (they contaminate each other). Weak: trusts the dashboard.',
          kill: "Strong: separate the idea from the test: the test couldn't answer the question; offer a fast, fixed re-run. Weak: dismissive, or reverses for no reason.",
        };
        const choice = ctx.choices.recommend ?? 'rerun';
        return [
          { type: 'p', text: `They chose **${OPTIONS.find((o) => o.id === choice)?.label ?? choice}**.` },
          { type: 'p', text: guides[choice] ?? guides.rerun },
        ];
      },
      rubric: [ADAPTS, NEXT_STEPS],
      followUps: () => [
        'How would you stop a broken split from happening again?',
        'What would you put in the team’s test checklist?',
      ],
    },
    {
      id: 'review-analysis',
      kind: 'critique',
      title: "Review a teammate's analysis",
      summary:
        'An analysis that treats a correlation as cause, uses a skewed average and a misleading chart. Think aloud.',
      timeLimitSec: 420,
      voiceMaxSec: 180,
      preferVoice: false,
      thinkAloud: true,
      scored: true,
      prompt: () => [
        {
          type: 'p',
          text: 'A teammate wants to present this to leadership. **Name the three biggest problems, worst first, and what each could lead leadership to do wrong.**',
        },
      ],
      material: (ctx) => {
        const v = ctx.variant;
        return [
          { type: 'h', text: `Slide: "${s(v, 'feature')} drives retention"` },
          {
            type: 'list',
            items: [
              `Users who used ${s(v, 'feature')} had ${n(v, 'featureUsersRetention')}% 90-day retention, against ${n(v, 'otherRetention')}% for everyone else. **${s(v, 'feature')} more than doubles retention.**`,
              `${n(v, 'featureUserShare')}% of users have used it. Recommendation: make ${s(v, 'feature')} the first screen for every new user to double retention.`,
              `Average session length for these users: ${n(v, 'meanSession')} minutes.`,
              'Chart: retention by month, y-axis from 40% to 60%.',
              'Based on 6 months of data and over 200,000 users.',
            ],
          },
        ];
      },
      reviewerGuide: (ctx) => {
        const v = ctx.variant;
        return [
          { type: 'p', text: 'Planted problems:' },
          {
            type: 'list',
            items: [
              `**Correlation sold as cause.** Engaged users are the ones who find ${s(v, 'feature')}; using it doesn't make people stay. Forcing it on everyone won't "double retention". Missing this caps "catches the real problems" at 1.`,
              `**The average is skewed.** A ${n(v, 'meanSession')}-minute mean with a median around ${n(v, 'medianSession')} minutes would show a few heavy users pulling it up; report the median.`,
              '**The truncated y-axis** (40–60%) exaggerates small changes.',
            ],
          },
          {
            type: 'p',
            text: 'Decoy: the sample size is large and fine. A strong answer suggests a test (e.g. promote the feature to a random half of new users).',
          },
        ];
      },
      rubric: [
        {
          id: 'critical',
          label: 'Catches the real problems',
          weight: 2,
          anchors: [
            'Misses that it is correlation, not cause.',
            'Hints at it.',
            'Names the selection effect and one more problem.',
            'Names all three, with a better way to answer the question.',
          ],
        },
        {
          id: 'consequence',
          label: 'Explains the risk',
          weight: 1,
          anchors: [
            'No consequence named.',
            'Generic.',
            'Says what leadership would wrongly do.',
            'Says it and how to test the claim properly.',
          ],
        },
        {
          id: 'severity',
          label: 'Orders by impact',
          weight: 1,
          anchors: [
            'Decoy or chart first.',
            'Unexplained.',
            'Sensible order.',
            'Ordered by how wrong the decision would be, explained.',
          ],
        },
      ],
      followUps: () => [
        'How would you test whether the feature actually helps retention?',
        'How would you tell your teammate without embarrassing them?',
      ],
    },
    aiAllowedStage({
      id: 'readout',
      title: 'Write the readout (AI allowed)',
      summary: 'Write the experiment readout for the PM with AI. Catches over-claiming from a p-value.',
      task: () => [
        {
          type: 'p',
          text: "Write the readout of the original four-day test for the PM and designer (under 200 words): what was tested, what the data shows, what it doesn't show, and the recommendation.",
        },
      ],
      guide: (ctx) => {
        const m = experimentMath(ctx.variant);
        return [
          {
            type: 'p',
            text: `Must mention the broken split (${m.treatShare}% in the variant), revenue per 100 users (${ctx.fmt.money(m.cRp100)} vs ${ctx.fmt.money(m.tRp100)}), and the short sale-weekend run.`,
          },
          {
            type: 'p',
            text: 'AI drafts typically declare a winner from the p-value and conversion lift and ignore the split. Did the candidate correct that?',
          },
        ];
      },
      accuracy: {
        id: 'accuracy',
        label: 'Accurate and honest',
        weight: 1,
        anchors: [
          'Declares a win.',
          'Mentions caveats weakly.',
          'Names the split and revenue problems clearly.',
          "Names them and states what can and can't be concluded.",
        ],
      },
      usable: {
        id: 'usable',
        label: 'Readable by non-analysts',
        weight: 1,
        anchors: [
          'Jargon-heavy or long.',
          'Usable with edits.',
          'Plain and short.',
          'A PM could act on it in one read.',
        ],
      },
    }),
    pastWorkStage({
      id: 'changed-decision',
      title: 'An analysis that changed a decision',
      summary: 'A real analysis that changed what a team did. Checks specificity and ownership.',
      question: 'Tell us about an analysis you did that changed a decision, or should have.',
    }),
  ],
};
