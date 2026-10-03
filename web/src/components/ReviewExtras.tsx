import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CandidateReport, IntegrityItem, IntegrityVerdict } from '../../../shared/api';
import type { Decision } from '../../../shared/types';
import { api, errorMessage } from '../api';
import { useAuth } from '../auth';
import { formatDate } from '../hooks';
import { Icon, type IconName } from './Icon';
import { ErrorNote } from './ui';

type OnReport = (report: CandidateReport) => void;

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/** A finished candidate whose review waits for the workspace to upgrade. */
export function LockedReview({ report }: { report: CandidateReport }) {
  return (
    <div className="px-locked">
      <span className="px-locked-icon" aria-hidden="true">
        <Icon name="lock" size={18} />
      </span>
      <div>
        <h2 className="px-locked-title">{firstName(report.candidate.name)}'s review is ready to run</h2>
        <p>
          They finished the assessment, but your free trial's reviews are used up. Choose a plan and this review runs
          straight away. Their answers and recordings are below in the meantime.
        </p>
        <Link to="/app/plan" className="btn btn-primary btn-sm">
          See plans
        </Link>
      </div>
    </div>
  );
}

// Integrity --------------------------------------------------------------------

const VERDICT: Record<IntegrityVerdict, { label: string; icon: IconName }> = {
  clean: { label: 'Clean', icon: 'shield' },
  question: { label: 'Worth a question', icon: 'alert' },
  likely: { label: 'Likely assisted', icon: 'alert' },
};

const SOURCE_LABEL: Record<IntegrityItem['source'], string> = {
  signals: 'Browser',
  timing: 'Timing',
  delivery: 'Recording',
  writing: 'Writing',
  consistency: 'Spoken vs written',
};

/** Candidates whose AI writing check has been started from this page, so it runs once. */
const integrityStarted = new Set<string>();

export function IntegrityPanel({ report, onReport }: { report: CandidateReport; onReport: OnReport }) {
  const { integrity } = report;
  const id = report.candidate.id;
  const reviewed = report.aiReview?.status === 'done';
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function check() {
    setRunning(true);
    setError(null);
    try {
      onReport(await api.post<CandidateReport>(`/api/candidates/${id}/integrity-check`));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setRunning(false);
    }
  }

  // The writing check runs by itself the first time anyone opens a reviewed candidate.
  useEffect(() => {
    if (!reviewed || integrity.aiChecked || integrityStarted.has(id)) return;
    integrityStarted.add(id);
    void check();
  }, [id, reviewed, integrity.aiChecked]);

  const main = integrity.items.filter((i) => i.level !== 'info');
  const minor = integrity.items.filter((i) => i.level === 'info');
  const verdict = VERDICT[integrity.verdict];

  return (
    <section className={`px-card px-integrity is-${integrity.verdict}`}>
      <div className="px-card-head">
        <h2 className="px-card-title">Integrity check</h2>
        <span className={`px-verdict is-${integrity.verdict}`}>
          <Icon name={verdict.icon} size={13} />
          {verdict.label}
        </span>
      </div>
      <p className="px-integrity-headline">{integrity.headline}</p>

      {main.length > 0 && (
        <ul className="px-findings">
          {main.map((item, i) => (
            <Finding key={i} item={item} />
          ))}
        </ul>
      )}
      {minor.length > 0 && (
        <details className="px-minor">
          <summary>
            {minor.length} minor note{minor.length === 1 ? '' : 's'}
          </summary>
          <ul className="px-findings">
            {minor.map((item, i) => (
              <Finding key={i} item={item} />
            ))}
          </ul>
        </details>
      )}

      <div className="px-card-foot">
        {running ? (
          <span className="px-status">
            <span className="spinner" aria-hidden="true" /> Reading their writing for signs of AI or outside help…
          </span>
        ) : integrity.aiChecked ? (
          <span className="px-status">
            Writing checked {integrity.checkedAt ? formatDate(integrity.checkedAt) : ''}
            <button type="button" className="px-link" onClick={check}>
              Check again
            </button>
          </span>
        ) : reviewed ? (
          <button type="button" className="btn btn-secondary btn-sm" onClick={check}>
            Check their writing
          </button>
        ) : (
          <span className="px-status">The writing check runs after the AI review.</span>
        )}
        <ErrorNote error={error} />
      </div>
      <p className="px-caveat">
        Hints, not proof. Honest candidates switch tabs and write well; use these to choose what to ask on the call.
      </p>
    </section>
  );
}

function Finding({ item }: { item: IntegrityItem }) {
  return (
    <li className={`px-finding is-${item.level}`}>
      <span className="px-finding-dot" aria-hidden="true" />
      <div>
        <div className="px-finding-meta">
          <span>{SOURCE_LABEL[item.source]}</span>
          {item.stageTitle && <span>{item.stageTitle}</span>}
          {item.level === 'strong' && <span className="px-strong">Strong sign</span>}
        </div>
        <p>{item.text}</p>
        {item.quote && <blockquote className="px-quote">“{item.quote}”</blockquote>}
        {item.ask && (
          <p className="px-ask">
            <strong>Ask:</strong> {item.ask}
          </p>
        )}
      </div>
    </li>
  );
}

// Interview kit ----------------------------------------------------------------

