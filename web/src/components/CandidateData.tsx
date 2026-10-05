import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BACKUP_DAYS } from '../../../shared/privacy';
import { api, errorMessage } from '../api';
import { Icon } from './Icon';
import { ErrorNote } from './ui';

/**
 * A candidate's rights over what they gave for one assessment: a copy of it,
 * and withdrawing, which deletes all of it. The invite link is the key.
 */
export function YourData({
  base,
  orgName,
  recordingDays,
  started,
  onDeleted,
}: {
  base: string;
  orgName: string;
  recordingDays: number;
  /** Before starting there is nothing to download, only the invitation to delete. */
  started: boolean;
  onDeleted: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function erase() {
    setBusy(true);
    setError(null);
    try {
      await api.post(`${base}/erase`, { confirm: true });
      onDeleted();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <section className="card your-data">
      <h2>Your data</h2>
      <p className="muted small">
        {started
          ? `Your answers are used only for this application and seen by ${orgName}’s hiring team. Recordings are deleted ${recordingDays} days after you finish. `
          : `Not taking part? You can delete the details ${orgName} entered for this invitation. `}
        <Link to="/privacy" target="_blank" rel="noopener">
          How we handle your data
        </Link>
      </p>
      {!confirming ? (
        <div className="row-gap">
          {started && (
            <a className="btn btn-secondary btn-sm" href={`${base}/my-data`} download>
              <Icon name="file" size={14} /> Download my answers
            </a>
          )}
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirming(true)}>
            {started ? 'Withdraw and delete my answers' : 'Delete my details'}
          </button>
        </div>
      ) : (
        <div className="your-data-confirm">
          <p>
            <strong>Delete everything you’ve given for this assessment?</strong> Your answers, recordings and {orgName}
            ’s review of them are deleted for good, and your application is withdrawn. This can’t be undone.
          </p>
          <div className="row-gap">
            <button type="button" className="btn btn-danger btn-sm" onClick={erase} disabled={busy}>
              {busy ? 'Deleting…' : 'Yes, delete everything'}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirming(false)}>
              Keep my application
            </button>
          </div>
        </div>
      )}
      <ErrorNote error={error} />
    </section>
  );
}

/** Shown once a candidate has deleted their answers. */
export function DataDeleted({ orgName }: { orgName: string }) {
  return (
    <main className="candidate-main narrow center">
      <div className="done-mark is-deleted" aria-hidden="true">
        <Icon name="check" size={28} />
      </div>
      <h1>Your answers are deleted.</h1>
      <p className="lead">
        Everything you gave for this assessment is gone, and your application to {orgName} is withdrawn. Copies in our
        nightly backups expire within {BACKUP_DAYS} days.
      </p>
    </main>
  );
}
