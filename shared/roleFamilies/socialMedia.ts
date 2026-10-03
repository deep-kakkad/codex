import type { Block, RoleFamily } from '../types';
import { n, s } from '../variants';
import { AI_ALLOWED_INTRO, AI_ALLOWED_STEPS, pastWorkStage, warmupStage } from './common';

const COMPANIES = [
  {
    company: 'GlowRoot',
    handle: '@glowroot',
    product: 'a plant-based skincare brand',
    hero: 'the Overnight Repair serum',
    voice: 'calm and evidence-led: no exclamation marks, no "miracle", no medical claims',
    banned: 'medical claims such as "cures acne"',
    complaint: 'says the serum gave her a rash, and shows the photos',
  },
  {
    company: 'Fizzco',
    handle: '@fizzco',
    product: 'a low-sugar craft soda brand',
    hero: 'the Ginger Lime soda',
    voice: 'dry and funny: no exclamation marks, no "guilt-free", no health claims',
    banned: 'health claims such as "good for your gut"',
    complaint: 'says a whole case arrived flat and leaking, and shows the box',
  },
  {
    company: 'Stridez',
    handle: '@stridez',
    product: 'a running shoe brand',
    hero: 'the Tempo 2 running shoe',
    voice: 'direct and practical: no exclamation marks, no "game-changer", no injury claims',
    banned: 'injury claims such as "prevents shin splints"',
    complaint: 'says the sole came apart after two weeks, and shows the shoe',
  },
] as const;

const CUSTOMERS = ['Priya', 'Meera', 'Ananya', 'Sara', 'Kavya', 'Riya'];

const PLAYS = [
  { id: 'giveaway', label: 'A bigger giveaway every month' },
  { id: 'creators', label: 'A paid micro-creator programme' },
  { id: 'boost', label: 'Put the budget behind boosting the best Reels' },
  { id: 'series', label: 'A weekly original video series' },
];

/** Content rows in the brief: posts, reach, engagements, link clicks, attributed sales. */
const FORMATS = [
  { key: 'reels', label: 'Instagram Reels' },
  { key: 'carousels', label: 'Instagram carousels' },
  { key: 'shorts', label: 'YouTube Shorts' },
  { key: 'giveaway', label: 'Giveaway post ("follow and tag 3 friends")' },
] as const;

