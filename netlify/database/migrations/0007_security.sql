-- Two-factor sign-in (an authenticator app code) for recruiters.
ALTER TABLE users ADD COLUMN totp_secret TEXT;
-- A secret being set up, until the first code confirms it.
ALTER TABLE users ADD COLUMN totp_pending_secret TEXT;
-- The last 30-second step accepted, so a code can't be used twice.
ALTER TABLE users ADD COLUMN totp_last_step BIGINT;
-- Hashes of one-time recovery codes, as a JSON list.
ALTER TABLE users ADD COLUMN recovery_codes TEXT;

-- A password that checked out, waiting for the two-factor code.
CREATE TABLE login_challenges (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at DOUBLE PRECISION NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
);

-- Recent failures per key (an email address or an IP address), to slow down guessing.
CREATE TABLE auth_throttle (
  key TEXT PRIMARY KEY,
  failures INTEGER NOT NULL,
  window_start DOUBLE PRECISION NOT NULL
);

-- Who did what and when: sign-ins, security changes, decisions, deletions, plan changes.
CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  org_id TEXT REFERENCES orgs(id) ON DELETE CASCADE,
  user_id TEXT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  detail TEXT,
  ip TEXT,
  created_at DOUBLE PRECISION NOT NULL
);
CREATE INDEX audit_log_org ON audit_log (org_id, created_at);

-- Errors from the API and from people's browsers, shown in the admin console.
CREATE TABLE error_events (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  message TEXT NOT NULL,
  detail TEXT,
  path TEXT,
  created_at DOUBLE PRECISION NOT NULL
);
CREATE INDEX error_events_created ON error_events (created_at);
