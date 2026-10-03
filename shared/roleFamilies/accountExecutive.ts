import type { Block, RoleFamily } from '../types';
import { n, s } from '../variants';
import { ADAPTS, FICTIONAL_CALLOUT, NEXT_STEPS, aiAllowedStage, pastWorkStage, warmupStage } from './common';

const SELLERS = [
  {
    company: 'Ledgerly',
    product: 'expense management software',
    team: 'finance team',
    users: 'employees filing expenses',
  },
  { company: 'Proximo', product: 'sales CRM', team: 'sales team', users: 'sales reps' },
  { company: 'Helpwise', product: 'customer support software', team: 'support team', users: 'support agents' },
  {
    company: 'Shiftly',
    product: 'field-service scheduling software',
    team: 'service team',
    users: 'field technicians',
  },
] as const;

const PROSPECTS = ['Kaveri Healthcare', 'Northwind Logistics', 'Saffron Hotels', 'Apex Learning', 'Tanvi Retail'];
const COMPETITORS = ['Zentrix', 'Clearbook', 'Quanta Suite'];

const OPTIONS = [
  { id: 'give', label: 'Give the 25% discount so it closes this quarter' },
  { id: 'trade', label: 'Offer 10% in exchange for a two-year contract' },
  { id: 'cfo', label: 'Hold the price and ask to meet the CFO with your champion' },
  { id: 'pilot', label: 'Offer a free one-month pilot for one team instead of a discount' },
];

