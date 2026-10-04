import { describe, expect, it } from 'vitest';
import { getRoleFamily } from '../shared/roleFamilies';
import { reconMath } from '../shared/roleFamilies/accountant';
import { baCapacity } from '../shared/roleFamilies/businessAnalyst';
import { creatorMath } from '../shared/roleFamilies/communityInfluencer';
import { regionMath } from '../shared/roleFamilies/dataAnalyst';
import { equityMath } from '../shared/roleFamilies/equityResearch';
import { fpaMath } from '../shared/roleFamilies/fpaAnalyst';
import { attritionMath } from '../shared/roleFamilies/hrbp';
import { siteMath } from '../shared/roleFamilies/operationsManager';
import { experimentMath } from '../shared/roleFamilies/productAnalyst';
import { winLoss } from '../shared/roleFamilies/productMarketing';
import { projectGoLive } from '../shared/roleFamilies/projectManager';
import { formatMath } from '../shared/roleFamilies/socialMediaExecutive';
import { sdrPlayMath } from '../shared/roleFamilies/sdr';
import type { Currency } from '../shared/types';
import { generateVariant, n, s } from '../shared/variants';

/** The planted facts each hand-built role depends on, checked for every seed. */
const CURRENCIES: Currency[] = ['INR', 'USD'];
const SEEDS = Array.from({ length: 80 }, (_, i) => i * 7919 + 13);

function eachVariant(familyId: string, check: (v: ReturnType<typeof generateVariant>, currency: Currency) => void) {
  const family = getRoleFamily(familyId);
  expect(family).toBeDefined();
  for (const currency of CURRENCIES)
    for (const seed of SEEDS) check(generateVariant(family!, seed, currency), currency);
}

