-- A recruiter's personal watch list.
CREATE TABLE candidate_stars (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  created_at DOUBLE PRECISION NOT NULL,
  PRIMARY KEY (user_id, candidate_id)
);

-- Teammates' short takes on a candidate before the decision, with an optional lean.
CREATE TABLE review_notes (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  lean TEXT CHECK (lean IN ('advance', 'hold', 'reject')),
  created_at DOUBLE PRECISION NOT NULL
);

CREATE INDEX review_notes_candidate ON review_notes (candidate_id, created_at);
