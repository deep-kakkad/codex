import { Fragment, type ReactNode } from 'react';

/** Initials on a soft colour picked from the name, so people are easy to tell apart. */
export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span className={`avatar avatar-${size} avatar-hue-${hash % 6}`} aria-hidden="true">
      {initials || '?'}
    </span>
  );
}

const ADVANCE_AT = 3;
const HOLD_AT = 2.3;

/** Overall score as a dial out of 4, with the hold and advance lines marked. */
export function ScoreRing({ value, size = 104 }: { value: number | null; size?: number }) {
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const tone = value === null ? 'none' : value >= ADVANCE_AT ? 'good' : value >= HOLD_AT ? 'mid' : 'low';
  // A tick on the ring at a score, measured clockwise from the top.
  const tick = (score: number) => {
    const angle = (score / 4) * 2 * Math.PI - Math.PI / 2;
    const inner = r - stroke / 2 - 2;
    const outer = r + stroke / 2 + 2;
    return {
      x1: size / 2 + inner * Math.cos(angle),
      y1: size / 2 + inner * Math.sin(angle),
      x2: size / 2 + outer * Math.cos(angle),
      y2: size / 2 + outer * Math.sin(angle),
    };
  };
  return (
    <div className={`ring tone-${tone}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" />
        <circle
          className="ring-arc"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - (value ?? 0) / 4)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ ['--ring-c' as string]: c }}
        />
        <line className="ring-tick" {...tick(HOLD_AT)} />
        <line className="ring-tick ring-tick-advance" {...tick(ADVANCE_AT)} />
      </svg>
      <div className="ring-label">
        <span className="ring-value">{value?.toFixed(1) ?? '—'}</span>
        <span className="ring-max">out of 4</span>
      </div>
    </div>
  );
}

export interface Evidence {
  id: string;
  label: string;
  quote: string;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The parts of an AI quote worth searching for: trimmed, split at ellipses, long enough to be distinctive. */
function fragments(quote: string): string[] {
  return quote
    .replace(/^[\s"'“”‘’]+|[\s"'“”‘’]+$/g, '')
    .split(/\s*(?:\.\.\.|…)\s*/)
    .map((f) => f.replace(/^[\s"'“”‘’.,;:]+|[\s"'“”‘’.,;:]+$/g, ''))
    .filter((f) => f.split(/\s+/).length >= 3 || f.length >= 14);
}

/** Where each quote appears in the text, tolerant of whitespace, case and curly quotes. */
export function findEvidence(text: string, evidence: Evidence[]) {
  const spans: { start: number; end: number; id: string; label: string }[] = [];
  for (const e of evidence) {
    for (const fragment of fragments(e.quote)) {
      const pattern = fragment
        .split(/\s+/)
        .map((word) => escapeRe(word).replace(/['’]/g, "['’]").replace(/["“”]/g, '["“”]'))
        .join('\\s+');
      const match = new RegExp(pattern, 'i').exec(text);
      if (match) spans.push({ start: match.index, end: match.index + match[0].length, id: e.id, label: e.label });
    }
  }
  // Earliest first; drop overlaps so marks never nest.
  spans.sort((a, b) => a.start - b.start);
  const kept: typeof spans = [];
  for (const s of spans) if (!kept.length || s.start >= kept[kept.length - 1].end) kept.push(s);
  return kept;
}

/** Candidate text with the AI's evidence highlighted in place. */
export function Highlighted({ text, evidence }: { text: string; evidence: Evidence[] }): ReactNode {
  const spans = findEvidence(text, evidence);
  if (!spans.length) return text;
  const out: ReactNode[] = [];
  let at = 0;
  spans.forEach((s, i) => {
    if (s.start > at) out.push(<Fragment key={`t${i}`}>{text.slice(at, s.start)}</Fragment>);
    out.push(
      <mark key={`m${i}`} className="evidence-mark" data-crit={s.id} title={`Evidence for "${s.label}"`}>
        {text.slice(s.start, s.end)}
      </mark>,
    );
    at = s.end;
  });
  if (at < text.length) out.push(<Fragment key="end">{text.slice(at)}</Fragment>);
  return out;
}