export const socialMedia: RoleFamily = {
  id: 'social-media',
  version: 1,
  name: 'Social Media',
  roles: ['Social Media Manager', 'Social Media Lead', 'Community Manager'],
  catalog: {
    function: 'Marketing',
    seniority: ['Mid', 'Senior'],
    industries: ['Consumer apps', 'D2C & e-commerce'],
    skills: ['Writing', 'Judgement', 'Communication'],
    keywords: ['social', 'Instagram', 'community', 'content creator'],
  },
  summary:
    'Engagement that is "up" because of a giveaway whose followers leave, a plan for the next quarter, and a public reply to a viral complaint that would make it worse.',

  warmups: [
    'Which brand do you think is best on social right now, and what exactly are they doing differently?',
    'What is a social media metric you think is overrated, and why?',
    'Tell us about a post, from any brand, that you thought was a mistake. Why?',
  ],

  generate(rng, currency) {
    const inr = currency === 'INR';
    const co = rng.pick(COMPANIES);
    const aov = inr ? rng.pick([799, 999, 1299]) : rng.pick([28, 34, 42]);
    const row: Record<string, number> = {};
    // Reels drive sales; the giveaway drives engagement and almost nothing else.
    const spec = {
      reels: {
        posts: rng.int(10, 14),
        reach: rng.int(18, 30) * 1000,
        er: rng.int(4, 6),
        clicks: rng.int(80, 120),
        orders: rng.int(9, 14),
      },
      carousels: {
        posts: rng.int(12, 18),
        reach: rng.int(4, 7) * 1000,
        er: rng.int(3, 5),
        clicks: rng.int(20, 40),
        orders: rng.int(1, 3),
      },
      shorts: {
        posts: rng.int(6, 10),
        reach: rng.int(6, 12) * 1000,
        er: rng.int(2, 4),
        clicks: rng.int(10, 25),
        orders: rng.int(1, 4),
      },
      giveaway: {
        posts: 1,
        reach: rng.int(120, 200) * 1000,
        er: rng.int(18, 26),
        clicks: rng.int(400, 900),
        orders: rng.int(0, 2),
      },
    };
    let totalOrders = 0;
    let reachAll = 0;
    let engagementsAll = 0;
    for (const { key } of FORMATS) {
      const f = spec[key];
      const reach = f.reach * f.posts;
      row[`${key}Posts`] = f.posts;
      row[`${key}Reach`] = reach;
      row[`${key}Engagements`] = Math.round((reach * f.er) / 100);
      row[`${key}Clicks`] = Math.round((reach * f.clicks) / 100_000);
      // Orders per post, so the totals stay consistent with the post count.
      row[`${key}Orders`] = f.orders * f.posts;
      row[`${key}Sales`] = f.orders * f.posts * aov;
      totalOrders += f.orders * f.posts;
      reachAll += reach;
      engagementsAll += row[`${key}Engagements`];
    }
    const tenths = (x: number) => Math.round(x * 10) / 10;
    const erWithoutGiveaway = tenths(
      ((engagementsAll - row.giveawayEngagements) / (reachAll - row.giveawayReach)) * 100,
    );
    const followersBefore = rng.int(40, 90) * 1000;
    const giveawayFollowers = rng.int(12, 25) * 1000;
    const unfollowPct = rng.int(55, 72);
    return {
      ...co,
      ...row,
      customer: rng.pick(CUSTOMERS),
      orderNumber: rng.int(40_000, 89_999),
      aov,
      totalOrders,
      followersBefore,
      giveawayFollowers,
      followersPeak: followersBefore + giveawayFollowers + rng.int(1, 3) * 1000,
      unfollowPct,
      // Engagement rate jumped last month thanks to one post; without it, it barely moved.
      erNow: tenths((engagementsAll / reachAll) * 100),
      erWithoutGiveaway,
      erBefore: tenths(erWithoutGiveaway + rng.int(-4, 2) / 10),
      salesBefore: Math.round(totalOrders * rng.pick([0.95, 1, 1.05])) * aov,
      complaintViews: rng.int(300, 900) * 1000,
      complaintComments: rng.int(800, 2500),
      // Branch outcomes.
      reachPerPostDropPct: rng.int(20, 35),
      secondGiveawayFollowers: rng.int(15, 30) * 1000,
      creators: 10,
      topCreatorSharePct: rng.int(65, 80),
      boostCpmUpPct: rng.int(35, 60),
      seriesDropPct: rng.int(40, 60),
      budget: inr ? rng.int(3, 6) * 100_000 : rng.int(5, 10) * 1000,
    };
  },

  brief(ctx) {
    const v = ctx.variant;
    const { fmt } = ctx;
    return [
      {
        type: 'p',
        text: `You've just joined **${s(v, 'company')}** (${s(v, 'handle')}), ${s(v, 'product')}, as social media lead. Your predecessor's last report said: **"Engagement rate up from ${n(v, 'erBefore').toFixed(1)}% to ${n(v, 'erNow').toFixed(1)}%, and ${fmt.num(n(v, 'giveawayFollowers'))} new followers in a month."** The CEO loved it. You have ${fmt.money(n(v, 'budget'))} a quarter beyond salaries.`,
      },
      {
        type: 'table',
        caption: 'Last month, by format',
        columns: ['Format', 'Posts', 'Reach', 'Engagements', 'Link clicks', 'Sales (tracked links)'],
        rows: FORMATS.map(({ key, label }) => [
          label,
          fmt.num(n(v, `${key}Posts`)),
          fmt.num(n(v, `${key}Reach`)),
          fmt.num(n(v, `${key}Engagements`)),
          fmt.num(n(v, `${key}Clicks`)),
          fmt.money(n(v, `${key}Sales`)),
        ]),
      },
      { type: 'h', text: 'Other things you have found' },
      {
        type: 'list',
        items: [
          `Followers went from ${fmt.num(n(v, 'followersBefore'))} to ${fmt.num(n(v, 'followersPeak'))} during the giveaway. ${fmt.pct(n(v, 'unfollowPct'))} of the accounts that followed during the giveaway have since unfollowed.`,
          `Social sales the month before were ${fmt.money(n(v, 'salesBefore'))}.`,
          `Brand voice: ${s(v, 'voice')}.`,
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
      id: 'whats-working',
      kind: 'scenario',
      title: 'What is actually working?',
      summary:
        'Explain what the engagement numbers hide and what actually drives sales. Think aloud: shows whether they look past vanity metrics.',
      timeLimitSec: 300,
      voiceMaxSec: 120,
      preferVoice: true,
      thinkAloud: true,
      scored: true,
      prompt: () => [
        {
          type: 'p',
          text: 'The CEO asks: **"So we should do more giveaways, right?"** What is actually working on your channels, what is not, and what do you tell them?',
        },
        { type: 'p', text: 'Refer to specific formats and numbers. The data is on the left.' },
      ],
      reviewerGuide: (ctx) => {
        const v = ctx.variant;
        const { fmt } = ctx;
        return [
          { type: 'p', text: 'Strong answers notice:' },
          {
            type: 'list',
            items: [
              `**The engagement rate is one post.** The giveaway has ${fmt.num(n(v, 'giveawayEngagements'))} engagements from a single post but brought ${fmt.money(n(v, 'giveawaySales'))} in sales. Without it the engagement rate is ${n(v, 'erWithoutGiveaway').toFixed(1)}%, against ${n(v, 'erBefore').toFixed(1)}% the month before.`,
              `**The followers did not stay.** ${fmt.pct(n(v, 'unfollowPct'))} of the giveaway followers have unfollowed, and the rest are prize-seekers, which can lower reach for future posts.`,
              `**Reels drive the business.** ${fmt.money(n(v, 'reelsSales'))} in tracked sales from ${n(v, 'reelsPosts')} Reels, by far the best format per post.`,
              '**Measurement caveat.** Tracked links undercount social influence (people search for the brand later), so check branded search or a post-purchase survey too.',
            ],
          },
          {
            type: 'p',
            text: 'A good answer tells the CEO plainly that the giveaway inflated the metrics and proposes a better measure (sales or clicks per post, retained followers). Weak answers celebrate the engagement or recommend more giveaways.',
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
            'Shows the engagement jump is the giveaway and Reels drive sales, with numbers.',
            'Compares formats per post and sizes what more Reels could bring.',
          ],
        },
        {
          id: 'metrics',
          label: 'Looks past vanity metrics',
          weight: 1,
          anchors: [
            'Treats engagement and followers as success.',
            'Mentions sales vaguely.',
            'Separates attention from business outcomes clearly.',
            'Proposes a better success metric and notes the limits of link tracking.',
          ],
        },
        {
          id: 'ceo',
          label: 'Honest, clear message to the CEO',
          weight: 1,
          anchors: [
            'Agrees to more giveaways or avoids the question.',
            'Understandable but hedged.',
            'Direct: explains why the giveaway numbers mislead.',
            'Direct, plus what to report instead from next month.',
          ],
        },
      ],
      followUps: () => [
        'Is there any situation where you would run a giveaway? What would it look like?',
        'How would you check whether social drives sales that tracked links miss?',
      ],
    },
    {
      id: 'quarter-plan',
      kind: 'decision',
      title: "Next quarter's plan",
      summary: "Commit to where the quarter's budget goes and estimate the sales impact. Think aloud.",
      timeLimitSec: 360,
      voiceMaxSec: 150,
      preferVoice: true,
      thinkAloud: true,
      scored: true,
      choices: PLAYS,
      prompt: (ctx) => [
        {
          type: 'p',
          text: `Where does most of the ${ctx.fmt.money(n(ctx.variant, 'budget'))} go next quarter?`,
        },
        {
          type: 'p',
          text: 'Pick one, then explain why, roughly how much extra social sales you expect a month (and how you got that), and the risk you are accepting.',
        },
      ],
      reviewerGuide: () => [
        {
          type: 'p',
          text: 'Creators and boosting Reels follow the evidence best; a series can work but is slow and costly to produce; more giveaways repeat the mistake. A giveaway choice can still score on reasoning if the candidate explains how they would fix its problems (targeting, entry rules), but should lose on use of evidence.',
        },
        {
          type: 'p',
          text: 'Look for an estimate built from sales per Reel or per post, and a named risk (creator fit and disclosure, rising ad costs, production capacity, fatigue).',
        },
      ],
      rubric: [
        {
          id: 'reasoning',
          label: 'Reasons from this data',
          weight: 2,
          anchors: [
            'Generic social advice.',
            'Plausible but not tied to the numbers.',
            'Uses the per-format results to justify the choice.',
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
            'A number built from the format data.',
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
      id: 'six-weeks-later',
      kind: 'branch',
      title: 'Six weeks later',
      summary: 'The situation changes based on their plan. Tests whether they adapt and explain what happened.',
      timeLimitSec: 300,
      voiceMaxSec: 120,
      preferVoice: true,
      scored: true,
      dependsOn: 'quarter-plan',
      prompt: (ctx) => {
        const v = ctx.variant;
        const { fmt } = ctx;
        const byChoice: Record<string, Block[]> = {
          giveaway: [
            {
              type: 'p',
              text: `The second giveaway added ${fmt.num(n(v, 'secondGiveawayFollowers'))} followers and the CEO is delighted. But reach per regular post is down ${fmt.pct(n(v, 'reachPerPostDropPct'))} and social sales have not moved.`,
            },
            { type: 'p', text: '**What do you tell the CEO, and what do you change?**' },
          ],
          creators: [
            {
              type: 'p',
              text: `Of ${n(v, 'creators')} creators, three drove ${fmt.pct(n(v, 'topCreatorSharePct'))} of the tracked sales. One of the others posted about ${s(v, 'hero')} without disclosing it was paid, and a follower has called it out in the comments.`,
            },
            { type: 'p', text: '**What do you do this week, and how do you change the programme?**' },
          ],
          boost: [
            {
              type: 'p',
              text: `Boosted Reels brought sales, but the cost per thousand views is up ${fmt.pct(n(v, 'boostCpmUpPct'))} since week one. The paid-ads team says your boosts are bidding against their campaigns for the same audience.`,
            },
            { type: 'p', text: '**What do you do, and what do you agree with the paid-ads team?**' },
          ],
          series: [
            {
              type: 'p',
              text: `Views are down ${fmt.pct(n(v, 'seriesDropPct'))} from episode one to episode five. Episode two did well because it featured a customer. The team is spending two days a week on production.`,
            },
            { type: 'p', text: '**Do you continue? What do you change?**' },
          ],
        };
        return byChoice[ctx.choices['quarter-plan'] ?? 'creators'] ?? byChoice.creators;
      },
      reviewerGuide: (ctx) => {
        const guides: Record<string, string> = {
          giveaway:
            'Tests honesty about a vanity win. Strong: explains that low-quality followers suppress reach, stops or reshapes giveaways, and resets the CEO on sales metrics. Weak: celebrates the followers.',
          creators:
            'Two issues: compliance (get the post labelled or removed today, reply publicly and honestly, tighten contracts) and concentration (renew the three that work, replace the rest). Weak: ignores the disclosure or deletes the comment.',
          boost:
            'Tests cost discipline and cross-team work. Strong: caps frequency, refreshes creative, and agrees audiences and a shared cost-per-sale target with the paid team. Weak: keeps spending or argues with the paid team.',
          series:
            'Tests reading the data. Strong: keeps what worked (customer stories), cuts production cost or frequency, and sets a stop rule. Weak: carries on unchanged or abandons it without learning from episode two.',
        };
        const choice = ctx.choices['quarter-plan'] ?? 'creators';
        return [
          { type: 'p', text: `They chose **${PLAYS.find((p) => p.id === choice)?.label ?? choice}**.` },
          { type: 'p', text: guides[choice] ?? guides.creators },
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
        'Knowing this, would you make the same plan again?',
      ],
    },
    {
      id: 'viral-reply',
      kind: 'critique',
      title: 'Review a reply to a viral complaint',
      summary:
        "Critique an intern's public reply to a viral complaint that exposes the customer's details and makes things worse. Think aloud.",
      timeLimitSec: 420,
      voiceMaxSec: 180,
      preferVoice: false,
      thinkAloud: true,
      scored: true,
      prompt: (ctx) => {
        const v = ctx.variant;
        const { fmt } = ctx;
        return [
          {
            type: 'p',
            text: `A customer, ${s(v, 'customer')}, posted a video that ${s(v, 'complaint')}. It has ${fmt.num(n(v, 'complaintViews'))} views and ${fmt.num(n(v, 'complaintComments'))} comments. An intern drafted the public reply below and wants to post it now.`,
          },
          {
            type: 'p',
            text: '**Name the three most important problems, most important first, and what you would do instead.** You do not need to comment on every line.',
          },
        ];
      },
      material: (ctx) => {
        const v = ctx.variant;
        return [
          { type: 'h', text: `Draft reply from ${s(v, 'handle')}` },
          {
            type: 'quote',
            text: `Hi ${s(v, 'customer')}, we got back to you within the hour as always. We've looked up order #${n(v, 'orderNumber')}, delivered to 14 Lake View Road, and honestly nobody else has ever reported this, so it is most likely down to how the product was stored or used. To make it right we'll send you a free year of ${s(v, 'hero')}. We've also hidden the negative comments on our page to keep things positive.`,
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
              `**It publishes the customer's order number and address.** A privacy breach in public; it must never be posted.`,
              '**It blames and contradicts the customer** ("nobody else has ever reported this", "how it was used") in front of an audience that has seen the video.',
              '**It overpromises compensation in public.** A free year sets a precedent that every commenter will ask for, before anyone has looked into it.',
              '**Hiding negative comments** gets noticed and makes the story worse.',
            ],
          },
          {
            type: 'p',
            text: `Replying quickly is good, and the right move is a short public reply that thanks ${s(v, 'customer')}, apologises for the experience, and takes details to a private message, then an investigation. Ranking the speed of the reply as a problem is a negative signal.`,
          },
        ];
      },
      rubric: [
        {
          id: 'flaws',
          label: 'Finds the damaging problems',
          weight: 2,
          anchors: [
            'Misses the privacy breach.',
            'Finds the privacy breach only.',
            'Finds the privacy breach and one other, and explains why each matters.',
            'Finds privacy, blame, overpromising and hidden comments.',
          ],
        },
        {
          id: 'ranking',
          label: 'Ranks by impact',
          weight: 1,
          anchors: [
            'No ranking, or ranks reply speed highly.',
            'Ranking without reasons.',
            'Sensible ranking with reasons.',
            'Ranking tied to legal risk and how the story could grow.',
          ],
        },
        {
          id: 'fixes',
          label: 'A better response',
          weight: 1,
          anchors: [
            'Criticism only.',
            'Vague fixes.',
            'A rewritten public reply that moves details to a private message.',
            'A rewritten reply plus the plan behind it (investigation, internal escalation, follow-up).',
          ],
        },
      ],
      followUps: () => [
        'What would you post publicly once you had investigated?',
        'Which part of the draft did you think was fine, and why?',
      ],
    },
    {
      id: 'captions',
      kind: 'ai_allowed',
      title: 'Reel captions (AI allowed)',
      summary:
        'Write on-brand Reel hooks and captions with any AI tool, and paste the conversation. Shows how they work with AI.',
      timeLimitSec: 540,
      voiceMaxSec: 0,
      preferVoice: false,
      scored: true,
      prompt: (ctx) => [
        { type: 'p', text: AI_ALLOWED_INTRO },
        {
          type: 'p',
          text: `Write the opening hook (the first line on screen) and caption for three Reels about ${s(ctx.variant, 'hero')}. Follow the brand voice in the brief.`,
        },
        { type: 'list', ordered: true, items: AI_ALLOWED_STEPS },
      ],
      reviewerGuide: (ctx) => [
        {
          type: 'p',
          text: `Check the transcript: did they give the AI the brand voice (${s(ctx.variant, 'voice')})? AI drafts tend to add exclamation marks, emoji walls, buzzwords and ${s(ctx.variant, 'banned')}, which is a legal risk.`,
        },
        {
          type: 'p',
          text: 'Strong answers have hooks that work in the first second, follow the voice, and make no claims the brand cannot back up.',
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
          label: 'On brand and safe',
          weight: 1,
          anchors: [
            'Breaks the voice or makes risky claims.',
            'Mostly generic.',
            'Follows the voice; no risky claims.',
            'Distinctive voice and specific to the product.',
          ],
        },
        {
          id: 'craft',
          label: 'Hooks that stop the scroll',
          weight: 1,
          anchors: [
            'Bland or slow openings.',
            'Serviceable.',
            'Clear, specific hooks.',
            'Varied hooks a team could test against each other.',
          ],
        },
      ],
      followUps: () => [
        'What did the AI get wrong first time?',
        'Which hook would you test first, and how would you judge it?',
      ],
    },
    pastWorkStage({
      id: 'real-post',
      title: 'A real campaign or post',
      summary:
        "A real social campaign or post that got attention but didn't help the business. Checks specificity and ownership.",
      question:
        'Tell us about a social campaign or post that got attention but did not help the business, or went wrong.',
    }),
  ],
};
