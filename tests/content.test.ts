import { describe, expect, it } from 'vitest';
import { exampleSpec } from '../server/ai/generateFamily';
import { ROLE_FAMILIES } from '../shared/roleFamilies';
import { SpecError, familyFromSpec, parseFamilySpec } from '../shared/roleFamilies/custom';
import type { Block, Currency, RoleFamily } from '../shared/types';
import { buildContext, createRng, generateVariant, n } from '../shared/variants';

const CURRENCIES: Currency[] = ['INR', 'USD'];
const SEEDS = Array.from({ length: 60 }, (_, i) => i * 7919 + 13);

function blockText(blocks: Block[]): string {
  return blocks
    .map((b) => {
      switch (b.type) {
        case 'list':
          return b.items.join('\n');
        case 'table':
          return [b.caption ?? '', ...b.columns, ...b.rows.flat()].join('\n');
        case 'quote':
          return `${b.text} ${b.cite ?? ''}`;
        default:
          return b.text;
      }
    })
    .join('\n');
}

/** Render every piece of content for every choice path. */
function renderAll(family: RoleFamily, seed: number, currency: Currency): string {
  const variant = generateVariant(family, seed, currency);
  const parts: string[] = [blockText(family.brief(buildContext(variant, currency)))];
  for (const stage of family.stages) {
    const source = stage.dependsOn ? family.stages.find((s) => s.id === stage.dependsOn) : undefined;
    const paths = source?.choices?.map((c) => ({ [source.id]: c.id })) ?? [{}];
    for (const choices of paths) {
      const ctx = buildContext(variant, currency, choices);
      parts.push(blockText(stage.prompt(ctx)));
      parts.push(blockText(stage.material?.(ctx) ?? []));
      parts.push(blockText(stage.reviewerGuide(ctx)));
      const answer = { excerpt: 'x', hasText: true, hasVoice: false, timedOut: false, choiceLabel: 'y' };
      parts.push(stage.followUps(ctx, answer).join('\n'));
    }
  }
  return parts.join('\n');
}

describe('seeded variants', () => {
  it('is deterministic for a seed and differs across seeds', () => {
    for (const family of ROLE_FAMILIES) {
      const a = generateVariant(family, 42, 'INR');
      const b = generateVariant(family, 42, 'INR');
      expect(a).toEqual(b);
      const distinct = new Set(SEEDS.map((seed) => JSON.stringify(generateVariant(family, seed, 'INR'))));
      expect(distinct.size).toBe(SEEDS.length);
    }
  });

  it('rng.int stays within bounds', () => {
    const rng = createRng(1);
    for (let i = 0; i < 1000; i++) {
      const value = rng.int(3, 7);
      expect(value).toBeGreaterThanOrEqual(3);
      expect(value).toBeLessThanOrEqual(7);
    }
  });
});

