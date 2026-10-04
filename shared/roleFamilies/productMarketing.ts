import type { Block, RoleFamily, Variant } from '../types';
import { n, s } from '../variants';
import { ADAPTS, FICTIONAL_CALLOUT, NEXT_STEPS, aiAllowedStage, pastWorkStage, warmupStage } from './common';

const PRODUCTS = [
  {
    company: 'Helpwise',
    product: 'customer support software',
    buyer: 'support heads',
    newFeature: 'an AI reply assistant',
  },
  {
    company: 'Payroll Pal',
    product: 'payroll and HR software',
    buyer: 'HR and finance heads',
    newFeature: 'automatic tax filing',
  },
  {
    company: 'Shiftly',
    product: 'field-service scheduling software',
    buyer: 'operations heads',
    newFeature: 'route optimisation',
  },
] as const;

const OPTIONS = [
  { id: 'price', label: 'Lead with price: match the competitor’s new cheaper plan' },
  { id: 'speed', label: 'Lead with how fast mid-size teams get set up and see value' },
  { id: 'ai', label: 'Lead with the new feature and the AI story' },
  { id: 'enterprise', label: 'Lead with security and scale to win large companies' },
];

/** Win and loss reasons from the last 40 deals, by segment. */
export function winLoss(v: Variant) {
  return {
    midWins: n(v, 'midWins'),
    midLosses: n(v, 'midLosses'),
    entWins: n(v, 'entWins'),
    entLosses: n(v, 'entLosses'),
    winSpeed: n(v, 'winSpeed'),
    winFeatures: n(v, 'winFeatures'),
    lossPrice: n(v, 'lossPrice'),
    lossSecurity: n(v, 'lossSecurity'),
  };
}

