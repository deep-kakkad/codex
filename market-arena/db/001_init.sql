-- Market Arena schema, v1.
--
-- Runs once against a fresh Neon database. Everything here is additive and
-- idempotent, so re-running it is safe.
--
-- Netlify Identity owns the credential; this owns everything else. The link
-- between them is users.id, which is the Identity user id verified server-side
-- by getUser(). Nothing in here trusts a value sent by the browser.

-- ---------------------------------------------------------------- users
-- Mirrored from Identity on first sign-in, so we can join our own data to a
-- person without asking Netlify about them on every request.
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,            -- Netlify Identity user id
  email         TEXT NOT NULL UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Set when the person asks to be deleted. The row goes, but we keep a tombstone
  -- so a re-signup with the same email cannot silently inherit an old balance.
  deleted_at    TIMESTAMPTZ
);

-- ---------------------------------------------------------------- credits
-- A ledger, not a counter. A single `credits INTEGER` column cannot answer
-- "where did mine go?", cannot be refunded when a call fails halfway, and cannot
-- be audited when someone disputes it. Balance is the sum of the entries.
--
-- delta is positive for grants and top-ups, negative for spend:
--   signup  +100      the free allowance
--   round     -1      a simulation round
--   ask      -10      one Ask Market Arena question
--   refund    +n      reversal when a paid call failed after we charged
--   topup     +n      a purchase
--   adjust    +/-n    manual correction, always with a note
CREATE TABLE IF NOT EXISTS credit_entries (
  id          BIGSERIAL PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta       INTEGER NOT NULL,
  reason      TEXT NOT NULL CHECK (reason IN ('signup','round','ask','refund','topup','adjust')),
  ref         TEXT,                          -- round id, question id, payment id
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS credit_entries_user_time ON credit_entries (user_id, created_at DESC);

-- One signup grant per person, enforced by the database rather than by remembering
-- to check: a retried sign-in cannot mint a second 100 credits.
CREATE UNIQUE INDEX IF NOT EXISTS credit_entries_one_signup
  ON credit_entries (user_id) WHERE reason = 'signup';

-- ---------------------------------------------------------------- work
CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  scenario    JSONB NOT NULL DEFAULT '{}'::jsonb,   -- title, brief
  personas    JSONB NOT NULL DEFAULT '[]'::jsonb,
  teams       JSONB NOT NULL DEFAULT '[]'::jsonb,
  extras      JSONB NOT NULL DEFAULT '[]'::jsonb,   -- optional fields, locked after round 1
  goal        TEXT,                                 -- the experiment brief
  goal_note   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS projects_user_time ON projects (user_id, updated_at DESC);

-- The round result verbatim, so the report renders from stored data exactly as it
-- did when run, and a later engine change cannot silently rewrite history.
CREATE TABLE IF NOT EXISTS rounds (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seq         INTEGER NOT NULL,               -- 1, 2, 3 within the project
  model       TEXT,                           -- pinned model that produced it
  result      JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, seq)
);
CREATE INDEX IF NOT EXISTS rounds_user_time ON rounds (user_id, created_at DESC);

-- ---------------------------------------------------------------- ask log
-- Every question and answer, because the model tier for Ask was chosen on price
-- and the thing to watch is whether it correctly refuses questions the round
-- cannot answer. Without this the choice can never be checked against real use.
CREATE TABLE IF NOT EXISTS ask_log (
  id            BIGSERIAL PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  round_id      TEXT REFERENCES rounds(id) ON DELETE SET NULL,
  question      TEXT NOT NULL,
  answer        TEXT,
  model         TEXT NOT NULL,
  input_tokens  INTEGER,
  cached_tokens INTEGER,                      -- proves the report prefix is caching
  output_tokens INTEGER,
  ms            INTEGER,
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ask_log_user_time ON ask_log (user_id, created_at DESC);

-- ---------------------------------------------------------------- balance
-- One place that defines what a balance is, so no caller can compute it its own way.
CREATE OR REPLACE VIEW credit_balances AS
  SELECT u.id AS user_id, u.email,
         COALESCE(SUM(c.delta), 0)::INTEGER AS balance
  FROM users u
  LEFT JOIN credit_entries c ON c.user_id = u.id
  GROUP BY u.id, u.email;
