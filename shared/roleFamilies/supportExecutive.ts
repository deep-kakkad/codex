import type { Block, RoleFamily, StageContext } from '../types';
import { n, s } from '../variants';
import { ADAPTS, FICTIONAL_CALLOUT, NEXT_STEPS, aiAllowedStage, pastWorkStage, shuffled, warmupStage } from './common';

const SHOPS = [
  {
    company: 'Trendora',
    product: 'fashion shopping app',
    item: 'a pair of sneakers',
    swap: 'size',
    safety: 'The hair dryer I bought sparked and burnt my dressing table. My daughter was standing right there.',
  },
  {
    company: 'Gadgetbay',
    product: 'electronics shopping app',
    item: 'a pair of wireless earbuds',
    swap: 'colour',
    safety: 'The power bank I bought got very hot and started smoking while charging. I unplugged it with a towel.',
  },
  {
    company: 'Glowkart',
    product: 'beauty and personal care app',
    item: 'a vitamin C serum',
    swap: 'variant, for sensitive skin',
    safety: 'The face cream gave me a burning rash and swelling. A doctor told me to stop using it immediately.',
  },
] as const;

const TICKETS = ['hacked', 'safety', 'sla', 'double', 'angry', 'influencer', 'address', 'feedback'] as const;

const OPTIONS = [
  { id: 'refuse', label: 'Politely decline: the return window has closed' },
  { id: 'refund', label: 'Approve a full refund as goodwill' },
  { id: 'credit', label: 'Offer store credit within your goodwill limit' },
  { id: 'escalate', label: 'Escalate to your supervisor to decide' },
];

const ticketIdOf = (v: StageContext['variant'], key: string) => s(v, `${key}Id`);

