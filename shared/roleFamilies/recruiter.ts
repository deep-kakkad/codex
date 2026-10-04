import type { Block, RoleFamily, StageContext } from '../types';
import { n, s } from '../variants';
import { ADAPTS, FICTIONAL_CALLOUT, NEXT_STEPS, aiAllowedStage, pastWorkStage, shuffled, warmupStage } from './common';

const ROLES = [
  {
    company: 'Ledgerly',
    role: 'Customer Success Manager',
    work: 'keep B2B customers renewing and growing',
    metric: 'renewal rate',
  },
  {
    company: 'Shopsense',
    role: 'Key Account Manager',
    work: 'grow revenue from the 40 largest retail accounts',
    metric: 'account revenue growth',
  },
  {
    company: 'Carelink',
    role: 'Operations Lead',
    work: 'run a 25-person patient support operation',
    metric: 'service levels',
  },
] as const;

const NAMES = [
  'Ananya Iyer',
  'Rohit Malhotra',
  'Sana Qureshi',
  'Vikram Rao',
  'Meera Pillai',
  'Arjun Bose',
  'Kavya Reddy',
  'Nikhil Joshi',
];
const PROFILES = ['brand', 'fit', 'hopper', 'overband', 'switcher', 'mba', 'mismatch', 'gap'] as const;

const OPTIONS = [
  { id: 'data', label: 'Push back with market data and propose different must-haves' },
  { id: 'premium', label: 'Do what the hiring manager asks and source only premium profiles' },
  { id: 'budget', label: 'Ask Finance to raise the budget to meet the market' },
  { id: 'test', label: 'Open the search wider and add a work-sample task to judge skill' },
];

const who = (v: StageContext['variant'], key: string) => s(v, `${key}Name`);

