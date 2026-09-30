import type { Currency, Formatter, RoleFamily, Rng, StageContext, Variant } from './types';

/** mulberry32: small, fast, deterministic PRNG. Same seed -> same scenario. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (items) => items[Math.floor(next() * items.length)],
  };
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

export function createFormatter(currency: Currency): Formatter {
  const locale = currency === 'INR' ? 'en-IN' : 'en-US';
  const money = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  });
  const num = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  return {
    money: (n) => money.format(Math.round(n)),
    num: (n) => num.format(Math.round(n)),
    pct: (n) => `${Math.round(n)}%`,
    x: (n) => `${n.toFixed(1)}x`,
  };
}

export function generateVariant(family: RoleFamily, seed: number, currency: Currency): Variant {
  const rng = createRng(seed);
  const variant = family.generate(rng, currency);
  if (family.warmups?.length) {
    variant.warmup = createRng(seed ^ 0x5bd1e995).pick(family.warmups);
  }
  return variant;
}

export function buildContext(
  variant: Variant,
  currency: Currency,
  choices: Record<string, string | undefined> = {},
): StageContext {
  return { variant, currency, fmt: createFormatter(currency), choices };
}

/** Typed accessors so content files read cleanly. */
export const n = (v: Variant, key: string): number => {
  const value = v[key];
  if (typeof value !== 'number') throw new Error(`Variant value "${key}" is not a number`);
  return value;
};

export const s = (v: Variant, key: string): string => {
  const value = v[key];
  if (value === undefined) throw new Error(`Variant value "${key}" is missing`);
  return String(value);
};