describe('role family content', () => {
  it('has unique stage ids, rubrics for scored stages and valid branch sources', () => {
    for (const family of ROLE_FAMILIES) {
      const ids = family.stages.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const stage of family.stages) {
        if (stage.scored) expect(stage.rubric.length).toBeGreaterThan(0);
        if (stage.kind === 'decision') expect(stage.choices?.length).toBeGreaterThan(1);
        // Think-aloud is for scored reasoning questions; the AI-allowed task keeps its transcript instead.
        if (stage.thinkAloud) {
          expect(stage.scored).toBe(true);
          expect(stage.kind).not.toBe('ai_allowed');
        }
        if (stage.dependsOn) {
          const sourceIndex = ids.indexOf(stage.dependsOn);
          expect(sourceIndex).toBeGreaterThanOrEqual(0);
          expect(sourceIndex).toBeLessThan(ids.indexOf(stage.id));
        }
      }
    }
  });

  it('renders every path without missing values', () => {
    for (const family of ROLE_FAMILIES) {
      for (const currency of CURRENCIES) {
        for (const seed of SEEDS) {
          const text = renderAll(family, seed, currency);
          expect(text).not.toMatch(/undefined|NaN|Infinity|\[object Object\]/);
        }
      }
    }
  });

  it('performance marketing numbers carry the planted flaws for every seed', () => {
    const family = ROLE_FAMILIES.find((f) => f.id === 'performance-marketing')!;
    for (const currency of CURRENCIES) {
      for (const seed of SEEDS) {
        const v = generateVariant(family, seed, currency);
        // Dashboards over-claim against store orders.
        expect(n(v, 'reportedOrders')).toBeGreaterThan(n(v, 'orders'));
        // The agency's target ROAS is below break-even.
        expect(n(v, 'agencyRoas')).toBeLessThan(n(v, 'breakEvenRoas'));
        // Channel spend adds up to total spend.
        const channels = n(v, 'metaSpend') + n(v, 'rtSpend') + n(v, 'searchSpend') + n(v, 'inflSpend');
        expect(channels).toBeCloseTo(n(v, 'spend'), 6);
        // Retargeting looks like the best channel on the dashboard.
        expect(n(v, 'rtSpend') / n(v, 'rtOrders')).toBeLessThan(n(v, 'metaSpend') / n(v, 'metaOrders'));
      }
    }
  });

  it('customer support demand always exceeds capacity', () => {
    const family = ROLE_FAMILIES.find((f) => f.id === 'customer-support-lead')!;
    for (const seed of SEEDS) {
      const v = generateVariant(family, seed, 'INR');
      expect(n(v, 'inboundToday')).toBeGreaterThan(n(v, 'capacity'));
      expect(n(v, 'backlog')).toBeGreaterThan(n(v, 'normalBacklog'));
    }
  });

  it('content and brand numbers carry the planted flaws for every seed', () => {
    const family = ROLE_FAMILIES.find((f) => f.id === 'content-brand')!;
    for (const currency of CURRENCIES) {
      for (const seed of SEEDS) {
        const v = generateVariant(family, seed, currency);
        // The brief's "cheapest" claim is false.
        expect(n(v, 'competitorPrice')).toBeLessThan(n(v, 'price'));
        // The listicle brings the most traffic and converts worst; the comparison page converts best.
        const rate = (page: string) => n(v, `${page}Trials`) / n(v, `${page}Sessions`);
        for (const page of ['guide', 'template', 'comparison', 'other']) {
          expect(n(v, 'listicleSessions')).toBeGreaterThan(n(v, `${page}Sessions`));
          expect(rate('listicle')).toBeLessThan(rate(page));
          if (page !== 'comparison') expect(rate('comparison')).toBeGreaterThan(rate(page));
        }
        // Customers buy for the differentiator, not price.
        expect(n(v, 'reasonDifferentiatorPct')).toBeGreaterThan(n(v, 'reasonPricePct'));
      }
    }
  });

  it('SEO numbers point at the migration, not the core update, for every seed', () => {
    const family = ROLE_FAMILIES.find((f) => f.id === 'seo')!;
    for (const seed of SEEDS) {
      const v = generateVariant(family, seed, 'USD');
      expect(n(v, 'catDropPct')).toBeGreaterThanOrEqual(n(v, 'prodDropPct') + 40);
      expect(Math.abs(n(v, 'blogChangePct'))).toBeLessThanOrEqual(3);
      expect(Math.abs(n(v, 'competitorChangePct'))).toBeLessThanOrEqual(3);
      // The 404s are the old category URLs.
      expect(n(v, 'notFound')).toBeLessThanOrEqual(n(v, 'oldCategoryUrls'));
      expect(n(v, 'notFound')).toBeGreaterThan(n(v, 'oldCategoryUrls') * 0.9);
      expect(n(v, 'indexedAfter')).toBeLessThan(n(v, 'indexedBefore'));
      expect(n(v, 'revenueAfter')).toBeLessThan(n(v, 'revenueBefore'));
    }
  });

  it('social media numbers carry the planted flaws for every seed', () => {
    const family = ROLE_FAMILIES.find((f) => f.id === 'social-media')!;
    for (const currency of CURRENCIES) {
      for (const seed of SEEDS) {
        const v = generateVariant(family, seed, currency);
        // The giveaway inflates engagement but sells least; Reels sell most.
        for (const format of ['reels', 'carousels', 'shorts']) {
          expect(n(v, 'giveawayEngagements')).toBeGreaterThan(n(v, `${format}Engagements`) / n(v, `${format}Posts`));
          expect(n(v, 'giveawaySales')).toBeLessThan(n(v, `${format}Sales`));
          if (format !== 'reels') expect(n(v, 'reelsSales')).toBeGreaterThan(n(v, `${format}Sales`));
        }
        expect(n(v, 'erNow')).toBeGreaterThan(n(v, 'erBefore') + 2);
        expect(Math.abs(n(v, 'erWithoutGiveaway') - n(v, 'erBefore'))).toBeLessThanOrEqual(0.5);
        expect(n(v, 'unfollowPct')).toBeGreaterThan(50);
      }
    }
  });
});

