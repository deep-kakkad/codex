import { type ReactNode, useState } from 'react';
import type { CandidateStatus, Decision, Recommendation, StageKind } from '../../../shared/types';
import { STAGE_KIND_LABEL } from '../../../shared/types';

const STATUS_LABEL: Record<CandidateStatus, string> = {
  invited: 'Invited',
  in_progress: 'In progress',
  submitted: 'Awaiting review',
  reviewed: 'Reviewed',
  decided: 'Decided',
};

export function StatusBadge({ status }: { status: CandidateStatus }) {
  return <span className={`badge badge-status-${status}`}>{STATUS_LABEL[status]}</span>;
}

const DECISION_LABEL: Record<Decision, string> = { advance: 'Advance', hold: 'Hold', reject: 'Reject' };

export function DecisionBadge({ decision }: { decision: Decision | null }) {
  if (!decision) return <span className="muted">—</span>;
  return <span className={`badge badge-decision-${decision}`}>{DECISION_LABEL[decision]}</span>;
}

const RECOMMENDATION_LABEL: Record<Recommendation, string> = {
  advance: 'Advance',
  hold: 'Hold',
  reject: 'Do not advance',
};

/** The AI's rubric-based suggestion; the decision stays with the recruiter. */
export function RecommendationBadge({ value }: { value: Recommendation | null }) {
  if (!value) return <span className="muted">—</span>;
  return <span className={`badge badge-decision-${value}`}>{RECOMMENDATION_LABEL[value]}</span>;
}

export function KindBadge({ kind }: { kind: StageKind }) {
  return <span className={`badge badge-kind badge-kind-${kind}`}>{STAGE_KIND_LABEL[kind]}</span>;
}

export function Score({ value, max = 4 }: { value: number | null; max?: number }) {
  if (value === null) return <span className="muted">—</span>;
  const tone = value >= 3 ? 'good' : value >= 2.3 ? 'mid' : 'low';
  return (
    <span className={`score score-${tone}`}>
      {value.toFixed(1)}
      <span className="score-max">/{max}</span>
    </span>
  );
}

export function Collapsible({
  title,
  children,
  defaultOpen = false,
  className = '',
}: {
  title: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`collapsible ${open ? 'is-open' : ''} ${className}`}>
      <button type="button" className="collapsible-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="chevron" aria-hidden="true">
          ▸
        </span>
        {title}
      </button>
      {open && <div className="collapsible-body">{children}</div>}
    </div>
  );
}

export function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div className="alert alert-error" role="alert">
      {error}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

export function CopyButton({ text, label = 'Copy link' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          window.prompt('Copy this link', text);
        }
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? 'Copied' : label}
    </button>
  );
}

export function candidateLink(token: string) {
  return `${window.location.origin}/c/${token}`;
}
