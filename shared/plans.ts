/** Plans and prices. Payments are not built yet: a recruiter asks to upgrade and we set it up. */
export type PlanId = 'trial' | 'starter' | 'growth' | 'payg' | 'pilot';

export interface PlanOffer {
  id: 'starter' | 'growth' | 'payg';
  name: string;
  price: string;
  per: string;
  blurb: string;
  features: string[];
}

/** Reviewed candidates a new workspace gets free. */
export const TRIAL_REVIEWS = 5;

export const PLAN_NAMES: Record<PlanId, string> = {
  trial: 'Free trial',
  starter: 'Starter',
  growth: 'Growth',
  payg: 'Pay as you go',
  pilot: 'Pilot',
};

/** Reviewed candidates included each month; beyond that, each one is billed as extra. */
export const MONTHLY_REVIEWS: Partial<Record<PlanId, number>> = { starter: 40, growth: 150 };

export const EXTRA_REVIEW_PRICE = '₹149';

export const PLAN_OFFERS: PlanOffer[] = [
  {
    id: 'starter',
    name: 'Starter',
    price: '₹4,999',
    per: 'per month',
    blurb: 'For a team hiring for a few roles at a time.',
    features: [
      '40 reviewed candidates a month',
      `${EXTRA_REVIEW_PRICE} for each one beyond that`,
      '2 recruiter seats',
      'Assessments built from your job descriptions',
    ],
  },
  {
    id: 'growth',
    name: 'Growth',
    price: '₹14,999',
    per: 'per month',
    blurb: 'For teams running several hiring pipelines.',
    features: [
      '150 reviewed candidates a month',
      `${EXTRA_REVIEW_PRICE} for each one beyond that`,
      '10 recruiter seats',
      'Everything in Starter',
    ],
  },
  {
    id: 'payg',
    name: 'Pay as you go',
    price: '₹249',
    per: 'per reviewed candidate',
    blurb: 'For agencies and occasional hiring. Credits last 12 months.',
    features: [
      'Buy credits when you need them',
      'Only finished candidates use a credit',
      'Unlimited assessments and seats',
    ],
  },
];