describe('AI-generated role families', () => {
  /** What a model would send: the spec as JSON, without the currency we set ourselves. */
  const asModelOutput = (familyIndex = 1) => {
    const { currency: _currency, ...spec } = exampleSpec(ROLE_FAMILIES[familyIndex], 'USD');
    return JSON.parse(JSON.stringify(spec));
  };

  it('accepts every practitioner-written family in spec form and renders every path', () => {
    for (let i = 0; i < ROLE_FAMILIES.length; i++) {
      const spec = parseFamilySpec(asModelOutput(i), 'USD');
      const family = familyFromSpec('gen-test', spec);
      expect(family.fixedCurrency).toBe('USD');
      expect(family.stages[0].id).toBe('warmup');
      expect(family.stages.at(-1)!.id).toBe('past-work');
      for (const seed of SEEDS.slice(0, 3)) {
        expect(renderAll(family, seed, 'USD')).not.toMatch(/undefined|NaN|Infinity|\[object Object\]/);
      }
    }
  });

  it('shows each branch the situation for the option chosen', () => {
    const family = familyFromSpec('gen-test', parseFamilySpec(asModelOutput(), 'USD'));
    const branch = family.stages.find((s) => s.kind === 'branch')!;
    const decision = family.stages.find((s) => s.id === branch.dependsOn)!;
    const [a, b] = decision.choices!;
    const variant = generateVariant(family, 1, 'USD');
    const text = (choice: string) => blockText(branch.prompt(buildContext(variant, 'USD', { [decision.id]: choice })));
    expect(text(a.id)).not.toBe(text(b.id));
  });

  it('rejects specs that would break the candidate flow, listing every problem', () => {
    const spec = asModelOutput();
    const branch = spec.stages.find((s: { kind: string }) => s.kind === 'branch');
    delete branch.branches[Object.keys(branch.branches)[0]];
    spec.stages.find((s: { kind: string }) => s.kind === 'critique').material = [];
    spec.brief[0] = { type: 'html', text: '<script>' };
    spec.stages.push({ ...spec.stages[0] });
    try {
      parseFamilySpec(spec, 'USD');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(SpecError);
      const issues = (error as SpecError).issues.join('\n');
      expect(issues).toMatch(/branches\.\w[\w-]* is missing/);
      expect(issues).toMatch(/material must be a list/);
      expect(issues).toMatch(/brief\[0\]\.type/);
      expect(issues).toMatch(/is repeated/);
    }
    expect(() => parseFamilySpec({ ...asModelOutput(), stages: [] }, 'USD')).toThrow(SpecError);
    expect(() => parseFamilySpec('not an object', 'USD')).toThrow(SpecError);
  });
});

describe('client bundle boundary', () => {
  it('never imports role family content (answer keys) into the web client', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs');
    const path = await import('node:path');
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const full = path.join(dir, name);
        return statSync(full).isDirectory() ? walk(full) : [full];
      });
    const offenders = walk(path.resolve(__dirname, '../web/src')).filter((file) =>
      /shared\/(roleFamilies|verification|variants|scoring)/.test(readFileSync(file, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});