export const productMarketing: RoleFamily = {
  id: 'product-marketing',
  version: 1,
  name: 'Product Marketing Manager',
  roles: ['Product Marketing Manager', 'Senior Product Marketer', 'Go-to-Market Manager'],
  catalog: {
    function: 'Marketing',
    seniority: ['Mid', 'Senior'],
    industries: ['SaaS'],
    skills: ['Analysis', 'Writing', 'Judgement'],
    keywords: ['PMM', 'positioning', 'messaging', 'go-to-market', 'GTM', 'launch', 'competitive', 'win/loss'],
  },
  summary:
    'A competitor launches a cheaper plan just before your feature launch: find where you really win in the win/loss data, choose the launch message, and cut the unprovable claims from a launch page.',

  warmups: [
    'What is a product whose marketing made you buy it? What did it say?',
    'Tell us about a product you love that explains itself badly.',
    "How would you describe your last company's product in one sentence?",
  ],

  generate(rng) {
    const p = rng.pick(PRODUCTS);
    const midWins = rng.int(14, 17);
    const midLosses = rng.int(4, 6);
    const entWins = rng.int(2, 4);
    const entLosses = 40 - midWins - midLosses - entWins;
    return {
      ...p,
      competitor: rng.pick(['Zentrix', 'Clearbook', 'Quanta Suite']),
      midWins,
      midLosses,
      entWins,
      entLosses,
      winSpeed: Math.round(midWins * rng.pick([0.6, 0.65, 0.7])),
      winFeatures: rng.int(2, 3),
      lossPrice: Math.round(midLosses * rng.pick([0.5, 0.6])),
      lossSecurity: Math.round(entLosses * rng.pick([0.6, 0.7])),
      setupDays: rng.pick([3, 5, 7]),
      competitorSetupWeeks: rng.pick([4, 6]),
      priceCutPct: rng.pick([25, 30, 35]),
      launchWeeks: 3,
      trialLift: rng.int(8, 14),
      aiSignupDrop: rng.int(5, 9),
    };
  },

  brief(ctx) {
    const v = ctx.variant;
    const w = winLoss(v);
    return [
      {
        type: 'p',
        text: `You're the product marketing manager at **${s(v, 'company')}**, which sells ${s(v, 'product')} to ${s(v, 'buyer')}. Your homepage says "The all-in-one platform for every team". You launch ${s(v, 'newFeature')} in ${n(v, 'launchWeeks')} weeks.`,
      },
      {
        type: 'p',
        text: `Yesterday ${s(v, 'competitor')} launched a plan ${n(v, 'priceCutPct')}% cheaper than yours. The CEO asks: "What's our launch message now?"`,
      },
      {
        type: 'table',
        caption: 'Win/loss interviews, last 40 deals',
        columns: ['Segment', 'Won', 'Lost', 'Most common reason'],
        rows: [
          [
            'Mid-size (50–500 staff)',
            String(w.midWins),
            String(w.midLosses),
            `Won: "live in ${n(v, 'setupDays')} days, not months" (${w.winSpeed} of ${w.midWins}). Lost: price (${w.lossPrice} of ${w.midLosses}).`,
          ],
          [
            'Large (500+ staff)',
            String(w.entWins),
            String(w.entLosses),
            `Lost: security reviews and single sign-on (${w.lossSecurity} of ${w.entLosses}).`,
          ],
        ],
      },
      {
        type: 'list',
        items: [
          `Only ${w.winFeatures} of the ${w.midWins + w.entWins} wins mentioned the number of features.`,
          `Customers say the competitor takes ${n(v, 'competitorSetupWeeks')} weeks to set up.`,
          `Sales says: "Large companies are where the money is. We should go after them."`,
        ],
      },
      { type: 'callout', text: FICTIONAL_CALLOUT },
    ];
  },

  stages: [
    warmupStage(),
    {
      id: 'where-we-win',
      kind: 'scenario',
      title: 'Where do we actually win?',
      summary:
        'Read win/loss data: the product wins mid-size deals on speed, not features, and loses large deals on security. Think aloud.',
      timeLimitSec: 300,
      voiceMaxSec: 120,
      preferVoice: true,
      thinkAloud: true,
      scored: true,
      prompt: () => [
        {
          type: 'p',
          text: '**Who do we win with, and why? Is "all-in-one platform for every team" the right positioning?** Use the win/loss data.',
        },
      ],
      reviewerGuide: (ctx) => {
        const v = ctx.variant;
        const w = winLoss(v);
        return [
          {
            type: 'p',
            text: `Mid-size: ${w.midWins} won, ${w.midLosses} lost; most wins cite speed ("live in ${n(v, 'setupDays')} days"). Large: ${w.entWins} won, ${w.entLosses} lost, mostly on security. Features rarely decide a win (${w.winFeatures} mentions).`,
          },
          {
            type: 'p',
            text: '"All-in-one for every team" is generic and doesn\'t match why people buy. Strong positioning: fastest to value for mid-size teams. Sales\' "go after large companies" ignores that the product loses there for reasons marketing can\'t fix. Weak answers keep "all-in-one" or chase enterprise.',
          },
        ];
      },
      rubric: [
        {
          id: 'insight',
          label: 'Finds where they win and why',
          weight: 2,
          anchors: [
            'Keeps the generic positioning.',
            'Notices one segment pattern.',
            'Mid-size wins on speed; large losses on security.',
            "That, plus why features don't sell and what it means for positioning.",
          ],
        },
        {
          id: 'evidence',
          label: 'Uses the data',
          weight: 1,
          anchors: [
            'Opinion only.',
            'Some numbers.',
            'Win rates and reasons by segment.',
            "All of that, including the competitor's weakness.",
          ],
        },
        {
          id: 'sales',
          label: 'Handles the Sales view',
          weight: 1,
          anchors: [
            'Agrees without data.',
            'Ignores it.',
            'Explains with data why enterprise is hard now.',
            'Explains and suggests what would need to change first.',
          ],
        },
      ],
      followUps: () => [
        'How would you test your positioning before the launch?',
        'What would you change on the homepage first?',
      ],
    },
    {
      id: 'message',
      kind: 'decision',
      title: 'The launch message',
      summary: 'Choose the launch message after a competitor price cut. Think aloud.',
      timeLimitSec: 300,
      voiceMaxSec: 150,
      preferVoice: true,
      thinkAloud: true,
      scored: true,
      choices: OPTIONS,
      prompt: () => [
        {
          type: 'p',
          text: '**What does the launch lead with?** Pick one, write the headline, and say how the new feature fits it.',
        },
      ],
      reviewerGuide: (ctx) => {
        const v = ctx.variant;
        return [
          {
            type: 'p',
            text: `Leading with speed for mid-size teams is the strongest: it's why they win, and it's where the competitor is weak (${n(v, 'competitorSetupWeeks')} weeks to set up). The new feature fits as "even faster". Matching price starts a race on the competitor's terms (price only explains a few mid-size losses). Leading with AI is generic. Enterprise security fights where the product currently loses. Any can score with honest reasoning.`,
          },
        ];
      },
      rubric: [
        {
          id: 'choice',
          label: 'Message fits the evidence',
          weight: 2,
          anchors: [
            'Ignores the data.',
            'Defensible, thin reasoning.',
            'Built on why they win.',
            'Built on why they win and where the competitor is weak.',
          ],
        },
        {
          id: 'headline',
          label: 'The headline',
          weight: 1,
          anchors: [
            'Missing or generic.',
            'Clear but bland.',
            'Specific and believable.',
            'Specific, believable and hard for the competitor to copy.',
          ],
        },
      ],
      followUps: (_ctx, answer) => [
        `You chose "${answer.choiceLabel ?? 'your message'}". What would you tell Sales to say when a buyer mentions the cheaper plan?`,
        'How would you know the message is working within a month?',
      ],
    },
    {
      id: 'after-launch',
      kind: 'branch',
      title: 'Two weeks after launch',
      summary: 'Results of their message. Tests reading signals and adapting.',
      timeLimitSec: 300,
      voiceMaxSec: 120,
      preferVoice: true,
      scored: true,
      dependsOn: 'message',
      prompt: (ctx) => {
        const v = ctx.variant;
        const byChoice: Record<string, Block[]> = {
          price: [
            {
              type: 'p',
              text: `You matched the price. ${s(v, 'competitor')} cut again by 10%. Sign-ups are flat and Finance says margins dropped. Sales asks for another discount.`,
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
          speed: [
            {
              type: 'p',
              text: `Trial sign-ups are up ${n(v, 'trialLift')}%, but Sales complains: "Large prospects say we look like a small-company tool." One large prospect dropped out.`,
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
          ai: [
            {
              type: 'p',
              text: `Press coverage was good, but sign-ups dropped ${n(v, 'aiSignupDrop')}%. In calls, buyers ask "is the AI safe with our data?" and Sales can't answer.`,
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
          enterprise: [
            {
              type: 'p',
              text: "Large-company leads went up, but every one stalled at the security review because single sign-on isn't built yet. Mid-size sign-ups fell.",
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
        };
        return byChoice[ctx.choices.message ?? 'speed'] ?? byChoice.speed;
      },
      reviewerGuide: (ctx) => {
        const guides: Record<string, string> = {
          price:
            'Strong: stop the price race, return to the value story (speed), and give Sales a talk track on total cost and time to value. Weak: another discount.',
          speed:
            "Working where it should. Strong: keep the mid-size focus, give Sales a separate story for large deals that is honest about the roadmap (security), and don't dilute the main message. Weak: switches to an enterprise message.",
          ai: 'Strong: answer the data-safety question fast (FAQ, security page, talk track), and reframe the feature around the speed benefit. Weak: more AI hype.',
          enterprise:
            'Strong: own that marketing ran ahead of the product, refocus on mid-size, and feed the security gap to the roadmap. Weak: pushes Sales to close anyway.',
        };
        const choice = ctx.choices.message ?? 'speed';
        return [
          { type: 'p', text: `They chose **${OPTIONS.find((o) => o.id === choice)?.label ?? choice}**.` },
          { type: 'p', text: guides[choice] ?? guides.speed },
        ];
      },
      rubric: [ADAPTS, NEXT_STEPS],
      followUps: () => ['What would you tell the CEO in one line?', 'What would you change for the next launch?'],
    },
    {
      id: 'launch-page',
      kind: 'critique',
      title: 'Review the launch page draft',
      summary: 'A launch page with unprovable claims, feature-first copy and the wrong audience. Think aloud.',
      timeLimitSec: 420,
      voiceMaxSec: 180,
      preferVoice: false,
      thinkAloud: true,
      scored: true,
      prompt: () => [
        {
          type: 'p',
          text: 'The agency sent this launch page draft. **Name the problems, worst first, and why each hurts.** Then rewrite the headline and first line.',
        },
      ],
      material: (ctx) => {
        const v = ctx.variant;
        return [
          { type: 'h', text: 'Launch page draft' },
          {
            type: 'list',
            items: [
              `**Headline:** "India's #1 ${s(v, 'product')}, now 10x smarter with ${s(v, 'newFeature')}."`,
              '**Subhead:** "Built for the world\'s largest enterprises."',
              '**Body:** "Powered by next-generation generative AI and a cutting-edge, cloud-native microservices architecture with 200+ features."',
              '**Button:** "Book a demo".',
              `**Footer:** a logo strip of 6 real customers (all have agreed).`,
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
              '**Unprovable claims:** "India\'s #1" and "10x smarter" have no source; they invite complaints and damage trust (and can fall foul of advertising standards).',
              '**Wrong audience:** "the world\'s largest enterprises" targets the segment where the product loses; the buyers who choose it are mid-size teams.',
              '**Features and jargon instead of benefit:** architecture and feature count say nothing about getting live in days.',
            ],
          },
          {
            type: 'p',
            text: `Decoy: the customer logo strip is fine (they agreed). A strong rewrite: "Live in ${n(v, 'setupDays')} days, not months" with ${s(v, 'newFeature')} as how teams save more time.`,
          },
        ];
      },
      rubric: [
        {
          id: 'critical',
          label: 'Catches the real problems',
          weight: 2,
          anchors: [
            'Misses the unprovable claims.',
            'Catches one problem.',
            'Catches the claims and the wrong audience.',
            'Catches all three and why each costs trust or sales.',
          ],
        },
        {
          id: 'rewrite',
          label: 'The rewrite',
          weight: 1,
          anchors: [
            'Missing or still generic.',
            'Better but vague.',
            'Clear benefit for the right buyer.',
            'Clear, specific, believable and differentiated.',
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
            'Ordered by risk to trust and conversion, explained.',
          ],
        },
      ],
      followUps: () => ['How would you push back on the agency?', 'What proof would you put on the page instead?'],
    },
    aiAllowedStage({
      id: 'launch-email',
      title: 'Launch email (AI allowed)',
      summary: 'Write the launch email to customers and prospects with AI. Catches buzzwords and unprovable claims.',
      timeLimitSec: 480,
      task: (ctx) => [
        {
          type: 'p',
          text: `Write the launch email for ${s(ctx.variant, 'newFeature')} (subject line plus under 150 words) to mid-size ${s(ctx.variant, 'buyer')}.`,
        },
      ],
      guide: (ctx) => [
        {
          type: 'p',
          text: `Should lead with the speed benefit (live in ${n(ctx.variant, 'setupDays')} days) and show how the feature saves time, for mid-size teams.`,
        },
        {
          type: 'p',
          text: 'AI drafts typically say "revolutionise", "game-changing", "seamless", claim "10x" or "#1", and focus on the technology. Did the candidate remove those and make it specific?',
        },
      ],
      accuracy: {
        id: 'accuracy',
        label: 'Specific and provable',
        weight: 1,
        anchors: [
          'Buzzwords or unprovable claims.',
          'Some specifics.',
          'Specific benefit, no unprovable claims.',
          'Specific, provable and aimed at the right buyer.',
        ],
      },
      usable: {
        id: 'usable',
        label: 'Ready to send',
        weight: 1,
        anchors: [
          'Long or generic.',
          'Usable with edits.',
          'Clear and short.',
          'Would get clicks from the right people.',
        ],
      },
    }),
    pastWorkStage({
      id: 'launch-story',
      title: 'A launch you ran',
      summary: 'A real launch or positioning change. Checks specificity and ownership.',
      question: 'Tell us about a launch or positioning change you led, and how you knew whether it worked.',
    }),
  ],
};
