-- Proofwork schema. Timestamps are epoch milliseconds stored as double
-- precision so every Postgres driver returns them as JS numbers.

CREATE TABLE orgs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at DOUBLE PRECISION NOT NULL
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('manager', 'reviewer')),
  created_at DOUBLE PRECISION NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at DOUBLE PRECISION NOT NULL
);

CREATE TABLE candidate_accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at DOUBLE PRECISION NOT NULL
);

CREATE TABLE candidate_sessions (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES candidate_accounts(id) ON DELETE CASCADE,
  expires_at DOUBLE PRECISION NOT NULL
);

CREATE TABLE assessments (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  role_family_id TEXT NOT NULL,
  role_family_version INTEGER NOT NULL,
  title TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (currency IN ('INR', 'USD')),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at DOUBLE PRECISION NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  stage_ids_json TEXT
);

CREATE TABLE candidates (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  assessment_id TEXT NOT NULL REFERENCES assessments(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  seed INTEGER NOT NULL,
  variant_json TEXT NOT NULL,
  time_multiplier DOUBLE PRECISION NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'invited',
  id_name TEXT,
  decision TEXT,
  created_at DOUBLE PRECISION NOT NULL,
  started_at DOUBLE PRECISION,
  submitted_at DOUBLE PRECISION,
  account_id TEXT REFERENCES candidate_accounts(id)
);
CREATE INDEX candidates_assessment ON candidates(assessment_id);
CREATE INDEX candidates_account ON candidates(account_id);

CREATE TABLE responses (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  stage_id TEXT NOT NULL,
  stage_index INTEGER NOT NULL,
  prompt_json TEXT NOT NULL,
  revealed_at DOUBLE PRECISION NOT NULL,
  deadline_at DOUBLE PRECISION NOT NULL,
  submitted_at DOUBLE PRECISION,
  closed_reason TEXT,
  text TEXT,
  choice_id TEXT,
  ai_transcript TEXT,
  reflection TEXT,
  audio_path TEXT,
  audio_mime TEXT,
  audio_sec DOUBLE PRECISION,
  draft_json TEXT,
  signals_json TEXT,
  scratch_json TEXT,
  UNIQUE (candidate_id, stage_id)
);

-- Think-aloud audio arrives as sequential chunks, stored one blob per chunk
-- under `path`. A new part starts if the candidate reloads mid-question.
CREATE TABLE audio_parts (
  response_id TEXT NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
  part INTEGER NOT NULL,
  path TEXT NOT NULL,
  mime TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  chunks INTEGER NOT NULL,
  start_ms DOUBLE PRECISION NOT NULL,
  sec DOUBLE PRECISION,
  PRIMARY KEY (response_id, part)
);

CREATE TABLE ai_reviews (
  candidate_id TEXT PRIMARY KEY REFERENCES candidates(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'done', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  models TEXT,
  result_json TEXT,
  error TEXT,
  created_at DOUBLE PRECISION NOT NULL,
  updated_at DOUBLE PRECISION NOT NULL
);

CREATE TABLE transcripts (
  response_id TEXT NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
  part INTEGER NOT NULL,
  transcript TEXT NOT NULL,
  delivery TEXT,
  delivery_reasons TEXT,
  model TEXT NOT NULL,
  created_at DOUBLE PRECISION NOT NULL,
  PRIMARY KEY (response_id, part)
);

CREATE TABLE verifications (
  candidate_id TEXT PRIMARY KEY REFERENCES candidates(id) ON DELETE CASCADE,
  interviewer_id TEXT NOT NULL REFERENCES users(id),
  identity TEXT,
  consistency TEXT,
  notes TEXT NOT NULL DEFAULT '',
  updated_at DOUBLE PRECISION NOT NULL
);