export const recruiter: RoleFamily = {
  id: 'recruiter',
  version: 1,
  name: 'Recruiter / Talent Acquisition',
  roles: ['Recruiter', 'Talent Acquisition Specialist', 'Talent Acquisition Partner', 'HR Recruiter'],
  catalog: {
    function: 'People & HR',
    seniority: ['Entry', 'Mid', 'Senior'],
    industries: ['Any', 'SaaS', 'Services'],
    skills: ['Judgement', 'Stakeholders', 'Writing'],
    keywords: ['TA', 'talent acquisition', 'recruitment', 'sourcing', 'hiring', 'HR recruiter', 'headhunter'],
  },
  summary:
    'A hiring manager wants a unicorn on a tight budget: shortlist from eight profiles with traps (big brands, a career break, an explained job-hopper), push back with market data, and fix an outreach message that gets the candidate’s name wrong.',

  warmups: [
    'What is the best job advert or recruiter message you have seen, and why?',
    'Tell us about a time you judged someone wrongly at first.',
    'What do you look for first in a CV, and why?',
  ],

  generate(rng, currency) {
    const inr = currency === 'INR';
    const r = rng.pick(ROLES);
    const names = shuffled(rng, NAMES);
    const order = shuffled(rng, PROFILES);
    const lakh = (x: number) => (inr ? `₹${x}L` : `$${Math.round(x * 1.2)}k`);
    const bandLow = rng.pick([14, 15]);
    const bandHigh = bandLow + 4;
    const market = bandHigh + rng.int(4, 7);
    const spec: Record<(typeof PROFILES)[number], string[]> = {
      brand: [
        'Senior Analyst, Sales Operations at Zentrix Global (a household-name tech company)',
        '6',
        'Internal reporting role; no customer-facing work',
        lakh(market + 8),
        '90 days',
      ],
      fit: [
        `${r.role} at a mid-size software company`,
        '4.5',
        `Improved ${r.metric} by ${rng.int(5, 8)} points across 35 accounts`,
        lakh(bandHigh - 1),
        '60 days',
      ],
      hopper: [
        `${r.role} at a growth-stage startup`,
        '5',
        'Four jobs in five years; two companies shut down. Clear results in each role',
        lakh(bandHigh - 2),
        '30 days',
      ],
      overband: [
        `Senior ${r.role} at a listed software company`,
        '7',
        'Exactly the experience asked for',
        lakh(market + 3),
        '90 days',
      ],
      switcher: [
        `${r.role} (2.5 years), before that a school teacher (4 years)`,
        '6.5',
        `Top of the team on ${r.metric} last year`,
        lakh(bandLow - 2),
        'Immediate',
      ],
      mba: [
        'Consultant at a strategy firm',
        '1',
        'MBA from a top business school; no hands-on experience in this work',
        lakh(bandHigh + 3),
        '60 days',
      ],
      mismatch: [
        'Account Executive (new business sales)',
        '5',
        '120% of quota; has never managed existing customers',
        lakh(bandHigh),
        '60 days',
      ],
      gap: [
        `${r.role} (5 years), then a one-year career break to care for a parent`,
        '6',
        `Led the ${r.metric} programme before the break; did a refresher course`,
        lakh(bandLow + 1),
        'Immediate',
      ],
    };
    const rows: Record<string, string> = {};
    order.forEach((key, i) => {
      rows[`slot${i}`] = key;
      rows[`${key}Name`] = names[i];
      spec[key].forEach((value, j) => {
        rows[`${key}F${j}`] = value;
      });
    });
    return {
      ...r,
      ...rows,
      band: `${lakh(bandLow)}–${lakh(bandHigh)}`,
      market: lakh(market),
      premiumPool: rng.int(25, 40),
      premiumAcceptPct: rng.int(5, 10),
      daysOpen: rng.int(45, 70),
      wideApplicants: rng.int(140, 220),
      testCompletePct: rng.int(35, 50),
      offerDeclines: rng.int(2, 3),
    };
  },

  brief(ctx) {
    const v = ctx.variant;
    return [
      {
        type: 'p',
        text: `You're the recruiter at **${s(v, 'company')}**, hiring a **${s(v, 'role')}** to ${s(v, 'work')}. The role has been open ${n(v, 'daysOpen')} days. Budget: **${s(v, 'band')}** a year.`,
      },
      {
        type: 'p',
        text: `The hiring manager's must-haves: "5+ years, from a top brand, MBA preferred, can join in 30 days." Market data for people with 5+ years in this role: median ${s(v, 'market')}; notice periods for employed people are usually 60–90 days.`,
      },
      {
        type: 'table',
        caption: 'Profiles in your pipeline',
        columns: ['Name', 'Current or last role', 'Years', 'Notable', 'Expects', 'Notice'],
        rows: Array.from({ length: 8 }, (_, i) => {
          const key = s(v, `slot${i}`);
          return [
            who(v, key),
            s(v, `${key}F0`),
            s(v, `${key}F1`),
            s(v, `${key}F2`),
            s(v, `${key}F3`),
            s(v, `${key}F4`),
          ];
        }),
      },
      { type: 'callout', text: FICTIONAL_CALLOUT },
    ];
  },

  stages: [
    warmupStage(),
    {
      id: 'shortlist',
      kind: 'scenario',
      title: 'Who goes on the shortlist?',
      summary:
        'Shortlist three of eight profiles, seeing past brand names and degrees, not penalising a career break or an explained job-hopper. Think aloud.',
      timeLimitSec: 360,
      voiceMaxSec: 150,
      preferVoice: true,
      thinkAloud: true,
      scored: true,
      prompt: () => [
        {
          type: 'p',
          text: '**Which three do you put in front of the hiring manager, and why?** Then name one you would not put forward, and why.',
        },
      ],
      reviewerGuide: (ctx) => {
        const v = ctx.variant;
        return [
          {
            type: 'p',
            text: `Strongest: **${who(v, 'fit')}** (direct experience, results, within budget), **${who(v, 'gap')}** (strong record; the career break is not a reason to reject) and **${who(v, 'hopper')}** (moves explained by shutdowns, with results). **${who(v, 'switcher')}** is also a strong case on results.`,
          },
          { type: 'p', text: 'Traps:' },
          {
            type: 'list',
            items: [
              `**${who(v, 'brand')}**: a famous company, but no customer-facing work and far above budget.`,
              `**${who(v, 'mba')}**: the degree the manager likes, but one year and no hands-on experience.`,
              `**${who(v, 'overband')}**: a great fit, but well above budget; worth a conversation about budget, not the shortlist as is.`,
              `**${who(v, 'mismatch')}**: strong in new-business sales, a different job.`,
            ],
          },
          {
            type: 'p',
            text: 'Weak answers pick by brand and degree, or drop the career break and the job-hopper without reading why.',
          },
        ];
      },
      rubric: [
        {
          id: 'evidence',
          label: 'Shortlists on evidence of skill',
          weight: 2,
          anchors: [
            'Picks by brand or degree.',
            'One or two sound picks.',
            'Three sound picks based on relevant results.',
            'Three sound picks, each with the specific evidence that matters for this job.',
          ],
        },
        {
          id: 'fairness',
          label: 'Fair to non-traditional profiles',
          weight: 1,
          anchors: [
            'Drops the career break or job-hopper without reading why.',
            'Hesitant.',
            'Judges them on the evidence.',
            'Judges them on evidence and says how to probe fairly in interview.',
          ],
        },
        {
          id: 'constraints',
          label: 'Keeps budget and notice in view',
          weight: 1,
          anchors: [
            'Ignores them.',
            'Mentions them.',
            'Uses budget and notice to decide.',
            'Uses them and flags the over-budget fit as a separate conversation.',
          ],
        },
      ],
      followUps: (ctx) => [
        `How would you present ${who(ctx.variant, 'gap')}'s career break to a sceptical hiring manager?`,
        `What would you ask ${who(ctx.variant, 'hopper')} about the job moves?`,
      ],
    },
    {
      id: 'manager',
      kind: 'decision',
      title: "The hiring manager's must-haves",
      summary: "Handle a hiring manager whose must-haves don't fit the budget or market. Think aloud.",
      timeLimitSec: 300,
      voiceMaxSec: 150,
      preferVoice: true,
      thinkAloud: true,
      scored: true,
      choices: OPTIONS,
      prompt: () => [
        {
          type: 'p',
          text: 'The hiring manager rejects your shortlist: "None are from top brands. Keep looking." **What do you do?** Pick one, and say how you would put it to them.',
        },
      ],
      reviewerGuide: (ctx) => {
        const v = ctx.variant;
        return [
          {
            type: 'p',
            text: `The must-haves cost about ${s(v, 'market')} against a budget of ${s(v, 'band')}, and "join in 30 days" rules out most employed people. Pushing back with market data, and agreeing must-haves based on the work (results in ${s(v, 'metric')}), is the strongest; adding a work-sample task supports it. Raising the budget can be right if the manager truly needs that profile, with the data. Sourcing only premium profiles wastes time: a small pool, few will accept the budget.`,
          },
        ];
      },
      rubric: [
        {
          id: 'influence',
          label: 'Influences with evidence',
          weight: 2,
          anchors: [
            'Complies without question, or argues without data.',
            'Raises concerns vaguely.',
            'Uses market data to reset expectations.',
            'Uses data and reframes the must-haves around the actual work.',
          ],
        },
        {
          id: 'partnership',
          label: 'Keeps the manager on side',
          weight: 1,
          anchors: [
            'Confrontational.',
            'Passive.',
            'Collaborative and clear.',
            'Turns it into a shared plan with a deadline.',
          ],
        },
      ],
      followUps: (_ctx, answer) => [
        `You chose "${answer.choiceLabel ?? 'your approach'}". What if the manager escalates to their boss?`,
        'What would you ask the manager to define what "great" looks like in this job?',
      ],
    },
    {
      id: 'three-weeks',
      kind: 'branch',
      title: 'Three weeks later',
      summary: 'What their approach led to. Tests adapting and owning the hiring outcome.',
      timeLimitSec: 300,
      voiceMaxSec: 120,
      preferVoice: true,
      scored: true,
      dependsOn: 'manager',
      prompt: (ctx) => {
        const v = ctx.variant;
        const byChoice: Record<string, Block[]> = {
          data: [
            {
              type: 'p',
              text: `The manager agreed to new must-haves. Two strong candidates reached the final round, but the manager now says one "isn't a culture fit" without explaining, and wants to reject her.`,
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
          premium: [
            {
              type: 'p',
              text: `You found ${n(v, 'premiumPool')} premium profiles; ${n(v, 'premiumAcceptPct')}% responded and all expected far above budget. ${n(v, 'offerDeclines')} offers were declined. The role is now open ${n(v, 'daysOpen') + 21} days, and the team is burning out.`,
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
          budget: [
            {
              type: 'p',
              text: 'Finance approved a higher band, but two people already in the team found out the new hire would earn more than them and are upset.',
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
          test: [
            {
              type: 'p',
              text: `The wider search brought ${n(v, 'wideApplicants')} applicants, but only ${n(v, 'testCompletePct')}% completed the work-sample task. Some strong candidates say it took them 5 hours and dropped out.`,
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
        };
        return byChoice[ctx.choices.manager ?? 'data'] ?? byChoice.data;
      },
      reviewerGuide: (ctx) => {
        const guides: Record<string, string> = {
          data: '"Culture fit" without reasons is a bias risk. Strong: ask for specific, job-related evidence against the agreed criteria; if there is none, push for a fair decision. Weak: accepts it.',
          premium:
            'Strong: own the outcome, bring the data back to the manager, and reset the criteria now. Weak: keeps sourcing the same pool.',
          budget:
            'Strong: raise internal pay equity with HR and the manager, consider adjusting existing salaries, and be careful about confidentiality. Weak: ignores it.',
          test: 'Strong: shorten the task (60–90 minutes), make it clearly scoped, and offer it later in the process. Weak: keeps the 5-hour task.',
        };
        const choice = ctx.choices.manager ?? 'data';
        return [
          { type: 'p', text: `They chose **${OPTIONS.find((o) => o.id === choice)?.label ?? choice}**.` },
          { type: 'p', text: guides[choice] ?? guides.data },
        ];
      },
      rubric: [ADAPTS, NEXT_STEPS],
      followUps: () => [
        'How would you keep the shortlisted candidates warm meanwhile?',
        'What will you do differently on the next hire with this manager?',
      ],
    },
    {
      id: 'outreach',
      kind: 'critique',
      title: 'Check an outreach message',
      summary: 'An outreach message with the wrong name, a generic pitch and an upfront salary question. Think aloud.',
      timeLimitSec: 360,
      voiceMaxSec: 150,
      preferVoice: false,
      thinkAloud: true,
      scored: true,
      prompt: () => [
        {
          type: 'p',
          text: 'A junior recruiter wants to send this. **Name the problems, worst first, and why each would lose the candidate.** Then write your version (under 100 words).',
        },
      ],
      material: (ctx) => {
        const v = ctx.variant;
        return [
          { type: 'h', text: `LinkedIn message to ${who(v, 'fit')}` },
          {
            type: 'quote',
            text: `Hi Dear ${who(v, 'switcher').split(' ')[0]},\n\nGreetings from ${s(v, 'company')}! We are a fast-growing, award-winning company with a great culture and amazing people. We have an urgent opening for ${s(v, 'role')}. Please send your updated CV along with current CTC, expected CTC and notice period at the earliest.\n\nBest salary in the industry!\n\nRegards`,
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
              `**Wrong name:** it's addressed to ${who(v, 'switcher').split(' ')[0]}, but sent to ${who(v, 'fit')}. An instant delete, and it looks like a copy-paste blast.`,
              '**Nothing about them or the work:** generic praise of the company, nothing about why they fit (their results) or what the job involves.',
              '**Asks for CV and current CTC up front:** a lot of effort before any interest; "best salary in the industry" is vague and the band is known.',
            ],
          },
          {
            type: 'p',
            text: 'Decoy: naming the role is correct. A strong rewrite uses their name and results, explains the work and the range, and asks for a 15-minute chat.',
          },
        ];
      },
      rubric: [
        {
          id: 'critical',
          label: 'Catches the real problems',
          weight: 2,
          anchors: [
            'Misses the wrong name.',
            'Catches one problem.',
            'Catches the name and the generic pitch.',
            'Catches all three and why each loses good people.',
          ],
        },
        {
          id: 'rewrite',
          label: 'The rewrite',
          weight: 1,
          anchors: [
            'Missing or still generic.',
            'Better but vague.',
            'Personal, about the work, a small ask.',
            'Would get a reply from a happy, employed person.',
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
            'Ordered by how fast it loses the candidate, explained.',
          ],
        },
      ],
      followUps: () => ['When is the right time to discuss salary?', 'How would you track whether your messages work?'],
    },
    aiAllowedStage({
      id: 'job-ad',
      title: 'The job advert (AI allowed)',
      summary: 'Write the job advert with AI. Catches biased wording and inflated requirements.',
      task: (ctx) => [
        {
          type: 'p',
          text: `Write the job advert for the ${s(ctx.variant, 'role')} (under 250 words), using the must-haves you agreed are really needed for the work.`,
        },
      ],
      guide: () => [
        {
          type: 'p',
          text: 'A strong advert describes the work and outcomes, lists a few real must-haves, states the pay range, and uses inclusive language.',
        },
        {
          type: 'p',
          text: 'AI drafts typically add long requirement lists, "rockstar/ninja", "young and dynamic", "top-tier college", or gendered wording. Did the candidate remove them?',
        },
      ],
      accuracy: {
        id: 'accuracy',
        label: 'Accurate and inclusive',
        weight: 1,
        anchors: [
          'Biased wording or inflated requirements.',
          'Some problems remain.',
          'About the work, inclusive, real must-haves.',
          'All of that plus the pay range and what success looks like.',
        ],
      },
      usable: {
        id: 'usable',
        label: 'Ready to post',
        weight: 1,
        anchors: [
          'Long or generic.',
          'Usable with edits.',
          'Clear and appealing.',
          "The right people would apply and the wrong ones wouldn't.",
        ],
      },
    }),
    pastWorkStage({
      id: 'hard-hire',
      title: 'A hard hire',
      summary: 'A real hard-to-fill role they closed. Checks specificity and ownership.',
      question: 'Tell us about a hard-to-fill role you worked on, and what you did.',
    }),
  ],
};
