import type { Block, RoleFamily, StageContext } from '../types';
import { n, s } from '../variants';
import { ADAPTS, FICTIONAL_CALLOUT, NEXT_STEPS, aiAllowedStage, pastWorkStage, shuffled, warmupStage } from './common';

const SELLERS = [
  {
    company: 'LedgerLoop',
    product: 'accounts-payable automation software',
    buyerTitle: 'Head of Finance',
    hireRole: 'accounts payable executives',
    competitor: 'PayFlow Pro',
    industry: 'Manufacturing',
    pain: 'invoices processed by hand',
  },
  {
    company: 'ShiftWise',
    product: 'staff scheduling and attendance software',
    buyerTitle: 'Head of Operations',
    hireRole: 'shift supervisors',
    competitor: 'RosterHub',
    industry: 'Retail chains',
    pain: 'rosters built in spreadsheets',
  },
  {
    company: 'HireLoop',
    product: 'applicant tracking software',
    buyerTitle: 'Head of Talent Acquisition',
    hireRole: 'recruiters',
    competitor: 'TalentDesk',
    industry: 'IT services',
    pain: 'CVs tracked over email and spreadsheets',
  },
  {
    company: 'FleetSense',
    product: 'fleet tracking and trip costing software',
    buyerTitle: 'Head of Logistics',
    hireRole: 'fleet coordinators',
    competitor: 'TrackMate',
    industry: 'Logistics',
    pain: 'trip costs reconciled by hand',
  },
] as const;

/** Names that don't suggest an industry, so they sit in any seller's list. */
const ACCOUNT_NAMES = [
  'Shreeji Industries',
  'Konark Enterprises',
  'Aarav Group',
  'Nimbus Ventures',
  'Sahyadri Holdings',
  'Trident Works',
  'Bluepeak Corp',
  'Orbit Industries',
  'Meridian Enterprises',
  'Lotus Group',
  'Pinnacle Works',
  'Vardhan & Sons',
];
const GOVERNMENT_NAMES = ['District Development Office', 'State Transport Department', 'Municipal Water Board'];

/** The eight leads: three strong, two tempting traps, three middling. */
const ARCHETYPES = ['hiring', 'funded', 'renewal', 'giant', 'opener', 'nobuyer', 'officp', 'stale'] as const;

const PLAYS = [
  { id: 'blast', label: 'Load a bought list of 600 contacts into a generic four-step email sequence' },
  { id: 'research', label: 'Research 60 accounts with a fresh trigger and write to each one personally' },
  { id: 'calls', label: 'Call the 150 inbound leads from the last six months' },
  { id: 'referrals', label: 'Ask 20 happy customers for an introduction to a peer' },
];

const lead = (v: StageContext['variant'], i: number, key: string) => s(v, `lead${i}${key}`);

function leadTable(ctx: StageContext): Block {
  const v = ctx.variant;
  return {
    type: 'table',
    caption: 'Your lead list for this week',
    columns: ['Company', 'Employees', 'Industry', 'Contact', 'Signal in the last 30 days'],
    rows: Array.from({ length: 8 }, (_, i) => [
      lead(v, i, 'Name'),
      ctx.fmt.num(n(v, `lead${i}Emp`)),
      lead(v, i, 'Industry'),
      lead(v, i, 'Contact'),
      lead(v, i, 'Signal'),
    ]),
  };
}

/** The lead built from one archetype, by name. */
function nameOf(v: StageContext['variant'], archetype: string) {
  return s(v, `${archetype}Name`);
}

/** Expected qualified meetings from each play, from the benchmarks in the brief. */
export function sdrPlayMath(v: StageContext['variant']) {
  const r = (x: number) => Math.round(x * 10) / 10;
  const blastMeetings = (600 * n(v, 'blastReply') * 0.3) / 100;
  const researchMeetings = (60 * n(v, 'researchReply') * 0.5) / 100;
  const callMeetings = (150 * n(v, 'connectPct') * 0.25) / 100;
  const referralMeetings = (20 * n(v, 'introPct') * 0.7) / 100;
  return {
    blast: { meetings: r(blastMeetings), qualified: r(blastMeetings * 0.4) },
    research: { meetings: r(researchMeetings), qualified: r(researchMeetings * 0.85) },
    calls: { meetings: r(callMeetings), qualified: r(callMeetings * 0.5) },
    referrals: { meetings: r(referralMeetings), qualified: r(referralMeetings * 0.9) },
  };
}

