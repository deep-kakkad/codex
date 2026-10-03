import type { Block, RoleFamily } from '../types';
import { n, s } from '../variants';
import { ADAPTS, FICTIONAL_CALLOUT, NEXT_STEPS, aiAllowedStage, pastWorkStage, warmupStage } from './common';

const COMPANIES = [
  { company: 'Bloomwear', product: 'sustainable clothing brand selling online' },
  { company: 'Brewcraft', product: 'specialty coffee brand selling online' },
  { company: 'Nuvo Skin', product: 'skincare brand selling online' },
] as const;

const OPTIONS = [
  { id: 'growth', label: 'Keep pushing growth with discounts to look strong for fundraising' },
  { id: 'margin', label: 'Cut discounts and fix the money lost on each order, even if growth slows' },
  { id: 'raise', label: 'Start fundraising now, before the numbers get worse' },
  { id: 'returns', label: 'Fix the returns problem first' },
];

export const foundersOffice: RoleFamily = {
  id: 'founders-office',
  version: 1,
  name: "Founder's Office / Chief of Staff",
  roles: [
    "Founder's Office Associate",
    'Chief of Staff',
    'Strategy and Operations Associate',
    'Business Associate to the CEO',
  ],
  catalog: {
    function: 'Operations',
    seniority: ['Entry', 'Mid', 'Senior'],
    industries: ['D2C & e-commerce', 'Consumer apps'],
    skills: ['Analysis', 'Numbers', 'Judgement', 'Stakeholders'],
    keywords: ["founder's office", 'chief of staff', 'CoS', 'strategy', 'bizops', 'business associate', 'generalist'],
  },
  summary:
    'The board meets in three days and every team says its numbers look great: find the growth that is losing money on each order, pick one priority for next quarter, and fix a cherry-picked board slide.',

  warmups: [
    'What is a company you admire, and one thing they do better than anyone?',
    'Tell us about a time you had to make sense of a lot of information quickly.',
    'How do you decide what to work on when everything feels urgent?',
  ],

  generate(rng, currency) {
    const inr = currency === 'INR';
    const co = rng.pick(COMPANIES);
    const ordersBefore = rng.int(40, 60) * 1000;
    const growth = rng.pick([28, 32, 36]);
    const aov = inr ? rng.pick([1400, 1600, 1800]) : rng.pick([38, 44, 50]);
    const cmBefore = inr ? rng.pick([90, 110, 130]) : rng.pick([3, 4]);
    const cmAfter = inr ? -rng.pick([30, 45, 60]) : -rng.pick([1, 2]);
    const unit = inr ? 10_000_000 : 1_000_000;
    const cash = rng.int(9, 14) * unit;
    const burnBefore = Math.round(cash / rng.pick([14, 15, 16]) / (unit / 100)) * (unit / 100);
    const burnAfter = Math.round(cash / rng.pick([8, 9]) / (unit / 100)) * (unit / 100);
    return {
      ...co,
      ordersBefore,
      ordersAfter: Math.round(ordersBefore * (1 + growth / 100)),
      growth,
      aov,
      discountBefore: rng.pick([10, 12]),
      discountAfter: rng.pick([22, 24, 26]),
      cmBefore,
      cmAfter,
      returnsBefore: rng.int(8, 10),
      returnsAfter: rng.int(15, 18),
      cash,
      burnBefore,
      burnAfter,
      cacClaimDrop: rng.pick([18, 20, 22]),
      repeatShareInNew: rng.int(30, 40),
      courierWeeks: rng.int(7, 9),
      investorAsk: rng.pick(['contribution margin', 'unit economics']),
      lostRevenuePct: rng.int(12, 18),
    };
  },

  brief(ctx) {
    const v = ctx.variant;
    const { fmt } = ctx;
    const runway = (burn: number) => Math.round((n(v, 'cash') / burn) * 10) / 10;
    return [
      {
        type: 'p',
        text: `You work in the founder's office at **${s(v, 'company')}**, a ${s(v, 'product')}. The CEO messages: **"Board meeting in three days. Tell me the three numbers that really matter and what our one priority for next quarter should be."**`,
      },
      { type: 'h', text: 'What each team sent you (this quarter vs last)' },
      {
        type: 'table',
        columns: ['Team', 'What they say', 'Their numbers'],
        rows: [
          [
            'Growth',
            '"Our best quarter ever."',
            `Orders ${fmt.num(n(v, 'ordersBefore'))} → ${fmt.num(n(v, 'ordersAfter'))} (+${n(v, 'growth')}%). Average order ${fmt.money(n(v, 'aov'))}.`,
          ],
          [
            'Marketing',
            '"We got much more efficient."',
            `Cost to acquire a new customer down ${n(v, 'cacClaimDrop')}%. Average discount ${n(v, 'discountBefore')}% → ${n(v, 'discountAfter')}%.`,
          ],
          [
            'Operations',
            '"New courier is cheaper."',
            `Shipping cost per order down 9%. Returns ${n(v, 'returnsBefore')}% → ${n(v, 'returnsAfter')}% of orders (most say "damaged in transit").`,
          ],
          [
            'Finance',
            '"Need to talk."',
            `Profit per order after product, shipping, discounts and marketing: ${fmt.money(n(v, 'cmBefore'))} → ${fmt.money(n(v, 'cmAfter'))}. Monthly cash burn ${fmt.money(n(v, 'burnBefore'))} → ${fmt.money(n(v, 'burnAfter'))}. Cash in bank ${fmt.money(n(v, 'cash'))}.`,
          ],
        ],
      },
      {
        type: 'p',
        text: `A note from Finance: marketing's "new customers" count includes anyone using a new-customer coupon; about ${n(v, 'repeatShareInNew')}% of those were existing customers with a new email. Runway at the old burn was about ${runway(n(v, 'burnBefore'))} months.`,
      },
      { type: 'callout', text: FICTIONAL_CALLOUT },
    ];
  },

  stages: [
    warmupStage(),
    {
      id: 'three-numbers',
      kind: 'scenario',
      title: 'The three numbers that matter',
      summary:
        "Pull the real story from four teams' numbers: growth bought with discounts, money lost per order, a shrinking runway. Think aloud.",
      timeLimitSec: 360,
      voiceMaxSec: 150,
      preferVoice: true,
      thinkAloud: true,
      scored: true,
      prompt: () => [
        {
          type: 'p',
          text: "**Which three numbers would you put in front of the board, and what story do they tell together?** Say which team numbers you don't trust, and why.",
        },
      ],
      reviewerGuide: (ctx) => {
        const v = ctx.variant;
        const runway = Math.round((n(v, 'cash') / n(v, 'burnAfter')) * 10) / 10;
        return [
          {
            type: 'p',
            text: 'The story: growth was bought with discounts and now loses money on every order, burning cash faster.',
          },
          {
            type: 'list',
            items: [
              `**Profit per order turned negative:** ${ctx.fmt.money(n(v, 'cmBefore'))} → ${ctx.fmt.money(n(v, 'cmAfter'))}, so each extra order makes things worse.`,
              `**Runway:** ${ctx.fmt.money(n(v, 'cash'))} ÷ ${ctx.fmt.money(n(v, 'burnAfter'))} a month ≈ ${runway} months, down from about ${Math.round((n(v, 'cash') / n(v, 'burnBefore')) * 10) / 10}.`,
              `**Discount doubled** (${n(v, 'discountBefore')}% → ${n(v, 'discountAfter')}%) to drive the +${n(v, 'growth')}% orders.`,
            ],
          },
          {
            type: 'p',
            text: `Numbers not to trust: marketing's ${n(v, 'cacClaimDrop')}% CAC drop (inflated by ~${n(v, 'repeatShareInNew')}% existing customers counted as new) and the courier "saving" (returns nearly doubled, which costs more than 9% on shipping). Weak answers lead with order growth.`,
          },
        ];
      },
      rubric: [
        {
          id: 'story',
          label: 'Finds the real story',
          weight: 2,
          anchors: [
            'Leads with growth.',
            'Notices one warning sign.',
            'Links discounts, negative profit per order and burn.',
            'Links them and quantifies the runway.',
          ],
        },
        {
          id: 'scepticism',
          label: 'Questions team numbers',
          weight: 1,
          anchors: [
            'Takes them at face value.',
            'General doubt.',
            'Challenges the CAC claim or the courier saving.',
            'Challenges both, with the reason for each.',
          ],
        },
        {
          id: 'clarity',
          label: 'Board-ready clarity',
          weight: 1,
          anchors: [
            'A list of metrics.',
            'Some framing.',
            'Three numbers with one clear story.',
            'Three numbers, one story, said in a sentence a board member would remember.',
          ],
        },
      ],
      followUps: () => [
        'How would you tell the Growth head their best quarter is a problem?',
        'Which number would the board ask about first?',
      ],
    },
    {
      id: 'priority',
      kind: 'decision',
      title: 'One priority for next quarter',
      summary: 'Recommend one company priority. Tests judgement with cash at stake. Think aloud.',
      timeLimitSec: 360,
      voiceMaxSec: 150,
      preferVoice: true,
      thinkAloud: true,
      scored: true,
      choices: OPTIONS,
      prompt: () => [
        {
          type: 'p',
          text: '**What one priority do you recommend for next quarter?** Pick one, give the reasoning with numbers, and say what the company should stop doing.',
        },
      ],
      reviewerGuide: (ctx) => {
        const v = ctx.variant;
        return [
          {
            type: 'p',
            text: `Fixing the money lost per order is the strongest: every order currently loses about ${ctx.fmt.money(-n(v, 'cmAfter'))}, so growth shortens the runway. Investors will ask about ${s(v, 'investorAsk')}, so pushing growth for fundraising backfires. Raising now with negative unit economics is hard and expensive. Returns matter (part of the margin problem) but are smaller than the discount problem; a strong "returns" answer links it to profit per order.`,
          },
          { type: 'p', text: 'Any option can score with honest maths and a clear "stop doing" list.' },
        ];
      },
      rubric: [
        {
          id: 'judgement',
          label: 'Sound priority',
          weight: 2,
          anchors: [
            'A priority that makes the cash problem worse, unexamined.',
            'Defensible, thin reasoning.',
            'Follows from profit per order and runway.',
            'Follows from them, with the cost of the trade-off.',
          ],
        },
        {
          id: 'stop',
          label: 'Says what to stop',
          weight: 1,
          anchors: [
            'Nothing.',
            'Vague.',
            'Specific things to stop.',
            'Specific, with who it affects and how to tell them.',
          ],
        },
      ],
      followUps: (_ctx, answer) => [
        `You chose "${answer.choiceLabel ?? 'your priority'}". What would you say to the Growth head?`,
        "What number would tell you in four weeks that it's working?",
      ],
    },
    {
      id: 'after-board',
      kind: 'branch',
      title: 'After the board meeting',
      summary: 'Reactions to their priority. Tests adapting and handling people.',
      timeLimitSec: 300,
      voiceMaxSec: 120,
      preferVoice: true,
      scored: true,
      dependsOn: 'priority',
      prompt: (ctx) => {
        const v = ctx.variant;
        const byChoice: Record<string, Block[]> = {
          growth: [
            {
              type: 'p',
              text: `A board member asked about ${s(v, 'investorAsk')}, and the CEO couldn't answer well. The board asks for a plan to break even per order within two quarters.`,
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
          margin: [
            {
              type: 'p',
              text: `Discounts were cut. Profit per order is back above zero, but revenue fell ${n(v, 'lostRevenuePct')}% this month. The Growth head tells the CEO you "killed the momentum" and the team is demotivated.`,
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
          raise: [
            {
              type: 'p',
              text: `Three investors passed, all citing ${s(v, 'investorAsk')}. Runway is now down a month, and the CEO is spending all their time on fundraising.`,
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
          returns: [
            {
              type: 'p',
              text: `Switching couriers takes ${n(v, 'courierWeeks')} weeks. Meanwhile discounts are still at ${n(v, 'discountAfter')}% and burn hasn't moved. The CEO asks why nothing has changed.`,
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
        };
        return byChoice[ctx.choices.priority ?? 'margin'] ?? byChoice.margin;
      },
      reviewerGuide: (ctx) => {
        const guides: Record<string, string> = {
          growth:
            'Strong: own the miss, build the per-order break-even plan (discount ladder, returns fix, marketing spend by channel) with numbers and owners. Weak: defends growth.',
          margin:
            'Expected pain. Strong: show the CEO the cash picture (losing less money per order extends runway), work with the Growth head on profitable growth levers (targeted offers, repeat customers), and recognise the team. Weak: reverses or dismisses the Growth head.',
          raise:
            "Strong: pause and fix the unit economics story first (cut discounts now), protect the CEO's time, then return to investors with a trend. Weak: keeps pitching.",
          returns:
            'Strong: admit the courier fix is slow, act on discounts now (the bigger, faster lever), and run both in parallel. Weak: waits.',
        };
        const choice = ctx.choices.priority ?? 'margin';
        return [
          { type: 'p', text: `They chose **${OPTIONS.find((o) => o.id === choice)?.label ?? choice}**.` },
          { type: 'p', text: guides[choice] ?? guides.margin },
        ];
      },
      rubric: [
        ADAPTS,
        {
          id: 'people',
          label: 'Brings people along',
          weight: 1,
          anchors: [
            'Creates conflict.',
            'Avoids it.',
            'Handles the people involved directly and fairly.',
            'Turns a critic into part of the solution.',
          ],
        },
        NEXT_STEPS,
      ],
      followUps: () => [
        'What would you tell the team in an all-hands?',
        'What did you get wrong in your original recommendation, if anything?',
      ],
    },
    {
      id: 'board-slide',
      kind: 'critique',
      title: "Review marketing's board slide",
      summary:
        'A board slide with an inflated CAC claim, revenue without returns and no comparison point. Think aloud.',
      timeLimitSec: 420,
      voiceMaxSec: 180,
      preferVoice: false,
      thinkAloud: true,
      scored: true,
      prompt: () => [
        {
          type: 'p',
          text: 'The marketing head wants this slide in the board deck. **Name the problems, worst first, and what the board would wrongly conclude from each.** Then say what the slide should show.',
        },
      ],
      material: (ctx) => {
        const v = ctx.variant;
        const { fmt } = ctx;
        return [
          { type: 'h', text: 'Slide: "Marketing: a record quarter"' },
          {
            type: 'list',
            items: [
              `Customer acquisition cost **down ${n(v, 'cacClaimDrop')}%**.`,
              `Revenue **${fmt.money(n(v, 'ordersAfter') * n(v, 'aov'))}**, our highest ever (orders × average order value).`,
              'Instagram followers up 45%.',
              'Chart: monthly revenue, last three months only.',
              "Sources: our ad platforms and the store's order system.",
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
              `**The CAC drop is inflated:** about ${n(v, 'repeatShareInNew')}% of "new" customers were existing ones using a new-customer coupon.`,
              `**Revenue ignores discounts and returns.** Orders × average order value overstates real revenue, with returns at ${n(v, 'returnsAfter')}% and discounts at ${n(v, 'discountAfter')}%; and the slide hides that each order now loses money.`,
              '**No comparison and a vanity metric:** three months with no prior-year or prior-quarter context; followers are not a board metric.',
            ],
          },
          {
            type: 'p',
            text: 'Decoy: the sources are listed, which is good. A strong slide shows net revenue, profit per order and true new-customer CAC.',
          },
        ];
      },
      rubric: [
        {
          id: 'critical',
          label: 'Catches the misleading numbers',
          weight: 2,
          anchors: [
            'Misses the CAC and revenue problems.',
            'Catches one.',
            'Catches both.',
            'Catches both and the hidden loss per order.',
          ],
        },
        {
          id: 'better',
          label: 'What the slide should show',
          weight: 1,
          anchors: [
            'Nothing.',
            'Vague.',
            'Net revenue, true CAC and profit per order.',
            'Those with comparisons and one honest headline.',
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
            'Ordered by how badly it would mislead the board, explained.',
          ],
        },
      ],
      followUps: () => [
        'How would you get the marketing head to agree to change it?',
        'What should never go on a board slide?',
      ],
    },
    aiAllowedStage({
      id: 'board-note',
      title: 'The board note (AI allowed)',
      summary: "Write the CEO's one-page board note with AI. Catches spin and invented numbers.",
      task: () => [
        {
          type: 'p',
          text: 'Write the one-page note the CEO sends the board before the meeting (under 250 words): what happened this quarter, the three numbers, the priority and what will change.',
        },
      ],
      guide: (ctx) => {
        const v = ctx.variant;
        return [
          {
            type: 'p',
            text: `Should use: +${n(v, 'growth')}% orders, profit per order ${ctx.fmt.money(n(v, 'cmBefore'))} → ${ctx.fmt.money(n(v, 'cmAfter'))}, discount ${n(v, 'discountBefore')}% → ${n(v, 'discountAfter')}%, runway about ${Math.round((n(v, 'cash') / n(v, 'burnAfter')) * 10) / 10} months.`,
          },
          {
            type: 'p',
            text: 'AI drafts typically spin ("strong momentum with some headwinds"), bury the loss per order, or invent targets. Did the candidate make it candid and specific?',
          },
        ];
      },
      accuracy: {
        id: 'accuracy',
        label: 'Candid and accurate',
        weight: 1,
        anchors: [
          'Spin or invented numbers.',
          'Accurate but buried.',
          'Accurate and candid.',
          'Candid, with the plan and how progress will be measured.',
        ],
      },
      usable: {
        id: 'usable',
        label: 'Board-ready',
        weight: 1,
        anchors: [
          'Long or rambling.',
          'Usable with edits.',
          'Tight and clear.',
          'A board member would trust the CEO more after reading it.',
        ],
      },
    }),
    pastWorkStage({
      id: 'cross-team',
      title: 'Something you drove across teams',
      summary: 'A real piece of work they drove across teams without authority. Checks specificity and ownership.',
      question: "Tell us about something you got done across several teams without being anyone's boss.",
    }),
  ],
};
