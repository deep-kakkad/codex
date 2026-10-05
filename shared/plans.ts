/** Plans and prices. Payments are not built yet: a recruiter asks to upgrade and we set it up. */
export type PlanId = 'trial' | 'starter' | 'growth' | 'payg' | 'pilot';

export type BillingCycle = 'monthly' | 'annual';

/** What paid for one review. */
export type Coverage = 'plan' | 'bonus' | 'credit' | 'extra';

export interface PlanOffer {
  id: 'starter' | 'growth' | 'payg';
  name: string;
  price: string;
  per: string;
  /** Billed yearly: ten months' price for twelve. Pay as you go has no annual option. */
  annual?: { price: string; perMonth: string };
  /** For revenue estimates in the admin console, in rupees. */
  monthlyInr?: number;
  annualInr?: number;
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

/** Pay as you go: the price of one reviewed candidate. */
export const PAYG_REVIEW_INR = 249;

export const EXTRA_REVIEW_PRICE = '₹149';
export const EXTRA_REVIEW_INR = 149;
/** For showing AI costs in rupees. */
export const USD_TO_INR = 88;

/** A referral earns this many free reviews for both teams. */
export const REFERRAL_REVIEWS = 10;
/** Referred teams that earn the referrer reviews, at most. */
export const REFERRAL_CAP = 20;

export const PLAN_OFFERS: PlanOffer[] = [
  {
    id: 'starter',
    name: 'Starter',
    price: '₹4,999',
    per: 'per month',
    annual: { price: '₹49,990', perMonth: '₹4,166' },
    monthlyInr: 4999,
    annualInr: 49990,
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
    annual: { price: '₹1,49,990', perMonth: '₹12,499' },
    monthlyInr: 14999,
    annualInr: 149990,
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
