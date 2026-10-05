import { randomUUID } from 'node:crypto';
import type { PrivacySettings } from '../shared/api';
import { DEFAULT_RECORDING_DAYS } from '../shared/privacy';
import { sha256 } from './auth';
import { type CandidateRow, type DB, type ResponseRow, all, one, run } from './db';
import type { FileStore } from './files';
import { audit } from './security';

const DAY_MS = 86_400_000;

const parse = (json: string | null) => {
  if (!json) return null;
  try {
    return JSON.parse(json) as unknown;
  } catch {
    return json;
  }
};
const iso = (ts: number | null) => (ts ? new Date(Number(ts)).toISOString() : null);

export type ErasedBy =
  { kind: 'candidate'; ip?: string | null } | { kind: 'recruiter'; userId: string; email: string; ip?: string | null };

/**
 * Deletes everything about one candidate: answers, recordings, transcripts,
 * the AI review, notes, scores and extras. Only an anonymous record remains
 * (which workspace and assessment, who asked, when), so their old link can
 * say what happened, and the review stays counted against the plan.
 */
export async function eraseCandidate(db: DB, files: FileStore, candidate: CandidateRow, by: ErasedBy, now: number) {
  const assessment = await one<{ title: string }>(
    db,
    'SELECT title FROM assessments WHERE id = ?',
    candidate.assessment_id,
  );
  // Recordings first: if the database step then fails, trying again still finds the candidate.
  await files.removeFolder(candidate.id);
  await run(db, 'DELETE FROM candidates WHERE id = ?', candidate.id);
  // Earlier activity named them; it no longer does.
  await run(
    db,
    "UPDATE audit_log SET target = 'a candidate whose data was deleted' WHERE org_id = ? AND target = ?",
    candidate.org_id,
    candidate.name,
  );
  await run(
    db,
    `INSERT INTO data_deletions (id, org_id, assessment_id, token_hash, requested_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    randomUUID(),
    candidate.org_id,
    candidate.assessment_id,
    sha256(candidate.token),
    by.kind === 'candidate' ? 'candidate' : by.email,
    now,
  );
  await audit(
    db,
    by.kind === 'candidate'
      ? {
          orgId: candidate.org_id,
          actor: 'A candidate',
          action: 'withdrew and deleted their data from',
          target: assessment?.title,
          ip: by.ip,
        }
      : {
          orgId: candidate.org_id,
          userId: by.userId,
          actor: by.email,
          action: 'deleted a candidate’s data from',
          target: assessment?.title,
          ip: by.ip,
        },
    now,
  );
}

/** What an old link shows after its candidate's data was deleted. */
export async function deletionForToken(db: DB, token: string) {
  return one<{ requested_by: string; created_at: number }>(
    db,
    'SELECT requested_by, created_at FROM data_deletions WHERE token_hash = ? ORDER BY created_at DESC LIMIT 1',
    sha256(token),
  );
}

async function answersOf(db: DB, candidateId: string) {
  const responses = await all<ResponseRow>(
    db,
    'SELECT * FROM responses WHERE candidate_id = ? ORDER BY stage_index',
    candidateId,
  );
  return Promise.all(
    responses.map(async (r) => {
      const transcripts = await all<{ part: number; transcript: string }>(
        db,
        'SELECT part, transcript FROM transcripts WHERE response_id = ? ORDER BY part',
        r.id,
      );
      return {
        question: r.stage_index + 1,
        stageId: r.stage_id,
        whatYouSaw: parse(r.prompt_json),
        openedAt: iso(r.revealed_at),
        submittedAt: iso(r.submitted_at),
        closed: r.closed_reason,
        writtenAnswer: r.text,
        choice: r.choice_id,
        aiConversation: r.ai_transcript,
        reflection: r.reflection,
        scratchpad: parse(r.scratch_json),
        recordingSeconds: r.audio_sec,
        recordingTranscripts: transcripts.map((t) => t.transcript),
        activity: parse(r.signals_json),
      };
    }),
  );
}

async function context(db: DB, candidate: CandidateRow) {
  const assessment = await one<{ title: string }>(
    db,
    'SELECT title FROM assessments WHERE id = ?',
    candidate.assessment_id,
  );
  const org = await one<{ name: string; recording_days: number }>(
    db,
    'SELECT name, recording_days FROM orgs WHERE id = ?',
    candidate.org_id,
  );
  return { assessment: assessment?.title ?? '', org: org?.name ?? '', recordingDays: org?.recording_days };
}

function person(candidate: CandidateRow) {
  return {
    name: candidate.name,
    email: candidate.email,
    nameOnId: candidate.id_name,
    invitedAt: iso(candidate.created_at),
    startedAt: iso(candidate.started_at),
    submittedAt: iso(candidate.submitted_at),
    consent: candidate.consent_at
      ? { givenAt: iso(candidate.consent_at), privacyNotice: candidate.consent_version }
      : null,
    recordingsDeletedAt: iso(candidate.recordings_deleted_at),
  };
}

/**
 * A candidate's own copy of what they gave: their answers, transcripts of
 * their recordings and when things happened. The hiring team's review is the
 * team's to share.
 */
export async function candidateOwnData(db: DB, candidate: CandidateRow) {
  const { assessment, org, recordingDays } = await context(db, candidate);
  return {
    about: `Everything you gave in the ${assessment} assessment for ${org}, as held by Proofwork on their behalf.`,
    exportedAt: new Date().toISOString(),
    you: person(candidate),
    assessment: { title: assessment, company: org },
    recordings: `Your recordings are kept for ${recordingDays ?? DEFAULT_RECORDING_DAYS} days after you finish. For a copy, or for the hiring team’s review of your answers, ask ${org}.`,
    answers: await answersOf(db, candidate.id),
  };
}

/** Everything held about one candidate, for a recruiter answering an access request. */
export async function candidateExport(db: DB, candidate: CandidateRow) {
  const { assessment, org } = await context(db, candidate);
  const review = await one<{ status: string; result_json: string | null; created_at: number }>(
    db,
    'SELECT status, result_json, created_at FROM ai_reviews WHERE candidate_id = ?',
    candidate.id,
  );
  const notes = await all<{ name: string; body: string; lean: string | null; created_at: number }>(
    db,
    `SELECT u.name, n.body, n.lean, n.created_at FROM review_notes n JOIN users u ON u.id = n.user_id
      WHERE n.candidate_id = ? ORDER BY n.created_at`,
    candidate.id,
  );
  const overrides = await all<{
    stage_id: string;
    criterion_id: string;
    ai_score: number;
    score: number;
    note: string;
  }>(
    db,
    'SELECT stage_id, criterion_id, ai_score, score, note FROM score_overrides WHERE candidate_id = ?',
    candidate.id,
  );
  const verification = await one<{ identity: string | null; consistency: string | null; notes: string }>(
    db,
    'SELECT identity, consistency, notes FROM verifications WHERE candidate_id = ?',
    candidate.id,
  );
  const extras = await all<{ kind: string; payload_json: string; created_at: number }>(
    db,
    'SELECT kind, payload_json, created_at FROM candidate_extras WHERE candidate_id = ? ORDER BY kind',
    candidate.id,
  );
  return {
    about: `Everything Proofwork holds about this candidate for ${org}.`,
    exportedAt: new Date().toISOString(),
    candidate: { ...person(candidate), status: candidate.status, decision: candidate.decision },
    assessment: { title: assessment, company: org },
    answers: await answersOf(db, candidate.id),
    aiReview: review
      ? { status: review.status, createdAt: iso(review.created_at), result: parse(review.result_json) }
      : null,
    scoreChanges: overrides.map((o) => ({
      stageId: o.stage_id,
      criterion: o.criterion_id,
      aiScore: o.ai_score,
      score: o.score,
      why: o.note,
    })),
    teamNotes: notes.map((n) => ({ by: n.name, note: n.body, lean: n.lean, at: iso(n.created_at) })),
    verificationCall: verification ?? null,
    extras: extras.map((e) => ({ kind: e.kind, createdAt: iso(e.created_at), content: parse(e.payload_json) })),
  };
}

/**
 * Deletes the recordings of candidates who finished (or stopped) longer ago
 * than their workspace keeps recordings. Answers, transcripts and reviews
 * stay. Reviews still running keep their recordings until they finish.
 */
export async function deleteOldRecordings(db: DB, files: FileStore, now: number, limit = 200) {
  const due = await all<{ id: string }>(
    db,
    `SELECT c.id FROM candidates c
       JOIN orgs o ON o.id = c.org_id
       LEFT JOIN ai_reviews r ON r.candidate_id = c.id
      WHERE c.recordings_deleted_at IS NULL
        AND COALESCE(c.submitted_at, c.started_at) < ? - o.recording_days * 86400000.0
        AND (r.status IS NULL OR r.status NOT IN ('pending', 'running'))
      ORDER BY COALESCE(c.submitted_at, c.started_at)
      LIMIT ?`,
    now,
    limit,
  );
  for (const { id } of due) {
    await files.removeFolder(id);
    await run(db, 'UPDATE candidates SET recordings_deleted_at = ? WHERE id = ?', now, id);
  }
  return due.length;
}

export async function privacySettings(db: DB, orgId: string, now: number): Promise<PrivacySettings> {
  const org = await one<{ recording_days: number }>(db, 'SELECT recording_days FROM orgs WHERE id = ?', orgId);
  const deletions = await one<{ n: number }>(
    db,
    'SELECT COUNT(*)::int AS n FROM data_deletions WHERE org_id = ? AND created_at >= ?',
    orgId,
    now - 365 * DAY_MS,
  );
  const withdrawn = await one<{ n: number }>(
    db,
    "SELECT COUNT(*)::int AS n FROM data_deletions WHERE org_id = ? AND created_at >= ? AND requested_by = 'candidate'",
    orgId,
    now - 365 * DAY_MS,
  );
  const cleared = await one<{ n: number }>(
    db,
    'SELECT COUNT(*)::int AS n FROM candidates WHERE org_id = ? AND recordings_deleted_at IS NOT NULL',
    orgId,
  );
  return {
    recordingDays: org?.recording_days ?? DEFAULT_RECORDING_DAYS,
    deletionsLastYear: deletions?.n ?? 0,
    withdrawnLastYear: withdrawn?.n ?? 0,
    recordingsDeleted: cleared?.n ?? 0,
  };
}
