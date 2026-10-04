import type { Block, RoleFamily, Variant } from '../types';
import { n, s } from '../variants';
import { ADAPTS, FICTIONAL_CALLOUT, NEXT_STEPS, aiAllowedStage, pastWorkStage, warmupStage } from './common';

const COMPANIES = [
  { company: 'Finbridge', business: 'a lending platform', hotTeam: 'Customer Success' },
  { company: 'Shopsense', business: 'a retail software company', hotTeam: 'Implementation' },
  { company: 'Carelink', business: 'a healthcare services company', hotTeam: 'Patient Support' },
] as const;

const TEAMS = ['Engineering', 'Sales', 'Finance', 'Operations'] as const;

const OPTIONS = [
  { id: 'raise', label: 'Give everyone a 10% raise, as the business head wants' },
  { id: 'targeted', label: 'Targeted retention for key people plus support and coaching for the manager' },
  { id: 'interviews', label: 'Run stay interviews in the team before deciding anything' },
  { id: 'replace', label: 'Move the manager out of the role now' },
];

/** Annual attrition by team, from headcount and leavers. */
export function attritionMath(v: Variant) {
  const teams = [s(v, 'hotTeam'), ...TEAMS].map((team, i) => {
    const headcount = n(v, `hc${i}`);
    const leavers = n(v, `left${i}`);
    return { team, headcount, leavers, rate: Math.round((leavers / headcount) * 1000) / 10 };
  });
  const hc = teams.reduce((a, t) => a + t.headcount, 0);
  const left = teams.reduce((a, t) => a + t.leavers, 0);
  return { teams, overall: Math.round((left / hc) * 1000) / 10 };
}

