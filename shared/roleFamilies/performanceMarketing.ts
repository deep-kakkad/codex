import type { Block, RoleFamily, StageContext } from '../types';
import { n, s } from '../variants';

const COMPANIES = [
  { company: 'Kesar & Clay', category: 'home décor', product: 'hand-painted ceramic planters' },
  { company: 'Tiffin Theory', category: 'packaged food', product: 'ready-to-cook regional meal kits' },
  { company: 'Loom Lane', category: 'apparel', product: 'handloom cotton kurtas' },
  { company: 'Brewhaus Beans', category: 'coffee', product: 'specialty coffee subscriptions' },
  { company: 'Nimbu Naturals', category: 'personal care', product: 'Ayurvedic skincare sets' },
  { company: 'Pawprint Pantry', category: 'pet food', product: 'fresh-cooked dog food' },
] as const;

const AGENCIES = ['Northstar Performance', 'BlueKite Digital', 'Growthline Media'] as const;

const CUT_CHOICES = [
  { id: 'meta', label: 'Meta prospecting' },
  { id: 'search', label: 'Google Search' },
  { id: 'influencers', label: 'Influencers' },
  { id: 'even', label: 'Spread the cut evenly across channels' },
];

function money(ctx: StageContext, key: string) {
  return ctx.fmt.money(n(ctx.variant, key));
}

function roas(ctx: StageContext, orders: number, spend: number) {
  return ctx.fmt.x((orders * n(ctx.variant, 'aov')) / spend);
}

