import type { Block, RoleFamily, Variant } from '../types';
import { n, s } from '../variants';
import { ADAPTS, FICTIONAL_CALLOUT, NEXT_STEPS, aiAllowedStage, pastWorkStage, warmupStage } from './common';

const BRANDS = [
  {
    company: 'Chai Point Co',
    product: 'a chain of tea cafés with delivery',
    thing: 'order',
    competitorTag: '#ChaiTimeWithTeaBox',
  },
  { company: 'Threadbare', product: 'an online fashion label', thing: 'outfit', competitorTag: '#StyledByUrbanloom' },
  {
    company: 'Munchbox',
    product: 'a healthy snacks brand',
    thing: 'snack box',
    competitorTag: '#SnackSmartWithNutrio',
  },
] as const;

const FORMATS = [
  'Reels (product)',
  'Carousels (tips and how-tos)',
  'Static images',
  'Stories with a link',
  'Trend and meme reels',
] as const;
const KEYS = ['reels', 'carousels', 'statics', 'stories', 'trends'] as const;

const OPTIONS = [
  { id: 'reply', label: 'Reply publicly once, apologise, move it to DMs and get support to fix it today' },
  { id: 'delete', label: 'Hide or delete the negative comments on your posts' },
  { id: 'ignore', label: 'Stay quiet and post the scheduled promotion as planned' },
  { id: 'meme', label: 'Post something funny to change the conversation' },
];

/** Last month's results per format, per post. */
export function formatMath(v: Variant) {
  return KEYS.map((key, i) => ({
    key,
    label: FORMATS[i],
    posts: n(v, `${key}Posts`),
    reach: n(v, `${key}Reach`),
    saves: n(v, `${key}Saves`),
    clicks: n(v, `${key}Clicks`),
  }));
}

