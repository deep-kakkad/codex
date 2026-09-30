import { describe, expect, it } from 'vitest';
import { getRoleFamily } from '../shared/roleFamilies';
import { computeScore, sanitizeScores, suggestedRecommendation } from '../shared/scoring';
import { describeSignals, sanitizeSignals } from '../shared/signals';
import type { ReviewScores } from '../shared/types';
import { buildContext, generateVariant } from '../shared/variants';
import { buildVerificationScript, excerpt, type ResponseForScript } from '../shared/verification';

const family = getRoleFamily('performance-marketing')!;

function allScores(value: number): ReviewScores {
  const scores: ReviewScores = {};
  for (const stage of family.stages) {
    if (!stage.scored) continue;
    scores[stage.id] = Object.fromEntries(stage.rubric.map((c) => [c.id, value]));
  }
  return scores;
}

describe('scoring', () => {
  it('weights criteria and reports completeness', () => {
    expect(computeScore(family, {}).overall).toBeNull();
    const full = computeScore(family, allScores(3));
    expect(full.overall).toBe(3);
    expect(full.complete).toBe(true);

    // first-read: numbers (weight 2) = 4, skepticism = 1, priority = 1 -> (8 + 1 + 1) / 4 = 2.5
    const partial = computeScore(family, { 'first-read': { numbers: 4, skepticism: 1, priority: 1 } });
    expect(partial.byStage['first-read']).toBe(2.5);
    expect(partial.complete).toBe(false);
  });

  it('drops unknown stages, unknown criteria and out-of-range values', () => {
    const clean = sanitizeScores(family, {
      'first-read': { numbers: 4, skepticism: 9, bogus: 2 },
      warmup: { anything: 3 },
      nope: { numbers: 1 },
    });
    expect(clean).toEqual({ 'first-read': { numbers: 4 } });
  });

  it('suggests a recommendation from the overall score', () => {
    expect(suggestedRecommendation(3.2)).toBe('advance');
    expect(suggestedRecommendation(2.5)).toBe('hold');
    expect(suggestedRecommendation(1.8)).toBe('reject');
    expect(suggestedRecommendation(null)).toBeNull();
  });
});

describe('signals', () => {
  it('treats big pastes as notable except where AI is allowed', () => {
    const signals = sanitizeSignals({ pasteCount: 1, pasteChars: 600, largestPaste: 600 });
    expect(describeSignals('scenario', signals, 700)[0].level).toBe('notable');
    expect(describeSignals('ai_allowed', signals, 700)[0].level).toBe('info');
  });

  it('sanitises garbage input', () => {
    expect(sanitizeSignals({ tabHidden: -3, hiddenMs: 'x', pasteCount: 2.6 })).toEqual({
      tabHidden: 0,
      hiddenMs: 0,
      pasteCount: 3,
      pasteChars: 0,
      largestPaste: 0,
      keystrokes: 0,
    });
  });
});

describe('verification script', () => {
  const variant = generateVariant(family, 7, 'INR');
  const ctx = buildContext(variant, 'INR', { 'budget-cut': 'search' });
  const response = (stageId: string, extra: Partial<ResponseForScript> = {}): ResponseForScript => ({
    stageId,
    text: 'I would look at blended CPA against break-even first because the dashboards over-claim.',
    choiceId: null,
    aiTranscript: null,
    reflection: null,
    hasVoice: false,
    voiceSec: null,
    closedReason: 'submitted',
    signals: null,
    ...extra,
  });

  it('puts probes with notable signals and past-work first', () => {
    const script = buildVerificationScript(family, ctx, { name: 'Asha Rao', idName: 'Asha Rao' }, [
      response('warmup', { hasVoice: true }),
      response('first-read'),
      response('budget-cut', { choiceId: 'search' }),
      response('agency-plan', { signals: sanitizeSignals({ pasteCount: 1, pasteChars: 900, largestPaste: 900 }) }),
      response('real-decision'),
    ]);
    expect(script.probes[0].stageId).toBe('agency-plan');
    expect(script.probes[1].stageId).toBe('real-decision');
    expect(script.probes.find((p) => p.stageId === 'budget-cut')?.questions[0]).toContain('Google Search');
    expect(script.identity.join(' ')).toContain('Asha Rao');
    expect(script.identity.join(' ')).toContain('voice note');
  });

  it('flags an ID name that differs from the invited name', () => {
    const script = buildVerificationScript(family, ctx, { name: 'Asha Rao', idName: 'A. Venkatesh' }, []);
    expect(script.identity.some((line) => line.includes('A. Venkatesh'))).toBe(true);
  });

  it('truncates long excerpts on a word boundary', () => {
    const long = 'word '.repeat(100);
    const cut = excerpt(long, 50);
    expect(cut.length).toBeLessThanOrEqual(51);
    expect(cut.endsWith('…')).toBe(true);
  });
});
