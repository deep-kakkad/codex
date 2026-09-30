import type { ScratchSnapshot } from './types';

export const SCRATCH_LIMITS = { snapshots: 200, chars: 5_000 };

/** Keeps well-formed snapshots inside the question's time window, oldest first. */
export function sanitizeScratch(input: unknown, maxT: number): ScratchSnapshot[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const clean: ScratchSnapshot[] = [];
  for (const item of input) {
    if (!item || typeof item !== 'object') continue;
    const { t, text } = item as Record<string, unknown>;
    if (typeof t !== 'number' || !Number.isFinite(t) || typeof text !== 'string') continue;
    clean.push({ t: Math.round(Math.min(Math.max(t, 0), maxT)), text: text.slice(0, SCRATCH_LIMITS.chars) });
  }
  clean.sort((a, b) => a.t - b.t);
  return clean.slice(-SCRATCH_LIMITS.snapshots);
}