export const accountExecutive: RoleFamily = {
  id: 'sales-ae',
  version: 1,
  name: 'Account Executive (B2B)',
  roles: ['Account Executive', 'Enterprise Sales Executive', 'Senior Sales Executive'],
  catalog: {
    function: 'Sales',
    seniority: ['Mid', 'Senior'],
    industries: ['SaaS', 'Services'],
    skills: ['Judgement', 'Numbers', 'Stakeholders'],
    keywords: ['AE', 'closing', 'B2B sales', 'deal', 'negotiation', 'enterprise sales', 'key account'],
  },
  summary:
    'A deal stuck for two months with the quarter ending: diagnose what is really wrong, decide on a 25% discount request, and catch the errors in a proposal before it goes out.',

  warmups: [
    'Tell us about a purchase you talked yourself out of. What would have changed your mind?',
    'What is one question you always ask a prospect, and why?',
    'Describe a time you had to tell someone something they did not want to hear.',
  ],

  generate(rng, currency) {
    const inr = currency === 'INR';
    const seller = rng.pick(SELLERS);
    const seats = rng.int(6, 12) * 10;
    const price = inr ? rng.pick([1200, 1500, 1800]) : rng.pick([15, 20, 25]);
    const acv = seats * price * 12;
    const quota = Math.round((acv * rng.pick([5, 6, 7])) / 1000) * 1000;
    const closed = Math.round((quota * rng.pick([0.55, 0.6, 0.65])) / 1000) * 1000;
    // The proposal's typo: a plausible wrong count, close enough to slip past a quick read.
    const typoSeats = seats - rng.pick([12, 18]);
    return {
      ...seller,
      prospect: rng.pick(PROSPECTS),
      competitor: rng.pick(COMPETITORS),
      seats,
      typoSeats,
      price,
      acv,
      quota,
      closed,
      gapToQuota: quota - closed,
      daysInStage: rng.int(55, 70),
      avgDaysInStage: rng.pick([18, 21, 24]),
      daysToQuarterEnd: rng.int(15, 21),
      lastReplyDays: rng.int(8, 12),
      questionnaireDays: rng.int(19, 26),
      procurementDays: rng.pick([30, 45]),
      approvalLimit: 10,
      otherCommit: Math.round((quota * 0.1) / 1000) * 1000,
      setupFee: inr ? rng.pick([150000, 200000]) : rng.pick([2500, 3000]),
      currentCost: Math.round((acv * rng.pick([1.6, 1.9, 2.2])) / 1000) * 1000,
      cfoDelayDays: rng.int(7, 12),
      pilotUsers: rng.int(8, 14),
      competitorDiscount: rng.pick([30, 35]),
    };
  },

  brief(ctx) {
    const v = ctx.variant;
    const { fmt } = ctx;
    return [
      {
        type: 'p',
        text: `You're an Account Executive at **${s(v, 'company')}**, which sells ${s(v, 'product')}. List price is ${fmt.money(n(v, 'price'))} per user per month, billed yearly. You can approve discounts up to ${n(v, 'approvalLimit')}%; anything more needs your VP.`,
      },
      {
        type: 'p',
        text: `The quarter ends in **${n(v, 'daysToQuarterEnd')} days**. Your quota is ${fmt.money(n(v, 'quota'))}; you've closed ${fmt.money(n(v, 'closed'))}. Your biggest open deal is **${s(v, 'prospect')}**: ${n(v, 'seats')} users, ${fmt.money(n(v, 'acv'))} a year.`,
      },
      {
        type: 'table',
        caption: `${s(v, 'prospect')}: deal history`,
        columns: ['When', 'What happened'],
        rows: [
          [
            `${n(v, 'daysInStage') + 16} days ago`,
            `Discovery call with Priya Nair, Head of Operations (your champion). Their ${s(v, 'team')} uses spreadsheets and email today.`,
          ],
          [`${n(v, 'daysInStage') + 9} days ago`, 'Demo to Priya and two of her team leads. Very positive.'],
          [
            `${n(v, 'daysInStage')} days ago`,
            `Proposal sent; the deal moved to the "Proposal" stage. Your team's average time in this stage is ${n(v, 'avgDaysInStage')} days.`,
          ],
          [
            `${n(v, 'questionnaireDays')} days ago`,
            'Their IT team sent a 40-question security questionnaire. It is still with your security team, unanswered.',
          ],
          ['2 weeks ago', `Priya mentioned they are "also looking at ${s(v, 'competitor')}".`],
          [`${n(v, 'lastReplyDays')} days ago`, 'Priya: "Busy with month-end, will revert."'],
          [
            'Yesterday',
            `Priya calls: "If you can do 25% off, I can get this approved this month. Our CFO, Rahul, signs anything over ${fmt.money(Math.round(n(v, 'acv') * 0.5))}."`,
          ],
        ],
      },
      {
        type: 'p',
        text: `Their new vendors go through procurement, which usually takes ${n(v, 'procurementDays')} days after a decision. Nobody at ${s(v, 'company')} has spoken to Rahul.`,
      },
      { type: 'callout', text: FICTIONAL_CALLOUT },
    ];
  },

  stages: [
    warmupStage(),
    {
      id: 'diagnose',
      kind: 'scenario',
      title: "What's really wrong with this deal?",
      summary:
        'Diagnose a stalled deal: single-threaded, no economic buyer, a stuck security review, an unrealistic close date. Think aloud.',
      timeLimitSec: 300,
      voiceMaxSec: 120,
      preferVoice: true,
      thinkAloud: true,
      scored: true,
      prompt: () => [
        {
          type: 'p',
          text: '**What is really holding this deal up?** Then say how you would forecast it for this quarter (commit, best case, or not this quarter) and why.',
        },
      ],
      reviewerGuide: (ctx) => {
        const v = ctx.variant;
        return [
          { type: 'p', text: 'What the history shows:' },
          {
            type: 'list',
            items: [
              `**Single-threaded, no economic buyer.** Only Priya; Rahul (CFO) signs and nobody has met him. Her discount ask suggests she lacks a business case to take to him.`,
              `**A blocker on our side.** The security questionnaire has sat with ${s(v, 'company')} for ${n(v, 'questionnaireDays')} days. IT won't approve without it.`,
              `**The close date is unrealistic.** ${n(v, 'procurementDays')} days of procurement after a decision doesn't fit in ${n(v, 'daysToQuarterEnd')} days.`,
              `**Slipping:** ${n(v, 'daysInStage')} days in stage against ${n(v, 'avgDaysInStage')}, slow replies, a competitor in play.`,
            ],
          },
          {
            type: 'p',
            text: 'A strong forecast is "not this quarter" or "best case at most", with the reasons. Calling it commit because Priya is positive is the weak answer.',
          },
        ];
      },
      rubric: [
        {
          id: 'diagnosis',
          label: 'Finds the real blockers',
          weight: 2,
          anchors: [
            'Blames price or timing only.',
            'Spots one blocker.',
            'Spots the missing CFO and the stuck questionnaire.',
            'Spots both plus the procurement timing, and how they connect.',
          ],
        },
        {
          id: 'forecast',
          label: 'Honest forecast',
          weight: 1,
          anchors: [
            'Commit, based on the champion.',
            'Best case without reasons.',
            'Best case or not this quarter, with reasons.',
            'A clear call with what would have to happen to move it up.',
          ],
        },
        {
          id: 'evidence',
          label: 'Uses the deal history',
          weight: 1,
          anchors: [
            'General sales advice.',
            'Mentions some events.',
            'Ties each point to an event or number.',
            'Uses dates and numbers to show the timeline does not work.',
          ],
        },
      ],
      followUps: (ctx) => [
        `What would you need to hear from Rahul to call this a commit?`,
        `Who at ${s(ctx.variant, 'company')} do you chase about the security questionnaire, and what do you say?`,
      ],
    },
    {
      id: 'discount',
      kind: 'decision',
      title: 'The 25% request',
      summary:
        'Respond to a discount request above their authority, with quota pressure. Tests deal judgement and maths. Think aloud.',
      timeLimitSec: 360,
      voiceMaxSec: 150,
      preferVoice: true,
      thinkAloud: true,
      scored: true,
      choices: OPTIONS,
      prompt: () => [
        { type: 'p', text: "**How do you respond to Priya's 25% request?** Pick one approach." },
        {
          type: 'p',
          text: 'Then show what it does to the deal value and to your quarter, and what you will say to Priya and to your VP.',
        },
      ],
      reviewerGuide: (ctx) => {
        const v = ctx.variant;
        const { fmt } = ctx;
        const acv = n(v, 'acv');
        return [
          {
            type: 'list',
            items: [
              `25% off: ${fmt.money(acv * 0.75)} a year (−${fmt.money(acv * 0.25)}), needs the VP, and probably still won't close in ${n(v, 'daysToQuarterEnd')} days because of procurement and security.`,
              `10% for two years: ${fmt.money(acv * 0.9)} a year, ${fmt.money(acv * 0.9 * 2)} contracted. Within their authority.`,
              `Hold price and meet the CFO: full ${fmt.money(acv)}; it fixes the real blocker but may slip the quarter.`,
              `Free pilot: no discount, but a month of delay; useful only if value is in doubt.`,
            ],
          },
          {
            type: 'p',
            text: `Their quarter gap is ${fmt.money(n(v, 'gapToQuota'))}, so the deal matters, but discounting doesn't remove the CFO or security blockers. The strongest answers trade (never give a discount for nothing), get to Rahul with a business case (their current cost is roughly ${fmt.money(n(v, 'currentCost'))} a year in staff time), and are honest with their VP about timing.`,
          },
        ];
      },
      rubric: [
        {
          id: 'judgement',
          label: 'Deal judgement',
          weight: 2,
          anchors: [
            'Gives the discount for nothing, or refuses with no alternative.',
            'A reasonable move that ignores the real blockers.',
            'A move that trades value and addresses the CFO or security.',
            'Trades value, reaches the economic buyer and protects price.',
          ],
        },
        {
          id: 'maths',
          label: 'Shows the money',
          weight: 1,
          anchors: [
            'No numbers.',
            'Rough numbers.',
            'Correct deal value under their option.',
            'Correct value plus the effect on the quarter and future renewals.',
          ],
        },
        {
          id: 'authority',
          label: 'Works within authority',
          weight: 1,
          anchors: [
            'Promises more than they can approve.',
            'Unclear about approval.',
            'Stays within 10% or involves the VP.',
            'Uses the approval process to their advantage with the customer.',
          ],
        },
      ],
      followUps: (_ctx, answer) => [
        `You chose "${answer.choiceLabel ?? 'your approach'}". Say the exact words you'd use with Priya.`,
        'What would make you walk away from this deal?',
      ],
    },
    {
      id: 'a-week-later',
      kind: 'branch',
      title: 'A week later',
      summary: 'The response to their choice comes back. Tests whether they adapt without panicking.',
      timeLimitSec: 300,
      voiceMaxSec: 120,
      preferVoice: true,
      scored: true,
      dependsOn: 'discount',
      prompt: (ctx) => {
        const v = ctx.variant;
        const byChoice: Record<string, Block[]> = {
          give: [
            {
              type: 'p',
              text: `Your VP approved 25%, reluctantly. Priya now says Rahul wants to see "the ROI case" before signing, and that ${s(v, 'competitor')} has offered ${n(v, 'competitorDiscount')}% off. The security questionnaire is still open.`,
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
          trade: [
            {
              type: 'p',
              text: `Priya likes the two-year idea, but says Rahul "never signs multi-year with a new vendor". She asks if you can do the 10% on one year instead, and mentions ${s(v, 'competitor')} again.`,
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
          cfo: [
            {
              type: 'p',
              text: `Priya is annoyed: "I told you I could get it done. Now Rahul's calendar is full for ${n(v, 'cfoDelayDays')} days." Your VP asks why this deal fell out of the commit.`,
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
          pilot: [
            {
              type: 'p',
              text: `The pilot started with ${n(v, 'pilotUsers')} users, but only 3 have logged in. Priya says the team is "too busy to learn a new tool" this month. The quarter ends in a week.`,
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
        };
        return byChoice[ctx.choices.discount ?? 'cfo'] ?? byChoice.cfo;
      },
      reviewerGuide: (ctx) => {
        const guides: Record<string, string> = {
          give: 'The discount bought nothing: the CFO still needs a business case and the competitor will match. Strong: stop discounting, build the ROI case with Priya using their current cost, push security internally, and get the meeting with Rahul. Weak: more discount.',
          trade:
            'Strong: explore why (cash flow? risk?), offer a one-year term with a lower annual escalation or an opt-out, or keep 10% conditional on something (case study, faster signature). Still needs Rahul. Weak: gives 10% for nothing.',
          cfo: 'Tests holding a good decision under pressure. Strong: repair with Priya (make her look good: prepare the business case with her for Rahul), use the wait to clear the security questionnaire, and give the VP an honest forecast. Weak: caves to a discount or blames Priya.',
          pilot:
            'Low adoption is a risk signal, not a reason to wait. Strong: find out why, run a short hands-on session, pick one painful workflow to prove value, and reset the timeline honestly with the VP. Weak: extends the pilot indefinitely.',
        };
        const choice = ctx.choices.discount ?? 'cfo';
        return [
          { type: 'p', text: `They chose **${OPTIONS.find((o) => o.id === choice)?.label ?? choice}**.` },
          { type: 'p', text: guides[choice] ?? guides.cfo },
        ];
      },
      rubric: [
        ADAPTS,
        {
          id: 'stakeholders',
          label: 'Manages the champion and the VP',
          weight: 1,
          anchors: [
            'Damages one of the relationships.',
            'Keeps the peace without moving forward.',
            'Handles both clearly and honestly.',
            'Turns the champion into an ally for the CFO conversation.',
          ],
        },
        NEXT_STEPS,
      ],
      followUps: () => [
        'What would you say to your VP in one sentence about this deal now?',
        'What did you learn about this buyer?',
      ],
    },
    {
      id: 'proposal',
      kind: 'critique',
      title: 'Check the proposal before it goes out',
      summary:
        'A proposal with the wrong user count, a calculation error and the wrong payment terms. Tests attention to numbers. Think aloud.',
      timeLimitSec: 420,
      voiceMaxSec: 180,
      preferVoice: false,
      thinkAloud: true,
      scored: true,
      prompt: () => [
        {
          type: 'p',
          text: 'Your sales assistant prepared the revised proposal for Rahul. **Find the problems, worst first, and say what each would cost you.** Then list what you would change.',
        },
      ],
      material: (ctx) => {
        const v = ctx.variant;
        const { fmt } = ctx;
        const wrongTotal = n(v, 'typoSeats') * n(v, 'price') * 12;
        const doubleDiscounted = wrongTotal * 0.9 * 0.9;
        return [
          { type: 'h', text: `Proposal: ${s(v, 'company')} for ${s(v, 'prospect')}` },
          {
            type: 'table',
            columns: ['Item', 'Detail'],
            rows: [
              ['Users', `${n(v, 'typoSeats')} ${s(v, 'users')}`],
              ['Price', `${fmt.money(n(v, 'price'))} per user per month`],
              ['Annual subscription', fmt.money(wrongTotal)],
              ['Discount', '10% (approved)'],
              ['Annual total after discount', fmt.money(doubleDiscounted)],
              ['Implementation', `${fmt.money(n(v, 'setupFee'))} one-time (standard)`],
              ['Payment terms', '100% of the annual fee in advance'],
              ['Start date', 'First day of next month'],
            ],
          },
          {
            type: 'p',
            text: `Notes from discovery: Priya asked for quarterly billing because of their cash cycle, and confirmed ${n(v, 'seats')} users.`,
          },
        ];
      },
      reviewerGuide: (ctx) => {
        const v = ctx.variant;
        const { fmt } = ctx;
        const right = n(v, 'seats') * n(v, 'price') * 12;
        return [
          { type: 'p', text: 'Planted problems:' },
          {
            type: 'list',
            items: [
              `**Wrong user count:** ${n(v, 'typoSeats')} instead of the ${n(v, 'seats')} Priya confirmed. Correct annual subscription: ${fmt.money(right)}; 10% off gives ${fmt.money(right * 0.9)}.`,
              '**The discount is applied twice.** The "after discount" line is 10% off twice (about 19%), more than they can approve.',
              '**Payment terms ignore the ask.** Priya asked for quarterly billing; 100% upfront hands Rahul a reason to say no.',
              `**Start date** ignores the ${n(v, 'procurementDays')}-day procurement process and the open security review.`,
            ],
          },
          {
            type: 'p',
            text: 'Decoy: the implementation fee is standard. Flagging it as the main problem is a weak signal.',
          },
        ];
      },
      rubric: [
        {
          id: 'critical',
          label: 'Catches the number errors',
          weight: 2,
          anchors: [
            'Misses the user count and the double discount.',
            'Catches one of them.',
            'Catches both.',
            'Catches both and works out the correct total.',
          ],
        },
        {
          id: 'buyer',
          label: 'Reads it as the buyer would',
          weight: 1,
          anchors: [
            'Ignores the payment terms and timing.',
            'Mentions one.',
            'Fixes payment terms and start date with reasons.',
            'Explains how each would look to the CFO and how to pre-empt it.',
          ],
        },
        {
          id: 'severity',
          label: 'Orders by cost',
          weight: 1,
          anchors: [
            'Unordered or decoy first.',
            'Ordering unexplained.',
            'Sensible ordering.',
            'Ordered by money and deal risk, explained.',
          ],
        },
      ],
      followUps: () => [
        'How would you stop this kind of error reaching a customer again?',
        'Rahul asks why he should pay for implementation. What do you say?',
      ],
    },
    aiAllowedStage({
      id: 'cfo-email',
      title: 'Email to the CFO (AI allowed)',
      summary: 'Write a short business case email to the CFO with AI. Catches invented ROI numbers.',
      task: (ctx) => [
        {
          type: 'p',
          text: `Write the email Priya can forward to Rahul (under 150 words) making the case for ${s(ctx.variant, 'company')} and asking for 20 minutes.`,
        },
      ],
      guide: (ctx) => [
        {
          type: 'p',
          text: `Use the scenario: ${n(ctx.variant, 'seats')} users, ${ctx.fmt.money(n(ctx.variant, 'acv'))} a year at list, and today's cost of about ${ctx.fmt.money(n(ctx.variant, 'currentCost'))} a year in staff time (if the candidate asks or estimates it). A CFO wants cost, risk and payback, briefly.`,
        },
        {
          type: 'p',
          text: 'AI drafts typically invent ROI figures ("save 300%"), name customers that don\'t exist, and write like marketing. Did the candidate remove made-up numbers and keep it short?',
        },
      ],
      accuracy: {
        id: 'accuracy',
        label: 'Accurate business case',
        weight: 1,
        anchors: [
          'Invented numbers or claims.',
          'Generic benefits, no numbers.',
          'Uses the real price and users; no invented claims.',
          'A clear cost-versus-benefit case a CFO could check.',
        ],
      },
      usable: {
        id: 'usable',
        label: 'Ready to forward',
        weight: 1,
        anchors: ['Long or salesy.', 'Usable with edits.', 'Short, clear ask.', 'A CFO would reply to it.'],
      },
    }),
    pastWorkStage({
      id: 'deal-story',
      title: 'A deal you saved or lost',
      summary: 'A real deal that went sideways. Checks specificity and ownership.',
      question: 'Tell us about a deal that went sideways late, and what you did.',
    }),
  ],
};
