import { describe, expect, it } from 'vitest';
import { ROLE_FAMILIES } from '../shared/roleFamilies';
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
