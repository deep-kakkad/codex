import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

export type DB = DatabaseSync;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS orgs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('manager', 'reviewer')),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS assessments (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  role_family_id TEXT NOT NULL,
  role_family_version INTEGER NOT NULL,
  title TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (currency IN ('INR', 'USD')),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS candidates (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  assessment_id TEXT NOT NULL REFERENCES assessments(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  seed INTEGER NOT NULL,
  variant_json TEXT NOT NULL,
  time_multiplier REAL NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'invited',
  id_name TEXT,
  decision TEXT,
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  submitted_at INTEGER
);
CREATE INDEX IF NOT EXISTS candidates_assessment ON candidates(assessment_id);

CREATE TABLE IF NOT EXISTS responses (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  stage_id TEXT NOT NULL,
  stage_index INTEGER NOT NULL,
  prompt_json TEXT NOT NULL,
  revealed_at INTEGER NOT NULL,
  deadline_at INTEGER NOT NULL,
  submitted_at INTEGER,
  closed_reason TEXT,
  text TEXT,
  choice_id TEXT,
  ai_transcript TEXT,
  reflection TEXT,
  audio_path TEXT,
  audio_mime TEXT,
  audio_sec REAL,
  draft_json TEXT,
  signals_json TEXT,
  UNIQUE (candidate_id, stage_id)
);

-- Think-aloud audio arrives as sequential chunks appended to one file per
-- part. A new part starts if the candidate reloads mid-question.
CREATE TABLE IF NOT EXISTS audio_parts (
  response_id TEXT NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
  part INTEGER NOT NULL,
  path TEXT NOT NULL,
  mime TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  chunks INTEGER NOT NULL,
  start_ms INTEGER NOT NULL,
  sec REAL,
  PRIMARY KEY (response_id, part)
);

-- Candidates have their own accounts, separate from recruiters.
CREATE TABLE IF NOT EXISTS candidate_accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS candidate_sessions (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES candidate_accounts(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

-- One AI review per candidate attempt, produced after submission.
CREATE TABLE IF NOT EXISTS ai_reviews (
  candidate_id TEXT PRIMARY KEY REFERENCES candidates(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'done', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  models TEXT,
  result_json TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Audio transcripts, cached so a retried review doesn't transcribe twice.
CREATE TABLE IF NOT EXISTS transcripts (
  response_id TEXT NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
  part INTEGER NOT NULL,
  transcript TEXT NOT NULL,
  delivery TEXT,
  delivery_reasons TEXT,
  model TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (response_id, part)
);

CREATE TABLE IF NOT EXISTS verifications (
  candidate_id TEXT PRIMARY KEY REFERENCES candidates(id) ON DELETE CASCADE,
  interviewer_id TEXT NOT NULL REFERENCES users(id),
  identity TEXT,
  consistency TEXT,
  notes TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL
);
`;

export function openDb(file: string): DB {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  // Columns added after the first release.
  addColumn(db, 'responses', 'scratch_json', 'TEXT');
  addColumn(db, 'assessments', 'stage_ids_json', 'TEXT');
  addColumn(db, 'candidates', 'account_id', 'TEXT REFERENCES candidate_accounts(id)');
  return db;
}

function addColumn(db: DB, table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

export type Params = SQLInputValue[];

export function one<T>(db: DB, sql: string, ...params: Params): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}

export function all<T>(db: DB, sql: string, ...params: Params): T[] {
  return db.prepare(sql).all(...params) as T[];
}

export function run(db: DB, sql: string, ...params: Params) {
  return db.prepare(sql).run(...params);
}

export function transaction<T>(db: DB, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

// Row types --------------------------------------------------------------

export interface UserRow {
  id: string;
  org_id: string;
  name: string;
  email: string;
  password_hash: string;
  role: 'manager' | 'reviewer';
  created_at: number;
}

export interface AssessmentRow {
  id: string;
  org_id: string;
  role_family_id: string;
  role_family_version: number;
  title: string;
  currency: 'INR' | 'USD';
  created_by: string;
  created_at: number;
  archived: number;
  /** Activities the recruiter chose; null means all. */
  stage_ids_json: string | null;
}

export interface CandidateRow {
  id: string;
  org_id: string;
  assessment_id: string;
  name: string;
  email: string;
  token: string;
  seed: number;
  variant_json: string;
  time_multiplier: number;
  status: string;
  id_name: string | null;
  decision: string | null;
  created_at: number;
  started_at: number | null;
  submitted_at: number | null;
  account_id: string | null;
}

export interface ResponseRow {
  id: string;
  candidate_id: string;
  stage_id: string;
  stage_index: number;
  prompt_json: string;
  revealed_at: number;
  deadline_at: number;
  submitted_at: number | null;
  closed_reason: 'submitted' | 'timeout' | null;
  text: string | null;
  choice_id: string | null;
  ai_transcript: string | null;
  reflection: string | null;
  audio_path: string | null;
  audio_mime: string | null;
  audio_sec: number | null;
  draft_json: string | null;
  signals_json: string | null;
  scratch_json: string | null;
}

export interface AudioPartRow {
  response_id: string;
  part: number;
  path: string;
  mime: string;
  bytes: number;
  chunks: number;
  start_ms: number;
  sec: number | null;
}

export interface CandidateAccountRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  created_at: number;
}

export interface AiReviewRow {
  candidate_id: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  attempts: number;
  models: string | null;
  result_json: string | null;
  error: string | null;
  created_at: number;
  updated_at: number;
}

export interface TranscriptRow {
  response_id: string;
  part: number;
  transcript: string;
  delivery: string | null;
  delivery_reasons: string | null;
  model: string;
  created_at: number;
}

export interface VerificationRow {
  candidate_id: string;
  interviewer_id: string;
  identity: string | null;
  consistency: string | null;
  notes: string;
  updated_at: number;
}
