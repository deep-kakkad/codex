import type { Block, RoleFamily } from '../types';
import { n, s } from '../variants';
import { ADAPTS, FICTIONAL_CALLOUT, NEXT_STEPS, aiAllowedStage, pastWorkStage, warmupStage } from './common';

const COMPANIES = [
  { company: 'Udaan Finance', thing: 'personal loan applications', item: 'application', approve: 'approve a loan' },
  { company: 'Kavach Insurance', thing: 'health insurance claims', item: 'claim', approve: 'settle a claim' },
  {
    company: 'Setu Supplies',
    thing: 'new supplier registrations',
    item: 'registration',
    approve: 'approve a supplier',
  },
] as const;

const OPTIONS = [
  { id: 'risk', label: 'Route by risk: automatic checks for small, clean cases; manual checks for the rest' },
  { id: 'hire', label: 'Keep every check manual and ask for more operations staff' },
  { id: 'sla', label: 'Keep every check and change the promise from 24 to 72 hours' },
  { id: 'phase', label: 'Launch for one city first and decide later' },
];

/** Daily demand against what the team can check by hand. */
export function baCapacity(v: Record<string, string | number>) {
  const daily = Number(v.daily);
  const capacity = Number(v.staff) * Number(v.perPerson);
  const smallShare = Number(v.smallPct) / 100;
  return {
    daily,
    capacity,
    shortfall: daily - capacity,
    manualIfRouted: Math.round(daily * (1 - smallShare * (Number(v.cleanPct) / 100))),
  };
}

