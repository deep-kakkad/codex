-- Plans. Workspaces that existed before plans keep everything unlocked ("pilot");
-- new sign-ups start on the free trial.
ALTER TABLE orgs ADD COLUMN plan TEXT NOT NULL DEFAULT 'pilot';
ALTER TABLE orgs ALTER COLUMN plan SET DEFAULT 'trial';
-- Prepaid reviews on the pay-as-you-go plan.
ALTER TABLE orgs ADD COLUMN review_credits INTEGER NOT NULL DEFAULT 0;

-- A review beyond what the plan covers waits, "locked", until the plan changes.
ALTER TABLE ai_reviews DROP CONSTRAINT ai_reviews_status_check;
ALTER TABLE ai_reviews ADD CONSTRAINT ai_reviews_status_check
  CHECK (status IN ('pending', 'running', 'done', 'failed', 'locked'));
ALTER TABLE ai_reviews ADD COLUMN cost_usd DOUBLE PRECISION;

-- What every AI job cost, as OpenRouter reported it: one row per job.
CREATE TABLE ai_usage (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  kind TEXT NOT NULL,
  ref_id TEXT NOT NULL,
  calls INTEGER NOT NULL,
  prompt_tokens INTEGER NOT NULL,
  completion_tokens INTEGER NOT NULL,
  cost_usd DOUBLE PRECISION NOT NULL,
  ok INTEGER NOT NULL,
  created_at DOUBLE PRECISION NOT NULL
);
CREATE INDEX ai_usage_org ON ai_usage (org_id, created_at);

-- A recruiter asking to move to a paid plan.
CREATE TABLE upgrade_requests (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  plan TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at DOUBLE PRECISION NOT NULL
);

-- AI extras made on request for one candidate: the interview kit, the
-- integrity check and the decision email draft.
CREATE TABLE candidate_extras (
  candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('interview_kit', 'integrity', 'decision_email')),
  payload_json TEXT NOT NULL,
  created_at DOUBLE PRECISION NOT NULL,
  PRIMARY KEY (candidate_id, kind)
);

-- Where a generated scenario came from: a short description or a pasted job description.
ALTER TABLE custom_families ADD COLUMN source TEXT NOT NULL DEFAULT 'description';
