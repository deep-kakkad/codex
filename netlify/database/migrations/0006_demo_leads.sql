-- Work emails left at the end of the guided demo, so someone can follow up.
CREATE TABLE demo_leads (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at DOUBLE PRECISION NOT NULL
);
CREATE UNIQUE INDEX demo_leads_email_source ON demo_leads (email, source);
