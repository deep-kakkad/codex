import type { Block, RoleFamily, StageContext } from '../types';
import { n, s } from '../variants';

const COMPANIES = [
  { company: 'Swiftcart', product: 'quick-commerce grocery app', orderNoun: 'order' },
  { company: 'PaySetu', product: 'bill-payments and recharge app', orderNoun: 'payment' },
  { company: 'StayNest', product: 'budget hotel booking platform', orderNoun: 'booking' },
  { company: 'RideRally', product: 'intercity bus ticketing app', orderNoun: 'ticket' },
  { company: 'Kitchenly', product: 'home-chef meal delivery app', orderNoun: 'order' },
] as const;

const LEVERS = [
  { id: 'proactive', label: 'Send a proactive message to every affected customer' },
  { id: 'overtime', label: 'Mandatory three-hour overtime for the whole team today' },
  { id: 'bulk', label: 'Bulk-reply to all "money debited" tickets with a macro and auto-close them' },
  { id: 'borrow', label: 'Borrow people from operations and sales to answer tickets today' },
];

function num(ctx: StageContext, key: string) {
  return ctx.fmt.num(n(ctx.variant, key));
}

export const customerSupport: RoleFamily = {
  id: 'customer-support-lead',
  version: 1,
  name: 'Customer Support Leadership',
  roles: ['Customer Support Team Lead', 'Support Operations Manager', 'CX Lead'],
  catalog: {
    function: 'Customer support',
    seniority: ['Manager'],
    industries: ['Consumer apps', 'Fintech'],
    skills: ['Prioritisation', 'Leadership', 'Customer empathy'],
    keywords: ['CX', 'support lead', 'customer service', 'team lead', 'contact centre'],
  },
  summary:
    'The morning after a payment outage: a backlog capacity alone cannot clear, a tempting shortcut, and a draft reply with a serious security mistake in it.',

  warmups: [
    'What is the best customer service you have received recently, and what made it good?',
    'What is one support metric you think teams rely on too much, and why?',
    'Tell us about a time you had to say no to a customer.',
  ],

  generate(rng, currency) {
    const inr = currency === 'INR';
    const co = rng.pick(COMPANIES);
    const agents = rng.int(14, 24);
    const perAgentDaily = rng.pick([45, 50, 55]);
    const normalDaily = Math.round((agents * perAgentDaily * 0.9) / 10) * 10;
    const refundDays = rng.pick([5, 7]);
    const rrn = String(rng.int(100000, 999999)) + String(rng.int(100000, 999999));
    return {
      ...co,
      agents,
      perAgentDaily,
      capacity: agents * perAgentDaily,
      normalDaily,
      normalBacklog: Math.round((normalDaily * 0.2) / 10) * 10,
      backlog: Math.round((normalDaily * rng.pick([1.4, 1.6, 1.8])) / 10) * 10,
      inboundToday: Math.round((normalDaily * rng.pick([1.8, 2.1, 2.4])) / 10) * 10,
      affected: rng.int(4, 9) * 1000,
      outageStart: rng.pick(['6:40 pm', '7:10 pm', '8:05 pm']),
      outageHours: rng.pick(['two hours', 'two and a half hours', 'three hours']),
      refundDays,
      topSharePct: rng.int(45, 60),
      repeatPct: rng.int(28, 40),
      chatFrtMin: rng.int(9, 16),
      emailFrtH: rng.int(18, 30),
      csatNow: rng.int(61, 70),
      csatBase: rng.int(86, 91),
      amount: rng.pick(inr ? [1249, 2380, 3899] : [48, 86, 129]),
      payMethod: inr ? 'UPI' : 'a digital wallet',
      complaintThreat: inr ? 'I am going to the consumer forum' : 'I am filing a complaint with my bank',
      rrn,
      contactsBefore: 3,
      borrowCount: rng.int(4, 8),
      doubleChargedReplies: rng.int(40, 120),
      overtimeDropPct: rng.int(8, 15),
      reopenPct: rng.int(35, 55),
      likes: rng.int(2, 9) * 1000,
      wrongPromisePct: rng.int(20, 35),
    };
  },

  brief(ctx) {
    const v = ctx.variant;
    const { fmt } = ctx;
    return [
      {
        type: 'p',
        text: `You lead the customer support team at **${s(v, 'company')}**, a ${s(v, 'product')}. It is 9:30 am on Tuesday.`,
      },
      {
        type: 'p',
        text: `Yesterday, from ${s(v, 'outageStart')} for about ${s(v, 'outageHours')}, a payment gateway fault meant **${num(ctx, 'affected')} customers were charged but their ${s(v, 'orderNoun')} failed**. Refunds were triggered automatically and reach customers within ${n(v, 'refundDays')} business days (company policy).`,
      },
      {
        type: 'table',
        caption: 'Support dashboard at 9:30 am',
        columns: ['Metric', 'Now', 'Normal'],
        rows: [
          ['Open tickets (backlog)', num(ctx, 'backlog'), num(ctx, 'normalBacklog')],
          ['Inbound tickets forecast for today', num(ctx, 'inboundToday'), num(ctx, 'normalDaily')],
          ['First response time: chat', `${n(v, 'chatFrtMin')} min`, 'under 2 min'],
          ['First response time: email', `${n(v, 'emailFrtH')} h`, 'under 8 h'],
          ['CSAT (last 24 h)', fmt.pct(n(v, 'csatNow')), fmt.pct(n(v, 'csatBase'))],
          ['New tickets tagged "Money debited, order failed"', fmt.pct(n(v, 'topSharePct')), '~3%'],
          ['Open tickets from customers with more than one open ticket', fmt.pct(n(v, 'repeatPct')), '~8%'],
        ],
      },
      { type: 'h', text: 'Your team' },
      {
        type: 'list',
        items: [
          `${n(v, 'agents')} agents on today's shift, covering chat and email.`,
          `Each agent resolves about ${n(v, 'perAgentDaily')} tickets a day.`,
          'Two senior agents handle escalations. You report to the Head of Operations.',
        ],
      },
      {
        type: 'callout',
        text: 'The company and numbers are fictional, and every candidate gets a slightly different version. A calculator is fine.',
      },
    ];
  },

  stages: [
    {
      id: 'warmup',
      kind: 'warmup',
      title: 'Warm-up',
      summary: 'A 45-second spontaneous answer. Not scored; gives a voice sample to compare with later recordings.',
      timeLimitSec: 120,
      voiceMaxSec: 45,
      preferVoice: true,
      scored: false,
      prompt: (ctx) => [
        { type: 'p', text: s(ctx.variant, 'warmup') },
        { type: 'p', text: 'Keep it under 45 seconds. This one is not scored; it just gets you talking.' },
      ],
      reviewerGuide: () => [
        {
          type: 'p',
          text: 'Not scored. On the verification call, listen for the same voice and ask a related question to check it is the same person.',
        },
      ],
      rubric: [],
      followUps: () => ['Ask them to say a little more about the example they gave in the warm-up.'],
    },
    {
      id: 'first-30-minutes',
      kind: 'scenario',
      title: 'The first 30 minutes',
      summary:
        'Read the outage dashboard and say what to do first. Think aloud: shows whether they go after demand or just add effort.',
      timeLimitSec: 300,
      voiceMaxSec: 120,
      preferVoice: true,
      thinkAloud: true,
      scored: true,
      prompt: () => [
        {
          type: 'p',
          text: '**What do you do in the next 30 minutes, and why that before anything else?**',
        },
        { type: 'p', text: 'Refer to the dashboard numbers.' },
      ],
      reviewerGuide: (ctx) => {
        const v = ctx.variant;
        return [
          {
            type: 'p',
            text: `Capacity today is about ${num(ctx, 'capacity')} tickets (${n(v, 'agents')} × ${n(v, 'perAgentDaily')}) against ${num(ctx, 'inboundToday')} inbound plus ${num(ctx, 'backlog')} already open. More effort alone cannot catch up.`,
          },
          { type: 'p', text: 'Strong answers go after demand:' },
          {
            type: 'list',
            items: [
              `${ctx.fmt.pct(n(v, 'topSharePct'))} of new tickets are one issue with a known answer, so a proactive status message and a macro remove most of it.`,
              `${ctx.fmt.pct(n(v, 'repeatPct'))} of open tickets come from customers chasing an existing ticket, so merging duplicates shrinks the backlog immediately.`,
              'They also triage risk: double debits, large amounts, legal or social-media threats.',
            ],
          },
          { type: 'p', text: 'Weak answers: "motivate the team", "hire more", generic empathy with no numbers.' },
        ];
      },
      rubric: [
        {
          id: 'numbers',
          label: 'Works from the dashboard',
          weight: 2,
          anchors: [
            'No numbers used.',
            'Quotes numbers without drawing a conclusion.',
            'Uses numbers to show capacity cannot keep up, or to size the main issue.',
            'Combines several numbers into a plan (e.g. capacity gap plus duplicate share).',
          ],
        },
        {
          id: 'demand',
          label: 'Reduces demand, not just adds effort',
          weight: 2,
          anchors: [
            'Only works harder or faster.',
            'Mentions communication but not as the main lever.',
            'Proactive communication or de-duplication is the main lever.',
            'Both, sequenced, with a sense of how much volume each removes.',
          ],
        },
        {
          id: 'triage',
          label: 'Risk triage',
          weight: 1,
          anchors: [
            'Treats every ticket the same.',
            'Mentions priority vaguely.',
            'Names specific high-risk ticket types to handle first.',
            'Sets up a clear routing rule for them with an owner.',
          ],
        },
      ],
      followUps: (ctx) => [
        `If nothing reduced demand, how long would ${n(ctx.variant, 'agents')} agents take to clear ${num(ctx, 'backlog')} open tickets on top of today's inbound? Work it out out loud.`,
        'Suppose your first action took twice as long as you expected. What would you drop?',
      ],
    },
    {
      id: 'one-lever',
      kind: 'decision',
      title: 'One lever',
      summary:
        'Commit to one lever (proactive message, overtime, bulk-close, borrowed staff) and estimate the end-of-day backlog. Think aloud.',
      timeLimitSec: 360,
      voiceMaxSec: 150,
      preferVoice: true,
      thinkAloud: true,
      scored: true,
      choices: LEVERS,
      prompt: (ctx) => [
        {
          type: 'p',
          text: `Your manager gives you **one lever for today** (the "borrow" option means ${n(ctx.variant, 'borrowCount')} people). Which do you pull?`,
        },
        {
          type: 'p',
          text: 'Then explain why, and estimate where the backlog will be at the end of the day with it.',
        },
      ],
      reviewerGuide: () => [
        {
          type: 'p',
          text: "The proactive message is usually the strongest lever because it removes repeat contacts at the source, but any option can score well with sound reasoning. Look for an end-of-day estimate with a method, and awareness of each lever's downside: bulk-closing risks reopens and anger; overtime adds limited capacity and burns people out; borrowed staff give wrong information.",
        },
      ],
      rubric: [
        {
          id: 'reasoning',
          label: 'Sound reasoning for the choice',
          weight: 2,
          anchors: [
            'No clear reasoning.',
            'Plausible but generic reasoning.',
            'Reasoning tied to this dashboard.',
            'Reasoning weighs the alternatives and their downsides.',
          ],
        },
        {
          id: 'estimate',
          label: 'End-of-day estimate',
          weight: 1,
          anchors: [
            'No estimate.',
            'A number with no method.',
            'A number with a clear method.',
            'A range with assumptions and what would change it.',
          ],
        },
        {
          id: 'downside',
          label: 'Owns the downside',
          weight: 1,
          anchors: [
            'Downside ignored.',
            'Generic downside.',
            'Specific downside of the chosen lever.',
            'Specific downside plus how they will catch it early.',
          ],
        },
      ],
      followUps: (_ctx, answer) => [
        `You chose: "${answer.choiceLabel ?? 'your lever'}". What was your second choice, and what would have made you pick it?`,
        'What is the first sign by midday that your choice is not working?',
      ],
    },
    {
      id: 'midday',
      kind: 'branch',
      title: 'Midday',
      summary: 'The situation changes based on their lever. Tests whether they adapt and own the downside.',
      timeLimitSec: 300,
      voiceMaxSec: 120,
      preferVoice: true,
      scored: true,
      dependsOn: 'one-lever',
      prompt: (ctx) => {
        const v = ctx.variant;
        const { fmt } = ctx;
        const byChoice: Record<string, Block[]> = {
          proactive: [
            {
              type: 'p',
              text: `The message went out at 11 am and new contacts dropped. But ${num(ctx, 'doubleChargedReplies')} customers replied that they were charged twice, and the message only mentioned one refund. Separately, Compliance asks why a message went to ${num(ctx, 'affected')} customers without their approval.`,
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
          overtime: [
            {
              type: 'p',
              text: `By 4 pm the backlog is down only ${fmt.pct(n(v, 'overtimeDropPct'))}. Two senior agents tell you they are burning out, and one has called in sick for tomorrow. Inbound is still about double the usual level.`,
            },
            { type: 'p', text: '**What now?**' },
          ],
          bulk: [
            {
              type: 'p',
              text: `By 3 pm, ${fmt.pct(n(v, 'reopenPct'))} of the auto-closed tickets have been reopened, many angrier than before. A customer's screenshot of the macro is trending on X with ${num(ctx, 'likes')} likes.`,
            },
            { type: 'p', text: '**What now?**' },
          ],
          borrow: [
            {
              type: 'p',
              text: `By 2 pm, QA spot checks show that ${fmt.pct(n(v, 'wrongPromisePct'))} of replies from borrowed staff promised refunds "within 24 hours". Policy is ${n(v, 'refundDays')} business days.`,
            },
            { type: 'p', text: '**What now?**' },
          ],
        };
        return byChoice[ctx.choices['one-lever'] ?? 'proactive'] ?? byChoice.proactive;
      },
      reviewerGuide: (ctx) => {
        const guides: Record<string, string> = {
          proactive:
            'Two problems at once: a customer-harm issue (double charges need investigation and escalation to payments) and a process issue (Compliance). Strong answers separate them, escalate the double charges with a list of affected customers, send a correction if needed, and repair the relationship with Compliance with a pre-approved template for next time, without becoming defensive.',
          overtime:
            "Tests whether they recognise overtime was capacity without leverage. Strong: stop or limit overtime, protect tomorrow's shift, switch to demand reduction (proactive message, merging duplicates), and speak honestly with the seniors. Weak: pushes harder.",
          bulk: 'Tests damage control and ownership. Strong: stop the auto-close, reopen the affected tickets with a personal follow-up, reply publicly and briefly on X, fix the macro, and own the mistake with their manager. Weak: blames the macro wording only, or goes silent.',
          borrow:
            'Tests speed of correction. Strong: pause borrowed staff or restrict them to scripted replies, send a correction to affected customers before the 24 hours run out, add QA, and set expectations honestly. Weak: leaves the wrong promise standing.',
        };
        const choice = ctx.choices['one-lever'] ?? 'proactive';
        return [
          { type: 'p', text: `They chose **${LEVERS.find((l) => l.id === choice)?.label ?? choice}**.` },
          { type: 'p', text: guides[choice] ?? guides.proactive },
        ];
      },
      rubric: [
        {
          id: 'adapt',
          label: 'Adapts to the new situation',
          weight: 2,
          anchors: [
            'Ignores or dismisses the new problem.',
            'Acknowledges it, with a thin response.',
            'Addresses the new problem directly and changes course where needed.',
            'Addresses it, fixes the root cause and prevents a repeat.',
          ],
        },
        {
          id: 'people',
          label: 'Handles people and stakeholders',
          weight: 1,
          anchors: [
            'Defensive or blames others.',
            'Informs stakeholders late or vaguely.',
            'Communicates clearly with customers, team and management.',
            'Clear communication plus owning the mistake where relevant.',
          ],
        },
        {
          id: 'action',
          label: 'Concrete next steps',
          weight: 1,
          anchors: [
            'No action.',
            'Vague actions.',
            'Specific actions in a sensible order.',
            'Specific actions with owners, timing and a success check.',
          ],
        },
      ],
      followUps: () => [
        'Who would you tell first, and what exactly would you say to them?',
        'Knowing this, what would you do differently at 9:30 am?',
      ],
    },
    {
      id: 'draft-reply',
      kind: 'critique',
      title: "Review a new agent's reply",
      summary:
        'Critique a draft reply with a planted security mistake (asking for an OTP) and a false refund promise. Think aloud.',
      timeLimitSec: 420,
      voiceMaxSec: 180,
      preferVoice: false,
      thinkAloud: true,
      scored: true,
      prompt: () => [
        {
          type: 'p',
          text: 'A new agent drafted the reply below. **Name the three most serious problems, most serious first, and say why each matters here.** Then write the first two sentences you would actually send.',
        },
      ],
      material: (ctx) => {
        const v = ctx.variant;
        return [
          { type: 'h', text: 'Customer record' },
          {
            type: 'table',
            columns: ['Field', 'Value'],
            rows: [
              ['Payment method', s(v, 'payMethod')],
              ['Amount', ctx.fmt.money(n(v, 'amount'))],
              ['Refund status', `Initiated yesterday at 11:52 pm. Bank reference ${s(v, 'rrn')}`],
              ['Contacts in the last 24 h', String(n(v, 'contactsBefore'))],
              ['Customer since', '2023, 41 previous orders'],
            ],
          },
          { type: 'h', text: 'Customer message' },
          {
            type: 'quote',
            text: `${ctx.fmt.money(n(v, 'amount'))} was taken from my account and my ${s(v, 'orderNoun')} never happened. This is the THIRD time I am writing. Your app is a scam. I want my money back TODAY or ${s(v, 'complaintThreat')}.`,
          },
          { type: 'h', text: "Agent's draft reply" },
          {
            type: 'quote',
            text: `Dear Customer, we apologise for the inconvenience caused. Your issue is very important to us. The problem was caused by our bank partner's server, which is not in our control. Your refund will be processed within 24 hours. To speed things up, please share your full card number and the OTP you receive so we can verify the transaction. Regards, Support Team`,
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
              `**Asks for a full card number and OTP.** A security failure that trains customers to fall for fraud, and the customer paid by ${s(v, 'payMethod')} anyway. Missing this should score 1 on "catches the critical flaws".`,
              `**Promises 24 hours against a ${n(v, 'refundDays')}-business-day policy.** It guarantees a fourth contact and an angrier customer.`,
              `**Ignores the facts that would calm them.** The refund is already initiated (reference ${s(v, 'rrn')}), and this is their third contact.`,
            ],
          },
          {
            type: 'p',
            text: 'Also: blaming the partner, the generic opener, and no escalation path for the complaint threat. A good rewrite gives the reference number and an honest date, and acknowledges the repeat contacts.',
          },
        ];
      },
      rubric: [
        {
          id: 'critical',
          label: 'Catches the critical flaws',
          weight: 2,
          anchors: [
            'Misses the card number and OTP request.',
            'Catches the OTP request only.',
            'Catches the OTP request and the false 24-hour promise.',
            'Catches both, plus the unused refund reference and repeat contacts.',
          ],
        },
        {
          id: 'severity',
          label: 'Orders by severity',
          weight: 1,
          anchors: [
            'No ordering, or tone issues ranked above security.',
            'Ordering present but unexplained.',
            'Sensible ordering with reasons.',
            'Ordering explained by harm to the customer and the business.',
          ],
        },
        {
          id: 'rewrite',
          label: 'Quality of the rewrite',
          weight: 1,
          anchors: [
            'No rewrite, or it repeats the problems.',
            'Polite but generic.',
            'Specific: gives the reference and an honest timeline.',
            'Specific, human, acknowledges the repeat contacts and offers a clear next step.',
          ],
        },
      ],
      followUps: (ctx) => [
        `The refund policy is ${n(ctx.variant, 'refundDays')} business days, but the customer wants it today. What exactly do you say?`,
        'How would you stop other agents from asking for OTPs from now on?',
      ],
    },
    {
      id: 'agent-macro',
      kind: 'ai_allowed',
      title: 'Agent guidance (AI allowed)',
      summary:
        'Write agent guidance with any AI tool and paste the conversation. Shows how they work with AI, not just whether they use it.',
      timeLimitSec: 540,
      voiceMaxSec: 0,
      preferVoice: false,
      scored: true,
      prompt: () => [
        {
          type: 'p',
          text: 'Use any AI tool you like for this one. We are assessing how you use it, not whether you do.',
        },
        {
          type: 'p',
          text: 'Write the internal guidance (about 150 words) your agents will use today for "money debited, order failed" tickets: what to say, what never to say, and when to escalate.',
        },
        {
          type: 'list',
          ordered: true,
          items: [
            'Paste your final guidance.',
            'Paste your full AI conversation, or write "none".',
            'In 2–3 lines, say what you kept, changed or rejected from the AI and why.',
          ],
        },
      ],
      reviewerGuide: (ctx) => [
        {
          type: 'p',
          text: `Check the facts: refund in ${n(ctx.variant, 'refundDays')} business days, quote the bank reference, never ask for an OTP or card details. Check for escalation rules (double debit, repeat contacts, legal or social threats).`,
        },
        {
          type: 'p',
          text: 'AI drafts commonly promise faster refunds or pad the text with "we apologise for any inconvenience". Did the candidate catch that?',
        },
      ],
      rubric: [
        {
          id: 'judgment',
          label: 'Judgment with AI',
          weight: 2,
          anchors: [
            'Pasted output unchanged, errors kept.',
            'Light edits; did not give the AI the real policy.',
            'Gave the AI the context and fixed its mistakes.',
            'Used AI deliberately and rejected weak suggestions with reasons.',
          ],
        },
        {
          id: 'accuracy',
          label: 'Policy accuracy',
          weight: 1,
          anchors: [
            'Wrong timeline or unsafe instructions.',
            'Mostly right, with gaps.',
            'Accurate timeline, reference and security rules.',
            'Accurate, with clear escalation triggers.',
          ],
        },
        {
          id: 'usable',
          label: 'Usable by agents today',
          weight: 1,
          anchors: [
            'Long or vague.',
            'Usable with effort.',
            'Clear and scannable.',
            'Could be pinned for the team as is.',
          ],
        },
      ],
      followUps: () => [
        'What did the AI get wrong in its first attempt?',
        'Which rule in your guidance matters most, and why?',
      ],
    },
    {
      id: 'real-escalation',
      kind: 'past_work',
      title: 'A real escalation',
      summary:
        'A real situation from their career that got worse before it got better. Checks specificity and ownership.',
      timeLimitSec: 240,
      voiceMaxSec: 150,
      preferVoice: true,
      scored: true,
      prompt: () => [
        {
          type: 'p',
          text: '**Tell us about a time a support situation got worse before it got better while you were responsible for it.** What did you see, what did you do, and what would you do differently?',
        },
        { type: 'p', text: 'Specifics such as numbers and timelines matter more than polish.' },
      ],
      reviewerGuide: () => [
        {
          type: 'p',
          text: 'Async answers here are easy to fabricate. Score specificity now, then verify on the call: rich detail that stays consistent under "why?" follow-ups is the signal.',
        },
      ],
      rubric: [
        {
          id: 'specificity',
          label: 'Specificity',
          weight: 1,
          anchors: [
            'Hypothetical or generic.',
            'A real situation, few specifics.',
            'Concrete numbers, timeline and their own role.',
            'Rich detail: what they saw, options considered and what happened next.',
          ],
        },
        {
          id: 'ownership',
          label: 'Ownership and learning',
          weight: 1,
          anchors: [
            'Blames others or circumstances.',
            'Takes some ownership; lesson is generic.',
            'Clear ownership with a specific lesson.',
            'Clear ownership, and shows how the lesson changed what they do now.',
          ],
        },
      ],
      followUps: () => [
        'What was the number or signal that told you it was getting worse?',
        'Who did you have to disagree with, and how did that go?',
        'What changed in your team afterwards?',
      ],
    },
  ],
};
