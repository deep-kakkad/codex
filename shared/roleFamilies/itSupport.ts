import type { Block, RoleFamily, StageContext } from '../types';
import { n, s } from '../variants';
import { ADAPTS, FICTIONAL_CALLOUT, NEXT_STEPS, aiAllowedStage, pastWorkStage, shuffled, warmupStage } from './common';

const COMPANIES = [
  { company: 'Mosaic Design Studio', kind: 'design agency' },
  { company: 'Northstar Consulting', kind: 'consulting firm' },
  { company: 'Greenleaf Pharma', kind: 'pharmaceutical distributor' },
] as const;

const TICKETS = ['phish', 'vpn', 'ceo', 'joiner', 'printer', 'resets', 'laptop', 'software'] as const;

const OPTIONS = [
  { id: 'contain', label: 'Reset the affected accounts, check their mailboxes and block the sender' },
  { id: 'everyone', label: 'Force a password reset for the whole company now' },
  { id: 'warn', label: 'Send a company-wide warning email and watch' },
  { id: 'vendor', label: 'Wait for the security vendor, who responds in four hours' },
];

const id = (v: StageContext['variant'], key: string) => s(v, `${key}Id`);

export const itSupport: RoleFamily = {
  id: 'it-support',
  version: 1,
  name: 'IT Support / Helpdesk',
  roles: ['IT Support Engineer', 'Helpdesk Technician', 'Desktop Support Engineer', 'IT Administrator'],
  catalog: {
    function: 'Data & tech',
    seniority: ['Entry', 'Mid'],
    industries: ['Services', 'Any'],
    skills: ['Prioritisation', 'Judgement', 'Communication'],
    keywords: ['IT support', 'helpdesk', 'service desk', 'L1', 'L2', 'desktop support', 'sysadmin', 'IT admin'],
  },
  summary:
    'Monday 9 am: a phishing email someone typed their password into, a VPN outage and the CEO’s board meeting. Triage it, contain the phishing, and catch the hole in the password reset process.',

  warmups: [
    'What is the most useful thing you have taught someone about technology?',
    'Tell us about a tech problem you solved at home or for family.',
    'How do you explain a technical problem to someone who isn’t technical?',
  ],

  generate(rng) {
    const co = rng.pick(COMPANIES);
    const base = rng.int(2100, 2800);
    const ids = shuffled(
      rng,
      TICKETS.map((_, i) => `#${base + i * 7 + rng.int(0, 5)}`),
    );
    const order = shuffled(rng, TICKETS);
    const slots: Record<string, string> = {};
    order.forEach((key, i) => {
      slots[`slot${i}`] = key;
      slots[`${key}Id`] = ids[i];
    });
    return {
      ...co,
      ...slots,
      staff: rng.int(220, 340),
      remote: rng.int(35, 60),
      reported: rng.int(3, 6),
      clicked: rng.int(2, 3),
      boardMins: rng.pick([40, 50, 60]),
      resets: rng.int(4, 7),
      vendorHours: 4,
      forwardingRuleTo: rng.pick(['invoices.desk@ma1lbox.co', 'accounts-team@out1ook-mail.com']),
      outageMins: rng.int(25, 40),
      lockedOut: rng.int(30, 60),
    };
  },

  brief(ctx) {
    const v = ctx.variant;
    const rows: Record<string, string[]> = {
      phish: [
        id(v, 'phish'),
        `${n(v, 'reported')} people`,
        `"Got an email from 'HR' about a salary revision with a login link. I clicked it and entered my password, then got suspicious." (Others say they clicked but didn't log in.)`,
      ],
      vpn: [
        id(v, 'vpn'),
        `${n(v, 'remote')} remote staff`,
        `VPN won't connect for anyone working from home since ${8 + Math.floor(n(v, 'outageMins') / 60)}:${String(n(v, 'outageMins') % 60).padStart(2, '0')} am.`,
      ],
      ceo: [
        id(v, 'ceo'),
        'CEO’s assistant',
        `The CEO's laptop won't show on the boardroom screen. Board meeting starts in ${n(v, 'boardMins')} minutes.`,
      ],
      joiner: [id(v, 'joiner'), 'HR', "A new joiner started today and can't log in to anything."],
      printer: [id(v, 'printer'), 'Accounts', 'Printer on floor 2 is jammed again.'],
      resets: [id(v, 'resets'), `${n(v, 'resets')} people`, 'Forgot password / account locked.'],
      laptop: [id(v, 'laptop'), 'Design team', 'Laptop is "very slow" since last week.'],
      software: [id(v, 'software'), 'Marketing', 'Please install a screen recording tool.'],
    };
    return [
      {
        type: 'p',
        text: `You're on the IT support team at **${s(v, 'company')}**, a ${s(v, 'kind')} with ${n(v, 'staff')} staff. There are two of you today; your colleague is at the other office until noon. It's 9 am on Monday.`,
      },
      {
        type: 'table',
        caption: 'Open tickets',
        columns: ['Ticket', 'From', 'Problem'],
        rows: Array.from({ length: 8 }, (_, i) => rows[s(v, `slot${i}`)]),
      },
      { type: 'callout', text: FICTIONAL_CALLOUT },
    ];
  },

  stages: [
    warmupStage(),
    {
      id: 'triage',
      kind: 'scenario',
      title: 'Monday 9 am',
      summary:
        "Order a queue with a security incident, an outage for remote staff and the CEO's deadline. Think aloud.",
      timeLimitSec: 300,
      voiceMaxSec: 120,
      preferVoice: true,
      thinkAloud: true,
      scored: true,
      prompt: () => [
        {
          type: 'p',
          text: '**What do you do in the next hour, in what order, and why?** Use the ticket numbers. Say what can wait until your colleague is back.',
        },
      ],
      reviewerGuide: (ctx) => {
        const v = ctx.variant;
        return [
          {
            type: 'list',
            ordered: true,
            items: [
              `**${id(v, 'phish')}**: someone typed their password into a phishing page. A live security incident; every minute the attacker can use that account. Contain first (reset, sign out sessions, check for forwarding rules).`,
              `**${id(v, 'vpn')}**: ${n(v, 'remote')} people can't work. Quick checks and a status message to them right away, even before it's fixed.`,
              `**${id(v, 'ceo')}**: time-bound (${n(v, 'boardMins')} minutes); often a quick fix (cable, display settings) or a backup laptop.`,
            ],
          },
          {
            type: 'p',
            text: "The new joiner and password resets come next. The printer, slow laptop and software install can wait. Some candidates put the CEO first; that's defensible only if the phishing is contained within minutes. Weak answers start with the CEO or the easy tickets and leave the phishing for later.",
          },
        ];
      },
      rubric: [
        {
          id: 'security',
          label: 'Treats the phishing as urgent',
          weight: 2,
          anchors: [
            'Leaves it for later or treats it as routine.',
            'Puts it high but vague about what to do.',
            'Handles it first, with containment steps.',
            'First, with specific containment and a check of what the attacker may have done.',
          ],
        },
        {
          id: 'impact',
          label: 'Orders by business impact',
          weight: 1,
          anchors: [
            'Order by ticket age or ease.',
            'Some logic.',
            'Weighs people affected and deadlines.',
            'Weighs them and communicates to those waiting.',
          ],
        },
        {
          id: 'communication',
          label: 'Keeps people informed',
          weight: 1,
          anchors: [
            'No updates.',
            'Updates only when fixed.',
            "Quick status to the VPN users and CEO's assistant.",
            'Clear updates with what to do meanwhile.',
          ],
        },
      ],
      followUps: (ctx) => [
        `What exactly would you check in the mailbox of the person who entered their password?`,
        `If the CEO's assistant called while you were on ${id(ctx.variant, 'phish')}, what would you say?`,
      ],
    },
    {
      id: 'contain',
      kind: 'decision',
      title: 'The phishing email',
      summary: 'Choose how to respond to a phishing incident with one password entered. Think aloud.',
      timeLimitSec: 300,
      voiceMaxSec: 150,
      preferVoice: true,
      thinkAloud: true,
      scored: true,
      choices: OPTIONS,
      prompt: (ctx) => [
        {
          type: 'p',
          text: `${n(ctx.variant, 'reported')} people reported the email; one entered their password, ${n(ctx.variant, 'clicked')} others clicked the link. You don't know how many others received it. **How do you respond?** Pick one, then list your first five actions.`,
        },
      ],
      reviewerGuide: () => [
        {
          type: 'p',
          text: 'Containing the affected accounts is the strongest: reset the password and sign out every session for the person who entered it, check and remove any mailbox rules (attackers often add forwarding), check sign-in logs, block the sender and link, search for and pull the email from other mailboxes, warn staff with a short note, and tell the security vendor. A company-wide reset is heavy (lockouts, a flood of tickets) and still misses rules and sessions. A warning alone leaves the compromised account open. Waiting four hours gives the attacker four hours.',
        },
      ],
      rubric: [
        {
          id: 'containment',
          label: 'Contains the incident',
          weight: 2,
          anchors: [
            'No containment.',
            'Resets a password only.',
            'Resets, signs out sessions and blocks the sender.',
            'All of that plus mailbox rules, logs and pulling the email from other inboxes.',
          ],
        },
        {
          id: 'proportion',
          label: 'Proportionate response',
          weight: 1,
          anchors: [
            'Panics or does nothing.',
            'Over- or under-reacts.',
            'Proportionate, with reasons.',
            'Proportionate, and knows when to escalate further.',
          ],
        },
      ],
      followUps: (_ctx, answer) => [
        `You chose "${answer.choiceLabel ?? 'your approach'}". What would make you escalate to a company-wide reset?`,
        'How would you tell the person who entered their password, without making them feel stupid?',
      ],
    },
    {
      id: 'later',
      kind: 'branch',
      title: 'An hour later',
      summary: 'What their response led to. Tests adapting during an incident.',
      timeLimitSec: 300,
      voiceMaxSec: 120,
      preferVoice: true,
      scored: true,
      dependsOn: 'contain',
      prompt: (ctx) => {
        const v = ctx.variant;
        const byChoice: Record<string, Block[]> = {
          contain: [
            {
              type: 'p',
              text: `In the compromised mailbox you find a rule forwarding every email containing "invoice" to ${s(v, 'forwardingRuleTo')}, created at 7:12 am. Finance says a supplier emailed new bank details this morning.`,
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
          everyone: [
            {
              type: 'p',
              text: `${n(v, 'lockedOut')} people are locked out and calling. The board meeting has started without the CEO's slides. You haven't yet looked at the compromised mailbox.`,
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
          warn: [
            {
              type: 'p',
              text: `After the warning, two more people say they entered their passwords last week. And the compromised account has sent the same phishing email to ${s(v, 'company')}'s clients.`,
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
          vendor: [
            {
              type: 'p',
              text: `While you waited, the compromised account sent the phishing email to the whole company and to clients. The vendor's first response is "please send us the logs".`,
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
        };
        return byChoice[ctx.choices.contain ?? 'contain'] ?? byChoice.contain;
      },
      reviewerGuide: (ctx) => {
        const guides: Record<string, string> = {
          contain:
            'The forwarding rule plus "new bank details" is a likely invoice fraud attempt. Strong: delete the rule, alert Finance immediately not to pay or change bank details without a phone call to a known number, check other mailboxes for the same rule, preserve evidence and escalate to the vendor and management. Weak: removes the rule and moves on.',
          everyone:
            'Strong: own the overload, prioritise containing the actual compromised mailbox, set up a quick self-service or batch unlock, communicate one clear message. Weak: handles lockouts one by one and leaves the mailbox.',
          warn: 'The incident has grown. Strong: contain all affected accounts now, tell clients quickly and plainly not to click, escalate to management and the vendor. Weak: another warning email.',
          vendor:
            'Strong: contain now without waiting, warn clients and staff, gather the logs, and own the delay. Weak: keeps waiting.',
        };
        const choice = ctx.choices.contain ?? 'contain';
        return [
          { type: 'p', text: `They chose **${OPTIONS.find((o) => o.id === choice)?.label ?? choice}**.` },
          { type: 'p', text: guides[choice] ?? guides.contain },
        ];
      },
      rubric: [ADAPTS, NEXT_STEPS],
      followUps: () => [
        'Who would you inform, in what order?',
        'What would you change so this is caught sooner next time?',
      ],
    },
    {
      id: 'reset-process',
      kind: 'critique',
      title: 'Review the password reset process',
      summary:
        'A phone reset process that verifies people with public information and reads passwords aloud. Think aloud.',
      timeLimitSec: 360,
      voiceMaxSec: 150,
      preferVoice: false,
      thinkAloud: true,
      scored: true,
      prompt: () => [
        {
          type: 'p',
          text: 'Your manager asks you to review the current phone process for password resets. **Name the problems, worst first, and how each could be abused.** Then write the process you would use instead.',
        },
      ],
      material: () => [
        { type: 'h', text: 'Process: password reset by phone' },
        {
          type: 'list',
          ordered: true,
          items: [
            'Caller gives their full name and employee ID.',
            'If they match the directory, reset the password to Welcome@123 and read it out on the call.',
            'Tell them to change it "when they get a chance".',
            'For senior staff, skip the checks if the caller sounds stressed and says it is urgent.',
            'Log the ticket number in the helpdesk tool.',
          ],
        },
      ],
      reviewerGuide: () => [
        { type: 'p', text: 'Planted problems:' },
        {
          type: 'list',
          items: [
            '**Identity check uses public information.** Names and employee IDs are on email signatures and badges; anyone can pass. Verify through a known channel (call back on the number in the directory, a code sent to their registered phone, or their manager).',
            '**Skipping checks for urgent senior staff** is exactly what social engineers exploit ("the CFO needs access now").',
            '**A shared, guessable default password read aloud,** with no forced change at next login.',
          ],
        },
        { type: 'p', text: 'Decoy: logging the ticket is correct. Calling it a problem is a weak signal.' },
      ],
      rubric: [
        {
          id: 'critical',
          label: 'Catches the security holes',
          weight: 2,
          anchors: [
            'Misses the weak identity check.',
            'Catches one hole.',
            'Catches the identity check and the urgency bypass.',
            'Catches all three with how an attacker would use each.',
          ],
        },
        {
          id: 'fix',
          label: 'A safer process',
          weight: 1,
          anchors: [
            'None or vague.',
            'Partly safer.',
            'Verification through a known channel and forced change.',
            "Safe, practical and quick enough that people won't bypass it.",
          ],
        },
        {
          id: 'severity',
          label: 'Orders by risk',
          weight: 1,
          anchors: [
            'Decoy first.',
            'Unexplained.',
            'Sensible order.',
            'Ordered by how easily it could be abused, explained.',
          ],
        },
      ],
      followUps: () => [
        'What would you say to a senior leader who refuses the new checks?',
        'How would you test whether the team follows the new process?',
      ],
    },
    aiAllowedStage({
      id: 'status-update',
      title: 'VPN outage update (AI allowed)',
      summary: 'Write the staff update about the VPN outage with AI. Catches jargon and invented fix times.',
      timeLimitSec: 420,
      task: (ctx) => [
        {
          type: 'p',
          text: `Write the message to the ${n(ctx.variant, 'remote')} remote staff (under 100 words): what's happening, what they can do meanwhile, and when they'll hear next. You don't yet know the cause.`,
        },
      ],
      guide: () => [
        {
          type: 'p',
          text: 'A strong update is plain, admits the cause is unknown, gives a workaround (e.g. use the web versions of email and files, or come in if close), and promises the next update at a specific time rather than a fix time.',
        },
        {
          type: 'p',
          text: 'AI drafts typically add jargon ("IPSec tunnel negotiation failure"), invent a fix time ("resolved within 30 minutes") or a cause. Did the candidate remove those?',
        },
      ],
      accuracy: {
        id: 'accuracy',
        label: 'Honest and useful',
        weight: 1,
        anchors: [
          'Invented cause or fix time.',
          'Vague.',
          'Honest, with a workaround.',
          'Honest, workaround, and a time for the next update.',
        ],
      },
      usable: {
        id: 'usable',
        label: 'Plain and short',
        weight: 1,
        anchors: [
          'Jargon-heavy or long.',
          'Usable with edits.',
          'Plain and short.',
          'Anyone could act on it in ten seconds.',
        ],
      },
    }),
    pastWorkStage({
      id: 'incident',
      title: 'An incident you handled',
      summary: 'A real outage or security problem they handled. Checks specificity and ownership.',
      question: 'Tell us about an outage or security problem you had to handle.',
    }),
  ],
};
