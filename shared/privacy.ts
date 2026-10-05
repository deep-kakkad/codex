/** Privacy settings and facts shown on the trust, privacy and DPA pages. */

/** Which version of the privacy notice a candidate agreed to; change it when the notice changes. */
export const PRIVACY_NOTICE_VERSION = '2026-10-05';
export const PRIVACY_NOTICE_UPDATED = '5 October 2026';

/** Where people send privacy questions and requests. */
export const PRIVACY_EMAIL = 'privacy@proofwork.example';

/** How long a workspace may keep candidates' recordings. */
export const RECORDING_DAY_OPTIONS = [30, 90, 180, 365] as const;
export const DEFAULT_RECORDING_DAYS = 180;

/** Database copies are kept this long, so deleted data is gone from them within it. */
export const BACKUP_DAYS = 14;

export interface Subprocessor {
  name: string;
  purpose: string;
  data: string;
  location: string;
}

/** Everyone who processes personal data for Proofwork. Keep in step with the code. */
export const SUBPROCESSORS: Subprocessor[] = [
  {
    name: 'Netlify',
    purpose: 'Hosts the website and API, runs background jobs, stores recordings and nightly database copies',
    data: 'All of the data below, including recordings',
    location: 'United States',
  },
  {
    name: 'Neon',
    purpose: 'Database',
    data: 'Accounts, assessments, candidates’ written answers, transcripts and reviews',
    location: 'United States (AWS, Ohio)',
  },
  {
    name: 'OpenRouter',
    purpose: 'Passes AI requests to the model provider',
    data: 'Candidates’ answers and recordings; job descriptions pasted to write a scenario',
    location: 'United States',
  },
  {
    name: 'Google (Gemini models, through OpenRouter)',
    purpose: 'Transcribes recordings and reviews answers against the rubric',
    data: 'Candidates’ answers and recordings; job descriptions pasted to write a scenario',
    location: 'Google’s data centres',
  },
];
