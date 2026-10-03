import { describe, expect, it } from 'vitest';
import { getRoleFamily } from '../shared/roleFamilies';
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
});