export const businessAnalyst: RoleFamily = {
  id: 'business-analyst',
  version: 1,
  name: 'Business Analyst',
  roles: ['Business Analyst', 'Functional Analyst', 'Process Analyst', 'Business Systems Analyst'],
  catalog: {
    function: 'Data & tech',
    seniority: ['Mid', 'Senior'],
    industries: ['Fintech', 'Services', 'Any'],
    skills: ['Stakeholders', 'Analysis', 'Writing'],
    keywords: [
      'BA',
      'requirements',
      'user stories',
      'BRD',
      'process mapping',
      'functional analyst',
      'acceptance criteria',
    ],
  },
  summary:
    'Three senior stakeholders want things that can’t all be true: spot the conflict hiding in their numbers, propose a design they can agree on, and fix requirements that no one could test.',

  warmups: [
    'Tell us about a time two people asked you for opposite things.',
    'What makes a requirement good, in your view?',
    'Describe a process at a shop, bank or office that frustrated you, and how you would fix it.',
  ],

  generate(rng, currency) {
    const inr = currency === 'INR';
    const co = rng.pick(COMPANIES);
    const staff = rng.int(6, 8);
    const perPerson = rng.pick([15, 18, 20]);
    const daily = Math.round(staff * perPerson * rng.pick([1.5, 1.6, 1.7]));
    return {
      ...co,
      staff,
      perPerson,
      daily,
      growthPct: rng.pick([20, 25, 30]),
      smallPct: rng.int(60, 70),
      cleanPct: rng.int(80, 88),
      threshold: inr ? rng.pick([50000, 75000, 100000]) : rng.pick([1000, 1500, 2000]),
      kycThreshold: inr ? 200000 : 4000,
      fraudLossPct: rng.pick([0.4, 0.6]),
      competitorHours: rng.pick([4, 6]),
      hireWeeks: rng.int(8, 12),
      dropAt72: rng.int(25, 35),
      pilotCity: rng.pick(['Pune', 'Jaipur', 'Lucknow']),
    };
  },

  brief(ctx) {
    const v = ctx.variant;
    const { fmt } = ctx;
    return [
      {
        type: 'p',
        text: `You're the business analyst on a project at **${s(v, 'company')}** to rebuild how ${s(v, 'thing')} are handled. Today it's mostly email and spreadsheets. Three people must sign off the requirements.`,
      },
      { type: 'h', text: 'What each stakeholder told you' },
      {
        type: 'list',
        items: [
          `**Head of Sales:** "Every ${s(v, 'item')} must get a decision within 24 hours. Competitors do it in ${n(v, 'competitorHours')} hours. This is non-negotiable."`,
          `**Head of Risk:** "Every ${s(v, 'item')} needs three manual checks: identity, documents and a phone call. No exceptions. Last year fraud cost us ${n(v, 'fraudLossPct')}% of value."`,
          `**Head of Operations:** "My team of ${n(v, 'staff')} can do about ${n(v, 'perPerson')} full checks each a day. We're not getting more people this year."`,
        ],
      },
      {
        type: 'table',
        caption: 'From last month’s data',
        columns: ['Fact', 'Value'],
        rows: [
          [`New ${s(v, 'thing')} per working day`, fmt.num(n(v, 'daily'))],
          ['Expected growth next year', fmt.pct(n(v, 'growthPct'))],
          [`Share under ${fmt.money(n(v, 'threshold'))}`, fmt.pct(n(v, 'smallPct'))],
          ['Of those, share with no issues found in any check', fmt.pct(n(v, 'cleanPct'))],
          ['Compliance rule', `Full identity re-verification above ${fmt.money(n(v, 'kycThreshold'))}`],
        ],
      },
      { type: 'callout', text: FICTIONAL_CALLOUT },
    ];
  },

  stages: [
    warmupStage(),
    {
      id: 'conflict',
      kind: 'scenario',
      title: 'Where do the requirements clash?',
      summary:
        "Find the conflict hidden in three stakeholders' numbers (demand far above manual capacity) and the questions to ask. Think aloud.",
      timeLimitSec: 300,
      voiceMaxSec: 120,
      preferVoice: true,
      thinkAloud: true,
      scored: true,
      prompt: () => [
        {
          type: 'p',
          text: '**Can all three requirements be met? Show why or why not with the numbers.** Then list the three questions you would ask before writing any requirements.',
        },
      ],
      reviewerGuide: (ctx) => {
        const v = ctx.variant;
        const c = baCapacity(v);
        return [
          {
            type: 'p',
            text: `Capacity is ${n(v, 'staff')} × ${n(v, 'perPerson')} = **${c.capacity} checks a day** against **${c.daily}** new ${s(v, 'thing')}: short by ${c.shortfall} every day, before ${n(v, 'growthPct')}% growth. With every check manual, the 24-hour promise fails within days as the backlog grows. All three can't be true at once.`,
          },
          {
            type: 'p',
            text: `Good questions: does Risk need all three checks for small ${s(v, 'thing')} (${n(v, 'smallPct')}% are small and ${n(v, 'cleanPct')}% of those are clean)? Which checks can be automated? Is 24 hours for a decision or a first response? What fraud rate is acceptable? Weak answers write requirements for everything or side with one stakeholder.`,
          },
        ];
      },
      rubric: [
        {
          id: 'maths',
          label: 'Shows the conflict with numbers',
          weight: 2,
          anchors: [
            'No numbers; assumes it can all work.',
            'Senses a tension without numbers.',
            'Works out capacity against demand.',
            'Works it out, including growth and how fast a backlog builds.',
          ],
        },
        {
          id: 'questions',
          label: 'Asks the right questions',
          weight: 1,
          anchors: [
            'None or generic.',
            'Some useful questions.',
            'Questions that could resolve the conflict.',
            "Sharp questions aimed at each stakeholder's real need.",
          ],
        },
        {
          id: 'neutral',
          label: 'Stays neutral',
          weight: 1,
          anchors: [
            'Takes one side.',
            'Leans one way.',
            'Treats each need as legitimate.',
            'Restates each need in terms of the outcome it protects.',
          ],
        },
      ],
      followUps: () => [
        'What would you say to the Head of Sales if they said "just make it work"?',
        'Which number would you double-check first, and with whom?',
      ],
    },
    {
      id: 'proposal',
      kind: 'decision',
      title: 'Your proposal',
      summary: 'Propose a design all three can sign. Tests trade-offs and quantifying them. Think aloud.',
      timeLimitSec: 360,
      voiceMaxSec: 150,
      preferVoice: true,
      thinkAloud: true,
      scored: true,
      choices: OPTIONS,
      prompt: () => [
        {
          type: 'p',
          text: '**What do you propose?** Pick one, show with numbers whether it fits the capacity, and say what each stakeholder gives up.',
        },
      ],
      reviewerGuide: (ctx) => {
        const v = ctx.variant;
        const c = baCapacity(v);
        return [
          {
            type: 'p',
            text: `Routing by risk is the strongest: if small, clean ${s(v, 'thing')} pass automated checks, about ${c.manualIfRouted} a day still need manual checks against ${c.capacity} capacity (a guide, depending on assumptions). It needs Risk to accept automated checks for small values, with sampling and the compliance rule above ${ctx.fmt.money(n(v, 'kycThreshold'))} kept.`,
          },
          {
            type: 'p',
            text: `More staff contradicts Operations and takes ${n(v, 'hireWeeks')}+ weeks. 72 hours fails Sales (and data suggests about ${n(v, 'dropAt72')}% of applicants drop out by then). A pilot city delays the conflict rather than solving it, though it can be a sensible way to test routing. Any choice can score with honest numbers and trade-offs.`,
          },
        ];
      },
      rubric: [
        {
          id: 'design',
          label: 'A workable design',
          weight: 2,
          anchors: [
            'Ignores the capacity gap.',
            'Partly addresses it.',
            'Closes the gap with a clear mechanism.',
            'Closes it with a mechanism and a safeguard (sampling, thresholds, monitoring).',
          ],
        },
        {
          id: 'numbers',
          label: 'Backs it with numbers',
          weight: 1,
          anchors: [
            'No numbers.',
            'Rough.',
            'Shows the design fits capacity.',
            'Shows it fits, with growth and assumptions stated.',
          ],
        },
        {
          id: 'tradeoffs',
          label: 'Names what each side gives up',
          weight: 1,
          anchors: [
            'Pretends nobody loses.',
            'Vague.',
            'Clear for each stakeholder.',
            'Clear, and framed so each can agree.',
          ],
        },
      ],
      followUps: (_ctx, answer) => [
        `You chose "${answer.choiceLabel ?? 'your proposal'}". How would you present it to the Head of Risk?`,
        'What would make you change the proposal after launch?',
      ],
    },
    {
      id: 'sign-off',
      kind: 'branch',
      title: 'The sign-off meeting',
      summary: 'A stakeholder pushes back on their proposal. Tests facilitation and adapting.',
      timeLimitSec: 300,
      voiceMaxSec: 120,
      preferVoice: true,
      scored: true,
      dependsOn: 'proposal',
      prompt: (ctx) => {
        const v = ctx.variant;
        const byChoice: Record<string, Block[]> = {
          risk: [
            {
              type: 'p',
              text: `The Head of Risk says: "Automatic checks are how fraudsters get in. I won't sign unless every ${s(v, 'item')} gets a phone call." The Head of Sales says: "Then we're back to square one."`,
            },
            { type: 'p', text: '**What do you do in the meeting?**' },
          ],
          hire: [
            {
              type: 'p',
              text: `Finance rejects the hiring request. The Head of Operations says the backlog is already ${baCapacity(v).shortfall * 5} ${s(v, 'thing')} after one week of the new process.`,
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
          sla: [
            {
              type: 'p',
              text: 'The Head of Sales refuses to sign: "72 hours means we lose customers to competitors." The CEO asks you for a recommendation by Friday.',
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
          phase: [
            {
              type: 'p',
              text: `The ${s(v, 'pilotCity')} launch works, but the other cities are still on email and spreadsheets, and their backlog doubled because the best operations staff moved to the pilot.`,
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
        };
        return byChoice[ctx.choices.proposal ?? 'risk'] ?? byChoice.risk;
      },
      reviewerGuide: (ctx) => {
        const guides: Record<string, string> = {
          risk: 'Strong: find the real concern (fraud losses), offer evidence-based safeguards (calls for a random sample and for any red flag, a fraud-rate threshold that switches automation off, a pilot with measurement), and make the decision about an acceptable loss rate explicit. Weak: gives in or argues.',
          hire: 'Strong: take the "no" as a constraint, return to reducing manual work (risk routing, automating one check), and show the backlog trend to force a decision. Weak: escalates the hiring ask.',
          sla: 'Strong: bring options with numbers (24 hours for small, clean cases; longer for complex), and a recommendation. Weak: picks a side.',
          phase:
            'Strong: rebalance staff, set exit criteria for the pilot and a rollout plan, and communicate honestly with the other cities. Weak: keeps piloting.',
        };
        const choice = ctx.choices.proposal ?? 'risk';
        return [
          { type: 'p', text: `They chose **${OPTIONS.find((o) => o.id === choice)?.label ?? choice}**.` },
          { type: 'p', text: guides[choice] ?? guides.risk },
        ];
      },
      rubric: [
        ADAPTS,
        {
          id: 'facilitation',
          label: 'Moves people to a decision',
          weight: 1,
          anchors: [
            'Lets it stall.',
            'Summarises without moving forward.',
            'Proposes a concrete way forward.',
            'Gets agreement on the decision and who owns it.',
          ],
        },
        NEXT_STEPS,
      ],
      followUps: () => [
        'Who decides if the stakeholders still disagree?',
        'What would you write in the meeting notes?',
      ],
    },
    {
      id: 'review-stories',
      kind: 'critique',
      title: 'Review the draft requirements',
      summary: 'Requirements that are vague, untestable and contradict each other. Think aloud.',
      timeLimitSec: 420,
      voiceMaxSec: 180,
      preferVoice: false,
      thinkAloud: true,
      scored: true,
      prompt: () => [
        {
          type: 'p',
          text: 'A junior BA drafted these. **Name the most serious problems, worst first, and why each would cause trouble later.** Then rewrite one requirement properly.',
        },
      ],
      material: (ctx) => {
        const v = ctx.variant;
        return [
          { type: 'h', text: 'Draft requirements' },
          {
            type: 'list',
            ordered: true,
            items: [
              `The system should be fast and user-friendly.`,
              `Every ${s(v, 'item')} must be checked manually by the operations team.`,
              `${s(v, 'item').charAt(0).toUpperCase() + s(v, 'item').slice(1)}s under ${ctx.fmt.money(n(v, 'threshold'))} with no issues are approved automatically.`,
              `As a reviewer, I want to see the ${s(v, 'item')}'s documents so that I can check them. Acceptance: documents are shown.`,
              `The system will send an SMS when a decision is made.`,
            ],
          },
        ];
      },
      reviewerGuide: () => [
        { type: 'p', text: 'Planted problems:' },
        {
          type: 'list',
          items: [
            '**2 and 3 contradict each other:** everything manual, and small clean cases automatic. Developers will pick one, and someone will be unhappy at testing.',
            '**1 is untestable:** "fast" and "user-friendly" need numbers (e.g. "a decision shown within 2 seconds of submission").',
            "**4's acceptance criterion is empty:** which documents, what happens if one is missing or unreadable, what the reviewer can do next.",
            '**Missing:** what happens when something is rejected (reasons, appeals), and the compliance rule above the threshold.',
          ],
        },
        {
          type: 'p',
          text: 'Decoy: requirement 5 is fine as a simple requirement (it could say which decisions, but it is testable).',
        },
      ],
      rubric: [
        {
          id: 'critical',
          label: 'Catches the serious problems',
          weight: 2,
          anchors: [
            'Misses the contradiction.',
            'Catches one problem.',
            'Catches the contradiction and an untestable requirement.',
            'Catches the contradiction, untestable wording and missing cases.',
          ],
        },
        {
          id: 'rewrite',
          label: 'The rewrite',
          weight: 1,
          anchors: [
            'Missing or still vague.',
            'Clearer but not testable.',
            'Testable, with clear acceptance criteria.',
            'Testable, with edge cases and the error path.',
          ],
        },
        {
          id: 'severity',
          label: 'Orders by impact',
          weight: 1,
          anchors: ['Decoy first.', 'Unexplained.', 'Sensible order.', 'Ordered by cost to fix later, explained.'],
        },
      ],
      followUps: () => [
        'How would you get the stakeholders to resolve requirement 2 versus 3?',
        'How do you know a requirement is testable?',
      ],
    },
    aiAllowedStage({
      id: 'stories',
      title: 'User stories (AI allowed)',
      summary:
        'Write user stories with acceptance criteria using AI. Catches untestable criteria and invented requirements.',
      task: (ctx) => [
        {
          type: 'p',
          text: `Write three user stories, with testable acceptance criteria, for the automatic route: a ${s(ctx.variant, 'item')} under ${ctx.fmt.money(n(ctx.variant, 'threshold'))} with no issues gets a decision without manual checks, and a random sample still goes to a person.`,
        },
      ],
      guide: (ctx) => [
        {
          type: 'p',
          text: `Look for the threshold (${ctx.fmt.money(n(ctx.variant, 'threshold'))}), what "no issues" means, the random sample, what happens when a check fails, and the compliance rule above ${ctx.fmt.money(n(ctx.variant, 'kycThreshold'))}.`,
        },
        {
          type: 'p',
          text: 'AI drafts typically produce generic stories ("as a user I want a seamless experience"), untestable criteria, and invent requirements nobody asked for. Did the candidate tighten them?',
        },
      ],
      accuracy: {
        id: 'accuracy',
        label: 'Testable and grounded',
        weight: 1,
        anchors: [
          'Vague or invented.',
          'Some testable criteria.',
          'All criteria testable and tied to the scenario.',
          'Testable, with edge cases and failure paths.',
        ],
      },
      usable: {
        id: 'usable',
        label: 'Ready for developers',
        weight: 1,
        anchors: [
          'Unclear.',
          'Usable with questions.',
          'Clear enough to estimate.',
          'A developer and tester could start today.',
        ],
      },
    }),
    pastWorkStage({
      id: 'stakeholder-clash',
      title: 'Stakeholders who disagreed',
      summary: 'A real time they brought conflicting stakeholders to a decision. Checks specificity and ownership.',
      question: 'Tell us about a project where stakeholders wanted conflicting things, and what you did.',
    }),
  ],
};
