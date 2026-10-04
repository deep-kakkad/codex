import type { Block, RoleFamily } from '../types';
import { n, s } from '../variants';
import { ADAPTS, FICTIONAL_CALLOUT, NEXT_STEPS, aiAllowedStage, pastWorkStage, warmupStage } from './common';

const BRIEFS = [
  {
    company: 'Pulsewatch',
    product: 'a smartwatch priced for first-time buyers',
    insight: 'the battery lasts 14 days',
    quoteA: '"My last watch died every night. I just want one I don\'t have to charge."',
    quoteB: '"I don\'t need 100 features. I need it to last my whole trip."',
    competitorLine: '"100+ smart features. Endless possibilities."',
    claim: "India's No. 1 smartwatch",
  },
  {
    company: 'Surakshit',
    product: 'a term insurance plan bought fully online',
    insight: 'you can buy it in 10 minutes with no medical tests up to a certain age',
    quoteA: '"I kept putting it off because I thought it meant forms and doctor visits."',
    quoteB: '"An agent kept calling me. I just wanted to do it myself."',
    competitorLine: '"Secure your family\'s future with comprehensive protection."',
    claim: 'the cheapest term plan in India',
  },
  {
    company: 'Brewcraft',
    product: 'specialty coffee sold by subscription',
    insight: 'the beans are roasted the week they ship',
    quoteA: '"Supermarket coffee tastes flat. I didn\'t know why until I saw the roast date."',
    quoteB: '"I want good coffee without thinking about reordering."',
    competitorLine: '"Premium coffee for premium moments."',
    claim: "India's best-tasting coffee",
  },
] as const;

const OPTIONS = [
  { id: 'use', label: "Use the client's line as they asked" },
  { id: 'proof', label: "Ask for proof; if there's none, offer a strong line you can back up" },
  { id: 'soften', label: 'Soften it to "one of India\'s favourite…"' },
  { id: 'refuse', label: 'Refuse to write it' },
];

