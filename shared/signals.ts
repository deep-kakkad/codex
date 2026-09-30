import type { StageKind, StageSignals } from './types';
import { EMPTY_SIGNALS } from './types';

export interface SignalNote {
  level: 'info' | 'notable';
  text: string;
}

/**
 * Integrity signals are weak evidence: a second phone or an invisible overlay
 * never trips them, and honest candidates switch tabs to find a calculator.
 * They are only used to decide what to probe on the live call.
 */
export function describeSignals(kind: StageKind, signals: StageSignals | null, answerChars: number): SignalNote[] {
  const sig = { ...EMPTY_SIGNALS, ...(signals ?? {}) };
  const notes: SignalNote[] = [];
  const aiAllowed = kind === 'ai_allowed';

  if (sig.tabHidden > 0) {
    const seconds = Math.round(sig.hiddenMs / 1000);
    notes.push({
      level: !aiAllowed && (sig.tabHidden >= 3 || seconds >= 45) ? 'notable' : 'info',
      text: `Left the tab ${sig.tabHidden} time${sig.tabHidden === 1 ? '' : 's'} (${formatDuration(seconds)} away)${aiAllowed ? ', expected here' : ''}`,
    });
  }

  if (sig.pasteCount > 0) {
    const share = answerChars > 0 ? Math.min(100, Math.round((sig.pasteChars / answerChars) * 100)) : 0;
    const large = sig.largestPaste >= 200 || share >= 50;
    notes.push({
      level: !aiAllowed && large ? 'notable' : 'info',
      text: `Pasted ${sig.pasteCount} time${sig.pasteCount === 1 ? '' : 's'}, ${sig.pasteChars} characters${share ? ` (~${share}% of the typed answer)` : ''}${aiAllowed ? ', expected here' : ''}`,
    });
  }

  return notes;
}

export function hasNotableSignals(kind: StageKind, signals: StageSignals | null, answerChars: number) {
  return describeSignals(kind, signals, answerChars).some((note) => note.level === 'notable');
}

export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

export function sanitizeSignals(input: unknown): StageSignals {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const count = (key: keyof StageSignals) => {
    const value = Number(raw[key]);
    return Number.isFinite(value) && value > 0 ? Math.min(Math.round(value), 10_000_000) : 0;
  };
  return {
    tabHidden: count('tabHidden'),
    hiddenMs: count('hiddenMs'),
    pasteCount: count('pasteCount'),
    pasteChars: count('pasteChars'),
    largestPaste: count('largestPaste'),
    keystrokes: count('keystrokes'),
  };
}
