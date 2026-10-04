import type { Block, RoleFamily, Variant } from '../types';
import { n, s } from '../variants';
import { ADAPTS, FICTIONAL_CALLOUT, NEXT_STEPS, aiAllowedStage, pastWorkStage, shuffled, warmupStage } from './common';

const BRANDS = [
  {
    company: 'Nuvo Skin',
    product: 'a vitamin C face serum',
    niche: 'skincare',
    claim: 'clears acne and dark spots in 7 days',
  },
  {
    company: 'Crunchfit',
    product: 'a protein snack bar',
    niche: 'fitness and food',
    claim: 'helps you lose 5 kg in a month',
  },
  { company: 'Sleepwell', product: 'a herbal sleep supplement', niche: 'wellness', claim: 'cures insomnia naturally' },
] as const;

const CREATORS = ['bought', 'macro', 'micro1', 'micro2', 'risky', 'nano'] as const;
const HANDLES = [
  '@glowwithriya',
  '@thefitdesi',
  '@meerakitchen',
  '@nikhiltalks',
  '@dailywithanya',
  '@kabirvlogs',
  '@simplysana',
  '@arjunreviews',
];

const OPTIONS = [
  { id: 'macro', label: 'Put most of the budget on the one large, genuine creator' },
  { id: 'micro', label: 'Spread it across the smaller creators with real, engaged audiences' },
  { id: 'big', label: 'Go with the creator with the most followers, as the CEO wants' },
  { id: 'ugc', label: 'Skip creators and run a customer video contest' },
];

/** Cost per 1,000 views from India, per creator. */
export function creatorMath(v: Variant) {
  return CREATORS.map((key) => {
    const views = n(v, `${key}Views`);
    const india = n(v, `${key}India`) / 100;
    const cost = n(v, `${key}Cost`);
    return {
      key,
      handle: s(v, `${key}Handle`),
      cost,
      indiaViews: views * india,
      costPer1k: Math.round(cost / ((views * india) / 1000)),
    };
  });
}

