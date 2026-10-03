import type { Block, RoleFamily } from '../types';
import { n, s } from '../variants';
import { ADAPTS, FICTIONAL_CALLOUT, NEXT_STEPS, aiAllowedStage, pastWorkStage, warmupStage } from './common';

const PROJECTS = [
  {
    vendor: 'Brightpath Solutions',
    client: 'Meridian Motors',
    system: 'a new dealer management system for 60 car dealerships',
    event: 'the annual dealer conference',
    data: 'customer and vehicle records',
  },
  {
    vendor: 'Kalpa Tech',
    client: 'Sunrise Hospitals',
    system: 'a new patient appointment and billing system for 9 hospitals',
    event: 'the opening of their new hospital',
    data: 'patient and billing records',
  },
  {
    vendor: 'Pinecrest Digital',
    client: 'Urban Basket',
    system: 'a new store inventory system for 120 grocery stores',
    event: 'the start of the festive season',
    data: 'product and stock records',
  },
] as const;

/** The earliest go-live if nothing changes: the export, then each step in sequence. */
export function projectGoLive(v: Record<string, string | number>) {
  return ['exportLateWeeks', 'migrationWeeks', 'testingWeeks', 'trainingWeeks'].reduce(
    (sum, key) => sum + Number(v[key]),
    0,
  );
}

const OPTIONS = [
  { id: 'scope', label: 'Keep the date; launch with fewer features and move the rest to a second phase' },
  { id: 'people', label: 'Keep the date and scope; add four more developers' },
  { id: 'delay', label: 'Move the go-live by three weeks' },
  { id: 'testing', label: 'Keep everything and shorten testing to one week' },
];

