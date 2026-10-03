import type { Block, RoleFamily } from '../types';
import { n, s } from '../variants';
import { ADAPTS, FICTIONAL_CALLOUT, NEXT_STEPS, aiAllowedStage, pastWorkStage, warmupStage } from './common';

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const PRODUCTS = [
  {
    company: 'Kirana Konnect',
    product: 'an app shopkeepers use to order stock from wholesalers',
    user: 'shopkeepers',
    action: 'placed an order',
    bigCustomer: 'a 400-store FMCG distributor',
    ceoFeature: 'bulk ordering from a price list upload',
    salesFeature: 'Tally accounting integration',
    supportIssue: '"Where is my delivery?" status updates',
  },
  {
    company: 'FitPulse',
    product: 'a fitness app with live and recorded classes',
    user: 'members',
    action: 'joined a class',
    bigCustomer: 'a 3,000-employee corporate wellness client',
    ceoFeature: 'company leaderboards',
    salesFeature: 'Google Fit and Apple Health sync',
    supportIssue: 'class reminders arriving late',
  },
  {
    company: 'LearnNest',
    product: 'an exam-prep app for school students',
    user: 'students',
    action: 'finished a lesson',
    bigCustomer: 'a 120-school education chain',
    ceoFeature: 'teacher dashboards',
    salesFeature: 'WhatsApp progress reports for parents',
    supportIssue: 'videos buffering on slow connections',
  },
] as const;

const OPTIONS = [
  { id: 'onboarding', label: 'Fix the Android onboarding first, then the support complaint' },
  { id: 'ceo', label: "Build the CEO's feature for the big customer" },
  { id: 'split', label: 'Split the team: half on onboarding, half on the CEO’s feature' },
  { id: 'research', label: 'Spend two weeks on research before committing to anything' },
];