export const hrbp: RoleFamily = {
  id: 'hr-business-partner',
  version: 1,
  name: 'HR Business Partner',
  roles: ['HR Business Partner', 'HR Manager', 'People Partner', 'HR Generalist'],
  catalog: {
    function: 'People & HR',
    seniority: ['Mid', 'Senior', 'Manager'],
    industries: ['Any', 'Services', 'Fintech'],
    skills: ['Analysis', 'Stakeholders', 'Judgement', 'Communication'],
    keywords: ['HRBP', 'HR', 'people partner', 'attrition', 'retention', 'employee relations', 'HR generalist'],
  },
  summary:
    'Attrition is up and the business head wants a 10% raise for everyone: find the one team and manager behind it, choose a fix, and catch the confidentiality breach in a new policy.',

  warmups: [
    'What makes you want to stay at a job, beyond pay?',
    'Tell us about a manager who brought out the best in you.',
    "How would you tell a senior leader something they don't want to hear?",
  ],

  generate(rng, currency) {
    const inr = currency === 'INR';
    const co = rng.pick(COMPANIES);
    const out: Record<string, number> = {};
    // The hot team: high attrition under a manager promoted last year.
    out.hc0 = rng.int(44, 58);
    out.left0 = Math.round(out.hc0 * rng.pick([0.38, 0.41, 0.44]));
    TEAMS.forEach((_, i) => {
      const hc = rng.int(50, 120);
      out[`hc${i + 1}`] = hc;
      out[`left${i + 1}`] = Math.round(hc * rng.pick([0.1, 0.12, 0.14]));
    });
    const payroll = inr ? rng.int(55, 80) * 10_000_000 : rng.int(7, 10) * 1_000_000;
    return {
      ...co,
      ...out,
      payroll,
      raiseCost: Math.round(payroll * 0.1),
      payGapPct: rng.int(3, 5),
      highPerfLeftPct: rng.int(55, 70),
      managerMonths: rng.int(10, 14),
      exitManagerPct: rng.int(60, 72),
      exitPayPct: rng.int(18, 26),
      exitWorkloadPct: rng.int(45, 58),
      engagementDrop: rng.int(18, 26),
      ticketsPerPerson: rng.int(35, 45),
      ticketsBefore: rng.int(22, 28),
    };
  },

  brief(ctx) {
    const v = ctx.variant;
    const a = attritionMath(v);
    return [
      {
        type: 'p',
        text: `You're the HR business partner for the delivery side of **${s(v, 'company')}**, ${s(v, 'business')}. The business head says: "Attrition is killing us. Let's give everyone a 10% raise." That would cost ${ctx.fmt.money(n(v, 'raiseCost'))} a year.`,
      },
      {
        type: 'table',
        caption: 'Last 12 months',
        columns: ['Team', 'Headcount', 'Leavers', 'Attrition'],
        rows: [
          ...a.teams.map((t) => [t.team, String(t.headcount), String(t.leavers), `${t.rate}%`]),
          [
            'All teams',
            String(a.teams.reduce((x, t) => x + t.headcount, 0)),
            String(a.teams.reduce((x, t) => x + t.leavers, 0)),
            `${a.overall}%`,
          ],
        ],
      },
      { type: 'h', text: 'What else you know' },
      {
        type: 'list',
        items: [
          `In ${s(v, 'hotTeam')}, a new manager was promoted from within ${n(v, 'managerMonths')} months ago. ${n(v, 'highPerfLeftPct')}% of that team's leavers were rated high performers.`,
          `Exit interviews in ${s(v, 'hotTeam')}: ${n(v, 'exitManagerPct')}% mention "my manager", ${n(v, 'exitWorkloadPct')}% workload, ${n(v, 'exitPayPct')}% pay.`,
          `${s(v, 'hotTeam')} now handles about ${n(v, 'ticketsPerPerson')} cases per person a week, up from ${n(v, 'ticketsBefore')}, because leavers weren't replaced.`,
          `Market data: your pay is ${n(v, 'payGapPct')}% below the median for these roles, the same for every team.`,
          `The latest engagement survey shows ${s(v, 'hotTeam')} down ${n(v, 'engagementDrop')} points; other teams are flat.`,
        ],
      },
      { type: 'callout', text: FICTIONAL_CALLOUT },
    ];
  },

  stages: [
    warmupStage(),
    {
      id: 'diagnose',
      kind: 'scenario',
      title: 'What is really driving attrition?',
      summary:
        'Find that attrition is concentrated in one team under a new manager, with workload spiralling, not a company-wide pay problem. Think aloud.',
      timeLimitSec: 360,
      voiceMaxSec: 150,
      preferVoice: true,
      thinkAloud: true,
      scored: true,
      prompt: () => [
        {
          type: 'p',
          text: "**What is really driving attrition here, and is the business head's fix the right one?** Use the data.",
        },
      ],
      reviewerGuide: (ctx) => {
        const v = ctx.variant;
        const a = attritionMath(v);
        return [
          {
            type: 'p',
            text: `${s(v, 'hotTeam')} runs at ${a.teams[0].rate}% attrition against about 10–14% elsewhere; the ${a.overall}% overall average hides it. Pay is ${n(v, 'payGapPct')}% below market for every team, so it can't explain one team's spike, and only ${n(v, 'exitPayPct')}% of exits mention pay against ${n(v, 'exitManagerPct')}% citing the manager.`,
          },
          {
            type: 'p',
            text: `It's a spiral: a new, possibly unsupported manager; high performers leave; work isn't backfilled (cases per person up from ${n(v, 'ticketsBefore')} to ${n(v, 'ticketsPerPerson')}); more people leave. A company-wide 10% raise (${ctx.fmt.money(n(v, 'raiseCost'))}) spends most of the money where there's no problem. Weak answers accept the raise or blame pay.`,
          },
        ];
      },
      rubric: [
        {
          id: 'diagnosis',
          label: 'Finds the real driver',
          weight: 2,
          anchors: [
            'Accepts that pay is the cause.',
            'Notices one team is worse.',
            'Links the team, the manager and the workload.',
            'Links them as a spiral and sizes it with the data.',
          ],
        },
        {
          id: 'evidence',
          label: 'Uses the evidence',
          weight: 1,
          anchors: [
            'Opinion only.',
            'Some data.',
            'Attrition by team, exit themes and workload.',
            "All of that, including why pay can't explain one team.",
          ],
        },
        {
          id: 'business',
          label: "Talks to the business head's concern",
          weight: 1,
          anchors: [
            'Dismisses it.',
            'Ignores the cost.',
            'Explains why the raise is poorly targeted.',
            'Explains it and offers a better use of the money.',
          ],
        },
      ],
      followUps: () => [
        'How would you check the manager is really the issue, fairly?',
        'What would you tell the business head in two sentences?',
      ],
    },
    {
      id: 'fix',
      kind: 'decision',
      title: 'What do you recommend?',
      summary: 'Recommend a fix to the business head. Tests judgement, fairness and cost. Think aloud.',
      timeLimitSec: 360,
      voiceMaxSec: 150,
      preferVoice: true,
      thinkAloud: true,
      scored: true,
      choices: OPTIONS,
      prompt: () => [
        {
          type: 'p',
          text: '**What do you recommend?** Pick one, say roughly what it costs, and how you would handle the manager fairly.',
        },
      ],
      reviewerGuide: () => [
        {
          type: 'p',
          text: 'Targeted retention plus support for the manager is the strongest: retain the people most at risk, backfill to fix the workload, give the manager coaching with clear expectations and a review date. Stay interviews are useful but slow if used alone while people keep leaving. Moving the manager out immediately may be unfair without support or a fair process. The company-wide raise is expensive and misses the cause.',
        },
      ],
      rubric: [
        {
          id: 'judgement',
          label: 'Sound, targeted fix',
          weight: 2,
          anchors: [
            'A fix that misses the cause.',
            'Partly targeted.',
            'Targets the team, the workload and the manager.',
            'Targets all three with a timeline and a measure of success.',
          ],
        },
        {
          id: 'fairness',
          label: 'Fair to the manager',
          weight: 1,
          anchors: [
            'Scapegoats or ignores the manager.',
            'Vague.',
            'Support with clear expectations.',
            "Support, expectations, a review date and a fair process if it doesn't improve.",
          ],
        },
        {
          id: 'cost',
          label: 'Cost-aware',
          weight: 1,
          anchors: [
            'No cost.',
            'Rough.',
            'A sensible cost compared to the raise.',
            'Cost against the cost of attrition (hiring, lost output).',
          ],
        },
      ],
      followUps: (_ctx, answer) => [
        `You chose "${answer.choiceLabel ?? 'your recommendation'}". How would the manager hear about it?`,
        'How will you know in three months if it is working?',
      ],
    },
    {
      id: 'reaction',
      kind: 'branch',
      title: 'Six weeks later',
      summary: 'Consequences of their recommendation. Tests adapting and handling people.',
      timeLimitSec: 300,
      voiceMaxSec: 120,
      preferVoice: true,
      scored: true,
      dependsOn: 'fix',
      prompt: (ctx) => {
        const v = ctx.variant;
        const byChoice: Record<string, Block[]> = {
          raise: [
            {
              type: 'p',
              text: `The raise went out. Three more people left ${s(v, 'hotTeam')} this month, two of them high performers, and their exit interviews again mention the manager. Finance asks what the ${ctx.fmt.money(n(v, 'raiseCost'))} achieved.`,
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
          targeted: [
            {
              type: 'p',
              text: `The manager feels singled out and tells the business head that HR is "building a case" against them. Meanwhile one retained high performer says she was promised a promotion that hasn't happened.`,
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
          interviews: [
            {
              type: 'p',
              text: 'The stay interviews confirm workload and the manager. But two more people resigned during the four weeks they took, and the business head asks why HR "only talked".',
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
          replace: [
            {
              type: 'p',
              text: 'The manager was moved. They have raised a formal grievance saying no feedback was ever given. The team now has no manager, and the business head wants HR to "find someone fast".',
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
        };
        return byChoice[ctx.choices.fix ?? 'targeted'] ?? byChoice.targeted;
      },
      reviewerGuide: (ctx) => {
        const guides: Record<string, string> = {
          raise:
            "Owning it: show the data that pay wasn't the driver, and move quickly to the team-level fix. Weak: suggests a bigger raise.",
          targeted:
            "Strong: meet the manager openly (support, not a case; share what you're seeing and the plan), check what was promised to the high performer and fix it or be honest. Weak: avoids the manager or overpromises.",
          interviews:
            'Strong: own the delay, act on what the interviews found immediately (backfills, workload, manager support). Weak: plans more interviews.',
          replace:
            'Strong: handle the grievance by the process (it may have merit), appoint an interim lead, and fix the workload. Learn the lesson about giving feedback first. Weak: dismisses the grievance.',
        };
        const choice = ctx.choices.fix ?? 'targeted';
        return [
          { type: 'p', text: `They chose **${OPTIONS.find((o) => o.id === choice)?.label ?? choice}**.` },
          { type: 'p', text: guides[choice] ?? guides.targeted },
        ];
      },
      rubric: [ADAPTS, NEXT_STEPS],
      followUps: () => ['What would you do differently from the start?', 'Who else needs to be involved now?'],
    },
    {
      id: 'policy',
      kind: 'critique',
      title: 'Review a new policy draft',
      summary: 'A policy that shares named exit interview comments with managers and punishes all exits. Think aloud.',
      timeLimitSec: 360,
      voiceMaxSec: 150,
      preferVoice: false,
      thinkAloud: true,
      scored: true,
      prompt: () => [
        {
          type: 'p',
          text: 'The business head drafted a policy to "make managers own attrition". **Name the problems, worst first, and the harm each could cause.** Then say what you would change.',
        },
      ],
      material: () => [
        { type: 'h', text: 'Draft policy: manager accountability for attrition' },
        {
          type: 'list',
          ordered: true,
          items: [
            "Every manager receives the full exit interview of each leaver, with the leaver's name, every month.",
            'Managers with any leaver in a quarter lose 20% of their bonus.',
            'Managers must hold a monthly one-to-one with each team member.',
            'HR publishes a ranking of managers by attrition on the intranet.',
          ],
        },
      ],
      reviewerGuide: () => [
        { type: 'p', text: 'Planted problems:' },
        {
          type: 'list',
          items: [
            '**Named exit interviews shared with managers** breaks the confidentiality people were promised; leavers stop being honest, and those still in touch may face retaliation.',
            '**Penalising any leaver** punishes managers for healthy exits (performance exits, relocations, promotions out) and encourages them to keep poor performers or hide resignations.',
            '**A public ranking** shames managers without context (team size, role type) and damages trust.',
          ],
        },
        {
          type: 'p',
          text: 'Decoy: monthly one-to-ones are good practice. A strong answer suggests anonymised themes, regretted-attrition measures with context, and support for managers.',
        },
      ],
      rubric: [
        {
          id: 'critical',
          label: 'Catches the real harms',
          weight: 2,
          anchors: [
            'Misses the confidentiality breach.',
            'Catches one problem.',
            'Catches confidentiality and the any-leaver penalty.',
            'Catches all three with the behaviour each would cause.',
          ],
        },
        {
          id: 'alternative',
          label: 'A better design',
          weight: 1,
          anchors: [
            'None.',
            'Vague.',
            'Anonymised themes and a fairer measure.',
            'Those plus manager support and context for comparisons.',
          ],
        },
        {
          id: 'severity',
          label: 'Orders by harm',
          weight: 1,
          anchors: [
            'Decoy first.',
            'Unexplained.',
            'Sensible order.',
            'Ordered by harm to people and trust, explained.',
          ],
        },
      ],
      followUps: () => [
        'How would you push back on the business head about this?',
        'What attrition measure would you use instead?',
      ],
    },
    aiAllowedStage({
      id: 'talking-points',
      title: 'Talking points for the manager (AI allowed)',
      summary: 'Prepare a hard conversation with the manager using AI. Catches vague or accusatory scripts.',
      timeLimitSec: 480,
      task: (ctx) => [
        {
          type: 'p',
          text: `Write your talking points (under 200 words) for a conversation with the ${s(ctx.variant, 'hotTeam')} manager: what you've seen, how you'll support them, what you expect, and by when.`,
        },
      ],
      guide: (ctx) => [
        {
          type: 'p',
          text: `Good points are specific (team attrition, workload up from ${n(ctx.variant, 'ticketsBefore')} to ${n(ctx.variant, 'ticketsPerPerson')} cases, engagement down ${n(ctx.variant, 'engagementDrop')} points), share themes without naming leavers, and pair clear expectations with real support.`,
        },
        {
          type: 'p',
          text: 'AI drafts are typically either soft and vague ("let\'s explore how things are going") or read like a warning letter, and sometimes quote individual exit comments. Did the candidate find the balance and protect confidentiality?',
        },
      ],
      accuracy: {
        id: 'accuracy',
        label: 'Specific, fair and confidential',
        weight: 1,
        anchors: [
          'Vague, accusatory or breaches confidentiality.',
          'Partly specific.',
          'Specific facts and clear expectations.',
          'Specific, supportive, with a review date and confidentiality kept.',
        ],
      },
      usable: {
        id: 'usable',
        label: 'Usable in the room',
        weight: 1,
        anchors: [
          'A script to read out.',
          'Usable with work.',
          'Clear points to guide the talk.',
          'Would make a hard conversation productive.',
        ],
      },
    }),
    pastWorkStage({
      id: 'people-issue',
      title: 'A people problem you solved',
      summary: 'A real people issue they handled. Checks specificity and ownership.',
      question: 'Tell us about a people problem in a team that you helped solve.',
    }),
  ],
};