export function InterviewKitPanel({ report, onReport }: { report: CandidateReport; onReport: OnReport }) {
  const kit = report.interviewKit;
  const reviewed = report.aiReview?.status === 'done';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titles = new Map(report.stages.map((s) => [s.id, s.title]));

  async function build() {
    setBusy(true);
    setError(null);
    try {
      onReport(await api.post<CandidateReport>(`/api/candidates/${report.candidate.id}/interview-kit`));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="px-card px-kit">
      <div className="px-card-head">
        <div>
          <span className="px-eyebrow">
            <Icon name="sparkle" size={13} filled /> Interview kit
          </span>
          <h2 className="px-card-title">Five questions for {firstName(report.candidate.name)}'s next interview</h2>
        </div>
        {kit && (
          <div className="row-gap no-print">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => window.print()}>
              <Icon name="print" size={14} /> Print
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={build} disabled={busy}>
              {busy ? 'Rewriting…' : 'Rewrite'}
            </button>
          </div>
        )}
      </div>

      {kit ? (
        <>
          <ol className="px-kit-list">
            {kit.questions.map((q, i) => (
              <li key={i} className="px-kit-q">
                <span className="px-kit-num num">{i + 1}</span>
                <div>
                  {q.stageId && titles.get(q.stageId) && <span className="px-kit-tag">{titles.get(q.stageId)}</span>}
                  <p className="px-kit-question">{q.question}</p>
                  {q.why && <p className="px-kit-why">{q.why}</p>}
                  <div className="px-kit-cols">
                    <div className="px-kit-good">
                      <span>Listen for</span>
                      <p>{q.listenFor}</p>
                    </div>
                    <div className="px-kit-bad">
                      <span>Red flags</span>
                      <p>{q.redFlags}</p>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ol>
          <p className="px-caveat">Written {formatDate(kit.createdAt)} from their answers and the AI review.</p>
        </>
      ) : (
        <div className="px-kit-empty">
          <p>
            Questions aimed at this candidate's weak spots and the answers worth checking they own, each with what a
            strong answer sounds like and the red flags. Hand it to the hiring manager.
          </p>
          {reviewed ? (
            <button type="button" className="btn btn-primary btn-sm" onClick={build} disabled={busy}>
              {busy ? (
                <>
                  <span className="spinner" aria-hidden="true" /> Writing the questions…
                </>
              ) : (
                <>
                  <Icon name="sparkle" size={14} filled /> Build the interview kit
                </>
              )}
            </button>
          ) : (
            <p className="px-status">Available once the AI review has finished.</p>
          )}
        </div>
      )}
      <ErrorNote error={error} />
    </section>
  );
}

// Decision email ---------------------------------------------------------------

const DECISION_WORD: Record<Decision, string> = {
  advance: 'next-step',
  hold: 'update',
  reject: 'decision',
};

export function DecisionEmail({ report, onReport }: { report: CandidateReport; onReport: OnReport }) {
  const { user } = useAuth();
  const decision = report.candidate.decision;
  const draft = report.decisionEmail;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(true);
  const [subject, setSubject] = useState(draft?.subject ?? '');
  const [body, setBody] = useState(draft?.body ?? '');
  const [copied, setCopied] = useState(false);

  // A new draft replaces what is in the boxes.
  useEffect(() => {
    setSubject(draft?.subject ?? '');
    setBody(draft?.body ?? '');
    if (draft) setOpen(true);
  }, [draft?.createdAt]);

  if (user?.role !== 'manager' || !decision) return null;
  const name = firstName(report.candidate.name);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      onReport(await api.post<CandidateReport>(`/api/candidates/${report.candidate.id}/decision-email`));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    const text = `Subject: ${subject}\n\n${body}`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.prompt('Copy this email', text);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  const mailto = `mailto:${encodeURIComponent(report.candidate.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  if (!draft || !open) {
    return (
      <div className={`px-mailbar is-${decision}`}>
        <Icon name="mail" size={16} />
        <span>
          Let {name} know. Draft the {DECISION_WORD[decision]} email, written from their assessment.
        </span>
        {draft ? (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(true)}>
            Show draft
          </button>
        ) : (
          <button type="button" className="btn btn-secondary btn-sm" onClick={generate} disabled={busy}>
            {busy ? 'Drafting…' : 'Draft email'}
          </button>
        )}
        <ErrorNote error={error} />
      </div>
    );
  }

  return (
    <section className={`px-card px-mail is-${decision}`}>
      <div className="px-card-head">
        <div>
          <span className="px-eyebrow">
            <Icon name="mail" size={13} /> Email to {report.candidate.name}
          </span>
          <p className="px-caveat">
            Nothing is sent from Proofwork. Edit it, then send it from your own email.
            {!draft.ai && ' AI was unavailable, so this is a template.'}
          </p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} aria-label="Hide draft">
          <Icon name="x" size={14} />
        </button>
      </div>
      <label className="field">
        <span>Subject</span>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} />
      </label>
      <label className="field">
        <span>Message</span>
        <textarea rows={9} value={body} onChange={(e) => setBody(e.target.value)} />
      </label>
      <div className="row-gap">
        <a className="btn btn-primary btn-sm" href={mailto}>
          <Icon name="mail" size={14} /> Open in my email
        </a>
        <button type="button" className="btn btn-secondary btn-sm" onClick={copy}>
          <Icon name="copy" size={14} /> {copied ? 'Copied' : 'Copy'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={generate} disabled={busy}>
          {busy ? 'Drafting…' : 'Draft again'}
        </button>
      </div>
      <ErrorNote error={error} />
    </section>
  );
}