export const communityInfluencer: RoleFamily = {
  id: 'community-influencer',
  version: 1,
  name: 'Influencer & Community Manager',
  roles: [
    'Influencer Marketing Manager',
    'Community Manager',
    'Creator Partnerships Manager',
    'Brand Partnerships Executive',
  ],
  catalog: {
    function: 'Marketing',
    seniority: ['Entry', 'Mid', 'Senior'],
    industries: ['D2C & e-commerce', 'Consumer apps'],
    skills: ['Analysis', 'Judgement', 'Communication'],
    keywords: ['influencer marketing', 'creators', 'community', 'UGC', 'brand partnerships', 'Instagram', 'YouTube'],
  },
  summary:
    'Pick creators for a launch from a list where the biggest account has bought followers, spend the budget for real reach, and fix a creator brief with no ad disclosure and a health claim you can’t make.',

  warmups: [
    'Which creator do you follow and trust, and why do you trust them?',
    'Tell us about a brand collaboration you saw that felt fake.',
    'What makes an online community feel alive?',
  ],

  generate(rng, currency) {
    const inr = currency === 'INR';
    const b = rng.pick(BRANDS);
    const handles = shuffled(rng, HANDLES);
    const order = shuffled(rng, CREATORS);
    const money = (x: number) => (inr ? x : Math.round(x / 80));
    const spec: Record<(typeof CREATORS)[number], [number, number, number, number, number, number, string]> = {
      // followers, avg views, engagement %, India %, gained last month, cost, note
      bought: [
        rng.int(78, 90) * 10000,
        rng.int(15, 22) * 1000,
        0.4,
        rng.int(28, 35),
        rng.int(18, 24) * 10000,
        money(rng.pick([180000, 200000])),
        'Comments are mostly emojis and "nice pic"',
      ],
      macro: [
        rng.int(42, 48) * 10000,
        rng.int(100, 130) * 1000,
        3.1,
        rng.int(86, 90),
        rng.int(4, 8) * 1000,
        money(rng.pick([240000, 260000])),
        `Long-time ${b.niche} creator; detailed reviews`,
      ],
      micro1: [
        rng.int(38, 46) * 1000,
        rng.int(30, 38) * 1000,
        6.2,
        rng.int(90, 94),
        rng.int(1, 3) * 1000,
        money(rng.pick([16000, 18000])),
        'Followers ask her for product advice in comments',
      ],
      micro2: [
        rng.int(60, 70) * 1000,
        rng.int(25, 32) * 1000,
        4.8,
        rng.int(88, 92),
        rng.int(1, 3) * 1000,
        money(rng.pick([20000, 22000])),
        `Honest ${b.niche} reviews, including negative ones`,
      ],
      risky: [
        rng.int(110, 130) * 1000,
        rng.int(80, 95) * 1000,
        5.0,
        rng.int(84, 88),
        rng.int(5, 9) * 1000,
        money(rng.pick([38000, 42000])),
        'Prank videos; two brands ended deals with him last year after a controversy',
      ],
      nano: [
        rng.int(8, 11) * 1000,
        rng.int(5, 7) * 1000,
        9.0,
        rng.int(94, 97),
        rng.int(0, 1) * 1000 + 300,
        money(rng.pick([4000, 5000])),
        'Small, very loyal local audience',
      ],
    };
    const out: Record<string, string | number> = {};
    order.forEach((key, i) => {
      const [followers, views, er, india, gained, cost, note] = spec[key];
      out[`slot${i}`] = key;
      out[`${key}Handle`] = handles[i];
      out[`${key}Followers`] = followers;
      out[`${key}Views`] = views;
      out[`${key}Er`] = er;
      out[`${key}India`] = india;
      out[`${key}Gained`] = gained;
      out[`${key}Cost`] = cost;
      out[`${key}Note`] = note;
    });
    return {
      ...b,
      ...out,
      budget: money(rng.pick([300000, 350000, 400000])),
      salesFromCode: rng.int(40, 70),
      ugcEntries: rng.int(25, 45),
      complaintViews: rng.int(40, 90) * 1000,
    };
  },

  brief(ctx) {
    const v = ctx.variant;
    const { fmt } = ctx;
    return [
      {
        type: 'p',
        text: `You run creator partnerships at **${s(v, 'company')}**, launching ${s(v, 'product')} in India next month. Budget: **${fmt.money(n(v, 'budget'))}** for one post or reel from each creator you choose. The CEO says: "Get the biggest account you can."`,
      },
      {
        type: 'table',
        caption: 'Shortlisted creators',
        columns: [
          'Creator',
          'Followers',
          'Average views (last 10 reels)',
          'Engagement',
          'Audience in India',
          'Followers gained last month',
          'Cost per post',
          'Notes',
        ],
        rows: Array.from({ length: 6 }, (_, i) => {
          const key = s(v, `slot${i}`);
          return [
            s(v, `${key}Handle`),
            fmt.num(n(v, `${key}Followers`)),
            fmt.num(n(v, `${key}Views`)),
            `${n(v, `${key}Er`)}%`,
            `${n(v, `${key}India`)}%`,
            fmt.num(n(v, `${key}Gained`)),
            fmt.money(n(v, `${key}Cost`)),
            s(v, `${key}Note`),
          ];
        }),
      },
      { type: 'callout', text: FICTIONAL_CALLOUT },
    ];
  },

  stages: [
    warmupStage(),
    {
      id: 'pick',
      kind: 'scenario',
      title: 'Which creators are real value?',
      summary:
        'Spot bought followers (huge account, low views, foreign audience, sudden growth) and a brand-safety risk; work out real reach per rupee. Think aloud.',
      timeLimitSec: 360,
      voiceMaxSec: 150,
      preferVoice: true,
      thinkAloud: true,
      scored: true,
      prompt: () => [
        {
          type: 'p',
          text: '**Which creators give real value for this launch, and which would you avoid?** Show how you compared them.',
        },
      ],
      reviewerGuide: (ctx) => {
        const v = ctx.variant;
        const rows = creatorMath(v);
        const fmtRow = (key: string) => {
          const r = rows.find((x) => x.key === key)!;
          return `${r.handle} ≈ ${ctx.fmt.money(r.costPer1k)} per 1,000 India views`;
        };
        return [
          {
            type: 'p',
            text: `**${s(v, 'boughtHandle')}** has the most followers but shows signs of bought followers: low views for its size, ${n(v, 'boughtEr')}% engagement, only ${n(v, 'boughtIndia')}% Indian audience, ${ctx.fmt.num(n(v, 'boughtGained'))} followers gained last month, emoji comments.`,
          },
          {
            type: 'p',
            text: `Cost per 1,000 views from India: ${['bought', 'macro', 'micro1', 'micro2', 'nano'].map(fmtRow).join('; ')}.`,
          },
          {
            type: 'p',
            text: `**${s(v, 'riskyHandle')}** has good numbers but a brand-safety history. The smaller creators and the genuine large creator give far more real reach per rupee. Weak answers rank by followers.`,
          },
        ];
      },
      rubric: [
        {
          id: 'fake',
          label: 'Spots the fake following',
          weight: 2,
          anchors: [
            'Picks the biggest account.',
            'Has doubts without evidence.',
            'Spots it from views, audience and growth.',
            'Spots it and explains each signal.',
          ],
        },
        {
          id: 'value',
          label: 'Compares real reach per rupee',
          weight: 1,
          anchors: [
            'Followers only.',
            'Views without cost.',
            'Cost per real view, roughly.',
            'Cost per Indian view for each, used to choose.',
          ],
        },
        {
          id: 'safety',
          label: 'Weighs brand safety',
          weight: 1,
          anchors: [
            'Ignores it.',
            'Mentions it.',
            'Avoids the risky creator with a reason.',
            'Avoids him and says how they would vet others.',
          ],
        },
      ],
      followUps: () => [
        "How would you check a creator's audience before paying?",
        'What would you tell the CEO about the biggest account?',
      ],
    },
    {
      id: 'budget',
      kind: 'decision',
      title: 'Spend the budget',
      summary: 'Allocate the launch budget across creators. Think aloud.',
      timeLimitSec: 300,
      voiceMaxSec: 150,
      preferVoice: true,
      thinkAloud: true,
      scored: true,
      choices: OPTIONS,
      prompt: () => [
        {
          type: 'p',
          text: '**How do you spend the budget?** Pick one, list the creators and costs, and say how you will measure results.',
        },
      ],
      reviewerGuide: (ctx) => {
        const v = ctx.variant;
        return [
          {
            type: 'p',
            text: `Spreading across the genuine smaller creators (plus the large genuine creator if it fits) gives the most real reach and trust within ${ctx.fmt.money(n(v, 'budget'))}. The large genuine creator alone is defensible for awareness. The biggest account is the bought-follower one. A customer contest is slow before a launch with no customers yet. Measure with creator-specific discount codes or links, not likes.`,
          },
        ];
      },
      rubric: [
        {
          id: 'plan',
          label: 'Sound allocation',
          weight: 2,
          anchors: [
            'Picks by followers.',
            'Defensible, uncosted.',
            'Costed within budget, real reach.',
            'Costed, real reach, with a reason for each creator.',
          ],
        },
        {
          id: 'measure',
          label: 'Measures results',
          weight: 1,
          anchors: [
            'Likes and followers.',
            'Views.',
            'Codes or links per creator.',
            'Codes or links, with a target cost per sale.',
          ],
        },
      ],
      followUps: (_ctx, answer) => [
        `You chose "${answer.choiceLabel ?? 'your plan'}". How would you convince the CEO?`,
        'What would you ask creators to do differently from a normal ad?',
      ],
    },
    {
      id: 'campaign-week',
      kind: 'branch',
      title: 'Campaign week',
      summary: 'What happens during the campaign. Tests adapting and brand safety.',
      timeLimitSec: 300,
      voiceMaxSec: 120,
      preferVoice: true,
      scored: true,
      dependsOn: 'budget',
      prompt: (ctx) => {
        const v = ctx.variant;
        const byChoice: Record<string, Block[]> = {
          macro: [
            {
              type: 'p',
              text: `The big creator's reel did well, but a follower commented that the product "gave me a rash", and it now has ${ctx.fmt.num(n(v, 'complaintViews'))} views. The creator asks what to say.`,
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
          micro: [
            {
              type: 'p',
              text: `Sales from creator codes: ${n(v, 'salesFromCode')}, mostly from two creators. One creator posted without the "paid partnership" label, and a follower called it out.`,
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
          big: [
            {
              type: 'p',
              text: `The post got likes but only ${Math.round(n(v, 'salesFromCode') / 8)} sales from the creator's code. Comments are bots. The CEO asks why sales are so low.`,
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
          ugc: [
            {
              type: 'p',
              text: `Only ${n(v, 'ugcEntries')} entries came in, and two of them use music you don't have rights to. The launch is next week.`,
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
        };
        return byChoice[ctx.choices.budget ?? 'micro'] ?? byChoice.micro;
      },
      reviewerGuide: (ctx) => {
        const guides: Record<string, string> = {
          macro:
            "Strong: take the safety complaint seriously (reach out privately, involve the quality team), help the creator reply honestly, and don't delete it. Weak: asks the creator to delete or ignore.",
          micro:
            "Strong: ask the creator to add the disclosure immediately (it's required), double down on the two creators that sell, and pause or adjust the rest. Weak: ignores the disclosure.",
          big: 'Owning it: show the CEO the evidence of fake followers, recover spend if possible, and move the rest of the budget to genuine creators. Weak: blames the creative.',
          ugc: "Strong: don't use entries with unlicensed music, extend or seed the contest with a few paid creators, and set realistic launch expectations. Weak: uses the entries anyway.",
        };
        const choice = ctx.choices.budget ?? 'micro';
        return [
          { type: 'p', text: `They chose **${OPTIONS.find((o) => o.id === choice)?.label ?? choice}**.` },
          { type: 'p', text: guides[choice] ?? guides.micro },
        ];
      },
      rubric: [ADAPTS, NEXT_STEPS],
      followUps: () => [
        'What would you change in creator contracts after this?',
        'How would you report this campaign to the CEO?',
      ],
    },
    {
      id: 'creator-brief',
      kind: 'critique',
      title: 'Check the creator brief',
      summary: "A creator brief with no ad disclosure, a claim you can't make and a word-for-word script. Think aloud.",
      timeLimitSec: 360,
      voiceMaxSec: 150,
      preferVoice: false,
      thinkAloud: true,
      scored: true,
      prompt: () => [
        {
          type: 'p',
          text: 'A teammate wrote this brief for creators. **Name the problems, worst first, and the risk each creates.** Then say what the brief should say instead.',
        },
      ],
      material: (ctx) => {
        const v = ctx.variant;
        return [
          { type: 'h', text: `Creator brief: ${s(v, 'product')}` },
          {
            type: 'list',
            items: [
              `Say: "This ${s(v, 'claim')}."`,
              'Read this script word for word (attached, 45 seconds).',
              "Don't mention that it's a paid post; it should feel natural.",
              'Use these 12 hashtags.',
              'Post by the 15th; share your draft by the 10th.',
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
              `**A claim you can't make:** "${s(v, 'claim')}" is a health claim with no evidence; it breaks advertising rules and invites complaints.`,
              "**No ad disclosure:** hiding that it's paid breaks influencer advertising guidelines and destroys trust when found out.",
              "**A word-for-word script and 12 hashtags** kill the creator's voice, which is the reason to use creators.",
            ],
          },
          { type: 'p', text: 'Decoy: the draft-review and posting dates are good practice.' },
        ];
      },
      rubric: [
        {
          id: 'critical',
          label: 'Catches the compliance problems',
          weight: 2,
          anchors: [
            'Misses the claim and the disclosure.',
            'Catches one.',
            'Catches both.',
            'Catches both, plus why scripting defeats the purpose.',
          ],
        },
        {
          id: 'better',
          label: 'A better brief',
          weight: 1,
          anchors: [
            'None.',
            'Vague.',
            'Key messages, disclosure, honest claims, creator freedom.',
            "All of that with what is and isn't allowed.",
          ],
        },
        {
          id: 'severity',
          label: 'Orders by risk',
          weight: 1,
          anchors: ['Decoy first.', 'Unexplained.', 'Sensible order.', 'Ordered by legal and trust risk, explained.'],
        },
      ],
      followUps: () => [
        'What claim could the product honestly make?',
        'How would you check creators follow the rules?',
      ],
    },
    aiAllowedStage({
      id: 'brief',
      title: 'Write the creator brief (AI allowed)',
      summary: 'Write a proper creator brief with AI. Catches invented claims and missing disclosure.',
      timeLimitSec: 480,
      task: (ctx) => [
        {
          type: 'p',
          text: `Write the brief for creators for ${s(ctx.variant, 'product')} (under 200 words): what to cover, what not to say, disclosure, and what freedom they have.`,
        },
      ],
      guide: () => [
        {
          type: 'p',
          text: 'A strong brief gives a few key messages, honest claims only, requires clear paid-partnership disclosure, lists what not to say, and leaves the creator room for their own style.',
        },
        {
          type: 'p',
          text: 'AI drafts often add strong health or results claims, forget disclosure, or include a full script. Did the candidate fix these?',
        },
      ],
      accuracy: {
        id: 'accuracy',
        label: 'Compliant and honest',
        weight: 1,
        anchors: [
          'Unsafe claims or no disclosure.',
          'Partly compliant.',
          'Honest claims and clear disclosure.',
          "Compliant, with a clear do/don't list.",
        ],
      },
      usable: {
        id: 'usable',
        label: 'Creator-ready',
        weight: 1,
        anchors: [
          'Rigid or vague.',
          'Usable with edits.',
          'Clear and short.',
          'A creator would enjoy working from it.',
        ],
      },
    }),
    pastWorkStage({
      id: 'creator-campaign',
      title: 'A campaign or community you built',
      summary: 'A real creator campaign or community effort. Checks specificity and ownership.',
      question: 'Tell us about a creator campaign or community you built, and how you measured it.',
    }),
  ],
};
