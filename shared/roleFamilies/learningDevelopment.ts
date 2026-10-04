import type { Block, RoleFamily } from '../types';
import { n, s } from '../variants';
import { ADAPTS, FICTIONAL_CALLOUT, NEXT_STEPS, aiAllowedStage, pastWorkStage, warmupStage } from './common';

const COMPANIES = [
  { company: 'Northstar Retail', business: 'a retail chain with 180 stores' },
  { company: 'Finbridge', business: 'a lending company with 1,200 staff' },
  { company: 'Carelink', business: 'a healthcare services company' },
] as const;

const OPTIONS = [
  { id: 'everyone', label: 'A two-day leadership programme for all managers' },
  { id: 'cohort', label: 'A practice-based programme for new managers only, with their bosses involved' },
  { id: 'library', label: 'Buy an e-learning library for every manager' },
  { id: 'coaching', label: 'One-to-one coaching for the 20 most senior managers' },
];

export const learningDevelopment: RoleFamily = {
  id: 'learning-development',
  version: 1,
  name: 'Learning & Development Manager',
  roles: ['Learning and Development Manager', 'L&D Specialist', 'Training Manager', 'Learning Designer'],
  catalog: {
    function: 'People & HR',
    seniority: ['Mid', 'Senior', 'Manager'],
    industries: ['Any', 'Retail', 'Services'],
    skills: ['Analysis', 'Planning', 'Stakeholders'],
    keywords: ['L&D', 'training', 'learning', 'instructional design', 'capability building', 'leadership development'],
  },
  summary:
    'The CEO wants leadership training for every manager: find the real skill gap in the survey data, design something that changes behaviour within budget, and catch a training report that measures only happiness.',

  warmups: [
    'What is the most useful thing you have learned at work, and how did you learn it?',
    'Tell us about a training session you attended that changed nothing. Why?',
    'How do you know someone has really learned something?',
  ],

  generate(rng, currency) {
    const inr = currency === 'INR';
    const co = rng.pick(COMPANIES);
    const managers = rng.int(180, 240);
    const newManagers = rng.int(38, 52);
    const perHeadTwoDay = inr ? rng.pick([28000, 32000]) : rng.pick([420, 480]);
    // The budget covers only part of "two days for everyone".
    const budget =
      Math.round((managers * perHeadTwoDay * rng.pick([0.55, 0.6, 0.65])) / (inr ? 100000 : 1000)) *
      (inr ? 100000 : 1000);
    return {
      ...co,
      managers,
      newManagers,
      budget,
      perHeadTwoDay,
      libraryPerSeat: inr ? rng.pick([6000, 7500]) : rng.pick([90, 110]),
      coachingPerHead: inr ? rng.pick([150000, 180000]) : rng.pick([2200, 2600]),
      selfFeedback: rng.pick([3.9, 4.0, 4.1]),
      teamFeedback: rng.pick([2.4, 2.5, 2.6]),
      newMgrTeamFeedback: rng.pick([2.0, 2.1, 2.2]),
      selfPlanning: 3.6,
      teamPlanning: 3.5,
      pastCompletionPct: rng.int(14, 22),
      newMgrAttritionPct: rng.int(28, 34),
      otherAttritionPct: rng.int(14, 18),
      satisfaction: rng.pick([4.5, 4.6, 4.7]),
      prePost: rng.int(30, 40),
      dropoutWeek: 3,
    };
  },

  brief(ctx) {
    const v = ctx.variant;
    const { fmt } = ctx;
    return [
      {
        type: 'p',
        text: `You run learning at **${s(v, 'company')}**, ${s(v, 'business')}. The CEO says: "Our managers need leadership training. Do something for all ${n(v, 'managers')} of them this year." Your budget is **${fmt.money(n(v, 'budget'))}**. ${n(v, 'newManagers')} of the managers were promoted in the last 12 months.`,
      },
      {
        type: 'table',
        caption: 'Manager skills survey (1–5): managers rate themselves; their teams rate them',
        columns: ['Skill', 'Managers rate themselves', 'Teams rate them', 'Teams of new managers rate them'],
        rows: [
          [
            'Giving feedback',
            n(v, 'selfFeedback').toFixed(1),
            n(v, 'teamFeedback').toFixed(1),
            n(v, 'newMgrTeamFeedback').toFixed(1),
          ],
          ["Planning the team's work", String(n(v, 'selfPlanning')), String(n(v, 'teamPlanning')), '3.4'],
          ['Knowing the business', '3.8', '3.7', '3.5'],
          ['Handling conflict', '3.5', '3.0', '2.8'],
        ],
      },
      { type: 'h', text: 'Other things you know' },
      {
        type: 'list',
        items: [
          `Last year's e-learning courses had a ${n(v, 'pastCompletionPct')}% completion rate.`,
          `Attrition in teams with a new manager: ${n(v, 'newMgrAttritionPct')}%. In other teams: ${n(v, 'otherAttritionPct')}%.`,
          `Costs: a two-day external programme ${fmt.money(n(v, 'perHeadTwoDay'))} per person; an e-learning library ${fmt.money(n(v, 'libraryPerSeat'))} per seat a year; a 6-month coaching engagement ${fmt.money(n(v, 'coachingPerHead'))} per person.`,
        ],
      },
      { type: 'callout', text: FICTIONAL_CALLOUT },
    ];
  },

  stages: [
    warmupStage(),
    {
      id: 'gap',
      kind: 'scenario',
      title: 'Where is the real gap?',
      summary:
        'Find the real need in survey data: new managers giving feedback (a big gap between self and team ratings), linked to attrition. Think aloud.',
      timeLimitSec: 300,
      voiceMaxSec: 120,
      preferVoice: true,
      thinkAloud: true,
      scored: true,
      prompt: () => [
        {
          type: 'p',
          text: '**What does the data tell you about where training would help most?** Is "leadership training for everyone" the right answer?',
        },
      ],
      reviewerGuide: (ctx) => {
        const v = ctx.variant;
        return [
          {
            type: 'p',
            text: `The biggest gap is **giving feedback**: managers rate themselves ${n(v, 'selfFeedback')}, their teams ${n(v, 'teamFeedback')}, and teams of new managers ${n(v, 'newMgrTeamFeedback')}. Planning shows almost no gap. Teams with new managers lose ${n(v, 'newMgrAttritionPct')}% of people against ${n(v, 'otherAttritionPct')}%.`,
          },
          {
            type: 'p',
            text: `So the need is specific: help ${n(v, 'newManagers')} new managers give feedback (and handle conflict). Generic leadership training for all ${n(v, 'managers')} spreads the budget thin. E-learning completion of ${n(v, 'pastCompletionPct')}% warns against a self-paced library. Weak answers accept "train everyone".`,
          },
        ];
      },
      rubric: [
        {
          id: 'gap',
          label: 'Finds the real gap',
          weight: 2,
          anchors: [
            'Accepts "everyone, leadership".',
            'Notices one gap.',
            'Finds feedback for new managers.',
            'Finds it and links it to attrition.',
          ],
        },
        {
          id: 'data',
          label: 'Reads the data well',
          weight: 1,
          anchors: [
            'No data.',
            'Uses self-ratings.',
            'Compares self and team ratings.',
            'Compares them and notes what the e-learning completion means.',
          ],
        },
        {
          id: 'ceo',
          label: "Responds to the CEO's ask",
          weight: 1,
          anchors: [
            'Ignores it.',
            'Goes along.',
            'Reframes it with evidence.',
            'Reframes it in a way the CEO would welcome.',
          ],
        },
      ],
      followUps: () => [
        'How would you check the survey is telling the truth?',
        'Why might managers rate themselves higher than their teams do?',
      ],
    },
    {
      id: 'design',
      kind: 'decision',
      title: 'What do you build?',
      summary: 'Choose an approach within budget. Tests design for behaviour change and cost. Think aloud.',
      timeLimitSec: 360,
      voiceMaxSec: 150,
      preferVoice: true,
      thinkAloud: true,
      scored: true,
      choices: OPTIONS,
      prompt: () => [
        {
          type: 'p',
          text: "**What do you recommend?** Pick one, show what it costs against the budget, and say how you'll know it changed behaviour.",
        },
      ],
      reviewerGuide: (ctx) => {
        const v = ctx.variant;
        const { fmt } = ctx;
        return [
          {
            type: 'list',
            items: [
              `Two days for everyone: ${n(v, 'managers')} × ${fmt.money(n(v, 'perHeadTwoDay'))} ≈ ${fmt.money(n(v, 'managers') * n(v, 'perHeadTwoDay'))} against ${fmt.money(n(v, 'budget'))}.`,
              `New managers only: ${n(v, 'newManagers')} people, so the budget allows practice, follow-up and their bosses' involvement.`,
              `Library: ${n(v, 'managers')} × ${fmt.money(n(v, 'libraryPerSeat'))} ≈ ${fmt.money(n(v, 'managers') * n(v, 'libraryPerSeat'))}, but past completion was ${n(v, 'pastCompletionPct')}%.`,
              `Coaching for 20 seniors: 20 × ${fmt.money(n(v, 'coachingPerHead'))} ≈ ${fmt.money(20 * n(v, 'coachingPerHead'))}, aimed at the wrong group.`,
            ],
          },
          {
            type: 'p',
            text: 'The new-manager programme is the strongest: targeted, with practice (role-plays of feedback conversations), spaced over weeks, with their bosses reinforcing it. Measure behaviour (team ratings of feedback, attrition in those teams), not attendance.',
          },
        ];
      },
      rubric: [
        {
          id: 'design',
          label: 'Designed to change behaviour',
          weight: 2,
          anchors: [
            'Content delivery only.',
            'Some practice or follow-up.',
            'Targeted, with practice and follow-up over time.',
            "All of that plus the manager's boss reinforcing it.",
          ],
        },
        {
          id: 'budget',
          label: 'Fits the budget',
          weight: 1,
          anchors: [
            'No cost.',
            'Rough or over budget.',
            'Costed within budget.',
            'Costed, with what the rest of the budget does.',
          ],
        },
        {
          id: 'measure',
          label: 'Measures behaviour',
          weight: 1,
          anchors: [
            'Attendance or satisfaction.',
            'A test score.',
            'Team ratings or attrition.',
            'A before/after on team ratings and attrition, with timing.',
          ],
        },
      ],
      followUps: (_ctx, answer) => [
        `You chose "${answer.choiceLabel ?? 'your design'}". What would the first session look like?`,
        'How would you get busy new managers to turn up?',
      ],
    },
    {
      id: 'midway',
      kind: 'branch',
      title: 'Halfway through',
      summary: 'Their programme meets reality. Tests adapting.',
      timeLimitSec: 300,
      voiceMaxSec: 120,
      preferVoice: true,
      scored: true,
      dependsOn: 'design',
      prompt: (ctx) => {
        const v = ctx.variant;
        const byChoice: Record<string, Block[]> = {
          everyone: [
            {
              type: 'p',
              text: `The budget ran out after about ${Math.floor(n(v, 'budget') / n(v, 'perHeadTwoDay'))} managers. Feedback scores are great (${n(v, 'satisfaction')}/5), but teams say nothing has changed. The CEO asks why the rest haven't been trained.`,
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
          cohort: [
            {
              type: 'p',
              text: `By week ${n(v, 'dropoutWeek')}, a third of new managers are missing sessions: "my boss says hitting targets comes first". The CEO asks why the other ${n(v, 'managers') - n(v, 'newManagers')} managers are getting nothing.`,
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
          library: [
            {
              type: 'p',
              text: `After three months, ${n(v, 'pastCompletionPct') - 4}% of managers have finished a course. Teams still rate feedback at ${n(v, 'teamFeedback')}.`,
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
          coaching: [
            {
              type: 'p',
              text: `The senior managers love their coaches. But attrition in new managers' teams is still ${n(v, 'newMgrAttritionPct')}%, and HR asks why the money went to the top.`,
            },
            { type: 'p', text: '**What do you do now?**' },
          ],
        };
        return byChoice[ctx.choices.design ?? 'cohort'] ?? byChoice.cohort;
      },
      reviewerGuide: (ctx) => {
        const guides: Record<string, string> = {
          everyone:
            "Owning it: high satisfaction isn't behaviour change. Strong: refocus the remaining effort on new managers with practice and follow-up, and measure team ratings. Weak: asks for more budget to finish the same programme.",
          cohort:
            "Strong: work with the new managers' bosses (they are blocking attendance), shorten or reschedule sessions, and give the CEO a plan for the wider group (a light offering, or the next cohort). Weak: accepts the drop-out.",
          library:
            "Strong: admit self-paced didn't work for this need, and redirect to practice-based sessions for new managers. Weak: sends reminder emails.",
          coaching:
            "Strong: admit it targeted the wrong group, use the coaches' insight, and shift the rest of the budget to new managers. Weak: defends it.",
        };
        const choice = ctx.choices.design ?? 'cohort';
        return [
          { type: 'p', text: `They chose **${OPTIONS.find((o) => o.id === choice)?.label ?? choice}**.` },
          { type: 'p', text: guides[choice] ?? guides.cohort },
        ];
      },
      rubric: [ADAPTS, NEXT_STEPS],
      followUps: () => [
        'What would you tell the CEO in your next update?',
        'What would you do differently in the next round?',
      ],
    },
    {
      id: 'evaluation',
      kind: 'critique',
      title: 'Review a training report',
      summary: 'A report that claims success from satisfaction scores and a same-day test. Think aloud.',
      timeLimitSec: 360,
      voiceMaxSec: 150,
      preferVoice: false,
      thinkAloud: true,
      scored: true,
      prompt: () => [
        {
          type: 'p',
          text: "A vendor sent this report on last year's programme. **Name the problems, worst first.** Then say what a convincing report would show.",
        },
      ],
      material: (ctx) => {
        const v = ctx.variant;
        return [
          { type: 'h', text: 'Programme report: "A resounding success"' },
          {
            type: 'list',
            items: [
              `Participant satisfaction: **${n(v, 'satisfaction')} / 5**.`,
              `Knowledge test: scores rose ${n(v, 'prePost')}% from the start of the session to the end of the same session.`,
              '92% of participants said they "intend to apply" what they learned.',
              'Sessions ran on schedule; attendance was recorded each day.',
            ],
          },
        ];
      },
      reviewerGuide: () => [
        { type: 'p', text: 'Planted problems:' },
        {
          type: 'list',
          items: [
            '**No behaviour or business result:** nothing about whether managers give feedback differently, how teams rate them, or attrition.',
            '**A same-day test** measures short-term recall, not learning that lasts or gets used.',
            '**Satisfaction and "intend to apply"** are opinions on the day; they rarely predict change.',
          ],
        },
        {
          type: 'p',
          text: 'Decoy: recording attendance is fine. A convincing report shows team ratings before and after (e.g. 3 and 6 months), attrition in those teams, and examples from bosses.',
        },
      ],
      rubric: [
        {
          id: 'critical',
          label: 'Catches the real gaps',
          weight: 2,
          anchors: [
            'Accepts it as success.',
            'One doubt.',
            'Says there is no behaviour or business measure.',
            "Says that and why each metric shown can't prove change.",
          ],
        },
        {
          id: 'better',
          label: 'What good evidence looks like',
          weight: 1,
          anchors: [
            'None.',
            'Vague.',
            'Behaviour and business measures.',
            'Those, with timing and a comparison group if possible.',
          ],
        },
        {
          id: 'severity',
          label: 'Orders by importance',
          weight: 1,
          anchors: [
            'Decoy first.',
            'Unexplained.',
            'Sensible order.',
            'Ordered by what matters to the business, explained.',
          ],
        },
      ],
      followUps: () => [
        'How would you get a vendor to commit to behaviour measures?',
        'What is the cheapest good measure of behaviour change here?',
      ],
    },
    aiAllowedStage({
      id: 'outline',
      title: 'Programme outline (AI allowed)',
      summary: 'Design a short programme outline with AI. Catches generic content-heavy designs.',
      task: (ctx) => [
        {
          type: 'p',
          text: `Write a 6-week outline for ${n(ctx.variant, 'newManagers')} new managers on giving feedback (under 250 words): what happens each week, what they practise, what their boss does, and how you measure it.`,
        },
      ],
      guide: () => [
        {
          type: 'p',
          text: "A strong outline is mostly practice (real conversations, role-plays with feedback), spaced over weeks, involves the managers' bosses, and measures team ratings later.",
        },
        {
          type: 'p',
          text: 'AI drafts are typically content-heavy ("Module 1: Theories of leadership"), generic, and measure satisfaction. Did the candidate turn it into practice with follow-up?',
        },
      ],
      accuracy: {
        id: 'accuracy',
        label: 'Built for practice and change',
        weight: 1,
        anchors: [
          'Lectures and theory.',
          'Some practice.',
          'Mostly practice, spaced, bosses involved.',
          'All of that with a behaviour measure.',
        ],
      },
      usable: {
        id: 'usable',
        label: 'Ready to run',
        weight: 1,
        anchors: ['Vague.', 'Usable with work.', 'Clear week by week.', 'A facilitator could run it from this.'],
      },
    }),
    pastWorkStage({
      id: 'learning-impact',
      title: 'Training that changed behaviour',
      summary: 'A real learning programme and its results. Checks specificity and ownership.',
      question: 'Tell us about a learning programme you ran or designed, and what changed because of it.',
    }),
  ],
};