export const supportExecutive: RoleFamily = {
  id: 'support-executive',
  version: 1,
  name: 'Customer Support Executive',
  roles: [
    'Customer Support Executive',
    'Customer Care Associate',
    'Chat Support Agent',
    'Customer Service Representative',
  ],
  catalog: {
    function: 'Customer support',
    seniority: ['Entry', 'Mid'],
    industries: ['D2C & e-commerce', 'Consumer apps'],
    skills: ['Prioritisation', 'Customer empathy', 'Writing'],
    keywords: ['customer service', 'customer care', 'CSE', 'chat support', 'email support', 'call centre', 'helpdesk'],
  },
  summary:
    'The start of a shift with a mixed queue: spot the safety and fraud tickets under the shouting, handle a refund request outside policy, and fix a teammate’s reply that leaks another customer’s details.',

  warmups: [
    'Tell us about a time a company fixed a problem for you really well. What did they do?',
    'What do you do when you don’t know the answer to a customer’s question?',
    'How do you stay calm when someone is shouting at you?',
  ],

  generate(rng, currency) {
    const inr = currency === 'INR';
    const shop = rng.pick(SHOPS);
    // Distinct, unordered ticket numbers.
    const base = rng.int(40, 48) * 1000;
    const ids = shuffled(
      rng,
      Array.from({ length: 8 }, (_, i) => `T-${base + i * 100 + rng.int(0, 99)}`),
    );
    const order = shuffled(rng, TICKETS);
    const tickets: Record<string, string | number> = {};
    order.forEach((key, i) => {
      tickets[`slot${i}`] = key;
      tickets[`${key}Id`] = ids[i];
    });
    const slaHours = 24;
    return {
      ...shop,
      ...tickets,
      slaHours,
      slaWait: rng.int(20, 22),
      angryMin: rng.int(10, 25),
      addressMin: rng.int(5, 15),
      hackedWait: rng.int(1, 3),
      safetyWait: rng.int(2, 5),
      doubleWait: rng.int(4, 9),
      otherWait: rng.int(6, 12),
      doubleAmount: inr ? rng.pick([7499, 8999, 12499]) : rng.pick([129, 159, 219]),
      itemPrice: inr ? rng.pick([2499, 3299, 4199]) : rng.pick([39, 49, 69]),
      goodwill: inr ? 500 : 10,
      returnDays: 7,
      daysSince: rng.int(9, 11),
      ordersBefore: rng.int(18, 40),
      refundDays: rng.pick([5, 7]),
      followers: rng.pick(['12k', '38k', '55k']),
      deliveryDays: rng.int(3, 5),
      placedDaysAgo: 2,
    };
  },

  brief(ctx) {
    const v = ctx.variant;
    const wait = (key: string) => `${n(v, key)} h`;
    const rows: Record<string, string[]> = {
      hacked: [
        ticketIdOf(v, 'hacked'),
        'Email',
        wait('hackedWait'),
        'There’s an order on my account I didn’t place, delivered to an address I don’t know. My saved card was charged.',
      ],
      safety: [ticketIdOf(v, 'safety'), 'Email', wait('safetyWait'), s(v, 'safety')],
      sla: [
        ticketIdOf(v, 'sla'),
        'Email',
        wait('slaWait'),
        `I asked to exchange ${s(v, 'item')} for a different ${s(v, 'swap')}. Still waiting.`,
      ],
      double: [
        ticketIdOf(v, 'double'),
        'Email',
        wait('doubleWait'),
        `I was charged twice for one order of ${ctx.fmt.money(n(v, 'doubleAmount'))}. Both show in my bank statement.`,
      ],
      angry: [
        ticketIdOf(v, 'angry'),
        'Chat',
        `${n(v, 'angryMin')} min`,
        `WHERE IS MY ORDER??? WORST APP EVER. Placed it ${n(v, 'placedDaysAgo')} days ago!!!`,
      ],
      influencer: [
        ticketIdOf(v, 'influencer'),
        'Instagram DM',
        wait('otherWait'),
        `I have ${s(v, 'followers')} followers. My parcel is a day late. Reply in 1 hour or I post about you.`,
      ],
      address: [
        ticketIdOf(v, 'address'),
        'Chat',
        `${n(v, 'addressMin')} min`,
        'How do I change the delivery address on an order I placed this morning?',
      ],
      feedback: [
        ticketIdOf(v, 'feedback'),
        'Email',
        wait('otherWait'),
        'Suggestion: please add a wishlist sharing feature. Love the app otherwise!',
      ],
    };
    return [
      {
        type: 'p',
        text: `You're a support executive at **${s(v, 'company')}**, a ${s(v, 'product')}. Your shift starts at 9 am. These tickets are waiting for you.`,
      },
      {
        type: 'table',
        caption: 'Your queue at 9 am',
        columns: ['Ticket', 'Channel', 'Waiting', 'Customer message'],
        rows: Array.from({ length: 8 }, (_, i) => rows[s(v, `slot${i}`)]),
      },
      { type: 'h', text: 'Team rules' },
      {
        type: 'list',
        items: [
          `First reply within ${n(v, 'slaHours')} hours on email and Instagram, 1 hour on chat.`,
          'Anything involving safety, injury, account security or fraud goes to the escalations team immediately.',
          `Refunds reach the customer in ${n(v, 'refundDays')} business days. Returns are accepted within ${n(v, 'returnDays')} days of delivery.`,
          `You can give goodwill credit of up to ${ctx.fmt.money(n(v, 'goodwill'))} without approval. Anything more needs your supervisor.`,
          `Standard delivery takes ${n(v, 'deliveryDays')}–${n(v, 'deliveryDays') + 2} days.`,
        ],
      },
      { type: 'callout', text: FICTIONAL_CALLOUT },
    ];
  },

  stages: [
    warmupStage(),
    {
      id: 'queue',
      kind: 'scenario',
      title: 'Which tickets first?',
      summary:
        'Order a mixed queue: safety and fraud tickets hidden among loud but low-risk ones, and one close to breaching its deadline. Think aloud.',
      timeLimitSec: 300,
      voiceMaxSec: 120,
      preferVoice: true,
      thinkAloud: true,
      scored: true,
      prompt: () => [
        {
          type: 'p',
          text: '**Which four tickets do you handle first, in what order, and why?** Use the ticket numbers. Then say which ticket can safely wait the longest.',
        },
      ],
      reviewerGuide: (ctx) => {
        const v = ctx.variant;
        return [
          { type: 'p', text: 'The strongest order:' },
          {
            type: 'list',
            ordered: true,
            items: [
              `**${ticketIdOf(v, 'safety')}** (product sparked, smoked or caused injury) and **${ticketIdOf(v, 'hacked')}** (order nobody placed, card charged): safety and fraud go to escalations immediately; either can come first.`,
              `**${ticketIdOf(v, 'sla')}**: waiting ${n(v, 'slaWait')} of ${n(v, 'slaHours')} hours, about to breach; a quick reply now.`,
              `**${ticketIdOf(v, 'double')}**: a double charge of ${ctx.fmt.money(n(v, 'doubleAmount'))}; real money, needs checking.`,
            ],
          },
          {
            type: 'p',
            text: `The loud ones are traps: **${ticketIdOf(v, 'angry')}** is shouting but was placed ${n(v, 'placedDaysAgo')} days ago and is inside the delivery window (a quick, calm reply, not first). The Instagram threat is low risk. **${ticketIdOf(v, 'feedback')}** (a feature suggestion) can wait longest.`,
          },
        ];
      },
      rubric: [
        {
          id: 'risk',
          label: 'Puts safety and fraud first',
          weight: 2,
          anchors: [
            'Misses the safety or fraud ticket.',
            'Gets one of them near the top.',
            'Both in the first two.',
            'Both first, and says they go to escalations, not handled alone.',
          ],
        },
        {
          id: 'order',
          label: 'Sensible order for the rest',
          weight: 1,
          anchors: [
            'Loudest first.',
            'Some logic, misses the deadline.',
            'Catches the ticket about to breach and the double charge.',
            'Uses waiting times and the rules to justify each place.',
          ],
        },
        {
          id: 'calm',
          label: 'Not pushed around by tone',
          weight: 1,
          anchors: [
            'Prioritises the shouting or the follower count.',
            'Hesitates over them.',
            'Explains why the loud tickets are lower risk.',
            'Explains it and says how to reply to them quickly and calmly.',
          ],
        },
      ],
      followUps: (ctx) => [
        `What exactly would you write back on ${ticketIdOf(ctx.variant, 'angry')}?`,
        'Why does the safety ticket go to escalations instead of you handling it?',
      ],
    },
    {
      id: 'late-return',
      kind: 'decision',
      title: 'A return after the window',
      summary:
        'A loyal customer asks for a refund two days past the return window. Tests policy judgement and authority. Think aloud.',
      timeLimitSec: 300,
      voiceMaxSec: 150,
      preferVoice: true,
      thinkAloud: true,
      scored: true,
      choices: OPTIONS,
      prompt: (ctx) => {
        const v = ctx.variant;
        return [
          {
            type: 'p',
            text: `A customer bought ${s(v, 'item')} for ${ctx.fmt.money(n(v, 'itemPrice'))}. It was delivered ${n(v, 'daysSince')} days ago, so the ${n(v, 'returnDays')}-day return window has closed. They say they were travelling and only opened it yesterday; it doesn't fit. They have placed ${n(v, 'ordersBefore')} orders before and never returned anything.`,
          },
          { type: 'p', text: '**What do you do?** Pick one, then write the first two sentences of your reply.' },
        ];
      },
      reviewerGuide: (ctx) => {
        const v = ctx.variant;
        return [
          {
            type: 'p',
            text: `The refund (${ctx.fmt.money(n(v, 'itemPrice'))}) is above their goodwill limit (${ctx.fmt.money(n(v, 'goodwill'))}), so approving it alone breaks the rules. Store credit within the limit, or escalating with a recommendation, are the strongest; declining politely is defensible but ignores a loyal customer (${n(v, 'ordersBefore')} orders, no returns).`,
          },
          {
            type: 'p',
            text: "Look for: knowing their authority, weighing the customer's value, and a reply that is warm and honest without promising what they can't give.",
          },
        ];
      },
      rubric: [
        {
          id: 'judgement',
          label: 'Policy judgement',
          weight: 2,
          anchors: [
            'Breaks the rules or refuses rigidly with no thought.',
            'A defensible choice, little reasoning.',
            'Weighs the policy, the limit and the customer.',
            'Weighs them and says what they would recommend to the supervisor and why.',
          ],
        },
        {
          id: 'reply',
          label: 'The reply',
          weight: 1,
          anchors: [
            'Cold, scripted or promises too much.',
            'Polite but generic.',
            'Warm, honest, clear next step.',
            'Warm, honest, uses their history, clear next step.',
          ],
        },
        {
          id: 'authority',
          label: 'Knows their authority',
          weight: 1,
          anchors: [
            'Ignores the limit.',
            'Unsure.',
            'Stays within the limit or escalates.',
            'Uses the limit well and explains it to the customer.',
          ],
        },
      ],
      followUps: (_ctx, answer) => [
        `You chose "${answer.choiceLabel ?? 'your option'}". What if the customer said a friend at another shop got a refund in the same situation?`,
        'When is it right to bend a rule for a customer?',
      ],
    },
    {
      id: 'their-answer',
      kind: 'branch',
      title: 'The customer replies',
      summary: 'The customer reacts to their choice. Tests calm, follow-through and honesty.',
      timeLimitSec: 300,
      voiceMaxSec: 120,
      preferVoice: true,
      scored: true,
      dependsOn: 'late-return',
      prompt: (ctx) => {
        const v = ctx.variant;
        const byChoice: Record<string, Block[]> = {
          refuse: [
            {
              type: 'p',
              text: `The customer replies: "${n(v, 'ordersBefore')} orders and this is how you treat me? Deleting the app." They've also posted a one-star review mentioning your name.`,
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
          refund: [
            {
              type: 'p',
              text: `Your supervisor sees the refund in a daily report and asks you to explain why you approved ${ctx.fmt.money(n(v, 'itemPrice'))} without approval, since your limit is ${ctx.fmt.money(n(v, 'goodwill'))}.`,
            },
            { type: 'p', text: '**What do you say, and what do you do differently?**' },
          ],
          credit: [
            {
              type: 'p',
              text: `The customer says the credit is "useless, I just want my money back", and asks to speak to "someone senior". Your supervisor is in a meeting for the next two hours.`,
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
          escalate: [
            {
              type: 'p',
              text: `Your supervisor replies: "Busy today, use your judgement." Meanwhile the customer has messaged twice asking for an update.`,
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
        };
        return byChoice[ctx.choices['late-return'] ?? 'escalate'] ?? byChoice.escalate;
      },
      reviewerGuide: (ctx) => {
        const guides: Record<string, string> = {
          refuse:
            'Strong: stay calm, acknowledge the frustration, check whether there is any option within authority (credit) or ask the supervisor about an exception for a loyal customer, and respond to the review professionally without arguing. Weak: argues or ignores.',
          refund:
            'Tests honesty and learning. Strong: own it plainly, explain the reasoning (loyal customer), accept the rule, and say how they would handle it next time (ask first, or offer credit). Weak: excuses or blames the customer.',
          credit:
            "Strong: acknowledge, explain honestly what they can do now, set a clear time for the supervisor's call-back and log the request, rather than promising a refund. Weak: gives in beyond authority or stonewalls.",
          escalate:
            'Strong: make a decision within their authority (credit up to the limit) or a clear recommendation, update the customer now with a timeline, and note it for the supervisor. Weak: leaves the customer waiting.',
        };
        const choice = ctx.choices['late-return'] ?? 'escalate';
        return [
          { type: 'p', text: `They chose **${OPTIONS.find((o) => o.id === choice)?.label ?? choice}**.` },
          { type: 'p', text: guides[choice] ?? guides.escalate },
        ];
      },
      rubric: [ADAPTS, NEXT_STEPS],
      followUps: () => [
        'What would you write in the internal note on this ticket?',
        'What would you do differently from the start?',
      ],
    },
    {
      id: 'teammate-reply',
      kind: 'critique',
      title: "Check a teammate's reply",
      summary:
        "A reply that leaks another customer's details, promises the wrong refund time and blames the courier. Think aloud.",
      timeLimitSec: 360,
      voiceMaxSec: 150,
      preferVoice: false,
      thinkAloud: true,
      scored: true,
      prompt: () => [
        {
          type: 'p',
          text: 'A new teammate asks you to check this reply to the double-charge ticket before sending. **Name the problems, worst first, and why each matters.** Then write your version.',
        },
      ],
      material: (ctx) => {
        const v = ctx.variant;
        return [
          { type: 'h', text: `Draft reply to ${ticketIdOf(v, 'double')}` },
          {
            type: 'quote',
            text: `Hi! Sorry for the trouble 😊 This happened because the courier's payment system had a glitch, not our fault. I can see the same thing happened to Rohit Sharma (order #A-88213, rohit.s@mailbox.com) yesterday, so you're not alone! Your extra ${ctx.fmt.money(n(v, 'doubleAmount'))} will be back in your account within 24 hours. Have a great day!`,
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
              '**Shares another customer\'s name, order and email.** A privacy breach; the most serious problem. Missing it caps "catches the problems" at 1.',
              `**Wrong refund time:** promises 24 hours; the rule is ${n(v, 'refundDays')} business days. Guarantees another angry contact.`,
              '**Blames the courier and says "not our fault".** It\'s our payment, and blaming doesn\'t help the customer.',
              'No reference number or next step, and an emoji that reads as flippant about a large double charge.',
            ],
          },
          {
            type: 'p',
            text: 'Decoy: being friendly is fine. A good rewrite apologises, confirms the double charge, gives the honest timeline and a reference.',
          },
        ];
      },
      rubric: [
        {
          id: 'critical',
          label: 'Catches the problems',
          weight: 2,
          anchors: [
            "Misses the other customer's details.",
            'Catches the privacy leak only.',
            'Catches the leak and the wrong refund time.',
            'Catches both and the blame, with why each matters.',
          ],
        },
        {
          id: 'severity',
          label: 'Orders by harm',
          weight: 1,
          anchors: [
            'Tone or emoji first.',
            'Unexplained order.',
            'Privacy first, with reasons.',
            'Ordered by harm to customers and the company, explained.',
          ],
        },
        {
          id: 'rewrite',
          label: 'The rewrite',
          weight: 1,
          anchors: [
            'Missing or repeats the problems.',
            'Correct but stiff.',
            'Correct, warm and clear.',
            'Correct, warm, gives a reference and sets expectations.',
          ],
        },
      ],
      followUps: () => [
        'How would you tell your teammate about the privacy problem?',
        'What should happen now that this kind of mistake is possible?',
      ],
    },
    aiAllowedStage({
      id: 'long-email',
      title: 'Reply to a long complaint (AI allowed)',
      summary: 'Answer a multi-issue complaint with AI. Catches over-promising and padded apologies.',
      timeLimitSec: 480,
      task: (ctx) => [
        {
          type: 'p',
          text: `A customer wrote 400 words: their order arrived late, one item was missing, the chat bot "went in circles", and they want compensation. Write the reply (under 150 words). Rules: refunds take ${n(ctx.variant, 'refundDays')} business days; your goodwill limit is ${ctx.fmt.money(n(ctx.variant, 'goodwill'))}.`,
        },
      ],
      guide: (ctx) => [
        {
          type: 'p',
          text: `A strong reply addresses each issue once, gives the right refund time (${n(ctx.variant, 'refundDays')} business days) for the missing item, offers goodwill within ${ctx.fmt.money(n(ctx.variant, 'goodwill'))}, and stays short.`,
        },
        {
          type: 'p',
          text: 'AI drafts commonly over-apologise, promise "immediate" refunds or compensation beyond the limit, and run long. Did the candidate fix that?',
        },
      ],
      accuracy: {
        id: 'accuracy',
        label: 'Within policy',
        weight: 1,
        anchors: [
          'Wrong timeline or promises too much.',
          'Mostly right.',
          'Correct timeline and limit.',
          'Correct, and covers every issue the customer raised.',
        ],
      },
      usable: {
        id: 'usable',
        label: 'Ready to send',
        weight: 1,
        anchors: [
          'Long or robotic.',
          'Usable with edits.',
          'Clear and human.',
          'The customer would feel heard and know what happens next.',
        ],
      },
    }),
    pastWorkStage({
      id: 'difficult-customer',
      title: 'A difficult customer',
      summary: 'A real difficult customer they handled. Checks specificity and ownership.',
      question: 'Tell us about a customer you found difficult to help, and what you did.',
    }),
  ],
};
