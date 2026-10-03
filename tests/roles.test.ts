import { describe, expect, it } from 'vitest';
import { getRoleFamily } from '../shared/roleFamilies';
import { baCapacity } from '../shared/roleFamilies/businessAnalyst';
import { regionMath } from '../shared/roleFamilies/dataAnalyst';
import { siteMath } from '../shared/roleFamilies/operationsManager';
import { experimentMath } from '../shared/roleFamilies/productAnalyst';
import { projectGoLive } from '../shared/roleFamilies/projectManager';
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
});
