-- People who run Proofwork itself: they can open the admin console.
ALTER TABLE users ADD COLUMN operator INTEGER NOT NULL DEFAULT 0;

-- Paid plans can be billed monthly or yearly; paid_until is when the current period ends.
ALTER TABLE orgs ADD COLUMN billing_cycle TEXT NOT NULL DEFAULT 'monthly';
ALTER TABLE orgs ADD COLUMN paid_until DOUBLE PRECISION;
ALTER TABLE upgrade_requests ADD COLUMN billing_cycle TEXT NOT NULL DEFAULT 'monthly';
ALTER TABLE upgrade_requests ADD COLUMN handled_at DOUBLE PRECISION;

-- Referrals: each workspace's link, who referred it, and free reviews earned.
ALTER TABLE orgs ADD COLUMN bonus_reviews INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orgs ADD COLUMN referral_code TEXT;
CREATE UNIQUE INDEX orgs_referral_code ON orgs (referral_code);
ALTER TABLE orgs ADD COLUMN referred_by TEXT REFERENCES orgs(id) ON DELETE SET NULL;
ALTER TABLE orgs ADD COLUMN referral_rewarded_at DOUBLE PRECISION;

-- What paid for each review: the plan, bonus reviews, a prepaid credit, or a billable extra.
ALTER TABLE ai_reviews ADD COLUMN covered_by TEXT;
