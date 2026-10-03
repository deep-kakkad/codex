import type { Block, RoleFamily } from '../types';
import { n, s } from '../variants';
import { ADAPTS, FICTIONAL_CALLOUT, NEXT_STEPS, aiAllowedStage, pastWorkStage, warmupStage } from './common';

const APPS = [
  { company: 'Medicart', product: 'medicine delivery app', thing: 'order', slotStep: 'Delivery slot' },
  {
    company: 'Ghar Seva',
    product: 'home services booking app (cleaning, repairs)',
    thing: 'booking',
    slotStep: 'Pick a time',
  },
  { company: 'Tiffinly', product: 'home-cooked meal subscription app', thing: 'subscription', slotStep: 'Start date' },
] as const;

const OPTIONS = [
  { id: 'redesign', label: 'Redesign the whole checkout' },
  { id: 'address', label: 'Fix the address step only' },
  { id: 'guest', label: 'Add guest checkout' },
  { id: 'trust', label: 'Add a progress bar and trust badges' },
];

export const uxDesigner: RoleFamily = {
  id: 'ux-designer',
  version: 1,
  name: 'UX / Product Designer',
  roles: ['Product Designer', 'UX Designer', 'UI/UX Designer', 'Interaction Designer'],
  catalog: {
    function: 'Product & design',
    seniority: ['Mid', 'Senior'],
    industries: ['Consumer apps', 'D2C & e-commerce'],
    skills: ['Analysis', 'Judgement', 'Writing'],
    keywords: ['UX', 'UI', 'product design', 'interaction design', 'usability', 'accessibility', 'Figma'],
  },
  summary:
    'A checkout losing a third of users at one step: find the problem from funnel data and usability notes, pick the fix that fits two weeks, and catch the accessibility problems in a proposed screen.',

  warmups: [
    'What is a form or checkout you hated using recently, and why?',
    'Describe a small design detail in an app you use that you think is great.',
    'How do you know a design is working?',
  ],

  generate(rng) {
    const app = rng.pick(APPS);
    const cart = rng.int(40, 60) * 1000;
    const addressRate = rng.pick([0.6, 0.62, 0.64]);
    const atAddress = Math.round(cart * rng.pick([0.92, 0.94]));
    const atSlot = Math.round(atAddress * addressRate);
    const atPayment = Math.round(atSlot * rng.pick([0.9, 0.92]));
    const done = Math.round(atPayment * rng.pick([0.86, 0.88]));
    return {
      ...app,
      cart,
      atAddress,
      atSlot,
      atPayment,
      done,
      mobilePct: rng.int(82, 88),
      lowEndPct: rng.int(55, 65),
      testers: 6,
      pincodeStruggle: rng.int(3, 5),
      landmarkStruggle: rng.int(2, 4),
      disabledTaps: rng.int(18, 30),
      engineerWeeks: 2,
      redesignWeeks: rng.int(6, 8),
      loggedInPct: rng.int(95, 99),
      afterFixRate: rng.pick([74, 77, 80]),
      trustLift: rng.pick([0.4, 0.8]),
    };
  },

  brief(ctx) {
    const v = ctx.variant;
    const { fmt } = ctx;
    const pct = (a: number, b: number) => `${Math.round((a / b) * 100)}%`;
    return [
      {
        type: 'p',
        text: `You're a product designer at **${s(v, 'company')}**, a ${s(v, 'product')}. ${fmt.pct(n(v, 'mobilePct'))} of users are on phones, ${fmt.pct(n(v, 'lowEndPct'))} of them on low-cost Android phones. ${fmt.pct(n(v, 'loggedInPct'))} of people who reach checkout are already logged in.`,
      },
      {
        type: 'table',
        caption: 'Checkout funnel, last 30 days',
        columns: ['Step', 'Users', 'Continue to next step'],
        rows: [
          ['Cart', fmt.num(n(v, 'cart')), pct(n(v, 'atAddress'), n(v, 'cart'))],
          ['Address', fmt.num(n(v, 'atAddress')), pct(n(v, 'atSlot'), n(v, 'atAddress'))],
          [s(v, 'slotStep'), fmt.num(n(v, 'atSlot')), pct(n(v, 'atPayment'), n(v, 'atSlot'))],
          ['Payment', fmt.num(n(v, 'atPayment')), pct(n(v, 'done'), n(v, 'atPayment'))],
          ['Done', fmt.num(n(v, 'done')), '—'],
        ],
      },
      { type: 'h', text: `Usability test notes (${n(v, 'testers')} participants, on their own phones)` },
      {
        type: 'list',
        items: [
          `${n(v, 'pincodeStruggle')} of ${n(v, 'testers')} typed their PIN code with a space ("560 034") and saw "Invalid PIN" with no explanation. The PIN field opens the letter keyboard.`,
          `${n(v, 'landmarkStruggle')} of ${n(v, 'testers')} stopped at the required "Landmark" field: "My building doesn't have one."`,
          'Two people moved the map pin by accident while scrolling, and their address changed.',
          'One person said the colours "look a bit dull" on the payment page.',
        ],
      },
      {
        type: 'p',
        text: `The heatmap shows people tapping the greyed-out "Continue" button on the address step an average of ${n(v, 'disabledTaps')} times per 100 visits. Nothing explains why it is disabled.`,
      },
      {
        type: 'p',
        text: `Engineering can give you **one engineer for ${n(v, 'engineerWeeks')} weeks** this cycle.`,
      },
      { type: 'callout', text: FICTIONAL_CALLOUT },
    ];
  },

  stages: [
    warmupStage(),
    {
      id: 'find-problem',
      kind: 'scenario',
      title: 'Where is checkout breaking?',
      summary:
        'Use funnel data, usability notes and a heatmap to find the real problem: the address step, for specific reasons. Think aloud.',
      timeLimitSec: 300,
      voiceMaxSec: 120,
      preferVoice: true,
      thinkAloud: true,
      scored: true,
      prompt: () => [
        {
          type: 'p',
          text: '**Where is checkout losing people, and why?** Rank the causes you see, most damaging first, and say how sure you are of each.',
        },
      ],
      reviewerGuide: (ctx) => {
        const v = ctx.variant;
        const loss = n(v, 'atAddress') - n(v, 'atSlot');
        return [
          {
            type: 'p',
            text: `The address step loses about ${ctx.fmt.num(loss)} users a month (${Math.round((1 - n(v, 'atSlot') / n(v, 'atAddress')) * 100)}% of those who reach it), far worse than any other step.`,
          },
          {
            type: 'list',
            items: [
              `PIN code rejects a space and opens the letter keyboard (${n(v, 'pincodeStruggle')} of ${n(v, 'testers')} testers).`,
              `"Landmark" is required but often doesn't exist (${n(v, 'landmarkStruggle')} of ${n(v, 'testers')}).`,
              'A disabled "Continue" with no explanation (repeated taps on the heatmap).',
              'The map pin moves while scrolling (2 testers).',
            ],
          },
          {
            type: 'p',
            text: 'Strong answers combine the funnel (where), the tests (why) and the heatmap (confirming). "Colours look dull" is a decoy: one person, on a step that converts well. Weak answers propose a general redesign or focus on payment.',
          },
        ];
      },
      rubric: [
        {
          id: 'where',
          label: 'Finds the step',
          weight: 1,
          anchors: [
            'Picks the wrong step or none.',
            'Points at checkout generally.',
            'Identifies the address step from the funnel.',
            'Identifies it with the size of the loss.',
          ],
        },
        {
          id: 'why',
          label: 'Explains why, from evidence',
          weight: 2,
          anchors: [
            'Opinion only.',
            'One cause.',
            'Several causes, each tied to a test note or the heatmap.',
            'Causes ranked by impact, with confidence and the decoy dismissed.',
          ],
        },
        {
          id: 'users',
          label: 'Designs for these users',
          weight: 1,
          anchors: [
            'Ignores the context.',
            'Mentions mobile.',
            'Uses the phone and low-end Android context.',
            'Shows how the context makes each problem worse.',
          ],
        },
      ],
      followUps: () => [
        'How would you check your top cause before building anything?',
        'Why not fix the payment page colours too?',
      ],
    },
    {
      id: 'two-weeks',
      kind: 'decision',
      title: 'What fits in two weeks',
      summary: 'Choose a fix for one engineer for two weeks. Tests scoping to the evidence. Think aloud.',
      timeLimitSec: 300,
      voiceMaxSec: 150,
      preferVoice: true,
      thinkAloud: true,
      scored: true,
      choices: OPTIONS,
      prompt: (ctx) => [
        {
          type: 'p',
          text: `**What do you ask the engineer to build in ${n(ctx.variant, 'engineerWeeks')} weeks?** Pick one, list exactly what changes, and say how you'll know it worked.`,
        },
      ],
      reviewerGuide: (ctx) => {
        const v = ctx.variant;
        return [
          {
            type: 'p',
            text: `Fixing the address step is the strongest: it targets the biggest loss with specific, small changes (accept spaces, numeric keyboard, optional landmark, explain the disabled button, lock the map pin while scrolling). A full redesign takes ${n(v, 'redesignWeeks')} weeks. Guest checkout solves nothing: ${n(v, 'loggedInPct')}% are already logged in. Trust badges don't address any observed problem.`,
          },
          {
            type: 'p',
            text: 'Look for a measurable success check: address-step continuation rate, with a target and a time to read it.',
          },
        ];
      },
      rubric: [
        {
          id: 'scope',
          label: 'Fix fits the evidence and time',
          weight: 2,
          anchors: [
            'A fix unrelated to the evidence or far too big.',
            'Related but vague or oversized.',
            'Specific changes aimed at the address problems, fits two weeks.',
            'Specific, sequenced by impact, with what is cut if time runs out.',
          ],
        },
        {
          id: 'measure',
          label: 'How they will know',
          weight: 1,
          anchors: [
            'No measure.',
            'Vague ("conversion").',
            'The address-step rate.',
            'That rate with a target and a time frame, plus a guardrail.',
          ],
        },
      ],
      followUps: (_ctx, answer) => [
        `You chose "${answer.choiceLabel ?? 'your fix'}". Which single change would you keep if you could only ship one?`,
        'How would you explain this choice to a PM who wants a redesign?',
      ],
    },
    {
      id: 'after-launch',
      kind: 'branch',
      title: 'After launch',
      summary: 'Results of their choice arrive. Tests reading results and adapting.',
      timeLimitSec: 300,
      voiceMaxSec: 120,
      preferVoice: true,
      scored: true,
      dependsOn: 'two-weeks',
      prompt: (ctx) => {
        const v = ctx.variant;
        const byChoice: Record<string, Block[]> = {
          redesign: [
            {
              type: 'p',
              text: `After two weeks only the cart and address screens are redesigned; the rest will take ${n(v, 'redesignWeeks') - 2} more weeks. The half-new, half-old flow looks inconsistent, and the PM asks whether to ship it as is.`,
            },
            { type: 'p', text: '**What do you do?**' },
          ],
          address: [
            {
              type: 'p',
              text: `The address step now continues at ${n(v, 'afterFixRate')}%. But support says some users in apartment blocks now get deliveries at the wrong gate, since "Landmark" became optional.`,
            },
            { type: 'p', text: '**What do you do?**' },
          ],
          guest: [
            {
              type: 'p',
              text: 'Guest checkout shipped. The address step still loses about the same share of users, and the PM asks why nothing moved.',
            },
            { type: 'p', text: '**What do you say and do?**' },
          ],
          trust: [
            {
              type: 'p',
              text: `Address-step continuation moved by ${s(v, 'trustLift')} points, within normal week-to-week noise. The marketing team loves the new badges and wants them on every page.`,
            },
            { type: 'p', text: '**What do you do?**' },
          ],
        };
        return byChoice[ctx.choices['two-weeks'] ?? 'address'] ?? byChoice.address;
      },
      reviewerGuide: (ctx) => {
        const guides: Record<string, string> = {
          redesign:
            "Strong: don't ship an inconsistent half-flow; ship the address fixes within the old design now and plan the redesign properly. Weak: ships as is.",
          address:
            'A good trade-off with a side effect. Strong: keep the gain, add a smarter optional field (e.g. "Gate or building name, helps your delivery") or prompt for it only for apartment addresses, and measure wrong-gate tickets. Weak: makes landmark mandatory again.',
          guest:
            'Owning the miss: almost everyone was already logged in, so guest checkout could not help. Strong: say so plainly and fix the address step next. Weak: blames traffic or waits.',
          trust:
            "Strong: say the change made no measurable difference, don't spread it on the evidence, and go back to the address problems. Weak: claims a win.",
        };
        const choice = ctx.choices['two-weeks'] ?? 'address';
        return [
          { type: 'p', text: `They chose **${OPTIONS.find((o) => o.id === choice)?.label ?? choice}**.` },
          { type: 'p', text: guides[choice] ?? guides.address },
        ];
      },
      rubric: [ADAPTS, NEXT_STEPS],
      followUps: () => ['What would you test next, and how?', 'What did you learn about the users from this?'],
    },
    {
      id: 'review-screen',
      kind: 'critique',
      title: 'Review a proposed screen',
      summary:
        'A new address screen spec with placeholder-only labels, colour-only errors, small tap targets and low contrast. Think aloud.',
      timeLimitSec: 420,
      voiceMaxSec: 180,
      preferVoice: false,
      thinkAloud: true,
      scored: true,
      prompt: () => [
        {
          type: 'p',
          text: 'A teammate proposes this new address screen. **Name the most serious problems, worst first, and who each one hurts.** Then describe your fixes.',
        },
      ],
      material: () => [
        { type: 'h', text: 'Proposed address screen' },
        {
          type: 'list',
          items: [
            'Single column of fields, one per row.',
            'Field names shown only as placeholder text inside the boxes (e.g. "Flat / House no."); they disappear when you start typing.',
            'Placeholder text in light grey #BDBDBD on white.',
            'If a field is wrong, its border turns red. No message.',
            '"Save address" and "Cancel" are the same size and colour, side by side at the bottom.',
            'The "use current location" link is 12 px text, about 28 × 18 px to tap.',
          ],
        },
      ],
      reviewerGuide: () => [
        { type: 'p', text: 'Planted problems:' },
        {
          type: 'list',
          items: [
            '**Labels that vanish.** Placeholders as the only labels: people forget what a field was, especially on long forms; bad for memory and screen readers. Use visible labels.',
            "**Errors shown only by colour.** A red border with no message fails colour-blind users and doesn't say what to fix: the exact problem the PIN field already has.",
            '**Low contrast** (#BDBDBD on white is about 1.9:1, well below 4.5:1) and a tiny tap target (28 × 18 px, under the ~44–48 px guideline): hard on low-end phones and in sunlight.',
            '**Equal-weight Save and Cancel** side by side invite mis-taps that throw away the address.',
          ],
        },
        { type: 'p', text: 'Decoy: a single column is good on mobile. Flagging it is a weak signal.' },
      ],
      rubric: [
        {
          id: 'critical',
          label: 'Catches the real problems',
          weight: 2,
          anchors: [
            'Misses the vanishing labels and colour-only errors.',
            'Catches one.',
            'Catches both plus contrast or tap size.',
            'Catches all of them with the users each one fails.',
          ],
        },
        {
          id: 'fixes',
          label: 'Concrete fixes',
          weight: 1,
          anchors: [
            'None or vague.',
            'Generic ("make it accessible").',
            'Specific fixes per problem.',
            'Specific fixes with standards (contrast ratio, target size).',
          ],
        },
        {
          id: 'severity',
          label: 'Orders by who is hurt',
          weight: 1,
          anchors: [
            'Decoy or taste first.',
            'Unexplained.',
            'Sensible order.',
            'Ordered by how many people it blocks, explained.',
          ],
        },
      ],
      followUps: () => [
        'How would you convince your teammate, who likes the clean look?',
        'How would you test this screen with real users cheaply?',
      ],
    },
    aiAllowedStage({
      id: 'microcopy',
      title: 'Error messages (AI allowed)',
      summary: 'Write the address-form error messages with AI. Catches vague, blaming copy.',
      timeLimitSec: 480,
      task: () => [
        {
          type: 'p',
          text: 'Write the error and help messages for the address form (each under 60 characters): PIN code wrong, PIN code outside the delivery area, house number missing, the disabled "Continue" button, and the location permission being denied.',
        },
      ],
      guide: () => [
        {
          type: 'p',
          text: 'Good messages say what happened and how to fix it ("PIN codes have 6 digits, like 560034"), never blame the user, and fit the limit. The PIN message should accept or explain spaces.',
        },
        {
          type: 'p',
          text: 'AI drafts typically say "Invalid input", "Error: please try again", or apologise at length. Did the candidate make each message specific and short?',
        },
      ],
      accuracy: {
        id: 'accuracy',
        label: 'Specific and helpful',
        weight: 1,
        anchors: [
          'Vague or blaming.',
          'Some specific, some vague.',
          'Each says what is wrong and how to fix it.',
          'All of that, in a consistent friendly voice.',
        ],
      },
      usable: {
        id: 'usable',
        label: 'Fits the screen',
        weight: 1,
        anchors: ['Over the limit.', 'Mostly fits.', 'All within 60 characters.', 'Short, scannable and translatable.'],
      },
    }),
    pastWorkStage({
      id: 'changed-after-testing',
      title: 'A design you changed after testing',
      summary: 'A real design they changed after seeing users struggle. Checks specificity and ownership.',
      question: 'Tell us about a design of yours that changed after you watched people use it.',
    }),
  ],
};