export const sdr: RoleFamily = {
  id: 'sales-sdr',
  version: 1,
  name: 'Sales Development (SDR / BDR)',
  roles: ['Sales Development Representative', 'Business Development Representative', 'Inside Sales Executive (B2B)'],
  catalog: {
    function: 'Sales',
    seniority: ['Entry', 'Mid'],
    industries: ['SaaS', 'Services'],
    skills: ['Prioritisation', 'Writing', 'Numbers'],
    keywords: ['SDR', 'BDR', 'lead generation', 'outbound', 'cold calling', 'prospecting', 'business development'],
  },
  summary:
    'Behind on meetings with two weeks left: pick the right leads from a list full of traps, choose one outbound play, and fix a teammate’s cold email that gets the prospect’s funding round wrong.',

  warmups: [
    'What is the best sales email or call you have ever received, and why did it work on you?',
    'Tell us about something you sold or persuaded someone to do outside work.',
    'What do you say in the first ten seconds of a cold call, and why?',
  ],

  generate(rng, currency) {
    const inr = currency === 'INR';
    const seller = rng.pick(SELLERS);
    const names = shuffled(rng, ACCOUNT_NAMES).slice(0, 8);
    const order = shuffled(rng, ARCHETYPES);
    const buyer = seller.buyerTitle;
    const round = inr ? rng.pick(['₹18 crore', '₹24 crore', '₹32 crore']) : rng.pick(['$2.5M', '$3M', '$4M']);
    const spec: Record<
      (typeof ARCHETYPES)[number],
      { emp: number; industry: string; contact: string; signal: string }
    > = {
      hiring: {
        emp: rng.int(12, 26) * 10,
        industry: seller.industry,
        contact: buyer,
        signal: `Posted ${rng.int(3, 5)} job openings for ${seller.hireRole} this week`,
      },
      funded: {
        emp: rng.int(6, 14) * 10,
        industry: seller.industry,
        contact: buyer,
        signal: `Raised a Series A (${round}) last month; visited your pricing page twice`,
      },
      renewal: {
        emp: rng.int(25, 45) * 10,
        industry: seller.industry,
        contact: buyer,
        signal: `Uses ${seller.competitor}; review sites say they're unhappy, and the contract renews next month`,
      },
      giant: {
        emp: rng.int(60, 85) * 100,
        industry: `${seller.industry} (group of 14 companies)`,
        contact: 'VP, Group Shared Services',
        signal: 'Famous logo your CEO keeps mentioning; built their own system in-house last year',
      },
      opener: {
        emp: rng.int(3, 6),
        industry: seller.industry,
        contact: 'Intern',
        signal: `Opened your emails ${rng.int(6, 9)} times`,
      },
      nobuyer: {
        emp: rng.int(15, 30) * 10,
        industry: seller.industry,
        contact: 'Office Manager',
        signal: 'No activity',
      },
      officp: {
        emp: rng.int(35, 50) * 10,
        industry: 'State government department',
        contact: buyer,
        signal: 'Downloaded your buyer’s guide',
      },
      stale: {
        emp: rng.int(7, 12) * 10,
        industry: seller.industry,
        contact: buyer,
        signal: 'Downloaded a guide five months ago; no reply since',
      },
    };
    const leads: Record<string, string | number> = {};
    const government = rng.pick(GOVERNMENT_NAMES);
    order.forEach((archetype, i) => {
      const row = spec[archetype];
      const name = archetype === 'officp' ? government : names[i];
      leads[`lead${i}Name`] = name;
      leads[`lead${i}Emp`] = row.emp;
      leads[`lead${i}Industry`] = row.industry;
      leads[`lead${i}Contact`] = row.contact;
      leads[`lead${i}Signal`] = row.signal;
      leads[`${archetype}Name`] = name;
    });
    const booked = rng.int(4, 6);
    return {
      ...seller,
      ...leads,
      round,
      quota: 12,
      booked,
      gap: 12 - booked,
      daysLeft: rng.int(9, 11),
      blastReply: rng.pick([1.2, 1.5, 1.8]),
      researchReply: rng.pick([10, 12, 14]),
      connectPct: rng.pick([8, 10, 12]),
      introPct: rng.pick([20, 25, 30]),
      emailsPerHour: rng.pick([4, 5]),
      unsubscribes: rng.int(9, 18),
      openBefore: rng.int(44, 52),
      openAfter: rng.int(17, 24),
      writtenSoFar: rng.int(20, 28),
      switchboardPct: rng.int(55, 70),
      agreeIntros: rng.int(5, 7),
      dealSize: inr ? rng.pick([480000, 720000, 960000]) : rng.pick([9000, 14000, 18000]),
    };
  },

  brief(ctx) {
    const v = ctx.variant;
    return [
      {
        type: 'p',
        text: `You're an SDR at **${s(v, 'company')}**, which sells ${s(v, 'product')} to ${s(v, 'industry').toLowerCase()} companies with **50 to 500 employees**. Your buyer is usually the ${s(v, 'buyerTitle')}. Typical deal: ${ctx.fmt.money(n(v, 'dealSize'))} a year.`,
      },
      {
        type: 'p',
        text: `Your target is **${n(v, 'quota')} qualified meetings** this month. You have **${n(v, 'booked')}**, with **${n(v, 'daysLeft')} working days** left. A meeting counts as qualified when the AE confirms the company fits and the contact can buy.`,
      },
      leadTable(ctx),
      { type: 'h', text: 'Benchmarks from your team (last quarter)' },
      {
        type: 'table',
        columns: ['Outreach', 'Reply or connect rate', 'Meeting from a reply or connect'],
        rows: [
          ['Generic email sequence', `${v.blastReply}% reply`, '30%'],
          ['Personal email with a fresh trigger', `${n(v, 'researchReply')}% reply`, '50%'],
          ['Cold call to a listed number', `${n(v, 'connectPct')}% connect`, '25%'],
          ['Introduction from a customer', `${n(v, 'introPct')}% agree to introduce`, '70%'],
        ],
      },
      {
        type: 'p',
        text: 'Last quarter, only 40% of meetings from generic sequences were qualified, against 85% from personal emails, 50% from old inbound leads and 90% from introductions.',
      },
      { type: 'callout', text: FICTIONAL_CALLOUT },
    ];
  },

  stages: [
    warmupStage(),
    {
      id: 'pick-leads',
      kind: 'scenario',
      title: 'Who do you go after first?',
      summary:
        'Pick three leads from a list with traps in it (a famous logo out of reach, an intern who opens every email). Think aloud.',
      timeLimitSec: 300,
      voiceMaxSec: 120,
      preferVoice: true,
      thinkAloud: true,
      scored: true,
      prompt: () => [
        {
          type: 'p',
          text: '**Which three leads do you contact first, and why those three?** Then name one lead you would not spend time on this week, and why.',
        },
        { type: 'p', text: 'Use the lead list and what counts as qualified.' },
      ],
      reviewerGuide: (ctx) => {
        const v = ctx.variant;
        return [
          {
            type: 'p',
            text: `The three strongest: **${nameOf(v, 'hiring')}** (hiring ${s(v, 'hireRole')}, so the pain is growing now), **${nameOf(v, 'funded')}** (just raised, visited pricing twice) and **${nameOf(v, 'renewal')}** (unhappy with ${s(v, 'competitor')}, renewal next month). All three fit 50–500 employees and have the buyer as the contact.`,
          },
          { type: 'p', text: 'The traps:' },
          {
            type: 'list',
            items: [
              `**${nameOf(v, 'giant')}**: thousands of employees and an in-house tool. Out of the 50–500 range, a long cycle, and won't help this month's number.`,
              `**${nameOf(v, 'opener')}**: lots of email opens, but a company of a few people and an intern as the contact. Opens are not intent.`,
              `**${nameOf(v, 'officp')}**: a government department, outside the target industry.`,
              `**${nameOf(v, 'nobuyer')}** fits on size but the contact can't buy; worth finding the right person, not first.`,
            ],
          },
          {
            type: 'p',
            text: 'Strong answers use fit (size, industry, buyer) and timing (a fresh trigger) together. Weak answers chase the biggest logo or the most email opens.',
          },
        ];
      },
      rubric: [
        {
          id: 'fit',
          label: 'Picks for fit and timing',
          weight: 2,
          anchors: [
            'Picks by size or opens alone, or picks a trap first.',
            'One or two strong picks, reasoning thin.',
            'All three strong leads, with fit or timing as the reason.',
            'All three, explained with both fit and a fresh trigger for each.',
          ],
        },
        {
          id: 'traps',
          label: 'Sees through the traps',
          weight: 1,
          anchors: [
            'Falls for the famous logo or the email opener.',
            'Avoids traps without saying why.',
            'Names a trap and why it wastes time this month.',
            'Names the giant and the opener, and what each signal really means.',
          ],
        },
        {
          id: 'target',
          label: 'Keeps the monthly target in view',
          weight: 1,
          anchors: [
            'No link to the target.',
            'Mentions the target.',
            'Links choices to booking qualified meetings this month.',
            'Uses the gap and days left to decide how much time each lead gets.',
          ],
        },
      ],
      followUps: (ctx) => [
        `Why not ${nameOf(ctx.variant, 'giant')}? Your CEO would love that logo.`,
        `What would you say in the first ten seconds of a call to ${nameOf(ctx.variant, 'renewal')}?`,
      ],
    },
    {
      id: 'one-play',
      kind: 'decision',
      title: 'One play for the rest of the month',
      summary:
        'Choose one outbound play and estimate the qualified meetings it brings. Tests pipeline maths: no single play closes the gap. Think aloud.',
      timeLimitSec: 360,
      voiceMaxSec: 150,
      preferVoice: true,
      thinkAloud: true,
      scored: true,
      choices: PLAYS,
      prompt: (ctx) => [
        {
          type: 'p',
          text: `You need ${n(ctx.variant, 'gap')} more qualified meetings in ${n(ctx.variant, 'daysLeft')} working days. You only have time to run **one** of these plays properly. Which one?`,
        },
        {
          type: 'p',
          text: 'Estimate how many **qualified** meetings it brings, using the benchmarks, and say what you would tell your manager today.',
        },
      ],
      reviewerGuide: (ctx) => {
        const v = ctx.variant;
        const m = sdrPlayMath(v);
        return [
          { type: 'p', text: 'Expected meetings from each play with the benchmarks (meetings → qualified):' },
          {
            type: 'list',
            items: [
              `Bought list: 600 × ${v.blastReply}% × 30% ≈ ${m.blast.meetings} → ~${m.blast.qualified} qualified, and it risks the email domain.`,
              `Personal emails: 60 × ${n(v, 'researchReply')}% × 50% ≈ ${m.research.meetings} → ~${m.research.qualified} qualified, but 60 researched emails take real time.`,
              `Old inbound calls: 150 × ${n(v, 'connectPct')}% × 25% ≈ ${m.calls.meetings} → ~${m.calls.qualified} qualified.`,
              `Customer introductions: 20 × ${n(v, 'introPct')}% × 70% ≈ ${m.referrals.meetings} → ~${m.referrals.qualified} qualified.`,
            ],
          },
          {
            type: 'p',
            text: `**No single play closes a gap of ${n(v, 'gap')}.** The best answers notice that, pick the play with the most qualified meetings for the time, and tell their manager today that they expect to land short, with a number. Any choice can score well with honest maths; the bought list is the weakest because most of its meetings don't qualify.`,
          },
        ];
      },
      rubric: [
        {
          id: 'maths',
          label: 'Pipeline maths',
          weight: 2,
          anchors: [
            'No estimate, or meetings counted without the qualified rate.',
            'A rough number with no method.',
            'Uses reply, meeting and qualified rates to get a number.',
            'Compares plays with the same method and sees no single play closes the gap.',
          ],
        },
        {
          id: 'choice',
          label: 'Sound choice',
          weight: 1,
          anchors: [
            'Chooses by volume alone.',
            'Plausible but unexplained.',
            'Reasoned from qualified meetings and time.',
            'Reasoned, including the downside (domain risk, time per email, stale leads).',
          ],
        },
        {
          id: 'honesty',
          label: 'Manages expectations',
          weight: 1,
          anchors: [
            'Promises the full target.',
            'Vague about the shortfall.',
            'Tells the manager the expected shortfall.',
            'Gives a number, a reason and what would change it.',
          ],
        },
      ],
      followUps: (_ctx, answer) => [
        `You chose "${answer.choiceLabel ?? 'your play'}". Walk me through the maths again, out loud.`,
        'If your manager said "I need 12, find a way", what would you do?',
      ],
    },
    {
      id: 'four-days-later',
      kind: 'branch',
      title: 'Four days later',
      summary: 'What happens next depends on their play. Tests whether they adjust or keep pushing.',
      timeLimitSec: 300,
      voiceMaxSec: 120,
      preferVoice: true,
      scored: true,
      dependsOn: 'one-play',
      prompt: (ctx) => {
        const v = ctx.variant;
        const byChoice: Record<string, Block[]> = {
          blast: [
            {
              type: 'p',
              text: `The sequence went out. You have one meeting so far, ${n(v, 'unsubscribes')} unsubscribes and two "stop spamming me" replies. Your team's email open rate has dropped from ${n(v, 'openBefore')}% to ${n(v, 'openAfter')}%, and another SDR asks if you broke something.`,
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
          research: [
            {
              type: 'p',
              text: `Three good replies so far, but research is slower than planned: you've written only ${n(v, 'writtenSoFar')} of the 60 emails (about ${n(v, 'emailsPerHour')} an hour). At this pace you won't finish.`,
            },
            { type: 'p', text: '**What do you change?**' },
          ],
          calls: [
            {
              type: 'p',
              text: `About ${n(v, 'switchboardPct')}% of numbers are switchboards. You finally reach a ${s(v, 'buyerTitle')}, who says: **"Just send me some information."**`,
            },
            {
              type: 'p',
              text: '**Write exactly what you say next**, then what you change about the rest of your calling.',
            },
          ],
          referrals: [
            {
              type: 'p',
              text: `${n(v, 'agreeIntros')} customers agreed to help. Two asked "what's in it for me?", and one of the customers you asked has an angry open support ticket about a bug, and has now told their account manager you're "asking for favours while our problem sits there".`,
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
        };
        return byChoice[ctx.choices['one-play'] ?? 'research'] ?? byChoice.research;
      },
      reviewerGuide: (ctx) => {
        const guides: Record<string, string> = {
          blast:
            'Damage control: pause the sequence immediately, tell the team and manager what happened (domain reputation affects everyone), clean the list, and switch the remaining time to a higher-quality play. Weak: keeps sending, or hides it.',
          research:
            'Tests time management: cut research per email to a template plus one trigger line, prioritise the accounts with the strongest triggers, follow up fast on the three replies, and use a few calls to hit the warmest accounts. Weak: keeps the same pace, or drops personalisation entirely.',
          calls:
            'The "send me information" reply is a polite brush-off. Strong: acknowledge it, ask one short question about their current process or pain, and offer something specific and small (a 15-minute look at X) or agree to send info and book a follow-up time. Then change the plan: find direct numbers, call at better times, or use email first. Weak: "Sure, I\'ll send it" and moves on.',
          referrals:
            "Tests judgement with customers. Strong: apologise to the angry customer's account manager, withdraw the ask, help get the bug escalated; offer something genuine to helpers (thanks, early access, a case study spotlight), never cash for intros without approval. Weak: pushes on, or offers discounts they can't give.",
        };
        const choice = ctx.choices['one-play'] ?? 'research';
        return [
          { type: 'p', text: `They chose **${PLAYS.find((p) => p.id === choice)?.label ?? choice}**.` },
          { type: 'p', text: guides[choice] ?? guides.research },
        ];
      },
      rubric: [
        ADAPTS,
        {
          id: 'people',
          label: 'Protects relationships',
          weight: 1,
          anchors: [
            'Damages the relationship or ignores it.',
            'Polite but passive.',
            'Handles the prospect, customer or team member well.',
            'Handles them well and turns it into something useful.',
          ],
        },
        NEXT_STEPS,
      ],
      followUps: () => [
        'Who would you tell about this first, and what would you say?',
        'Knowing this, would you pick the same play again?',
      ],
    },
    {
      id: 'review-email',
      kind: 'critique',
      title: "Fix a teammate's cold email",
      summary:
        'A cold email with a wrong fact about the prospect, a too-big ask and an unauthorised discount. Think aloud.',
      timeLimitSec: 420,
      voiceMaxSec: 180,
      preferVoice: false,
      thinkAloud: true,
      scored: true,
      prompt: () => [
        {
          type: 'p',
          text: 'A new SDR wants feedback before sending this. **Name the three biggest problems, worst first, and why each one hurts.** Then write the version you would send (under 90 words).',
        },
      ],
      material: (ctx) => {
        const v = ctx.variant;
        const prospect = nameOf(v, 'funded');
        return [
          { type: 'h', text: `Draft email to the ${s(v, 'buyerTitle')} at ${prospect}` },
          {
            type: 'quote',
            text: `Subject: Quick question about ${prospect}\n\nHi there,\n\nCongratulations on your Series B! ${s(v, 'company')} is the leading ${s(v, 'product')} platform, trusted by companies across India. We offer AI-powered workflows, 40+ integrations, role-based access, custom dashboards, mobile apps, audit trails and 24/7 support. Companies like yours have reduced ${s(v, 'pain')} using our platform.\n\nI'd love to show you a 45-minute demo next Tuesday at 4 pm. Also, if you sign before Friday I can get you 50% off the first year.\n\nLooking forward to hearing from you!`,
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
              `**Wrong fact: "Series B".** The lead list says ${nameOf(v, 'funded')} raised a **Series A**. Getting the one personal detail wrong kills credibility. Missing this caps "catches the real problems" at 2.`,
              '**The ask is too big.** A 45-minute demo at a fixed time from a first cold email. A short, low-commitment ask works better.',
              "**An unauthorised 50% discount with fake urgency.** SDRs don't set prices; it damages the AE's deal and the brand.",
              "**It's about us, not them.** A list of features, nothing about why now (they just raised and visited pricing twice).",
            ],
          },
          {
            type: 'p',
            text: 'Decoy: the subject line is fine (short, specific). Calling it the main problem is a weak signal. Also "Hi there" instead of a name. A good rewrite: their name, the Series A and pricing visits as the reason, one pain, one proof point, a 15-minute ask.',
          },
        ];
      },
      rubric: [
        {
          id: 'critical',
          label: 'Catches the real problems',
          weight: 2,
          anchors: [
            'Misses the wrong funding round and the discount.',
            'Catches one of them.',
            'Catches the wrong round and the discount or the ask.',
            'Catches all three and why each costs the meeting.',
          ],
        },
        {
          id: 'severity',
          label: 'Orders by impact',
          weight: 1,
          anchors: [
            'Subject line or style ranked first.',
            'Ordering unexplained.',
            'Sensible ordering with reasons.',
            'Ordered by what loses the deal, explained.',
          ],
        },
        {
          id: 'rewrite',
          label: 'Quality of the rewrite',
          weight: 1,
          anchors: [
            'No rewrite, or repeats the problems.',
            'Shorter but generic.',
            'Correct facts, about them, small ask.',
            'Feels written for this person, under 90 words, a clear easy reply.',
          ],
        },
      ],
      followUps: (ctx) => [
        `What would you say if the ${s(ctx.variant, 'buyerTitle')} replied "we're not looking right now"?`,
        'How would you give this feedback to the new SDR without crushing them?',
      ],
    },
    aiAllowedStage({
      id: 'sequence',
      title: 'A three-touch sequence (AI allowed)',
      summary: 'Write a short sequence for one lead with AI. Catches invented proof points and generic copy.',
      task: (ctx) => [
        {
          type: 'p',
          text: `Write a three-touch sequence for the ${s(ctx.variant, 'buyerTitle')} at **${nameOf(ctx.variant, 'hiring')}**: a first email (under 90 words), a LinkedIn connection note (under 300 characters) and a 20-second call opener.`,
        },
      ],
      guide: (ctx) => [
        {
          type: 'p',
          text: `The trigger is that they're hiring ${s(ctx.variant, 'hireRole')} right now, so the pain (${s(ctx.variant, 'pain')}) is growing. A strong sequence uses that trigger, not generic praise.`,
        },
        {
          type: 'p',
          text: 'AI drafts typically invent proof ("we helped 500 companies cut costs by 40%"), name customers that don\'t exist, and run long. Did the candidate remove made-up claims and keep to the limits?',
        },
      ],
      accuracy: {
        id: 'accuracy',
        label: 'Accurate and specific',
        weight: 1,
        anchors: [
          'Invented claims or the wrong facts.',
          'Generic but not false.',
          'Uses the hiring trigger, no invented claims.',
          'Uses the trigger well across all three touches, each adding something.',
        ],
      },
      usable: {
        id: 'usable',
        label: 'Ready to send',
        weight: 1,
        anchors: [
          'Too long or salesy.',
          'Usable with edits.',
          'Within limits, clear ask.',
          'Would get a reply; sounds human.',
        ],
      },
    }),
    pastWorkStage({
      id: 'cold-start',
      title: 'A meeting from a cold start',
      summary: 'A real meeting or deal they created from nothing. Checks specificity and ownership.',
      question: 'Tell us about a meeting or deal you created from a cold start.',
    }),
  ],
};