export const performanceMarketing: RoleFamily = {
  id: 'performance-marketing',
  version: 1,
  name: 'Performance Marketing',
  roles: ['Performance Marketing Manager', 'Growth Marketer', 'Paid Media Lead'],
  summary:
    'A D2C brand with a budget cut, over-claiming ad dashboards and an agency plan with flaws that only show up if you do the unit economics.',

  warmups: [
    'Tell us about a brand whose marketing caught your attention recently. What made it stick?',
    'What is one marketing metric you think people rely on too much, and why?',
    'What is the best ad you have seen this month, and where did you see it?',
  ],

  generate(rng, currency) {
    const inr = currency === 'INR';
    const co = rng.pick(COMPANIES);
    const aov = rng.pick(inr ? [899, 1199, 1499, 1799, 2199] : [36, 44, 52, 64, 78]);
    const marginPct = rng.pick([45, 50, 55, 60, 65]);
    const spend = inr ? rng.int(12, 30) * 100_000 : rng.int(8, 22) * 5_000;
    // Blended CPA relative to first-order gross profit: <1 is profitable on the
    // first order, >1 loses money until customers come back.
    const efficiency = rng.pick([0.8, 0.9, 1.05]);
    const grossProfitPerOrder = (aov * marginPct) / 100;
    const targetCpa = grossProfitPerOrder * efficiency;
    const orders = Math.round(spend / targetCpa);

    const rtShare = rng.int(8, 12);
    const searchShare = rng.int(20, 28);
    const inflShare = rng.int(14, 20);
    const metaShare = 100 - rtShare - searchShare - inflShare;

    // Each platform's reported CPA relative to the true blended CPA. Retargeting
    // and brand search look great because they claim sales that would have
    // happened anyway; discount codes under-count influencer impact.
    const channel = (share: number, multiplier: number) => {
      const channelSpend = (spend * share) / 100;
      return [channelSpend, Math.max(1, Math.round(channelSpend / (targetCpa * multiplier)))] as const;
    };
    const [metaSpend, metaOrders] = channel(metaShare, rng.pick([0.85, 0.9, 0.95]));
    const [rtSpend, rtOrders] = channel(rtShare, rng.pick([0.3, 0.35, 0.4]));
    const [searchSpend, searchOrders] = channel(searchShare, rng.pick([0.55, 0.6, 0.65]));
    const [inflSpend, inflOrders] = channel(inflShare, rng.pick([1.7, 1.9, 2.1]));
    const reportedOrders = metaOrders + rtOrders + searchOrders + inflOrders;

    const cutPct = rng.pick([20, 25, 30]);
    const breakEvenRoas = Math.round((100 / marginPct) * 100) / 100;
    const discountPct = 20;

    return {
      ...co,
      agency: rng.pick(AGENCIES),
      aov,
      marginPct,
      spend,
      orders,
      repeatPct: rng.int(18, 32),
      metaSpend,
      metaOrders,
      rtSpend,
      rtOrders,
      searchSpend,
      searchOrders,
      inflSpend,
      inflOrders,
      reportedOrders,
      overclaimPct: Math.round((reportedOrders / orders - 1) * 100),
      blendedCpa: spend / orders,
      breakEvenCpa: grossProfitPerOrder,
      breakEvenRoas,
      blendedRoas: Math.round(((orders * aov) / spend) * 100) / 100,
      cutPct,
      newSpend: (spend * (100 - cutPct)) / 100,
      agencyRoas: Math.round(breakEvenRoas * rng.pick([0.75, 0.8, 0.85]) * 10) / 10,
      youtubeSharePct: 35,
      discountPct,
      gpDropPct: Math.round((discountPct / marginPct) * 100),
      metaDropPct: rng.int(28, 40),
      searchDropPct: rng.int(12, 20),
      cpcRisePct: rng.pick([60, 80, 110]),
      shareAbovePct: rng.int(35, 55),
      spikeOrders: rng.int(90, 180),
      evenDropPct: cutPct + rng.int(8, 14),
    };
  },

  brief(ctx) {
    const v = ctx.variant;
    const { fmt } = ctx;
    const row = (label: string, spendKey: string, ordersKey: string) => {
      const spend = n(v, spendKey);
      const orders = n(v, ordersKey);
      return [label, fmt.money(spend), fmt.num(orders), fmt.money(spend / orders), roas(ctx, orders, spend)];
    };
    const bold = (cells: string[]) => cells.map((cell) => `**${cell}**`);
    return [
      {
        type: 'p',
        text: `You've just joined **${s(v, 'company')}** as its first in-house performance marketer. ${s(v, 'company')} is a D2C ${s(v, 'category')} brand selling ${s(v, 'product')} online. The founder runs the business day to day, and an agency, ${s(v, 'agency')}, runs paid media.`,
      },
      {
        type: 'table',
        caption: 'Last month, as reported by each ad platform',
        columns: ['Channel', 'Spend', 'Orders (platform-reported)', 'CPA', 'ROAS'],
        rows: [
          row('Meta – prospecting', 'metaSpend', 'metaOrders'),
          row('Meta – retargeting', 'rtSpend', 'rtOrders'),
          row('Google Search (brand + generic)', 'searchSpend', 'searchOrders'),
          row('Influencers (tracked by discount code)', 'inflSpend', 'inflOrders'),
          bold(row('Total (sum of dashboards)', 'spend', 'reportedOrders')),
        ],
      },
      { type: 'h', text: 'Same month, from the store backend' },
      {
        type: 'list',
        items: [
          `Orders: **${fmt.num(n(v, 'orders'))}**`,
          `Average order value: **${money(ctx, 'aov')}**`,
          `Gross margin after product, shipping and payment costs: **${fmt.pct(n(v, 'marginPct'))}**`,
          `About ${fmt.pct(n(v, 'repeatPct'))} of customers order again within 90 days.`,
        ],
      },
      {
        type: 'callout',
        text: 'The company and numbers are fictional, and every candidate gets a slightly different version. A calculator is fine.',
      },
    ];
  },

  stages: [
    {
      id: 'warmup',
      kind: 'warmup',
      title: 'Warm-up',
      timeLimitSec: 120,
      voiceMaxSec: 45,
      preferVoice: true,
      scored: false,
      prompt: (ctx) => [
        { type: 'p', text: s(ctx.variant, 'warmup') },
        { type: 'p', text: 'Keep it under 45 seconds. This one is not scored; it just gets you talking.' },
      ],
      reviewerGuide: () => [
        {
          type: 'p',
          text: 'Not scored. On the verification call, listen for the same voice and ask a related question to check it is the same person.',
        },
      ],
      rubric: [],
      followUps: () => ['Ask them to say a little more about the example they gave in the warm-up.'],
    },
    {
      id: 'first-read',
      kind: 'scenario',
      title: 'First read',
      timeLimitSec: 300,
      voiceMaxSec: 120,
      preferVoice: true,
      scored: true,
      prompt: (ctx) => [
        {
          type: 'p',
          text: `It's your first morning at ${s(ctx.variant, 'company')}. Looking at last month's numbers, **what worries you most, and what is the first number you would check before changing anything?**`,
        },
        { type: 'p', text: 'Refer to specific figures. One sharp point beats a list of ten.' },
      ],
      reviewerGuide: (ctx) => {
        const v = ctx.variant;
        const { fmt } = ctx;
        const firstOrderProfitable = n(v, 'blendedCpa') < n(v, 'breakEvenCpa');
        return [
          { type: 'p', text: 'Strong answers notice at least one of these:' },
          {
            type: 'list',
            items: [
              `**Over-attribution.** Dashboards claim ${fmt.num(n(v, 'reportedOrders'))} orders, but the store recorded ${fmt.num(n(v, 'orders'))}, so platforms over-claim by about ${fmt.pct(n(v, 'overclaimPct'))}. Channel ROAS can't be taken at face value.`,
              `**Unit economics.** Blended CPA is ${fmt.money(n(v, 'blendedCpa'))} against a first-order break-even CPA of ${fmt.money(n(v, 'breakEvenCpa'))} (AOV × margin). The business is ${firstOrderProfitable ? 'only just profitable' : 'losing money'} on first orders, and repeat purchase (${fmt.pct(n(v, 'repeatPct'))}) has to carry the rest.`,
              `**Retargeting and brand search look too good.** ${roas(ctx, n(v, 'rtOrders'), n(v, 'rtSpend'))} reported ROAS on retargeting mostly reflects people who were already going to buy.`,
            ],
          },
          {
            type: 'p',
            text: 'Weak answers give generic advice ("refresh creatives", "optimise targeting") without touching the numbers, or take platform ROAS literally and pour budget into retargeting.',
          },
        ];
      },
      rubric: [
        {
          id: 'numbers',
          label: 'Works from the actual numbers',
          weight: 2,
          anchors: [
            'No specific figures; generic advice.',
            'Quotes figures but does not connect them.',
            'Connects two or more figures into a conclusion (e.g. CPA vs break-even).',
            'Spots a non-obvious relationship, such as over-attribution, and quantifies it.',
          ],
        },
        {
          id: 'skepticism',
          label: 'Measurement scepticism',
          weight: 1,
          anchors: [
            'Takes platform ROAS at face value.',
            'Mentions attribution vaguely.',
            'Says which channel numbers are least trustworthy and why.',
            'Proposes a concrete check sized to this business (holdout, geo split, post-purchase survey, code/UTM audit).',
          ],
        },
        {
          id: 'priority',
          label: 'Prioritisation',
          weight: 1,
          anchors: [
            'A list of everything.',
            'Several priorities, unclear order.',
            'One clear priority with a reason.',
            'Clear priority plus what would change their mind.',
          ],
        },
      ],
      followUps: (ctx) => {
        const v = ctx.variant;
        return [
          'Suppose the first number you wanted to check came back clean. What would you look at next, and why?',
          `The dashboards add up to ${ctx.fmt.num(n(v, 'reportedOrders'))} orders but the store recorded ${ctx.fmt.num(n(v, 'orders'))}. Where do the extra ${ctx.fmt.num(n(v, 'reportedOrders') - n(v, 'orders'))} come from?`,
          `Work out ${s(v, 'company')}'s break-even CPA out loud. (Answer: ${money(ctx, 'breakEvenCpa')}.)`,
        ];
      },
    },
    {
      id: 'budget-cut',
      kind: 'decision',
      title: 'The budget cut',
      timeLimitSec: 360,
      voiceMaxSec: 150,
      preferVoice: true,
      scored: true,
      choices: CUT_CHOICES,
      prompt: (ctx) => [
        {
          type: 'p',
          text: `The founder has cut next month's paid media budget by **${ctx.fmt.pct(n(ctx.variant, 'cutPct'))}**, to **${money(ctx, 'newSpend')}**, and wants orders to stay roughly flat. Retargeting is small; leave it out of this decision.`,
        },
        { type: 'p', text: '**Where does most of the cut come from?** Pick one, then explain:' },
        {
          type: 'list',
          items: [
            'why this channel,',
            'what you expect to happen to store orders next month (give a number and how you got it),',
            'the risk you are accepting, and the early warning you would watch.',
          ],
        },
      ],
      reviewerGuide: () => [
        {
          type: 'p',
          text: 'There is no single right answer. Good answers commit, estimate the order impact from marginal (not average) CPA, recognise that cutting prospecting starves retargeting and brand search later, and name an early-warning metric.',
        },
        {
          type: 'p',
          text: '"Spread evenly" can be fine if it comes with a stated test plan; it is weak when it avoids the decision.',
        },
      ],
      rubric: [
        {
          id: 'tradeoff',
          label: 'Commits and reasons from unit economics',
          weight: 2,
          anchors: [
            'No clear choice, or reasoning is generic.',
            'Makes a choice with a plausible but unquantified reason.',
            'Reasons from CPA, margin or attribution quality specific to this scenario.',
            'Reasons about marginal returns and second-order effects between channels.',
          ],
        },
        {
          id: 'estimate',
          label: 'Quantified expectation',
          weight: 1,
          anchors: [
            'No estimate.',
            'A number with no logic behind it.',
            'A number with a clear, if simple, method.',
            'A range with assumptions stated and a sense of confidence.',
          ],
        },
        {
          id: 'risk',
          label: 'Risk and monitoring',
          weight: 1,
          anchors: [
            'Risk not mentioned.',
            'Generic risk ("orders may drop").',
            'Specific risk tied to the channel chosen.',
            'Specific risk plus a metric, threshold and timing for reacting.',
          ],
        },
      ],
      followUps: (_ctx, answer) => [
        `You cut ${answer.choiceLabel ?? 'the channel you chose'}. What was your second choice, and what would have made you pick it?`,
        'What number in week one would tell you that you got this wrong?',
      ],
    },
    {
      id: 'two-weeks-later',
      kind: 'branch',
      title: 'Two weeks later',
      timeLimitSec: 300,
      voiceMaxSec: 120,
      preferVoice: true,
      scored: true,
      dependsOn: 'budget-cut',
      prompt: (ctx) => {
        const v = ctx.variant;
        const { fmt } = ctx;
        const company = s(v, 'company');
        const byChoice: Record<string, Block[]> = {
          meta: [
            {
              type: 'p',
              text: `Two weeks in, Meta-reported orders are down ${fmt.pct(n(v, 'metaDropPct'))}, roughly as you planned. But Google Search orders are also down ${fmt.pct(n(v, 'searchDropPct'))}, mostly on searches for "${company}", and your retargeting audiences have shrunk by about a third.`,
            },
            {
              type: 'p',
              text: 'The founder asks: **"Was cutting Meta a mistake?"** What do you tell them, and what do you do this week?',
            },
          ],
          search: [
            {
              type: 'p',
              text: `Two weeks in, a competitor has started bidding on "${company}" as a keyword. Your brand CPC is up ${fmt.pct(n(v, 'cpcRisePct'))} and the competitor now appears above you for your own name on ${fmt.pct(n(v, 'shareAbovePct'))} of searches.`,
            },
            { type: 'p', text: 'You cut Search. **What do you do this week, and what do you tell the founder?**' },
          ],
          influencers: [
            {
              type: 'p',
              text: `Two weeks in, a creator you paid last month posts about ${company} without being paid. Over three days you get about ${fmt.num(n(v, 'spikeOrders'))} extra orders, almost all tagged "Direct / none" in analytics, and nobody uses a discount code.`,
            },
            {
              type: 'p',
              text: 'The founder says: **"Influencers work when we don\'t pay them. Cancel all the contracts."** What do you tell them?',
            },
          ],
          even: [
            {
              type: 'p',
              text: `Two weeks in, every channel is down roughly in proportion and store orders are down ${fmt.pct(n(v, 'evenDropPct'))}, worse than the ${fmt.pct(n(v, 'cutPct'))} cut would suggest.`,
            },
            {
              type: 'p',
              text: 'The founder says: **"You didn\'t make a decision, you made a spreadsheet."** What do you change now?',
            },
          ],
        };
        return byChoice[ctx.choices['budget-cut'] ?? 'even'] ?? byChoice.even;
      },
      reviewerGuide: (ctx) => {
        const guides: Record<string, string> = {
          meta: 'Tests whether they understand that prospecting feeds brand search and retargeting pools (the halo). Strong: explains the mechanism, proposes a partial restore or a structured test, and quantifies it. Weak: blames seasonality or defends the plan without looking at the new data.',
          search:
            'Tests brand defence. Strong: restores brand-term bidding quickly (cheap, high-intent), keeps any generic cut, considers a trademark complaint, and plans to measure how incremental brand search really is. Weak: ignores it, or restores all of Search.',
          influencers:
            'Tests attribution literacy. Strong: explains that codes under-count influencer impact, that the unpaid post may be a result of the past paid relationship, warns against generalising from one event, and proposes better measurement (unique links, "how did you hear about us?" survey). Weak: agrees with the founder.',
          even: 'Tests whether they can admit the weakness and adapt. Strong: explains why even cuts hurt (campaigns fall below learning thresholds, fixed creative and agency costs), consolidates into the best marginal channels, and sets a clear test. Weak: defensive, or swings to an unreasoned all-in bet.',
        };
        const choice = ctx.choices['budget-cut'] ?? 'even';
        return [
          {
            type: 'p',
            text: `They chose **${CUT_CHOICES.find((c) => c.id === choice)?.label ?? choice}** in the previous question.`,
          },
          { type: 'p', text: guides[choice] ?? guides.even },
        ];
      },
      rubric: [
        {
          id: 'update',
          label: 'Updates on new information',
          weight: 2,
          anchors: [
            'Ignores or dismisses the new data.',
            'Acknowledges it but keeps the plan unchanged without a reason.',
            'Separates what the data shows from what it only suggests, and adjusts.',
            'Adjusts in proportion to the evidence and says what would trigger a bigger change.',
          ],
        },
        {
          id: 'mechanism',
          label: 'Explains the mechanism',
          weight: 1,
          anchors: [
            'No explanation of why it happened.',
            'A plausible but generic explanation.',
            'A correct mechanism specific to the channel.',
            'A correct mechanism plus how to prove it.',
          ],
        },
        {
          id: 'action',
          label: 'Concrete next step this week',
          weight: 1,
          anchors: [
            'No action.',
            'Vague action ("monitor closely").',
            'A specific action with an owner or timing.',
            'A specific action, the expected result and how the founder will know.',
          ],
        },
      ],
      followUps: () => [
        'If the founder pushed back on what you told them, what data would you bring to the next meeting?',
        'What would you have done differently in your original decision, knowing this now?',
      ],
    },
    {
      id: 'agency-plan',
      kind: 'critique',
      title: "Critique the agency's plan",
      timeLimitSec: 420,
      voiceMaxSec: 180,
      preferVoice: false,
      scored: true,
      prompt: (ctx) => [
        {
          type: 'p',
          text: `${s(ctx.variant, 'agency')} has sent their plan for next month (budget ${money(ctx, 'newSpend')}). **Pick the three problems that matter most for ${s(ctx.variant, 'company')} right now, in order.** For each, say why it is a problem using the numbers, and what you would do instead.`,
        },
        { type: 'p', text: 'You do not need to comment on every item.' },
      ],
      material: (ctx) => {
        const v = ctx.variant;
        const { fmt } = ctx;
        return [
          { type: 'h', text: `${s(v, 'agency')}: plan for next month` },
          {
            type: 'list',
            ordered: true,
            items: [
              `Move ${fmt.pct(n(v, 'youtubeSharePct'))} of the budget into a YouTube brand-awareness campaign to build the funnel for Q4.`,
              `Set Meta campaigns to a target ROAS of ${fmt.x(n(v, 'agencyRoas'))}, comfortably above the category benchmark.`,
              'Report success as the sum of platform-reported ROAS across channels, as in the current dashboard.',
              'Refresh ad creatives every two weeks and test three new hooks per week.',
              `Run a ${fmt.pct(n(v, 'discountPct'))} sitewide discount in week one to protect volume.`,
            ],
          },
        ];
      },
      reviewerGuide: (ctx) => {
        const v = ctx.variant;
        const { fmt } = ctx;
        return [
          { type: 'p', text: 'Planted problems, roughly in order of how much they reveal:' },
          {
            type: 'list',
            items: [
              `**#2 Target ROAS is below break-even.** At ${fmt.pct(n(v, 'marginPct'))} margin, first-order break-even ROAS is ${n(v, 'breakEvenRoas').toFixed(2)}x, so a ${fmt.x(n(v, 'agencyRoas'))} target loses money on every attributed order, and more once you allow for platform over-claiming. The strongest expertise signal: generic AI critiques miss it unless given the margin.`,
              `**#3 Summing platform ROAS double-counts.** Dashboards over-claim by about ${fmt.pct(n(v, 'overclaimPct'))} against store orders. Judge on blended CPA or MER against store orders.`,
              `**#5 The discount destroys margin.** A ${fmt.pct(n(v, 'discountPct'))} discount cuts gross profit per order by about ${fmt.pct(n(v, 'gpDropPct'))} (${fmt.pct(n(v, 'discountPct'))} ÷ ${fmt.pct(n(v, 'marginPct'))}), and the goal is flat volume, not growth.`,
              "**#1 Awareness spend won't pay back next month**, while the budget is being cut and orders must hold.",
            ],
          },
          { type: 'p', text: '#4 is reasonable. Ranking it as a top-three problem is a negative signal.' },
        ];
      },
      rubric: [
        {
          id: 'flaws',
          label: 'Finds the context-bound flaws',
          weight: 2,
          anchors: [
            'Misses #2, #3 and #5.',
            'Finds one of them without the numbers.',
            'Finds two with supporting numbers.',
            'Finds #2 with the break-even maths plus at least one more.',
          ],
        },
        {
          id: 'ranking',
          label: 'Ranks by impact',
          weight: 1,
          anchors: [
            'No ranking, or ranks #4 highly.',
            'Ranking present but unexplained.',
            'Sensible ranking with reasons.',
            "Ranking tied explicitly to next month's goal and the budget cut.",
          ],
        },
        {
          id: 'fixes',
          label: 'Concrete alternatives',
          weight: 1,
          anchors: [
            'Criticism only.',
            'Vague alternatives.',
            'A specific alternative for each problem.',
            'Specific alternatives with numbers (e.g. a target ROAS above break-even).',
          ],
        },
      ],
      followUps: (ctx) => [
        `Recompute the break-even ROAS for ${s(ctx.variant, 'company')} out loud. (Answer: ${n(ctx.variant, 'breakEvenRoas').toFixed(2)}x.)`,
        'Which item on the agency list did you think was actually fine, and why?',
        'If the founder insisted on YouTube, what is the smallest test you would agree to?',
      ],
    },
    {
      id: 'founder-update',
      kind: 'ai_allowed',
      title: 'Founder update (AI allowed)',
      timeLimitSec: 540,
      voiceMaxSec: 0,
      preferVoice: false,
      scored: true,
      prompt: (ctx) => [
        {
          type: 'p',
          text: 'Use any AI tool you like for this one. We are assessing how you use it, not whether you do.',
        },
        {
          type: 'p',
          text: `Write the WhatsApp message (about 150 words) you would send ${s(ctx.variant, 'company')}'s founder summarising your plan for next month and the one risk they should know about.`,
        },
        {
          type: 'list',
          ordered: true,
          items: [
            'Paste your final message.',
            'Paste your full AI conversation, or write "none".',
            'In 2–3 lines, say what you kept, changed or rejected from the AI and why.',
          ],
        },
      ],
      reviewerGuide: (ctx) => [
        {
          type: 'p',
          text: 'Read the transcript first. Did they give the AI the real numbers and constraints? Did they catch wrong numbers or generic filler? Is the final message short, specific and written for a founder?',
        },
        {
          type: 'p',
          text: `A polished message whose numbers do not match ${s(ctx.variant, 'company')}'s scenario (budget ${money(ctx, 'newSpend')}, ${ctx.fmt.num(n(ctx.variant, 'orders'))} orders last month) is a red flag. "None" for the transcript is fine if the message itself is strong.`,
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
            'Used AI deliberately (drafting, critique) and rejected weak suggestions with reasons.',
          ],
        },
        {
          id: 'accuracy',
          label: 'Accurate to the scenario',
          weight: 1,
          anchors: [
            'Numbers wrong or invented.',
            'Mostly generic; few scenario numbers.',
            'Scenario numbers used correctly.',
            'Numbers correct and consistent with their earlier answers.',
          ],
        },
        {
          id: 'communication',
          label: 'Founder-ready communication',
          weight: 1,
          anchors: [
            'Long, vague or jargon-heavy.',
            'Understandable but unfocused.',
            'Clear plan and risk in plain language.',
            'Could be sent as is; leads with the decision and the ask.',
          ],
        },
      ],
      followUps: () => [
        'What did the AI get wrong in its first attempt?',
        'Which sentence did you rewrite most, and why?',
      ],
    },
    {
      id: 'real-decision',
      kind: 'past_work',
      title: 'A real decision',
      timeLimitSec: 240,
      voiceMaxSec: 150,
      preferVoice: true,
      scored: true,
      prompt: () => [
        {
          type: 'p',
          text: '**Tell us about a real budget or channel decision you made that did not go to plan.** What were you looking at, what did you decide, what happened, and what would you do differently?',
        },
        { type: 'p', text: 'Specifics such as numbers and timelines matter more than polish.' },
      ],
      reviewerGuide: () => [
        {
          type: 'p',
          text: 'Async answers here are easy to fabricate. Score specificity now, then verify on the call: rich detail that stays consistent under "why?" follow-ups is the signal. Stories that stay vague under follow-up questions are a warning sign.',
        },
      ],
      rubric: [
        {
          id: 'specificity',
          label: 'Specificity',
          weight: 1,
          anchors: [
            'Hypothetical or generic.',
            'A real situation, few specifics.',
            'Concrete metrics, timeline and their own role.',
            'Rich detail: what they saw, alternatives considered and what happened next.',
          ],
        },
        {
          id: 'ownership',
          label: 'Ownership and learning',
          weight: 1,
          anchors: [
            'Blames others or circumstances.',
            'Takes some ownership; lesson is generic.',
            'Clear ownership with a specific lesson.',
            'Clear ownership, and shows how the lesson changed later decisions.',
          ],
        },
      ],
      followUps: () => [
        'What exact metric were you watching, and what number made you act?',
        'Who disagreed with you at the time, and what did they argue?',
        'What did you do the following week?',
      ],
    },
  ],
};
