import { DEMO_ASSESSMENT, DEMO_SAMPLE_CANDIDATE, DEMO_SECOND_CANDIDATE, DEMO_TOKEN } from './mode';
import type { TourId } from './tour';

/** What a step can do to the page once it is on screen. */
export interface TourUi {
  /** Resolves with the first element matching `selector` once it exists. */
  waitFor: (selector: string, text?: string) => Promise<HTMLElement>;
  /** Clicks the first element matching `selector` (and containing `text`), once it exists. */
  click: (selector: string, text?: string) => Promise<void>;
}

export interface TourStep {
  /** The page to show, path and query. */
  path: string;
  /** What to spotlight. Without one, the card sits in the middle of the screen. */
  target?: string;
  title: string;
  body: string;
  /** Sets up the demo data before the page opens. */
  prepare?: () => Promise<void>;
  /** Opens the right tab or panel once the page is on screen. */
  act?: (ui: TourUi) => Promise<void>;
  /** The closing card, with the ways to carry on. */
  end?: boolean;
}

const asha = `/app/candidates/${DEMO_SAMPLE_CANDIDATE}`;
const assessment = `/app/assessments/${DEMO_ASSESSMENT}`;

const reviewTab = (ui: TourUi) => ui.click('.rv-tabs button', 'Review');

const RECRUITER: TourStep[] = [
  {
    path: '/app',
    target: '.grid-cards',
    title: 'Your hiring workspace',
    body: 'Each assessment is one role you’re hiring for. Demo Co is hiring a Growth Marketing Manager, and two candidates have finished and are waiting for a decision.',
  },
  {
    path: '/app/new',
    target: '.jd-form',
    title: 'Start from your job description',
    body: 'Paste a job description and AI builds a full assessment for that exact role in a few minutes. Or start from one of 27 ready-made roles.',
  },
  {
    path: '/app/new?family=performance-marketing',
    target: '.activity-list',
    title: 'Choose what candidates do',
    body: 'A realistic scenario with real numbers, think-aloud questions, a decision that changes the story, a critique with planted mistakes, and one task where AI is allowed. About 35 minutes.',
  },
  {
    path: assessment,
    target: '.invite-card',
    title: 'Invite candidates',
    body: 'Add one person or paste a whole list. Each candidate gets a private link: no account, no download, no webcam.',
  },
  {
    path: assessment,
    target: '.nudge-card',
    title: 'See who’s stuck, and nudge them',
    body: 'Proofwork shows who hasn’t started or stopped halfway. A short reminder brings most people back.',
  },
  {
    path: assessment,
    target: '[data-tour="candidates"]',
    title: 'Finished candidates arrive scored',
    body: 'Every finished candidate gets an AI review within minutes. Star the ones you like, and compare the best side by side.',
  },
  {
    path: asha,
    target: '.rv-head',
    act: reviewTab,
    title: 'Read the AI review',
    body: 'An overall score, a recommendation and where they rank in the pool. The AI recommends; your team decides.',
  },
  {
    path: asha,
    target: '.rv-exec',
    act: reviewTab,
    title: 'The verdict in plain words',
    body: 'A one-line verdict, strengths and concerns, and how the candidate did with AI compared with on their own.',
  },
  {
    path: asha,
    target: '#rv-questions',
    act: async (ui) => {
      await reviewTab(ui);
      await ui.click('.rv-step-item', 'budget cut');
    },
    title: 'Every score quotes the candidate',
    body: 'Open any question to see what they were asked, their answer and think-aloud audio, and the exact words behind each rubric score. Disagree with a score and the total updates.',
  },
  {
    path: asha,
    target: '.rv-side .px-integrity',
    act: reviewTab,
    title: 'Integrity check',
    body: 'Signs of outside help, like pasted answers or recordings that sound read out, become questions to ask, never accusations.',
  },
  {
    path: asha,
    target: '.px-kit',
    act: (ui) => ui.click('.rv-tabs button', 'Verification call'),
    title: 'Questions for the next interview',
    body: 'Five questions written from the candidate’s own answers, with what a strong and a weak reply sound like.',
  },
  {
    path: `${assessment}/compare?ids=${DEMO_SAMPLE_CANDIDATE},${DEMO_SECOND_CANDIDATE}`,
    target: '.compare-table',
    title: 'Compare finalists side by side',
    body: 'Question by question, with the best score in each row marked and the quoted evidence one click away.',
  },
  {
    path: asha,
    target: '.px-mail',
    act: async (ui) => {
      await reviewTab(ui);
      const advance = await ui.waitFor('.rv-decide-btn.is-advance');
      if (advance.getAttribute('aria-pressed') !== 'true') advance.click();
      const mail = await ui.waitFor('.px-mailbar button, .px-mail');
      if (mail.tagName === 'BUTTON') await ui.click('.px-mailbar button', 'draft');
    },
    title: 'Decide, and send the email',
    body: 'Advance, hold or reject. Proofwork drafts the email to the candidate for you to edit and send.',
  },
  {
    path: '/app',
    end: true,
    title: 'That’s Proofwork',
    body: 'Real tasks, their reasoning in their own voice, and evidence your whole team can act on.',
  },
];