export const copywriter: RoleFamily = {
  id: 'copywriter',
  version: 1,
  name: 'Copywriter / Content Writer',
  roles: ['Copywriter', 'Content Writer', 'Senior Copywriter', 'Content Marketing Executive'],
  catalog: {
    function: 'Marketing',
    seniority: ['Entry', 'Mid', 'Senior'],
    industries: ['D2C & e-commerce', 'Consumer apps', 'Fintech'],
    skills: ['Writing', 'Judgement', 'Customer empathy'],
    keywords: ['copywriting', 'content writing', 'ad copy', 'headlines', 'brand voice', 'UX writing', 'creative'],
  },
  summary:
    'A launch brief with real customer research: find the insight competitors miss, handle a client who wants an unprovable “No. 1” claim, and edit a weak landing page.',

  warmups: [
    'What is an ad or line of copy you still remember, and why does it stick?',
    'Tell us about something you wrote that worked.',
    'How do you start when you have a blank page?',
  ],

  generate(rng, currency) {
    const b = rng.pick(BRIEFS);
    const inr = currency === 'INR';
    return {
      ...b,
      surveyN: rng.int(180, 260),
      insightPct: rng.int(58, 68),
      featurePct: rng.int(9, 15),
      pricePct: rng.int(18, 25),
      price: inr ? rng.pick([2999, 3499, 3999]) : rng.pick([49, 59, 69]),
      ctrA: rng.pick([1.1, 1.3]),
      ctrB: rng.pick([2.4, 2.8, 3.1]),
      complaintDays: rng.int(5, 9),
      headlineChars: 30,
      descChars: 90,
    };
  },

  brief(ctx) {
    const v = ctx.variant;
    return [
      {
        type: 'p',
        text: `You're a copywriter at an agency. The client is **${s(v, 'company')}**, launching ${s(v, 'product')} at ${ctx.fmt.money(n(v, 'price'))}. They want a homepage headline and ads.`,
      },
      { type: 'h', text: `Research: survey of ${n(v, 'surveyN')} target customers, "What matters most?"` },
      {
        type: 'table',
        columns: ['Answer', 'Share'],
        rows: [
          [`That ${s(v, 'insight')}`, `${n(v, 'insightPct')}%`],
          ['Price', `${n(v, 'pricePct')}%`],
          ['Number of features or options', `${n(v, 'featurePct')}%`],
        ],
      },
      { type: 'h', text: 'From customer interviews' },
      { type: 'quote', text: s(v, 'quoteA') },
      { type: 'quote', text: s(v, 'quoteB') },
      { type: 'p', text: `Main competitor's headline: ${s(v, 'competitorLine')}` },
      { type: 'callout', text: FICTIONAL_CALLOUT },
    ];
  },

  stages: [
    warmupStage(),
    {
      id: 'headlines',
      kind: 'scenario',
      title: 'Three headline directions',
      summary:
        'Write three headline directions from the research and pick one. Tests finding the insight competitors miss. Think aloud.',
      timeLimitSec: 360,
      voiceMaxSec: 150,
      preferVoice: true,
      thinkAloud: true,
      scored: true,
      prompt: () => [
        {
          type: 'p',
          text: '**Write three different headline directions, then say which one you would put forward and why.** Talk through what you are taking from the research.',
        },
      ],
      reviewerGuide: (ctx) => {
        const v = ctx.variant;
        return [
          {
            type: 'p',
            text: `The insight is clear: ${n(v, 'insightPct')}% care most that ${s(v, 'insight')}; only ${n(v, 'featurePct')}% care about features. The interview quotes say the same in customers' words. The competitor talks generically (${s(v, 'competitorLine')}), which leaves the insight open.`,
          },
          {
            type: 'p',
            text: 'Strong directions are specific, use the insight or the customers\' own language, and differ genuinely from each other (e.g. benefit, problem, proof). Weak ones are generic ("Smart. Stylish. You."), feature lists, or copy the competitor\'s tone.',
          },
        ];
      },
      rubric: [
        {
          id: 'insight',
          label: 'Built on the insight',
          weight: 2,
          anchors: [
            'Generic lines.',
            'One line uses the research.',
            'Lines built on the main insight.',
            "Built on it, using customers' own language, and distinct from the competitor.",
          ],
        },
        {
          id: 'craft',
          label: 'Craft',
          weight: 1,
          anchors: [
            'Clumsy or long.',
            'Clear but flat.',
            'Clear, specific, memorable.',
            "Sharp and distinctive; you'd stop scrolling.",
          ],
        },
        {
          id: 'range',
          label: 'Real range and a reasoned pick',
          weight: 1,
          anchors: [
            'Three versions of one line.',
            'Some range.',
            'Three genuinely different directions.',
            'Different directions and a convincing reason for the pick.',
          ],
        },
      ],
      followUps: () => [
        'How would you test which headline works best?',
        'Which customer quote helped you most, and why?',
      ],
    },
    {
      id: 'claim',
      kind: 'decision',
      title: 'The client\'s "No. 1" line',
      summary: 'The client insists on an unprovable superlative. Tests judgement with a client. Think aloud.',
      timeLimitSec: 300,
      voiceMaxSec: 150,
      preferVoice: true,
      thinkAloud: true,
      scored: true,
      choices: OPTIONS,
      prompt: (ctx) => [
        {
          type: 'p',
          text: `The client's marketing head loves the work but wants the headline to say **"${s(ctx.variant, 'claim')}"**. There is no data behind it. **What do you do?** Pick one and write what you would say to them.`,
        },
      ],
      reviewerGuide: () => [
        {
          type: 'p',
          text: 'Asking for proof and offering a strong alternative is the strongest: unprovable superlatives can break advertising standards, invite complaints and competitor challenges, and the research insight is more persuasive anyway. Softening to "one of India\'s favourite" is still vague and unprovable. Using it as asked shifts risk to the client without advice. Refusing flatly loses the relationship without solving the problem.',
        },
      ],
      rubric: [
        {
          id: 'judgement',
          label: 'Protects the client and the work',
          weight: 2,
          anchors: [
            'Writes it without a word, or refuses flatly.',
            'Raises it weakly.',
            'Explains the risk and offers a better line.',
            'Explains the risk, asks for proof, and makes the better line irresistible.',
          ],
        },
        {
          id: 'tone',
          label: 'Client handling',
          weight: 1,
          anchors: [
            'Preachy or defensive.',
            'Polite but weak.',
            'Clear and respectful.',
            'Makes the client feel smart for changing their mind.',
          ],
        },
      ],
      followUps: (_ctx, answer) => [
        `You chose "${answer.choiceLabel ?? 'your approach'}". What if they say "our competitor says it, why can't we"?`,
        'What proof would make a superlative acceptable?',
      ],
    },
    {
      id: 'live',
      kind: 'branch',
      title: 'After it goes live',
      summary: 'Consequences of their choice. Tests adapting and ownership.',
      timeLimitSec: 300,
      voiceMaxSec: 120,
      preferVoice: true,
      scored: true,
      dependsOn: 'claim',
      prompt: (ctx) => {
        const v = ctx.variant;
        const byChoice: Record<string, Block[]> = {
          use: [
            {
              type: 'p',
              text: `${n(v, 'complaintDays')} days after launch, a competitor filed a complaint with the advertising standards body about "${s(v, 'claim')}". The client asks why the agency didn't warn them.`,
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
          proof: [
            {
              type: 'p',
              text: `The client agreed to your line. Ads with it get ${n(v, 'ctrB')}% click-through against ${n(v, 'ctrA')}% for an old generic line. Now the client wants "15 more versions by tomorrow".`,
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
          soften: [
            {
              type: 'p',
              text: 'The client used "one of India\'s favourite". A customer on social media asks "favourite according to whom?", and the post is getting attention. Click-through is low.',
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
          refuse: [
            {
              type: 'p',
              text: 'The client went over your head to the agency head, who is annoyed you didn\'t "find a way". The client\'s in-house team wrote the No. 1 line themselves.',
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
        };
        return byChoice[ctx.choices.claim ?? 'proof'] ?? byChoice.proof;
      },
      reviewerGuide: (ctx) => {
        const guides: Record<string, string> = {
          use: 'Owning it: acknowledge the agency should have advised clearly, help withdraw or replace the line fast with the insight-led alternative. Weak: blames the client.',
          proof:
            'Strong: agree what 15 versions are for (testing which angle?), propose a structured set across a few angles, and set a realistic timeline. Weak: dumps 15 near-identical lines overnight.',
          soften:
            'Strong: replace it with the specific, provable insight line, and reply to the public question honestly. Weak: argues with the customer.',
          refuse:
            'Strong: repair with the agency head and client, explain the risk calmly with evidence, and offer the alternative again. Weak: stays rigid or gives up.',
        };
        const choice = ctx.choices.claim ?? 'proof';
        return [
          { type: 'p', text: `They chose **${OPTIONS.find((o) => o.id === choice)?.label ?? choice}**.` },
          { type: 'p', text: guides[choice] ?? guides.proof },
        ];
      },
      rubric: [ADAPTS, NEXT_STEPS],
      followUps: () => [
        'What would you do differently at the start?',
        'How do you decide when to push back on a client?',
      ],
    },
    {
      id: 'edit',
      kind: 'critique',
      title: 'Edit a weak landing page',
      summary: 'A draft with jargon, a buried benefit, an unsupported claim and inconsistent voice. Think aloud.',
      timeLimitSec: 420,
      voiceMaxSec: 180,
      preferVoice: false,
      thinkAloud: true,
      scored: true,
      prompt: () => [
        {
          type: 'p',
          text: 'A junior writer drafted this section of the landing page. **Name the biggest problems, worst first.** Then rewrite it (under 60 words).',
        },
      ],
      material: (ctx) => {
        const v = ctx.variant;
        return [
          {
            type: 'quote',
            text: `Leveraging cutting-edge, next-generation technology and a best-in-class, customer-centric approach, ${s(v, 'company')} brings you a holistic solution designed to empower your lifestyle. Trusted by millions. Oh, and by the way, ${s(v, 'insight')}! So what are you waiting for?? Grab yours today, folks!`,
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
              `**The benefit is buried:** the one thing ${n(v, 'insightPct')}% of customers care about (${s(v, 'insight')}) is an afterthought at the end.`,
              '**Jargon with no meaning:** "leveraging", "next-generation", "holistic solution", "empower your lifestyle".',
              '**"Trusted by millions"** for a product that is just launching: false and risky.',
              '**Voice flips** from corporate to "folks!" and double question marks.',
            ],
          },
          {
            type: 'p',
            text: "Decoy: having a call to action is right. A strong rewrite leads with the benefit in customers' words and ends with one clear action.",
          },
        ];
      },
      rubric: [
        {
          id: 'critical',
          label: 'Catches the real problems',
          weight: 2,
          anchors: [
            'Fixes typos only.',
            'Catches the jargon only.',
            'Catches the buried benefit and the false claim.',
            'Catches all four.',
          ],
        },
        {
          id: 'rewrite',
          label: 'The rewrite',
          weight: 1,
          anchors: [
            'Missing or still weak.',
            'Cleaner but generic.',
            'Leads with the benefit, clear action.',
            "Leads with the benefit in a distinctive voice; you'd want one.",
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
            'Ordered by effect on conversion and trust, explained.',
          ],
        },
      ],
      followUps: () => [
        'How would you give this feedback to the junior writer?',
        'What makes copy sound like a person?',
      ],
    },
    aiAllowedStage({
      id: 'ads',
      title: 'Search ads (AI allowed)',
      summary: 'Write search ad variations with AI within character limits. Catches limits broken and invented claims.',
      timeLimitSec: 480,
      task: (ctx) => [
        {
          type: 'p',
          text: `Write five search ad headlines (each under ${n(ctx.variant, 'headlineChars')} characters) and two descriptions (each under ${n(ctx.variant, 'descChars')} characters) for ${s(ctx.variant, 'company')}. Count the characters.`,
        },
      ],
      guide: (ctx) => [
        {
          type: 'p',
          text: `Should use the insight (${s(ctx.variant, 'insight')}), stay within limits, and make no unprovable claims.`,
        },
        {
          type: 'p',
          text: 'AI often breaks character limits, repeats the same idea five ways, or adds "#1"/"best" claims. Did the candidate check counts and cut claims?',
        },
      ],
      accuracy: {
        id: 'accuracy',
        label: 'Within limits and honest',
        weight: 1,
        anchors: [
          'Over limits or false claims.',
          'Some over.',
          'All within limits, honest.',
          'Within limits, honest, using the insight well.',
        ],
      },
      usable: {
        id: 'usable',
        label: 'Ready to run',
        weight: 1,
        anchors: ['Repetitive or bland.', 'Usable with edits.', 'Varied and clear.', 'A set worth testing as is.'],
      },
    }),
    pastWorkStage({
      id: 'copy-that-worked',
      title: "Copy that worked (or didn't)",
      summary: 'Real writing they did and its results. Checks specificity and ownership.',
      question: "Tell us about a piece of copy you wrote that worked, or one that didn't, and how you knew.",
    }),
  ],
};