describe('hand-built roles keep their planted facts', () => {
  it('SDR: no single play closes the gap, and the strong leads fit', () => {
    eachVariant('sales-sdr', (v) => {
      const math = sdrPlayMath(v);
      const best = Math.max(...Object.values(math).map((m) => m.qualified));
      expect(best).toBeLessThan(n(v, 'gap'));
      // Personal emails or introductions beat the bought list on qualified meetings.
      expect(math.research.qualified).toBeGreaterThan(math.blast.qualified);
      // Every lead name is distinct and every archetype has a row.
      const names = Array.from({ length: 8 }, (_, i) => s(v, `lead${i}Name`));
      expect(new Set(names).size).toBe(8);
      for (const key of ['hiring', 'funded', 'renewal', 'giant', 'opener']) expect(names).toContain(s(v, `${key}Name`));
    });
  });

  it('AE: the proposal typo and the timeline trap are always there', () => {
    eachVariant('sales-ae', (v) => {
      expect(n(v, 'typoSeats')).not.toBe(n(v, 'seats'));
      expect(n(v, 'typoSeats')).toBeGreaterThan(0);
      // Procurement alone takes longer than the quarter has left.
      expect(n(v, 'procurementDays')).toBeGreaterThan(n(v, 'daysToQuarterEnd'));
      expect(n(v, 'daysInStage')).toBeGreaterThan(n(v, 'avgDaysInStage') * 2);
      expect(n(v, 'gapToQuota')).toBeGreaterThan(0);
    });
  });

  it('Support executive: distinct tickets, a near-breach and a refund above the limit', () => {
    eachVariant('support-executive', (v) => {
      const ids = ['hacked', 'safety', 'sla', 'double', 'angry', 'influencer', 'address', 'feedback'].map((k) =>
        s(v, `${k}Id`),
      );
      expect(new Set(ids).size).toBe(8);
      expect(n(v, 'slaWait')).toBeLessThan(n(v, 'slaHours'));
      expect(n(v, 'slaHours') - n(v, 'slaWait')).toBeLessThanOrEqual(4);
      expect(n(v, 'itemPrice')).toBeGreaterThan(n(v, 'goodwill'));
      expect(n(v, 'daysSince')).toBeGreaterThan(n(v, 'returnDays'));
    });
  });

  it('PM: the drop sits in new Android users', () => {
    eachVariant('product-manager', (v) => {
      expect(n(v, 'androidBefore') - n(v, 'androidAfter')).toBeGreaterThanOrEqual(8);
      expect(n(v, 'iosBefore') - n(v, 'iosAfter')).toBeLessThanOrEqual(1);
      expect(n(v, 'blendedAfter')).toBeLessThan(n(v, 'blendedBefore'));
      expect(n(v, 'otpTicketsAfter')).toBeGreaterThan(n(v, 'otpTicketsBefore') * 3);
      expect(n(v, 'ceoWeeks')).toBeGreaterThan(n(v, 'ceoDeadlineWeeks'));
      expect(n(v, 'onboardingWeeks')).toBeLessThan(n(v, 'engineerWeeks'));
    });
  });

  it('Product analyst: the split is off, conversion is up, revenue per user is down', () => {
    eachVariant('product-analyst', (v) => {
      const m = experimentMath(v);
      expect(m.treatShare).toBeLessThan(48);
      expect(m.lift).toBeGreaterThan(0);
      expect(m.tRp100).toBeLessThan(m.cRp100);
    });
  });

  it('UX designer: the address step is by far the leakiest', () => {
    eachVariant('ux-designer', (v) => {
      const address = n(v, 'atSlot') / n(v, 'atAddress');
      for (const other of [
        n(v, 'atAddress') / n(v, 'cart'),
        n(v, 'atPayment') / n(v, 'atSlot'),
        n(v, 'done') / n(v, 'atPayment'),
      ]) {
        expect(address).toBeLessThan(other - 0.15);
      }
      expect(n(v, 'redesignWeeks')).toBeGreaterThan(n(v, 'engineerWeeks'));
    });
  });

  it('Data analyst: the dashboard says East, the clean data says West', () => {
    eachVariant('data-analyst', (v) => {
      const rows = regionMath(v);
      const top = (key: 'shownGrowth' | 'trueGrowth') => [...rows].sort((a, b) => b[key] - a[key])[0].region;
      expect(top('shownGrowth')).toBe('East');
      expect(top('trueGrowth')).toBe('West');
    });
  });

  it('BA: manual checks can never keep up, risk routing can', () => {
    eachVariant('business-analyst', (v) => {
      const c = baCapacity(v);
      expect(c.shortfall).toBeGreaterThan(0);
      expect(c.manualIfRouted).toBeLessThan(c.capacity);
    });
  });

  it('IT support: distinct ticket numbers and the phishing ticket is present', () => {
    eachVariant('it-support', (v) => {
      const ids = ['phish', 'vpn', 'ceo', 'joiner', 'printer', 'resets', 'laptop', 'software'].map((k) =>
        s(v, `${k}Id`),
      );
      expect(new Set(ids).size).toBe(8);
      expect(n(v, 'outageMins')).toBeLessThan(60);
    });
  });

  it('Ops: only the late-truck site is short of capacity today; the spike overloads all', () => {
    eachVariant('operations-manager', (v) => {
      const [a, b, late] = siteMath(v);
      expect(late.capacity).toBeLessThan(late.orders);
      expect(a.capacity).toBeGreaterThan(a.orders);
      expect(b.capacity).toBeGreaterThan(b.orders);
      // The late site has as many pickers as the smallest other site, give or take.
      expect(late.pickers).toBeGreaterThanOrEqual(36);
      for (const site of [a, b]) expect(site.orders * (1 + n(v, 'spikePct') / 100)).toBeGreaterThan(site.capacity);
    });
  });

  it('Project manager: the plan can never make the promised date', () => {
    eachVariant('project-manager', (v) => {
      expect(projectGoLive(v)).toBeGreaterThan(n(v, 'weeksToLaunch'));
      expect(n(v, 'buildDoneWeek')).toBeGreaterThan(0);
    });
  });

  it("Founder's office: each order loses money and the runway shrinks", () => {
    eachVariant('founders-office', (v) => {
      expect(n(v, 'cmAfter')).toBeLessThan(0);
      expect(n(v, 'cmBefore')).toBeGreaterThan(0);
      expect(n(v, 'burnAfter')).toBeGreaterThan(n(v, 'burnBefore'));
      expect(n(v, 'discountAfter')).toBeGreaterThan(n(v, 'discountBefore') * 1.5);
    });
  });

  it('FP&A: revenue misses on price, profit beats on delayed costs', () => {
    eachVariant('fpa-analyst', (v) => {
      const m = fpaMath(v);
      expect(m.revVar).toBeLessThan(0);
      expect(m.priceEffect).toBeLessThan(0);
      expect(Math.abs(m.volumeEffect)).toBeLessThan(Math.abs(m.priceEffect));
      expect(m.ebitdaA).toBeGreaterThan(m.ebitdaB);
    });
  });

  it('Accountant: the reconciling items explain the whole difference', () => {
    eachVariant('accountant', (v) => {
      const r = reconMath(v);
      const items = n(v, 'unclearedCheque') - n(v, 'bankCharges') - n(v, 'dupReceipt') + n(v, 'unrecordedReceipt');
      expect(r.difference).toBe(items);
      expect(r.difference).not.toBe(0);
      expect(new Set([s(v, 'vendorQ'), s(v, 'vendorP'), s(v, 'vendorS')]).size).toBe(3);
      expect(n(v, 'newInvoice')).toBeGreaterThan(n(v, 'dupPayment'));
      expect(n(v, 'overdueAmount')).toBeGreaterThan(n(v, 'paidLastWeek'));
    });
  });

  it('Equity research: growth up, cash and collections getting worse every year', () => {
    eachVariant('equity-research', (v) => {
      const rows = equityMath(v);
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i].revenue).toBeGreaterThan(rows[i - 1].revenue);
        expect(rows[i].receivableDays).toBeGreaterThan(rows[i - 1].receivableDays);
        expect(rows[i].ocf / rows[i].ebitda).toBeLessThan(rows[i - 1].ocf / rows[i - 1].ebitda);
        expect(rows[i].pledgePct).toBeGreaterThan(rows[i - 1].pledgePct);
      }
      expect(n(v, 'pe')).toBeLessThan(n(v, 'peerPe'));
    });
  });

  it('HRBP: one team carries the attrition; pay is the same gap everywhere', () => {
    eachVariant('hr-business-partner', (v) => {
      const a = attritionMath(v);
      const [hot, ...rest] = a.teams;
      for (const t of rest) expect(hot.rate).toBeGreaterThan(t.rate * 2);
      expect(hot.rate).toBeGreaterThan(a.overall + 10);
      expect(n(v, 'exitManagerPct')).toBeGreaterThan(n(v, 'exitPayPct') * 2);
    });
  });

  it('Recruiter: distinct names and a budget below the market', () => {
    eachVariant('recruiter', (v) => {
      const names = ['brand', 'fit', 'hopper', 'overband', 'switcher', 'mba', 'mismatch', 'gap'].map((k) =>
        s(v, `${k}Name`),
      );
      expect(new Set(names).size).toBe(8);
      expect(s(v, 'fitName')).not.toBe(s(v, 'switcherName'));
    });
  });

  it('L&D: training everyone costs more than the budget; new managers fit', () => {
    eachVariant('learning-development', (v) => {
      expect(n(v, 'managers') * n(v, 'perHeadTwoDay')).toBeGreaterThan(n(v, 'budget'));
      expect(n(v, 'newManagers') * n(v, 'perHeadTwoDay') * 1.5).toBeLessThan(n(v, 'budget'));
      expect(n(v, 'selfFeedback') - n(v, 'teamFeedback')).toBeGreaterThan(1);
    });
  });

  it('PMM: wins are mid-size, losses are large companies', () => {
    eachVariant('product-marketing', (v) => {
      const w = winLoss(v);
      expect(w.midWins / (w.midWins + w.midLosses)).toBeGreaterThan(0.65);
      expect(w.entWins / (w.entWins + w.entLosses)).toBeLessThan(0.25);
      expect(w.midWins + w.midLosses + w.entWins + w.entLosses).toBe(40);
      expect(w.winSpeed).toBeGreaterThan(w.winFeatures * 2);
    });
  });

  it('Influencer: the biggest account is the worst value per real view', () => {
    eachVariant('community-influencer', (v) => {
      const rows = creatorMath(v);
      const bought = rows.find((r) => r.key === 'bought')!;
      for (const r of rows) if (r.key !== 'bought') expect(bought.costPer1k).toBeGreaterThan(r.costPer1k);
      expect(n(v, 'boughtFollowers')).toBeGreaterThan(n(v, 'macroFollowers'));
      expect(new Set(rows.map((r) => r.handle)).size).toBe(6);
    });
  });

  it('Copywriter: the insight beats features and price', () => {
    eachVariant('copywriter', (v) => {
      expect(n(v, 'insightPct')).toBeGreaterThan(n(v, 'pricePct') + n(v, 'featurePct'));
    });
  });

  it('Social media executive: trends win reach, carousels win clicks', () => {
    eachVariant('social-media-executive', (v) => {
      const rows = formatMath(v);
      const get = (k: string) => rows.find((r) => r.key === k)!;
      expect(get('trends').reach).toBeGreaterThan(
        Math.max(...rows.filter((r) => r.key !== 'trends').map((r) => r.reach)),
      );
      expect(get('carousels').clicks).toBeGreaterThan(
        Math.max(...rows.filter((r) => r.key !== 'carousels').map((r) => r.clicks)),
      );
      expect(n(v, 'typoPrice')).not.toBe(n(v, 'price'));
    });
  });
});
