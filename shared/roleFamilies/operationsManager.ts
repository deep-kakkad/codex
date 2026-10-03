import type { Block, RoleFamily, Variant } from '../types';
import { n, s } from '../variants';
import { ADAPTS, FICTIONAL_CALLOUT, NEXT_STEPS, aiAllowedStage, pastWorkStage, warmupStage } from './common';

const COMPANIES = [
  { company: 'Cartwheel', product: 'online home and kitchen store' },
  { company: 'Fitfuel', product: 'online health foods store' },
  { company: 'Toybox', product: 'online toy store' },
] as const;

const SITES = ['Bhiwandi', 'Hoskote', 'Kundli'] as const;

const OPTIONS = [
  { id: 'temps', label: 'Hire temporary pickers at all three sites' },
  { id: 'truck', label: 'Move the late site’s inbound truck to the morning, then add temps where still short' },
  { id: 'reroute', label: 'Cap orders at the late site and send the rest to the other two' },
  { id: 'overtime', label: 'Extend shifts with overtime at all sites' },
];

/** Orders each site can dispatch on time in a day, and what it is asked to do. */
export function siteMath(v: Variant) {
  return SITES.map((site, i) => {
    const pickers = n(v, `pickers${i}`);
    const rate = n(v, `rate${i}`);
    const hours = n(v, `hours${i}`);
    const capacity = Math.round(pickers * rate * hours * (1 - n(v, `absent${i}`) / 100));
    const orders = n(v, `orders${i}`);
    return { site, pickers, rate, hours, capacity, orders, onTime: n(v, `onTime${i}`) };
  });
}