const candidatePath = (step: number) => `/c/${DEMO_TOKEN}?step=${step}`;
const frame = (at: Parameters<typeof import('./fakeApi').showCandidateFrame>[0]) => async () =>
  (await import('./fakeApi')).showCandidateFrame(at);

const CANDIDATE: TourStep[] = [
  {
    path: candidatePath(0),
    prepare: frame('intro'),
    target: '[data-tour="how-it-works"]',
    title: 'A private link, nothing to install',
    body: 'Candidates open their link and see exactly what to expect: how many questions, how long, and what’s recorded. No account, no webcam.',
  },
  {
    path: candidatePath(1),
    prepare: frame('intro'),
    target: '[data-tour="how-reviewed"]',
    title: 'Told up front how they’re judged',
    body: 'AI scores against a fixed rubric and people make every decision. Accent, fluency and nerves don’t count.',
  },
  {
    path: candidatePath(2),
    prepare: frame('brief'),
    target: '.brief-card',
    title: 'A realistic brief with real numbers',
    body: 'Every candidate gets their own version of the numbers, so answers can’t be passed around.',
  },
  {
    path: candidatePath(3),
    prepare: frame(0),
    target: '.think-aloud-panel',
    title: 'Thinking out loud',
    body: 'Key questions record their reasoning from the moment they open, next to a scratchpad. Audio only, never video.',
  },
  {
    path: candidatePath(4),
    prepare: frame(1),
    target: '.choices',
    title: 'A real decision',
    body: 'They commit to one option and explain why, with the numbers to back it.',
  },
  {
    path: candidatePath(5),
    prepare: frame(2),
    target: '.stage-main .card',
    title: 'The situation changes',
    body: 'What happens next depends on what they chose, so you see how they adapt when the plan meets reality.',
  },
  {
    path: candidatePath(6),
    prepare: frame(3),
    target: '.answer-card',
    title: 'One task with AI allowed',
    body: 'They use any AI tool and paste the conversation, so you see how they work with AI, not just whether they do.',
  },
  {
    path: candidatePath(7),
    prepare: frame('done'),
    end: true,
    title: 'That’s the candidate’s side',
    body: 'About 35 minutes, no account, no webcam. Then the hiring team gets an AI review with the evidence behind every score.',
  },
];

export const TOURS: Record<TourId, TourStep[]> = { recruiter: RECRUITER, candidate: CANDIDATE };

/** Where the candidate walkthrough's "see what the hiring team gets" picks up the recruiter tour. */
export const REVIEW_STEP = RECRUITER.findIndex((step) => step.target === '.rv-head');
