-- A public link anyone can use to apply to an assessment, when the team opens it.
ALTER TABLE assessments ADD COLUMN apply_token TEXT;
CREATE UNIQUE INDEX assessments_apply_token ON assessments (apply_token);
ALTER TABLE assessments ADD COLUMN apply_open INTEGER NOT NULL DEFAULT 0;

-- How a candidate arrived: invited by the team, or applied through the public link.
ALTER TABLE candidates ADD COLUMN source TEXT NOT NULL DEFAULT 'invited';