export const projectManager: RoleFamily = {
  id: 'project-manager',
  version: 1,
  name: 'Project Manager',
  roles: ['Project Manager', 'Delivery Manager', 'Program Manager', 'Implementation Manager'],
  catalog: {
    function: 'Operations',
    seniority: ['Mid', 'Senior', 'Manager'],
    industries: ['SaaS', 'Services', 'Any'],
    skills: ['Planning', 'Stakeholders', 'Communication'],
    keywords: [
      'PM',
      'project management',
      'delivery',
      'program manager',
      'PMP',
      'scrum master',
      'implementation',
      'critical path',
    ],
  },
  summary:
    'A client system launch three weeks behind, tied to a big event: find the critical path problem, choose how to recover, and fix a status report that says “green” while the project slips.',

  warmups: [
    'Tell us about a plan you made outside work that went off track. What happened?',
    'How do you tell someone more senior that a deadline will be missed?',
    'What makes a status update useful?',
  ],

  generate(rng) {
    const p = rng.pick(PROJECTS);
    // Always earlier than export + migration + testing + training can finish.
    const weeksToLaunch = rng.int(6, 8);
    const exportLateWeeks = rng.int(2, 3);
    return {
      ...p,
      weeksToLaunch,
      exportLateWeeks,
      buildDoneWeek: weeksToLaunch - 4,
      migrationWeeks: 3,
      testingWeeks: 3,
      trainingWeeks: 1,
      slipWeeks: exportLateWeeks + 1,
      team: rng.int(8, 10),
      onboardWeeks: rng.int(2, 3),
      phase2Features: rng.pick([
        'custom reports and the mobile app',
        'loyalty points and the mobile app',
        'analytics dashboards and SMS alerts',
      ]),
      defectsFound: rng.int(40, 60),
      criticalDefects: rng.int(5, 9),
      penaltyPct: rng.pick([5, 8, 10]),
    };
  },

  brief(ctx) {
    const v = ctx.variant;
    return [
      {
        type: 'p',
        text: `You're the project manager at **${s(v, 'vendor')}**, rolling out ${s(v, 'system')} at **${s(v, 'client')}**. Go-live is promised for ${s(v, 'event')}, **${n(v, 'weeksToLaunch')} weeks from today**. The contract has a ${n(v, 'penaltyPct')}% penalty for missing the go-live date without the client's agreement. Your team has ${n(v, 'team')} people.`,
      },
      {
        type: 'table',
        caption: 'Plan (weeks from today)',
        columns: ['Work', 'Depends on', 'Takes', 'Status'],
        rows: [
          ['Build and configure', '—', 'Done by week ' + n(v, 'buildDoneWeek'), 'On track'],
          [
            `Data export from the client's old system`,
            'Client IT team',
            '—',
            `Was due last week; client now says ${n(v, 'exportLateWeeks')} more weeks`,
          ],
          [`Migrate ${s(v, 'data')}`, 'Data export', `${n(v, 'migrationWeeks')} weeks`, 'Waiting'],
          ['Testing with client users', 'Migration', `${n(v, 'testingWeeks')} weeks`, 'Waiting'],
          ['Training staff', 'Testing', `${n(v, 'trainingWeeks')} week`, 'Not started'],
          ['Go-live', 'Training', '—', `Week ${n(v, 'weeksToLaunch')}`],
        ],
      },
      {
        type: 'p',
        text: `Last week's status report to the client was marked **green**. The client's project sponsor asks for a call tomorrow "to confirm we're on track".`,
      },
      { type: 'callout', text: FICTIONAL_CALLOUT },
    ];
  },

  stages: [
    warmupStage(),
    {
      id: 'status',
      kind: 'scenario',
      title: 'Are we on track?',
      summary:
        "Work out the real status from a dependency chain: the client's late data export pushes go-live out. Think aloud.",
      timeLimitSec: 300,
      voiceMaxSec: 120,
      preferVoice: true,
      thinkAloud: true,
      scored: true,
      prompt: () => [
        {
          type: 'p',
          text: '**What is the real status, and when can go-live actually happen if nothing changes?** Show how you worked it out. What colour should the report be?',
        },
      ],
      reviewerGuide: (ctx) => {
        const v = ctx.variant;
        const earliest = projectGoLive(v);
        return [
          {
            type: 'p',
            text: `The critical path is export → migration → testing → training. The export arrives in about ${n(v, 'exportLateWeeks')} weeks, so the earliest go-live is about week ${earliest} (${n(v, 'exportLateWeeks')} + ${n(v, 'migrationWeeks')} + ${n(v, 'testingWeeks')} + ${n(v, 'trainingWeeks')} weeks), against the promised week ${n(v, 'weeksToLaunch')}. The build being on track doesn't help: it isn't on the critical path.`,
          },
          {
            type: 'p',
            text: 'Strong answers call it red (or amber with a firm recovery plan) and note that the delay is caused by the client, which matters for the penalty. Weak answers keep it green because the build is on track.',
          },
        ];
      },
      rubric: [
        {
          id: 'path',
          label: 'Finds the critical path',
          weight: 2,
          anchors: [
            'Judges by the build alone.',
            'Sees the export is late.',
            'Works out the knock-on delay to go-live.',
            'Works it out and spots the build is off the critical path.',
          ],
        },
        {
          id: 'honest',
          label: 'Honest status',
          weight: 1,
          anchors: [
            'Keeps it green.',
            'Amber without a reason.',
            'Red or amber with the reason.',
            'Red with the reason and who caused the delay.',
          ],
        },
        {
          id: 'contract',
          label: 'Sees the commercial angle',
          weight: 1,
          anchors: [
            'Ignores the penalty.',
            'Mentions it.',
            "Notes the delay is the client's, which affects the penalty.",
            'Notes it and says how to document it.',
          ],
        },
      ],
      followUps: () => [
        "What would you say in the first minute of tomorrow's call?",
        "Why was last week's report green, do you think?",
      ],
    },
    {
      id: 'recovery',
      kind: 'decision',
      title: 'The recovery plan',
      summary: 'Choose a recovery option. Tests trade-offs between scope, time, people and quality. Think aloud.',
      timeLimitSec: 360,
      voiceMaxSec: 150,
      preferVoice: true,
      thinkAloud: true,
      scored: true,
      choices: OPTIONS,
      prompt: () => [
        {
          type: 'p',
          text: '**Which recovery option do you take to the sponsor?** Pick one, show how it changes the dates, and name the risk you are accepting.',
        },
      ],
      reviewerGuide: (ctx) => {
        const v = ctx.variant;
        return [
          {
            type: 'p',
            text: `Adding people doesn't help: the bottleneck is the client's export and the sequence after it, and new developers need ${n(v, 'onboardWeeks')} weeks to get up to speed. Shortening testing to a week risks launching with serious defects at ${s(v, 'event')}. Reducing scope (moving ${s(v, 'phase2Features')} to phase 2) can save some migration and testing time; moving the date is honest and safest, and the delay is the client's.`,
          },
          {
            type: 'p',
            text: 'Strong answers often combine: agree a reduced first phase or a short delay, and get the client to own the export date in writing. Any option can score with honest dates and named risks; adding people or cutting testing without addressing the export is weak.',
          },
        ];
      },
      rubric: [
        {
          id: 'tradeoff',
          label: 'Understands the trade-off',
          weight: 2,
          anchors: [
            "Picks an option that can't fix the problem, without noticing.",
            'Plausible, with thin reasoning.',
            'Option addresses the critical path, with dates.',
            'Addresses it, with dates, and protects quality.',
          ],
        },
        {
          id: 'risk',
          label: 'Names the risk accepted',
          weight: 1,
          anchors: ['None.', 'Generic.', 'Specific risk.', "Specific risk with how they'll watch for it."],
        },
        {
          id: 'sponsor',
          label: 'Ready for the sponsor',
          weight: 1,
          anchors: [
            'Unclear message.',
            'Clear but one-sided.',
            'Clear options and a recommendation.',
            'Clear, and asks the client for what they need (the export).',
          ],
        },
      ],
      followUps: (_ctx, answer) => [
        `You chose "${answer.choiceLabel ?? 'your option'}". What if the sponsor says the event date can't move?`,
        "What would you need from the client's IT team, by when?",
      ],
    },
    {
      id: 'two-weeks-later',
      kind: 'branch',
      title: 'Two weeks later',
      summary: 'What their recovery plan led to. Tests adapting and managing the client.',
      timeLimitSec: 300,
      voiceMaxSec: 120,
      preferVoice: true,
      scored: true,
      dependsOn: 'recovery',
      prompt: (ctx) => {
        const v = ctx.variant;
        const byChoice: Record<string, Block[]> = {
          scope: [
            {
              type: 'p',
              text: `The client agreed to phase 2 for ${s(v, 'phase2Features')}, but their regional heads are now telling staff the new system "won't have reports", and adoption plans are wobbling. The export arrived, one week late again.`,
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
          people: [
            {
              type: 'p',
              text: "The four new developers are still learning the system and have slowed the team down with questions. The export still hasn't arrived.",
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
          delay: [
            {
              type: 'p',
              text: `The sponsor agreed, but your own CEO is unhappy: "We'll look bad at ${s(v, 'event')}, and the penalty clause worries me." The export has arrived.`,
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
          testing: [
            {
              type: 'p',
              text: `In the one week of testing, client users found ${n(v, 'defectsFound')} defects, ${n(v, 'criticalDefects')} of them critical (including wrong totals on invoices). Go-live is in nine days.`,
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
        };
        return byChoice[ctx.choices.recovery ?? 'scope'] ?? byChoice.scope;
      },
      reviewerGuide: (ctx) => {
        const guides: Record<string, string> = {
          scope:
            'Strong: work with the sponsor on a clear message to regional heads (what phase 1 does, when phase 2 comes), and re-plan honestly around the new export date. Weak: lets the rumour spread.',
          people:
            "Strong: admit adding people didn't help, refocus them on non-critical work or release them, and escalate the export to the sponsor with a dated impact. Weak: adds more people.",
          delay:
            "Strong: explain to the CEO that the delay is caused by the client and documented (so the penalty shouldn't apply), and show the risk of launching broken at the event. Weak: reverses the decision.",
          testing:
            "Strong: don't launch with critical defects in billing; tell the sponsor today, propose a short delay or launching only the parts that pass. Weak: launches and hopes.",
        };
        const choice = ctx.choices.recovery ?? 'scope';
        return [
          { type: 'p', text: `They chose **${OPTIONS.find((o) => o.id === choice)?.label ?? choice}**.` },
          { type: 'p', text: guides[choice] ?? guides.scope },
        ];
      },
      rubric: [ADAPTS, NEXT_STEPS],
      followUps: () => [
        'Who needs to hear about this first, and how?',
        'What did this project teach you about dependencies on clients?',
      ],
    },
    {
      id: 'status-report',
      kind: 'critique',
      title: "Review last week's status report",
      summary: 'A "green" status report that hides a slipping dependency, with vague risks and no owners. Think aloud.',
      timeLimitSec: 360,
      voiceMaxSec: 150,
      preferVoice: false,
      thinkAloud: true,
      scored: true,
      prompt: () => [
        {
          type: 'p',
          text: 'This is the report your team sent last week. **Name the problems, worst first, and what each could cost the project.** Then rewrite the "Overall status" and "Risks" sections.',
        },
      ],
      material: (ctx) => {
        const v = ctx.variant;
        return [
          { type: 'h', text: `Weekly status: ${s(v, 'client')} rollout` },
          {
            type: 'list',
            items: [
              '**Overall status: GREEN.** Build is on schedule and the team is working hard.',
              '**This week:** configured 14 screens, fixed 23 bugs, held 3 workshops.',
              '**Risks:** some dependencies on the client; timelines may be impacted.',
              '**Next week:** continue build.',
              `**Go-live:** week ${n(v, 'weeksToLaunch')}, as planned.`,
            ],
          },
        ];
      },
      reviewerGuide: () => [
        { type: 'p', text: 'Planted problems:' },
        {
          type: 'list',
          items: [
            '**"Green" while the critical path has slipped.** The overdue export pushes go-live back; reporting green hides it and makes the later bad news worse (a "watermelon" report: green outside, red inside).',
            "**The risk is vague and unowned.** It should name the export, the new date, the impact on go-live, the owner on the client side and what's needed by when.",
            "**Activity, not progress.** Counts of screens and workshops don't show whether the project will land.",
          ],
        },
        {
          type: 'p',
          text: 'Decoy: weekly reporting itself is fine. A strong rewrite states red, the cause, the new date and the decision needed from the client.',
        },
      ],
      rubric: [
        {
          id: 'critical',
          label: 'Catches the real problems',
          weight: 2,
          anchors: [
            'Misses the false green.',
            'Catches one problem.',
            'Catches the false green and the vague risk.',
            'Catches all three and why they matter.',
          ],
        },
        {
          id: 'rewrite',
          label: 'The rewrite',
          weight: 1,
          anchors: [
            'Missing or still vague.',
            'Better but incomplete.',
            'Honest status, specific risk with owner and date.',
            'All that plus the decision needed from the client.',
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
            'Ordered by damage to trust and schedule, explained.',
          ],
        },
      ],
      followUps: () => [
        'How would you raise the false green with the person who wrote it?',
        'What should every status report include, in your view?',
      ],
    },
    aiAllowedStage({
      id: 'sponsor-email',
      title: 'Email to the sponsor (AI allowed)',
      summary: 'Write the honest re-plan email to the client sponsor with AI. Catches vague dates and blame.',
      task: () => [
        {
          type: 'p',
          text: "Write the email to the client sponsor before tomorrow's call (under 180 words): the real status, why, the options with dates, your recommendation and what you need from them.",
        },
      ],
      guide: (ctx) => [
        {
          type: 'p',
          text: `Must be honest about the slip, tie it to the export (${n(ctx.variant, 'exportLateWeeks')} weeks late), give dates, and ask for a firm export date with an owner. Good emails are factual about the cause without blaming people.`,
        },
        {
          type: 'p',
          text: 'AI drafts are typically vague ("some challenges", "slight delay"), overly apologetic, or blame the client sharply. Did the candidate fix the tone and add real dates?',
        },
      ],
      accuracy: {
        id: 'accuracy',
        label: 'Honest and specific',
        weight: 1,
        anchors: [
          'Vague or misleading.',
          'Honest but no dates.',
          'Honest with dates and options.',
          'Honest, dated, with a clear ask and owner.',
        ],
      },
      usable: {
        id: 'usable',
        label: 'Ready to send',
        weight: 1,
        anchors: [
          'Long or defensive.',
          'Usable with edits.',
          'Clear and calm.',
          'A sponsor could decide from it before the call.',
        ],
      },
    }),
    pastWorkStage({
      id: 'slipping-project',
      title: 'A project that slipped',
      summary: 'A real project that went off track. Checks specificity and ownership.',
      question: 'Tell us about a project you managed that slipped, and what you did.',
    }),
  ],
};
