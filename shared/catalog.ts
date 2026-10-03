/** How the role library is filtered: what a role is, at what level, where, and what it tests. */

export const JOB_FUNCTIONS = [
  'Sales',
  'Customer support',
  'Marketing',
  'Product & design',
  'Data & tech',
  'Operations',
  'Finance',
  'People & HR',
] as const;
export type JobFunction = (typeof JOB_FUNCTIONS)[number];

export const SENIORITIES = ['Entry', 'Mid', 'Senior', 'Manager'] as const;
export type Seniority = (typeof SENIORITIES)[number];

export const INDUSTRIES = [
  'SaaS',
  'D2C & e-commerce',
  'Consumer apps',
  'Fintech',
  'Retail',
  'Logistics',
  'Services',
  'Any',
] as const;
export type Industry = (typeof INDUSTRIES)[number];

export const SKILLS = [
  'Analysis',
  'Numbers',
  'Prioritisation',
  'Judgement',
  'Writing',
  'Communication',
  'Stakeholders',
  'Customer empathy',
  'Planning',
  'Leadership',
] as const;
export type Skill = (typeof SKILLS)[number];

export interface CatalogInfo {
  function: JobFunction;
  seniority: Seniority[];
  industries: Industry[];
  skills: Skill[];
  /** Other titles people search for, e.g. "BDR" for an SDR role. */
  keywords?: string[];
}