export const operationsManager: RoleFamily = {
  id: 'operations-manager',
  version: 1,
  name: 'Operations Manager',
  roles: ['Operations Manager', 'Warehouse Operations Manager', 'Fulfilment Manager', 'Operations Lead'],
  catalog: {
    function: 'Operations',
    seniority: ['Mid', 'Manager'],
    industries: ['D2C & e-commerce', 'Logistics', 'Retail'],
    skills: ['Analysis', 'Numbers', 'Planning'],
    keywords: ['ops', 'warehouse', 'fulfilment', 'supply chain', 'SLA', 'capacity planning', 'logistics'],
  },
  summary:
    'One warehouse keeps missing dispatch deadlines and festival week is ten days away: find the real bottleneck (not headcount), plan for the spike, and fix a staffing plan built on wrong assumptions.',

  warmups: [
    'What is a queue or process in daily life you think is badly run, and why?',
    'Tell us about a time you made something run faster or smoother.',
    'How do you know a team is overloaded?',
  ],

  generate(rng) {
    const co = rng.pick(COMPANIES);
    const base: Record<string, number> = {};
    // Site 2 (the late one) has enough pickers but its truck arrives late, so its pick hours are short.
    const late = 2;
    for (let i = 0; i < 3; i++) {
      const pickers = rng.int(36, 46);
      const rate = rng.pick([9, 10, 11]);
      const hours = i === late ? rng.pick([4.5, 5]) : 7;
      const absent = rng.int(6, 10);
      const capacity = pickers * rate * hours * (1 - absent / 100);
      const orders =
        Math.round((capacity * (i === late ? rng.pick([1.25, 1.3]) : rng.pick([0.82, 0.86, 0.9]))) / 10) * 10;
      base[`pickers${i}`] = pickers;
      base[`rate${i}`] = rate;
      base[`hours${i}`] = hours;
      base[`absent${i}`] = absent;
      base[`orders${i}`] = orders;
      base[`onTime${i}`] = i === late ? rng.int(71, 78) : rng.int(95, 98);
      base[`overtime${i}`] = i === late ? rng.int(140, 190) : rng.int(10, 30);
      base[`truck${i}`] = i === late ? rng.pick([11, 12]) : 7;
    }
    return {
      ...co,
      ...base,
      lateSite: SITES[late],
      festivalDays: 10,
      spikePct: rng.pick([60, 70, 80]),
      tempCostPerDay: rng.pick([900, 1000, 1100]),
      tempRateShare: rng.pick([60, 65]),
      truckMoveDays: rng.int(3, 5),
      distanceDays: 1,
      overtimeErrorsPct: rng.int(2, 4),
    };
  },

  brief(ctx) {
    const v = ctx.variant;
    const rows = siteMath(v);
    return [
      {
        type: 'p',
        text: `You run fulfilment for **${s(v, 'company')}**, an ${s(v, 'product')}, across three warehouses. Orders must leave the warehouse by 6 pm on the day they're placed (before 2 pm). Each picker shift is 8 hours; most of the work happens after the inbound truck is unloaded.`,
      },
      {
        type: 'table',
        caption: 'Last month, per site (daily averages)',
        columns: [
          'Site',
          'Orders a day',
          'Pickers',
          'Orders picked per picker-hour',
          'Absent on a typical day',
          'Inbound truck arrives',
          'Overtime hours a week',
          'Dispatched on time',
        ],
        rows: rows.map((r, i) => [
          r.site,
          ctx.fmt.num(r.orders),
          String(r.pickers),
          String(r.rate),
          `${n(v, `absent${i}`)}%`,
          `${n(v, `truck${i}`)}:00`,
          String(n(v, `overtime${i}`)),
          `${r.onTime}%`,
        ]),
      },
      {
        type: 'p',
        text: `Your boss says: "${s(v, 'lateSite')} is always late. It probably needs more people." Festival week starts in **${n(v, 'festivalDays')} days**, when orders usually jump about **${n(v, 'spikePct')}%** for a week.`,
      },
      {
        type: 'p',
        text: `Temporary pickers cost ${ctx.fmt.money(n(v, 'tempCostPerDay'))} a day each and pick at about ${n(v, 'tempRateShare')}% of an experienced picker's speed.`,
      },
      { type: 'callout', text: FICTIONAL_CALLOUT },
    ];
  },

  stages: [
    warmupStage(),
    {
      id: 'bottleneck',
      kind: 'scenario',
      title: 'Why is one site always late?',
      summary:
        'Find the real bottleneck at the late site: a late inbound truck that shortens pick time, not too few people. Think aloud.',
      timeLimitSec: 360,
      voiceMaxSec: 150,
      preferVoice: true,
      thinkAloud: true,
      scored: true,
      prompt: (ctx) => [
        {
          type: 'p',
          text: `**Why does ${s(ctx.variant, 'lateSite')} miss its dispatch deadline?** Is your boss right that it needs more people? Use the numbers.`,
        },
      ],
      reviewerGuide: (ctx) => {
        const v = ctx.variant;
        const late = siteMath(v)[2];
        return [
          {
            type: 'p',
            text: `${late.site} has as many pickers as the others and they pick just as fast. Its truck arrives at ${n(v, 'truck2')}:00 instead of 7:00, so there are only about ${late.hours} hours of picking before the 6 pm cut-off. Capacity ≈ ${late.pickers} × ${late.rate} × ${late.hours} h × ${100 - n(v, 'absent2')}% ≈ ${ctx.fmt.num(late.capacity)} orders against ${ctx.fmt.num(late.orders)}. The heavy overtime (${n(v, 'overtime2')} hours a week) is the site working around the truck.`,
          },
          {
            type: 'p',
            text: 'Strong answers say more people is the expensive answer: fixing the truck time restores pick hours. Weak answers agree with the boss or blame the pickers.',
          },
        ];
      },
      rubric: [
        {
          id: 'diagnosis',
          label: 'Finds the real bottleneck',
          weight: 2,
          anchors: [
            'Agrees it needs more people, or blames the pickers.',
            'Notices the truck time without linking it.',
            'Links the late truck to lost pick hours.',
            'Links it and shows it with capacity maths.',
          ],
        },
        {
          id: 'maths',
          label: 'Capacity maths',
          weight: 1,
          anchors: [
            'None.',
            'Rough.',
            'Capacity against demand for the late site.',
            'For all three sites, with absence included.',
          ],
        },
        {
          id: 'pushback',
          label: 'Pushes back on the boss with evidence',
          weight: 1,
          anchors: [
            'Goes along.',
            'Hesitant.',
            'Disagrees with evidence.',
            'Disagrees with evidence and offers a cheaper fix.',
          ],
        },
      ],
      followUps: (ctx) => [
        `What would you check on the ground at ${s(ctx.variant, 'lateSite')} before changing anything?`,
        'Why might overtime be hiding the real problem?',
      ],
    },
    {
      id: 'festival',
      kind: 'decision',
      title: 'Festival week plan',
      summary: 'Choose a plan for a big order spike in ten days. Tests capacity planning and cost. Think aloud.',
      timeLimitSec: 360,
      voiceMaxSec: 150,
      preferVoice: true,
      thinkAloud: true,
      scored: true,
      choices: OPTIONS,
      prompt: (ctx) => [
        {
          type: 'p',
          text: `Orders will be about ${n(ctx.variant, 'spikePct')}% higher for festival week. **What is your plan?** Pick one, size it with numbers (people, cost, capacity), and say what could go wrong.`,
        },
      ],
      reviewerGuide: (ctx) => {
        const v = ctx.variant;
        const rows = siteMath(v);
        const spike = 1 + n(v, 'spikePct') / 100;
        return [
          {
            type: 'list',
            items: rows.map(
              (r) =>
                `${r.site}: demand ≈ ${ctx.fmt.num(r.orders * spike)} a day against capacity ≈ ${ctx.fmt.num(r.capacity)} (gap ≈ ${ctx.fmt.num(Math.max(0, r.orders * spike - r.capacity))}).`,
            ),
          },
          {
            type: 'p',
            text: `Moving the truck (takes ~${n(v, 'truckMoveDays')} days to arrange) restores ${s(v, 'lateSite')}'s pick hours, then temps fill the remaining gap; this is the strongest. Temps everywhere without fixing the truck still leave ${s(v, 'lateSite')} short of hours. Rerouting adds a day of delivery distance and overloads the other sites. Overtime alone burns people out and raises errors. Any choice can score with honest sizing and risks.`,
          },
        ];
      },
      rubric: [
        {
          id: 'plan',
          label: 'Plan fits the spike',
          weight: 2,
          anchors: [
            'No sizing; hopes for the best.',
            'Sized roughly or for one site.',
            "Sized for each site, with the late site's hours fixed or accounted for.",
            "Sized per site, with temps' slower rate and absence included.",
          ],
        },
        {
          id: 'cost',
          label: 'Cost and trade-offs',
          weight: 1,
          anchors: [
            'No cost.',
            'A rough cost.',
            'Cost worked out from the numbers.',
            'Cost compared with an alternative.',
          ],
        },
        {
          id: 'risk',
          label: 'Plans for what can go wrong',
          weight: 1,
          anchors: [
            'None.',
            'Generic.',
            'Specific risks.',
            'Specific risks with a fallback and an early warning sign.',
          ],
        },
      ],
      followUps: (_ctx, answer) => [
        `You chose "${answer.choiceLabel ?? 'your plan'}". What would you check on day one of festival week?`,
        'How would you train temporary pickers quickly?',
      ],
    },
    {
      id: 'day-two',
      kind: 'branch',
      title: 'Festival week, day two',
      summary: 'What their plan led to. Tests adapting under pressure.',
      timeLimitSec: 300,
      voiceMaxSec: 120,
      preferVoice: true,
      scored: true,
      dependsOn: 'festival',
      prompt: (ctx) => {
        const v = ctx.variant;
        const byChoice: Record<string, Block[]> = {
          temps: [
            {
              type: 'p',
              text: `The temps arrived, but ${s(v, 'lateSite')} still dispatched only 74% on time: the extra people stood around until the ${n(v, 'truck2')}:00 truck arrived, then got in each other's way.`,
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
          truck: [
            {
              type: 'p',
              text: `The truck now arrives at 7:00 and on-time dispatch at ${s(v, 'lateSite')} is up. But the transporter says the early slot costs 15% more, and Finance wasn't told.`,
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
          reroute: [
            {
              type: 'p',
              text: 'Rerouted orders arrive a day later than promised, and customer complaints about delivery dates have tripled. The other two sites are now at 88% on time.',
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
          overtime: [
            {
              type: 'p',
              text: `On day two, picking errors are up ${n(v, 'overtimeErrorsPct')}x and 9 pickers at ${s(v, 'lateSite')} called in sick. The site supervisor says the team is exhausted.`,
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
        };
        return byChoice[ctx.choices.festival ?? 'truck'] ?? byChoice.truck;
      },
      reviewerGuide: (ctx) => {
        const guides: Record<string, string> = {
          temps:
            'The plan added people without fixing hours. Strong: use the morning for prep (restocking, packing materials, training temps), stagger shifts later, and push the truck change now. Weak: adds more temps.',
          truck:
            'A good fix with a process gap. Strong: tell Finance now with the cost against the saved overtime and lost sales, and get the change approved properly. Weak: hides the cost.',
          reroute:
            "Strong: stop over-promising (show the real delivery date at checkout for affected pin codes), rebalance volumes, and fix the late site's hours. Weak: keeps rerouting.",
          overtime:
            'Strong: stop the overtime, protect people, bring in temps for the rest of the week, accept a short-term hit and tell customer support. Weak: pushes harder.',
        };
        const choice = ctx.choices.festival ?? 'truck';
        return [
          { type: 'p', text: `They chose **${OPTIONS.find((o) => o.id === choice)?.label ?? choice}**.` },
          { type: 'p', text: guides[choice] ?? guides.truck },
        ];
      },
      rubric: [ADAPTS, NEXT_STEPS],
      followUps: () => [
        'What would you tell your boss at the end of the day?',
        "What would you change before next year's festival?",
      ],
    },
    {
      id: 'staffing-plan',
      kind: 'critique',
      title: 'Check the staffing plan',
      summary:
        "A staffing plan that uses the best site's speed everywhere, ignores breaks and absence, and counts temps as experienced. Think aloud.",
      timeLimitSec: 420,
      voiceMaxSec: 180,
      preferVoice: false,
      thinkAloud: true,
      scored: true,
      prompt: () => [
        {
          type: 'p',
          text: 'A supervisor drafted the festival staffing plan below. **Find the wrong assumptions, worst first, and say how much each one throws the plan off.**',
        },
      ],
      material: (ctx) => {
        const v = ctx.variant;
        const best = Math.max(n(v, 'rate0'), n(v, 'rate1'), n(v, 'rate2'));
        return [
          { type: 'h', text: 'Festival staffing plan (draft)' },
          {
            type: 'list',
            items: [
              `Every picker, permanent or temporary, picks ${best + 2} orders an hour (our best week ever).`,
              'Each picker works 8 productive hours a day.',
              'Everyone on the roster turns up.',
              'Temps start on the first day of festival week; training happens on the job.',
              'Plan is reviewed every evening with each site supervisor.',
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
              `**Best-week speed for everyone, temps included.** Normal speed is ${n(v, 'rate0')}–${n(v, 'rate2')} an hour, and temps work at about ${n(v, 'tempRateShare')}% of that.`,
              `**8 productive hours** ignores breaks and the truck: about 7 at most sites and only ${n(v, 'hours2')} at ${s(v, 'lateSite')}.`,
              `**No absence:** ${n(v, 'absent0')}–${n(v, 'absent2')}% are absent on a normal day, more in festival week.`,
              "**Temps trained on the first day** of the busiest week lowers everyone's speed and raises errors.",
            ],
          },
          {
            type: 'p',
            text: 'Combined, the plan overstates capacity by roughly a third or more. Decoy: the daily evening review is good practice.',
          },
        ];
      },
      rubric: [
        {
          id: 'critical',
          label: 'Catches the wrong assumptions',
          weight: 2,
          anchors: [
            'Misses most of them.',
            'Catches one or two.',
            'Catches speed, hours and absence.',
            'Catches all four and how they compound.',
          ],
        },
        {
          id: 'size',
          label: 'Sizes the error',
          weight: 1,
          anchors: [
            'No sizing.',
            'Says "too optimistic".',
            'Estimates the effect of each.',
            'Estimates the combined effect on capacity.',
          ],
        },
        {
          id: 'severity',
          label: 'Orders by impact',
          weight: 1,
          anchors: ['Decoy first.', 'Unexplained.', 'Sensible order.', 'Ordered by size of error, explained.'],
        },
      ],
      followUps: () => [
        "How would you get realistic numbers for temps' speed?",
        "How would you tell the supervisor the plan doesn't work?",
      ],
    },
    aiAllowedStage({
      id: 'shift-brief',
      title: 'The shift brief (AI allowed)',
      summary:
        'Write the festival-week brief for site supervisors with AI. Catches generic advice and invented numbers.',
      timeLimitSec: 480,
      task: () => [
        {
          type: 'p',
          text: 'Write the one-page brief for the three site supervisors for festival week (under 200 words): the daily targets per site, the shift plan, what to escalate and when, and the one thing that matters most.',
        },
      ],
      guide: (ctx) => {
        const rows = siteMath(ctx.variant);
        return [
          {
            type: 'p',
            text: `Targets should come from the scenario (normal orders ${rows.map((r) => `${r.site} ${ctx.fmt.num(r.orders)}`).join(', ')}, up about ${n(ctx.variant, 'spikePct')}%), with the late site's truck time addressed.`,
          },
          {
            type: 'p',
            text: 'AI drafts typically give generic safety and motivation tips and invent targets. Did the candidate make it specific and usable on a warehouse floor?',
          },
        ];
      },
      accuracy: {
        id: 'accuracy',
        label: 'Grounded in the numbers',
        weight: 1,
        anchors: [
          'Invented or missing targets.',
          'Some real numbers.',
          'Targets per site from the data.',
          'Targets per site with clear escalation triggers.',
        ],
      },
      usable: {
        id: 'usable',
        label: 'Usable on the floor',
        weight: 1,
        anchors: [
          'Long or generic.',
          'Usable with edits.',
          'Short and clear.',
          'A supervisor could run the day from it.',
        ],
      },
    }),
    pastWorkStage({
      id: 'process-fix',
      title: 'A process you fixed',
      summary: 'A real operational problem they fixed. Checks specificity and ownership.',
      question: 'Tell us about an operational process you fixed, and how you knew it was broken.',
    }),
  ],
};