export const productManager: RoleFamily = {
  id: 'product-manager',
  version: 1,
  name: 'Product Manager',
  roles: ['Product Manager', 'Senior Product Manager', 'Product Owner'],
  catalog: {
    function: 'Product & design',
    seniority: ['Mid', 'Senior'],
    industries: ['Consumer apps', 'SaaS'],
    skills: ['Analysis', 'Prioritisation', 'Stakeholders'],
    keywords: ['PM', 'product management', 'roadmap', 'prioritisation', 'PRD', 'product owner'],
  },
  summary:
    'Retention dropped after a release and the CEO wants a feature for a big customer: find the real cause in the data, decide what the team builds next, and catch the holes in a junior PM’s spec.',

  warmups: [
    'What is an app you use every day, and one thing you would change about it?',
    'Tell us about a feature you think should be removed from a product you use.',
    'How do you decide something is worth building?',
  ],

  generate(rng) {
    const p = rng.pick(PRODUCTS);
    const androidShare = rng.pick([72, 76, 80]);
    const iosBefore = rng.int(32, 36);
    const androidBefore = rng.int(29, 33);
    const androidAfter = androidBefore - rng.int(8, 11);
    const iosAfter = iosBefore - rng.pick([0, 1]);
    const blended = (x: number, y: number) => Math.round((x * androidShare + y * (100 - androidShare)) / 100);
    return {
      ...p,
      androidShare,
      iosBefore,
      iosAfter,
      androidBefore,
      androidAfter,
      blendedBefore: blended(androidBefore, iosBefore),
      blendedAfter: blended(androidAfter, iosAfter),
      returningAndroid: androidBefore - rng.pick([0, 1]),
      otpTicketsBefore: rng.int(30, 45),
      otpTicketsAfter: rng.int(150, 210),
      engineerWeeks: 6,
      onboardingWeeks: 2,
      ceoWeeks: rng.pick([5, 6]),
      salesWeeks: 3,
      supportWeeks: 2,
      bigCustomerUsers: rng.int(8, 14) * 100,
      mau: rng.int(18, 40) * 10000,
      releaseWeeks: rng.int(4, 6),
      ceoDeadlineWeeks: rng.int(3, 4),
      liftAfterFix: rng.int(5, 8),
    };
  },

  brief(ctx) {
    const v = ctx.variant;
    const { fmt } = ctx;
    return [
      {
        type: 'p',
        text: `You're the Product Manager at **${s(v, 'company')}**, ${s(v, 'product')}, with ${fmt.num(n(v, 'mau'))} monthly active ${s(v, 'user')}. ${fmt.pct(n(v, 'androidShare'))} of them use Android. Your quarterly goal is **week-4 retention**: the share of new ${s(v, 'user')} who have ${s(v, 'action')} in their fourth week.`,
      },
      {
        type: 'p',
        text: `Release 3.2 shipped ${n(v, 'releaseWeeks')} weeks ago with a new sign-up flow (phone number and OTP first, then permissions). Since then, the headline number has fallen.`,
      },
      {
        type: 'table',
        caption: 'Week-4 retention',
        columns: ['Segment', 'Before 3.2', 'After 3.2'],
        rows: [
          ['All new users', fmt.pct(n(v, 'blendedBefore')), fmt.pct(n(v, 'blendedAfter'))],
          ['New users, iOS', fmt.pct(n(v, 'iosBefore')), fmt.pct(n(v, 'iosAfter'))],
          ['New users, Android', fmt.pct(n(v, 'androidBefore')), fmt.pct(n(v, 'androidAfter'))],
          [
            'Returning users, Android (week-4 activity)',
            fmt.pct(n(v, 'androidBefore')),
            fmt.pct(n(v, 'returningAndroid')),
          ],
        ],
      },
      {
        type: 'p',
        text: `Support tickets tagged "OTP not received" went from ${n(v, 'otpTicketsBefore')} a week to ${n(v, 'otpTicketsAfter')} a week after the release.`,
      },
      { type: 'h', text: 'What people are asking for' },
      {
        type: 'table',
        columns: ['Request', 'From', 'Estimate'],
        rows: [
          [
            `${capitalise(s(v, 'ceoFeature'))} for ${s(v, 'bigCustomer')} (${fmt.num(n(v, 'bigCustomerUsers'))} users)`,
            'CEO',
            `${n(v, 'ceoWeeks')} engineer-weeks`,
          ],
          [s(v, 'salesFeature'), 'Sales', `${n(v, 'salesWeeks')} engineer-weeks`],
          [`Fix ${s(v, 'supportIssue')}`, 'Support (top complaint)', `${n(v, 'supportWeeks')} engineer-weeks`],
          ['Investigate and fix the new sign-up flow on Android', 'You', `${n(v, 'onboardingWeeks')} engineer-weeks`],
        ],
      },
      {
        type: 'p',
        text: `You have **${n(v, 'engineerWeeks')} engineer-weeks** in the next cycle. The CEO has promised the big customer something "within ${n(v, 'ceoDeadlineWeeks')} weeks".`,
      },
      { type: 'callout', text: FICTIONAL_CALLOUT },
    ];
  },

  stages: [
    warmupStage(),
    {
      id: 'why-down',
      kind: 'scenario',
      title: 'Why is retention down?',
      summary:
        'Find the cause of a retention drop hidden in the averages: Android new users after a sign-up change, with OTP tickets spiking. Think aloud.',
      timeLimitSec: 300,
      voiceMaxSec: 120,
      preferVoice: true,
      thinkAloud: true,
      scored: true,
      prompt: () => [
        {
          type: 'p',
          text: '**What do you think is causing the drop, and how would you confirm it this week?** Say what you would look at first.',
        },
      ],
      reviewerGuide: (ctx) => {
        const v = ctx.variant;
        return [
          {
            type: 'p',
            text: `The drop is almost entirely **new Android users** (${n(v, 'androidBefore')}% → ${n(v, 'androidAfter')}%); iOS and returning Android users are flat. It started with 3.2's OTP-first sign-up, and "OTP not received" tickets jumped from ${n(v, 'otpTicketsBefore')} to ${n(v, 'otpTicketsAfter')} a week. The likeliest cause: OTP delivery or auto-read failing on Android, so people never finish signing up.`,
          },
          {
            type: 'p',
            text: 'Strong answers segment, form one clear hypothesis, and name quick checks: the sign-up funnel by platform and device, OTP delivery rates by SMS provider, a few session recordings or a call with support. Weak answers blame "seasonality" or propose a redesign without looking at segments.',
          },
        ];
      },
      rubric: [
        {
          id: 'segment',
          label: 'Finds where the drop is',
          weight: 2,
          anchors: [
            'Treats the average as the whole story.',
            'Notices a platform difference.',
            'Pins it on new Android users after 3.2.',
            'Pins it there and links it to the OTP tickets.',
          ],
        },
        {
          id: 'hypothesis',
          label: 'Clear hypothesis',
          weight: 1,
          anchors: [
            'None, or a list of guesses.',
            'A vague cause.',
            'One specific, testable cause.',
            'A specific cause plus what would prove it wrong.',
          ],
        },
        {
          id: 'checks',
          label: 'Fast ways to confirm',
          weight: 1,
          anchors: [
            'None.',
            'Generic ("look at data").',
            'Specific checks this week.',
            'Specific checks in order of speed, with who does each.',
          ],
        },
      ],
      followUps: () => [
        `If OTP delivery looked fine, what would you check next?`,
        `Why does the blended number fall less than the Android number? Explain it out loud.`,
      ],
    },
    {
      id: 'next-cycle',
      kind: 'decision',
      title: 'What gets built next',
      summary: 'Choose how to spend six engineer-weeks with the CEO pushing for a customer feature. Think aloud.',
      timeLimitSec: 360,
      voiceMaxSec: 150,
      preferVoice: true,
      thinkAloud: true,
      scored: true,
      choices: OPTIONS,
      prompt: (ctx) => [
        {
          type: 'p',
          text: `**How do you use the ${n(ctx.variant, 'engineerWeeks')} engineer-weeks?** Pick one, then explain what you are saying no to and how you'll tell the CEO.`,
        },
      ],
      reviewerGuide: (ctx) => {
        const v = ctx.variant;
        return [
          {
            type: 'p',
            text: `The onboarding fix is small (${n(v, 'onboardingWeeks')} weeks) and hits the team's goal for the ${n(v, 'androidShare')}% of users on Android. The CEO's feature takes ${n(v, 'ceoWeeks')} weeks, nearly the whole cycle, for one customer, and can't land in ${n(v, 'ceoDeadlineWeeks')} weeks anyway.`,
          },
          {
            type: 'p',
            text: 'Fixing onboarding first is the strongest, especially paired with an honest conversation with the CEO about a smaller first slice for the customer. Splitting the team can work if sized realistically. Pure research delays a fix the data already points to. Any choice can score with sound reasoning and an honest message to the CEO.',
          },
        ];
      },
      rubric: [
        {
          id: 'tradeoff',
          label: 'Clear trade-off',
          weight: 2,
          anchors: [
            'Tries to do everything, or picks without reasons.',
            'Picks with partial reasons.',
            'Weighs impact on the goal against effort.',
            'Weighs impact, effort and the CEO deadline, and names what is not done.',
          ],
        },
        {
          id: 'maths',
          label: 'Fits the capacity',
          weight: 1,
          anchors: [
            'Plan exceeds the six weeks.',
            'Roughly fits.',
            'Fits, with the estimates used.',
            'Fits, with a buffer and what slips if estimates are wrong.',
          ],
        },
        {
          id: 'ceo',
          label: 'Handles the CEO',
          weight: 1,
          anchors: [
            'Ignores or caves.',
            'Vague message.',
            'Clear, honest message with reasons.',
            'Clear message plus an alternative for the customer.',
          ],
        },
      ],
      followUps: (_ctx, answer) => [
        `You chose "${answer.choiceLabel ?? 'your plan'}". What would you say to the CEO in the first 30 seconds?`,
        'What would make you change this plan mid-cycle?',
      ],
    },
    {
      id: 'three-weeks-in',
      kind: 'branch',
      title: 'Three weeks in',
      summary: 'Their plan meets reality. Tests adapting and stakeholder management.',
      timeLimitSec: 300,
      voiceMaxSec: 120,
      preferVoice: true,
      scored: true,
      dependsOn: 'next-cycle',
      prompt: (ctx) => {
        const v = ctx.variant;
        const byChoice: Record<string, Block[]> = {
          onboarding: [
            {
              type: 'p',
              text: `The fix shipped: OTP auto-read was broken on several Android versions. New-user week-1 activity is up, but week-4 retention won't be known for a month. Meanwhile the CEO forwards an email from ${s(v, 'bigCustomer')}: "If we don't see ${s(v, 'ceoFeature')} soon we'll look elsewhere."`,
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
          ceo: [
            {
              type: 'p',
              text: `The feature is half-built and slipping by a week. Android week-4 retention has fallen another 2 points, and your manager asks in the leadership meeting why the quarterly goal is going backwards.`,
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
          split: [
            {
              type: 'p',
              text: 'Neither half is finished: the onboarding fix needs one more week, and the CEO’s feature is 40% done. Two engineers say context-switching is killing them.',
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
          research: [
            {
              type: 'p',
              text: `Research confirms the OTP problem on Android, which the data already suggested. Two weeks have passed with nothing shipped, about ${n(v, 'otpTicketsAfter') * 2} more OTP tickets have come in, and the CEO asks what the team has been doing.`,
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
        };
        return byChoice[ctx.choices['next-cycle'] ?? 'onboarding'] ?? byChoice.onboarding;
      },
      reviewerGuide: (ctx) => {
        const guides: Record<string, string> = {
          onboarding:
            'Strong: share the early leading indicator honestly (week-1 up, week-4 pending), offer the customer a scoped first version with dates, and protect the remaining capacity. Weak: drops everything for the email, or ignores the customer risk.',
          ceo: 'Tests owning a decision that is not working. Strong: say plainly that retention is the team goal and it is getting worse, re-plan to fix onboarding now (it is small), reset the customer timeline. Weak: defends the choice or blames estimates.',
          split:
            'Strong: stop splitting; finish the onboarding fix first (one more week), then move everyone to the feature, and reset dates honestly. Weak: keeps both going.',
          research:
            'Tests owning a slow call. Strong: admit the data was enough, ship the fix immediately, and explain what the research added. Weak: asks for more research.',
        };
        const choice = ctx.choices['next-cycle'] ?? 'onboarding';
        return [
          { type: 'p', text: `They chose **${OPTIONS.find((o) => o.id === choice)?.label ?? choice}**.` },
          { type: 'p', text: guides[choice] ?? guides.onboarding },
        ];
      },
      rubric: [ADAPTS, NEXT_STEPS],
      followUps: () => [
        'What would you write in the update to leadership this week?',
        'What did you learn about how your team estimates?',
      ],
    },
    {
      id: 'review-spec',
      kind: 'critique',
      title: "Review a junior PM's spec",
      summary:
        'A one-page spec with a vanity success metric, no segment, scope creep and no rollout plan. Think aloud.',
      timeLimitSec: 420,
      voiceMaxSec: 180,
      preferVoice: false,
      thinkAloud: true,
      scored: true,
      prompt: () => [
        {
          type: 'p',
          text: 'A junior PM wrote this spec for the sign-up fix. **Name the three most important problems, worst first, and why each matters.** Then rewrite the success metric.',
        },
      ],
      material: (ctx) => {
        const v = ctx.variant;
        return [
          { type: 'h', text: 'Spec: Sign-up flow improvements' },
          {
            type: 'list',
            items: [
              `**Problem:** Users find sign-up confusing. Quotes from 3 ${s(v, 'user')}: "too many steps", "why do you need my location?", "OTP took forever".`,
              '**Goal:** Increase app downloads by 20% this quarter.',
              '**Scope:** Redesign all sign-up screens with the new brand colours, add Google and Facebook login, add a referral code field, and fix OTP auto-read.',
              '**Rollout:** Ship to 100% of users on both platforms next sprint.',
              '**Effort:** 2 engineer-weeks.',
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
              "**Wrong success metric.** Downloads are not the goal and sign-up changes don't move them; it should be sign-up completion and week-4 retention for new Android users.",
              `**Scope creep against the estimate.** A full redesign, social login and referrals don't fit ${n(v, 'onboardingWeeks')} engineer-weeks; the OTP fix is the part the data supports.`,
              '**No segment and no safe rollout.** The problem is Android; shipping everything to 100% at once means no way to know what helped, and risk to iOS, which is fine.',
            ],
          },
          {
            type: 'p',
            text:
              'Decoy: using user quotes is good. A strong metric rewrite: sign-up completion on Android, then new-user week-4 retention back to about ' +
              `${n(v, 'androidBefore')}%.`,
          },
        ];
      },
      rubric: [
        {
          id: 'critical',
          label: 'Catches the real problems',
          weight: 2,
          anchors: [
            'Misses the wrong metric.',
            'Catches one problem.',
            'Catches the metric and the scope.',
            'Catches the metric, scope and rollout, and why each matters here.',
          ],
        },
        {
          id: 'metric',
          label: 'Rewritten success metric',
          weight: 1,
          anchors: [
            'Missing or another vanity metric.',
            'Better but vague.',
            'Sign-up completion or new-user retention on Android.',
            'A leading and a lagging metric with targets.',
          ],
        },
        {
          id: 'severity',
          label: 'Orders by impact',
          weight: 1,
          anchors: [
            'Unordered or decoy first.',
            'Ordering unexplained.',
            'Sensible order.',
            'Ordered by risk to the goal, explained.',
          ],
        },
      ],
      followUps: () => [
        'How would you give this feedback to the junior PM?',
        'What would you cut first if the fix took four weeks?',
      ],
    },
    aiAllowedStage({
      id: 'ceo-update',
      title: 'Update to the CEO (AI allowed)',
      summary: 'Write the cycle plan update to the CEO with AI. Catches vague trade-offs and invented numbers.',
      task: () => [
        {
          type: 'p',
          text: 'Write your update to the CEO (under 200 words): the plan for the next cycle, what is not happening and why, and what you are offering the big customer.',
        },
      ],
      guide: (ctx) => [
        {
          type: 'p',
          text: `Uses the real numbers: new Android week-4 retention down from ${n(ctx.variant, 'androidBefore')}% to ${n(ctx.variant, 'androidAfter')}%, ${n(ctx.variant, 'engineerWeeks')} engineer-weeks, the ${n(ctx.variant, 'ceoWeeks')}-week estimate for the CEO's feature.`,
        },
        {
          type: 'p',
          text: 'AI drafts are typically vague ("we are prioritising user experience"), avoid saying no, or invent projected gains. Did the candidate make the trade-off explicit with real numbers?',
        },
      ],
      accuracy: {
        id: 'accuracy',
        label: 'Clear and accurate trade-off',
        weight: 1,
        anchors: [
          'Vague or invented numbers.',
          'Some real numbers, trade-off unclear.',
          'Real numbers, clear what is and is not happening.',
          'All of that plus a concrete offer for the customer.',
        ],
      },
      usable: {
        id: 'usable',
        label: 'Ready to send',
        weight: 1,
        anchors: [
          'Long or evasive.',
          'Usable with edits.',
          'Short and direct.',
          'A CEO would agree or push back in one reply.',
        ],
      },
    }),
    pastWorkStage({
      id: 'wrong-call',
      title: 'A product call you got wrong',
      summary: 'A real product decision that did not work. Checks specificity and ownership.',
      question: 'Tell us about a product decision you made that turned out wrong.',
    }),
  ],
};