export const socialMediaExecutive: RoleFamily = {
  id: 'social-media-executive',
  version: 1,
  name: 'Social Media Executive',
  roles: [
    'Social Media Executive',
    'Social Media Associate',
    'Content and Community Executive',
    'Junior Social Media Manager',
  ],
  catalog: {
    function: 'Marketing',
    seniority: ['Entry'],
    industries: ['D2C & e-commerce', 'Consumer apps', 'Retail'],
    skills: ['Analysis', 'Writing', 'Judgement'],
    keywords: ['social media', 'Instagram', 'content calendar', 'community management', 'reels', 'captions', 'social'],
  },
  summary:
    'Plan next week’s posts from last month’s numbers (trend reels get reach but no clicks), handle a customer complaint going viral, and fix captions with a price typo and a competitor’s hashtag.',

  warmups: [
    'Which brand do you think is great on social media, and why?',
    'Tell us about a post you made or saw that did much better than expected.',
    'What do you do when someone leaves a rude comment?',
  ],

  generate(rng, currency) {
    const inr = currency === 'INR';
    const b = rng.pick(BRANDS);
    const price = inr ? rng.pick([499, 799, 999]) : rng.pick([12, 19, 25]);
    return {
      ...b,
      goalClicks: rng.int(18, 25) * 100,
      reelsPosts: 8,
      reelsReach: rng.int(18, 26) * 1000,
      reelsSaves: rng.int(70, 110),
      reelsClicks: rng.int(30, 50),
      carouselsPosts: 6,
      carouselsReach: rng.int(6, 9) * 1000,
      carouselsSaves: rng.int(350, 480),
      carouselsClicks: rng.int(150, 210),
      staticsPosts: 10,
      staticsReach: rng.int(2, 4) * 1000,
      staticsSaves: rng.int(20, 40),
      staticsClicks: rng.int(10, 20),
      storiesPosts: 20,
      storiesReach: rng.int(2, 3) * 1000,
      storiesSaves: 0,
      storiesClicks: rng.int(50, 70),
      trendsPosts: 4,
      trendsReach: rng.int(40, 60) * 1000,
      trendsSaves: rng.int(20, 40),
      trendsClicks: rng.int(5, 12),
      price,
      typoPrice: inr ? Math.round(price / 10) : Math.max(1, Math.round(price / 10)),
      complaintComments: rng.int(15, 30) * 100,
      complaintShares: rng.int(3, 8) * 100,
      fixedHours: rng.int(3, 6),
      newsEvent: rng.pick(['floods in Assam', 'a train accident in the news', 'a building collapse in Mumbai']),
    };
  },

  brief(ctx) {
    const v = ctx.variant;
    const rows = formatMath(v);
    const { fmt } = ctx;
    return [
      {
        type: 'p',
        text: `You're the social media executive at **${s(v, 'company')}**, ${s(v, 'product')}. This month's goal from your manager: **${fmt.num(n(v, 'goalClicks'))} clicks to the website** from Instagram (that's where people ${s(v, 'thing') === 'order' ? 'order' : 'buy'}).`,
      },
      {
        type: 'table',
        caption: 'Last month on Instagram (average per post)',
        columns: ['Format', 'Posts', 'Reach', 'Saves', 'Website clicks'],
        rows: rows.map((r) => [
          r.label,
          String(r.posts),
          fmt.num(r.reach),
          r.saves ? fmt.num(r.saves) : '—',
          fmt.num(r.clicks),
        ]),
      },
      {
        type: 'p',
        text: 'Your manager says: "The trend reels went viral! Let\'s do more of those." You can make about five feed posts and some stories next week.',
      },
      { type: 'callout', text: FICTIONAL_CALLOUT },
    ];
  },

  stages: [
    warmupStage(),
    {
      id: 'next-week',
      kind: 'scenario',
      title: 'Plan next week',
      summary:
        'Plan posts toward a clicks goal: trend reels win reach but bring almost no clicks; carousels and link stories drive them. Think aloud.',
      timeLimitSec: 300,
      voiceMaxSec: 120,
      preferVoice: true,
      thinkAloud: true,
      scored: true,
      prompt: () => [
        {
          type: 'p',
          text: '**What five feed posts (and which stories) do you plan for next week, and why?** Is your manager right about trend reels?',
        },
      ],
      reviewerGuide: (ctx) => {
        const v = ctx.variant;
        const rows = formatMath(v);
        const total = (key: string) => {
          const r = rows.find((x) => x.key === key)!;
          return r.posts * r.clicks;
        };
        return [
          {
            type: 'p',
            text: `The goal is clicks, not reach. Trend reels average ${ctx.fmt.num(n(v, 'trendsReach'))} reach but only ${n(v, 'trendsClicks')} clicks each; carousels average ${n(v, 'carouselsClicks')} clicks (and the most saves); link stories ${n(v, 'storiesClicks')} each. Last month carousels brought ${ctx.fmt.num(total('carousels'))} clicks in total against ${ctx.fmt.num(total('trends'))} from trend reels.`,
          },
          {
            type: 'p',
            text: 'A strong plan leans on carousels and link stories, keeps one product reel for reach, and maybe one trend reel for awareness, but not more. Weak answers chase "viral" or ignore the goal.',
          },
        ];
      },
      rubric: [
        {
          id: 'goal',
          label: 'Plans for the goal',
          weight: 2,
          anchors: [
            'Plans for reach or likes.',
            'Mentions clicks without using the data.',
            'Plans around the formats that bring clicks.',
            'Plans around them and estimates the clicks the week could bring.',
          ],
        },
        {
          id: 'pushback',
          label: "Handles the manager's idea",
          weight: 1,
          anchors: [
            'Agrees without thought.',
            'Ignores it.',
            "Explains with data why trends don't serve the goal.",
            'Explains and keeps a smart, small place for trends.',
          ],
        },
        {
          id: 'specific',
          label: 'Specific post ideas',
          weight: 1,
          anchors: [
            'None.',
            'Formats only.',
            'Specific ideas per post.',
            'Specific ideas with a hook and a call to action each.',
          ],
        },
      ],
      followUps: () => [
        'What would you write on the first slide of a carousel?',
        'How would you check mid-week whether the plan is working?',
      ],
    },
    {
      id: 'complaint',
      kind: 'decision',
      title: 'A complaint goes viral',
      summary: "A customer's complaint post about the brand is spreading. Choose a response. Think aloud.",
      timeLimitSec: 300,
      voiceMaxSec: 150,
      preferVoice: true,
      thinkAloud: true,
      scored: true,
      choices: OPTIONS,
      prompt: (ctx) => [
        {
          type: 'p',
          text: `A customer posted that her ${s(ctx.variant, 'thing')} arrived damaged and support ignored her for a week. It has ${ctx.fmt.num(n(ctx.variant, 'complaintComments'))} comments and ${ctx.fmt.num(n(ctx.variant, 'complaintShares'))} shares, and people are commenting on your posts too. **What do you do?** Pick one and write your public reply.`,
        },
      ],
      reviewerGuide: () => [
        {
          type: 'p',
          text: "Replying once publicly, apologising without excuses, moving to DMs and getting support to fix it today is the strongest; also pause scheduled promotional posts and tell your manager. Deleting comments usually makes it worse and looks like hiding. Staying quiet while posting a promotion looks tone-deaf. A meme looks like you don't care.",
        },
      ],
      rubric: [
        {
          id: 'judgement',
          label: 'Calms it down',
          weight: 2,
          anchors: [
            'Deletes, ignores or jokes.',
            'Responds but defensive.',
            'Honest public reply, moves to DMs, gets it fixed.',
            'All of that plus pausing promotions and telling the manager.',
          ],
        },
        {
          id: 'reply',
          label: 'The public reply',
          weight: 1,
          anchors: [
            'Missing, robotic or blaming.',
            'Polite but generic.',
            'Human, owns it, clear next step.',
            'Human, owns it, specific, and short.',
          ],
        },
      ],
      followUps: (_ctx, answer) => [
        `You chose "${answer.choiceLabel ?? 'your approach'}". Who in the company would you message first?`,
        'When is it OK to hide a comment?',
      ],
    },
    {
      id: 'next-day',
      kind: 'branch',
      title: 'The next day',
      summary: 'What happened after their response. Tests adapting.',
      timeLimitSec: 300,
      voiceMaxSec: 120,
      preferVoice: true,
      scored: true,
      dependsOn: 'complaint',
      prompt: (ctx) => {
        const v = ctx.variant;
        const byChoice: Record<string, Block[]> = {
          reply: [
            {
              type: 'p',
              text: `Support fixed it within ${n(v, 'fixedHours')} hours and the customer posted an update thanking you. Now dozens of others are commenting with their own old complaints, hoping for the same treatment.`,
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
          delete: [
            {
              type: 'p',
              text: 'Someone posted screenshots showing the brand deleting comments. It has more shares than the original complaint. Your manager asks what happened.',
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
          ignore: [
            {
              type: 'p',
              text: 'The promotional post got hundreds of comments like "fix your support first". A news site picked up the story.',
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
          meme: [
            {
              type: 'p',
              text: 'The meme was screenshotted with "brand laughs while customers suffer" and is spreading. The original customer is now more upset.',
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
        };
        return byChoice[ctx.choices.complaint ?? 'reply'] ?? byChoice.reply;
      },
      reviewerGuide: (ctx) => {
        const guides: Record<string, string> = {
          reply:
            'Strong: set up a simple way to route each complaint to support (a pinned message or DM flow), reply to each briefly, and share the pattern with your manager (support has a backlog). Weak: ignores the new comments or promises everyone compensation.',
          delete:
            "Owning it: stop deleting, reply honestly (apologise for hiding comments too), fix the customer's issue, and tell your manager plainly. Weak: deletes more.",
          ignore:
            'Strong: pause promotions, reply honestly, get the issue fixed, and give your manager a summary before the news story grows. Weak: keeps posting.',
          meme: 'Strong: take the meme down, apologise sincerely, fix the customer\'s issue, and tell your manager. Weak: defends it as "just a joke".',
        };
        const choice = ctx.choices.complaint ?? 'reply';
        return [
          { type: 'p', text: `They chose **${OPTIONS.find((o) => o.id === choice)?.label ?? choice}**.` },
          { type: 'p', text: guides[choice] ?? guides.reply },
        ];
      },
      rubric: [ADAPTS, NEXT_STEPS],
      followUps: () => [
        'What would you tell your manager in a quick message?',
        'What should the brand change so this happens less?',
      ],
    },
    {
      id: 'captions',
      kind: 'critique',
      title: "Check the week's captions",
      summary:
        "Captions with a price typo, a competitor's hashtag and a joke during a tragedy in the news. Think aloud.",
      timeLimitSec: 360,
      voiceMaxSec: 150,
      preferVoice: false,
      thinkAloud: true,
      scored: true,
      prompt: () => [
        {
          type: 'p',
          text: 'An intern drafted captions for this week. **Find the problems, worst first, and say what could happen if each goes out.** Then fix them.',
        },
      ],
      material: (ctx) => {
        const v = ctx.variant;
        return [
          { type: 'p', text: `This week's news is dominated by ${s(v, 'newsEvent')}.` },
          {
            type: 'list',
            ordered: true,
            items: [
              `"Our bestseller is back! Only ${ctx.fmt.money(n(v, 'typoPrice'))} this week 🔥 Link in bio." (The real offer price is ${ctx.fmt.money(n(v, 'price'))}.)`,
              `"Swipe for 3 ways to make your mornings better ☀️ ${s(v, 'competitorTag')} #MorningRoutine"`,
              '"Things are so bad out there, you might as well treat yourself 😂 Order now!"',
              '"Tag a friend who needs this 💛"',
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
              `**Price typo:** ${ctx.fmt.money(n(v, 'typoPrice'))} instead of ${ctx.fmt.money(n(v, 'price'))}. Customers will screenshot it and demand that price.`,
              `**Insensitive joke during ${s(v, 'newsEvent')}:** "things are so bad out there 😂" reads as mocking a tragedy; a likely backlash.`,
              `**A competitor's branded hashtag** (${s(v, 'competitorTag')}) sends your audience to them.`,
            ],
          },
          { type: 'p', text: 'Decoy: caption 4 is fine. Emojis are fine.' },
        ];
      },
      rubric: [
        {
          id: 'critical',
          label: 'Catches the problems',
          weight: 2,
          anchors: [
            'Misses the price typo and the joke.',
            'Catches one.',
            'Catches the typo and the joke.',
            'Catches all three and why each matters.',
          ],
        },
        {
          id: 'fixes',
          label: 'Fixes',
          weight: 1,
          anchors: [
            'None.',
            'Partial.',
            'Fixed captions for each.',
            'Fixed captions, plus pausing light-hearted posts that week.',
          ],
        },
        {
          id: 'severity',
          label: 'Orders by risk',
          weight: 1,
          anchors: ['Decoy first.', 'Unexplained.', 'Sensible order.', 'Ordered by harm, explained.'],
        },
      ],
      followUps: () => [
        'How would you check captions before they go out?',
        'What would you post during a week of bad news?',
      ],
    },
    aiAllowedStage({
      id: 'carousel-captions',
      title: 'Carousel captions (AI allowed)',
      summary: "Write captions for the week's carousels with AI. Catches generic copy and hashtag stuffing.",
      timeLimitSec: 420,
      task: (ctx) => [
        {
          type: 'p',
          text: `Write captions for three carousel posts for ${s(ctx.variant, 'company')} (under 60 words each), each with a hook, a reason to save it, and a call to visit the website.`,
        },
      ],
      guide: () => [
        {
          type: 'p',
          text: 'Strong captions have a specific hook, give a reason to save (useful tips), and end with a clear website call to action, with a few relevant hashtags.',
        },
        {
          type: 'p',
          text: 'AI captions tend to be generic ("Elevate your everyday!"), emoji-heavy, and stuffed with 20 hashtags. Did the candidate make them specific and on-goal?',
        },
      ],
      accuracy: {
        id: 'accuracy',
        label: 'On-goal and specific',
        weight: 1,
        anchors: [
          'Generic, no call to action.',
          'Some specifics.',
          'Hook, save reason and website call to action.',
          "All of that in the brand's own voice.",
        ],
      },
      usable: {
        id: 'usable',
        label: 'Ready to post',
        weight: 1,
        anchors: ['Bland or stuffed.', 'Usable with edits.', 'Clear and engaging.', 'Would get saves and clicks.'],
      },
    }),
    pastWorkStage({
      id: 'post-story',
      title: 'A post or page you grew',
      summary: 'A real social media result they drove. Checks specificity and ownership.',
      question: 'Tell us about a social media account, post or campaign you worked on, and what the numbers showed.',
    }),
  ],
};
