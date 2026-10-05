/**
 * What the public marketing pages say: the role library (from the same public
 * summaries the demo uses), the comparison pages, and every page's title and
 * description. The build renders these pages to static HTML (server/prerender.tsx).
 */
import type { RoleFamilySummary } from '../../../shared/api';
import library from '../demo/content/library.json';

export const SITE_URL = 'https://proofwork-hiring.netlify.app';

export const ROLES = library as RoleFamilySummary[];

export const roleById = (id: string) => ROLES.find((r) => r.id === id);

/** Roles grouped by job function, in the library's order. */
export function rolesByFunction() {
  const groups = new Map<string, RoleFamilySummary[]>();
  for (const role of ROLES) {
    const key = role.catalog?.function ?? 'Other';
    groups.set(key, [...(groups.get(key) ?? []), role]);
  }
  return [...groups.entries()];
}

export interface Versus {
  slug: string;
  name: string;
  /** "Proofwork vs …" in headings. */
  short: string;
  goodFor: string;
  lead: string;
  rows: { label: string; us: string; them: string }[];
  chooseThem: string[];
  chooseUs: string[];
  /** How the two can sit side by side in one hiring process. */
  together: string;
}

export const VERSUS: Versus[] = [
  {
    slug: 'testgorilla',
    name: 'TestGorilla',
    short: 'TestGorilla',
    goodFor: 'screening large volumes on general skills, aptitude and personality',
    lead: 'TestGorilla is built around a large library of short, mostly timed tests you combine into one assessment. Proofwork gives each candidate one realistic situation from the job and shows you how they reason through it.',
    rows: [
      {
        label: 'What candidates do',
        us: 'One realistic scenario from the job: read the numbers, decide, react to a change, critique a plan',
        them: 'Several short tests, mostly multiple choice, often with a few custom questions',
      },
      {
        label: 'What you see',
        us: 'Their reasoning in their own voice, with quotes behind every score',
        them: 'A score per test, compared with other test takers',
      },
      {
        label: 'Candidate experience',
        us: 'About 30–40 minutes, no camera or proctoring',
        them: 'Depends on the tests chosen',
      },
    ],
    chooseThem: [
      'You need to screen thousands of applicants on general aptitude first.',
      'You want personality or culture questionnaires.',
    ],
    chooseUs: [
      'The role is about judgement with real numbers: marketing, sales, product, operations, finance.',
      'You want to know how someone thinks, not only whether they picked the right option.',
      'You want to see how they work with AI.',
    ],
    together: 'Some teams use a broad skills test on every applicant first, then Proofwork for the shortlist.',
  },
  {
    slug: 'hirevue',
    name: 'HireVue',
    short: 'HireVue',
    goodFor: 'high-volume, structured video screening at enterprise scale',
    lead: 'HireVue is best known for on-demand video interviews, where candidates record answers to set questions on camera. Proofwork asks no camera questions: candidates work through a realistic problem and think aloud, audio only.',
    rows: [
      {
        label: 'What candidates do',
        us: 'Work through a scenario from the job, thinking aloud on the key questions',
        them: 'Record video answers to interview questions; some roles add games or tests',
      },
      {
        label: 'What you see',
        us: 'Their working and decisions, scored against a rubric with their own words quoted',
        them: 'Recorded answers, with optional AI-assisted scoring',
      },
      {
        label: 'Camera',
        us: 'Never. Audio only, and accent, fluency and nerves aren’t assessed',
        them: 'Video is central to the interview',
      },
      {
        label: 'Set-up',
        us: 'Pick a role, invite people the same day',
        them: 'Typically an enterprise roll-out',
      },
    ],
    chooseThem: [
      'You run very large graduate or hourly hiring programmes with an enterprise HR stack.',
      'You specifically want recorded video interviews.',
    ],
    chooseUs: [
      'You want evidence of how someone does the work, not how they come across on camera.',
      'You care about candidates who won’t sit through a camera interview with a bot.',
      'You want to start this week, without a sales cycle.',
    ],
    together: 'Some teams keep video interviews for later rounds and use Proofwork to decide who gets one.',
  },
  {
    slug: 'hackerrank',
    name: 'HackerRank',
    short: 'HackerRank',
    goodFor: 'testing developers’ coding skills',
    lead: 'HackerRank is made for hiring software engineers: coding challenges, technical interviews and developer skills. Proofwork covers the business roles around them, from marketing and sales to product, data, operations, finance and HR.',
    rows: [
      {
        label: 'Roles',
        us: '27 business roles: marketing, sales, support, product, data, operations, finance, HR',
        them: 'Software engineering and related technical roles',
      },
      {
        label: 'What candidates do',
        us: 'A realistic business situation with numbers, decisions and a critique',
        them: 'Coding problems in an online editor',
      },
      {
        label: 'What you see',
        us: 'Reasoning in their own voice, with quotes behind every score',
        them: 'Code, test results and a score',
      },
    ],
    chooseThem: ['You are hiring software engineers.'],
    chooseUs: [
      'You are hiring for business roles that a coding test can’t assess.',
      'You want one tool for analysts, marketers, product managers and operators.',
    ],
    together: 'Many teams use HackerRank for engineering roles and Proofwork for the business roles around them.',
  },
  {
    slug: 'take-home',
    name: 'take-home assignments',
    short: 'take-home tasks',
    goodFor: 'seeing finished work on an open-ended problem',
    lead: 'Take-home tasks show finished work, but today a polished answer may say more about the candidate’s chatbot than about them, and good people drop out of tasks that take a weekend. Proofwork keeps the realism and shows you the thinking behind the answer.',
    rows: [
      {
        label: 'Time for candidates',
        us: 'About 30–40 minutes, timed per question',
        them: 'Often several hours',
      },
      {
        label: 'Who did the work',
        us: 'Think-aloud audio, their own numbers and an AI-allowed task make it clear',
        them: 'Hard to tell once AI is involved',
      },
      {
        label: 'Reviewing',
        us: 'AI reviews each answer against a rubric and quotes the evidence; your team decides',
        them: 'Someone on your team reads every submission',
      },
      {
        label: 'Fairness',
        us: 'Everyone gets the same situation and the same rubric',
        them: 'Depends on the reviewer',
      },
    ],
    chooseThem: ['The final stage needs a substantial piece of work, such as a portfolio-grade design.'],
    chooseUs: [
      'You want a shortlist before anyone on your team spends hours reading.',
      'You need to know what the candidate did, and what AI did.',
    ],
    together: 'Some teams shortlist with Proofwork, then set a take-home for the final two or three.',
  },
];

