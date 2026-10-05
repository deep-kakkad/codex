-- How long a workspace keeps candidates' recordings, in days.
ALTER TABLE orgs ADD COLUMN recording_days INTEGER NOT NULL DEFAULT 180;

-- The candidate's consent to processing, and which notice they agreed to.
ALTER TABLE candidates ADD COLUMN consent_at DOUBLE PRECISION;
ALTER TABLE candidates ADD COLUMN consent_version TEXT;
-- Set when the recordings were deleted at the end of the retention period.
ALTER TABLE candidates ADD COLUMN recordings_deleted_at DOUBLE PRECISION;

-- What each review cost the workspace's plan. Kept when a candidate's data is
-- deleted, so deleting candidates never gives reviews back.
CREATE TABLE review_charges (
  candidate_id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  covered_by TEXT NOT NULL,
  created_at DOUBLE PRECISION NOT NULL
);
CREATE INDEX review_charges_org ON review_charges (org_id, created_at);
INSERT INTO review_charges (candidate_id, org_id, covered_by, created_at)
  SELECT r.candidate_id, c.org_id, COALESCE(r.covered_by, 'plan'), r.created_at
    FROM ai_reviews r JOIN candidates c ON c.id = r.candidate_id WHERE r.status <> 'locked';

-- A candidate's data was deleted: by whom and when, with nothing about the person.
-- token_hash lets their old link say what happened.
CREATE TABLE data_deletions (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  assessment_id TEXT,
  token_hash TEXT,
  requested_by TEXT NOT NULL,
  created_at DOUBLE PRECISION NOT NULL
);
CREATE INDEX data_deletions_token ON data_deletions (token_hash);
CREATE INDEX data_deletions_org ON data_deletions (org_id, created_at);
