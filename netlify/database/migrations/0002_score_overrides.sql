-- A recruiter's disagreement with one AI rubric score, with their reason.
-- Kept alongside the AI score, never replacing it, so the two can be compared.
CREATE TABLE score_overrides (
  candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  stage_id TEXT NOT NULL,
  criterion_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  ai_score INTEGER NOT NULL,
  score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 4),
  note TEXT NOT NULL,
  updated_at DOUBLE PRECISION NOT NULL,
  PRIMARY KEY (candidate_id, stage_id, criterion_id)
);