export const versusBySlug = (slug: string) => VERSUS.find((v) => v.slug === slug);

export interface PageMeta {
  title: string;
  description: string;
}

const clip = (text: string, max = 158) => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`);

/** Title and description for every public page, for the browser tab and search results. */
export function pageMeta(path: string): PageMeta | null {
  if (path === '/') {
    return {
      title: 'Proofwork · Practical hiring assessments, reviewed with evidence',
      description:
        'Real tasks from the job, reasoning in the candidate’s own voice, and one AI-allowed task. AI reviews with quoted evidence; your team decides.',
    };
  }
  if (path === '/roles') {
    return {
      title: `Practical skills assessments for ${ROLES.length} roles · Proofwork`,
      description:
        'Scenario-based assessments for marketing, sales, support, product, data, operations, finance and HR roles, written by practitioners and reviewed with evidence.',
    };
  }
  const role = path.startsWith('/roles/') ? roleById(path.slice('/roles/'.length)) : null;
  if (role) {
    return {
      title: `${role.name} assessment · Proofwork`,
      description: clip(
        `A ${role.totalMinutes}-minute practical assessment for ${role.roles[0]} roles. ${role.summary}`,
      ),
    };
  }
  const versus = path.startsWith('/compare/') ? versusBySlug(path.slice('/compare/'.length)) : null;
  if (versus) {
    return {
      title: `Proofwork vs ${versus.short}: which fits your hiring? · Proofwork`,
      description: clip(versus.lead),
    };
  }
  if (path === '/roi') {
    return {
      title: 'Hiring ROI calculator · Proofwork',
      description:
        'Work out how many hours of screening and interviews Proofwork saves your team each year, and what that is worth against its cost.',
    };
  }
  if (path === '/trust') {
    return {
      title: 'Trust and security · Proofwork',
      description:
        'How Proofwork protects candidates’ answers and recordings: security practices, sub-processors, retention, deletion and privacy law.',
    };
  }
  if (path === '/privacy') {
    return {
      title: 'Privacy notice · Proofwork',
      description: 'What Proofwork collects, why, who sees it, how long it is kept and what you can do about it.',
    };
  }
  if (path === '/dpa') {
    return {
      title: 'Data processing agreement · Proofwork',
      description:
        'Proofwork’s standard data processing agreement for customers, with security measures and sub-processors.',
    };
  }
  return null;
}

/** Every page the build renders to static HTML, and lists in the sitemap. */
export function publicPaths() {
  return [
    '/',
    '/roles',
    ...ROLES.map((r) => `/roles/${r.id}`),
    ...VERSUS.map((v) => `/compare/${v.slug}`),
    '/roi',
    '/trust',
    '/privacy',
    '/dpa',
  ];
}
