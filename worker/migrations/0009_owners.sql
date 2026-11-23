-- Site owners: a verified owner of a site (eTLD+1) manages the rooms of that site.
-- A claim proves control of the domain (meta tag, file or DNS TXT); the operator approves it (or auto-approval is on).

CREATE TABLE IF NOT EXISTS site_claims (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  user_id TEXT NOT NULL,
  token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | verified | approved | rejected | revoked
  method TEXT,                            -- meta | file | dns | admin
  contact TEXT,                           -- the owner's note to the operator (role, phone)
  note TEXT,                              -- the operator's note
  created_at INTEGER NOT NULL,
  verified_at INTEGER,
  decided_at INTEGER
);
CREATE INDEX IF NOT EXISTS site_claims_domain ON site_claims(domain);
CREATE INDEX IF NOT EXISTS site_claims_user ON site_claims(user_id);
CREATE INDEX IF NOT EXISTS site_claims_status ON site_claims(status, created_at);

CREATE TABLE IF NOT EXISTS site_owners (
  domain TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  claim_id TEXT,
  since INTEGER NOT NULL,
  welcome TEXT,                           -- the owner's message, pinned on top of the site's rooms
  no_comments INTEGER NOT NULL DEFAULT 0, -- the owner closed talkbacks and chat on the site
  no_media INTEGER NOT NULL DEFAULT 0,    -- the owner closed image uploads on the site
  ref_code TEXT UNIQUE,                   -- the owner's referral code (badge and links)
  share_pct INTEGER NOT NULL DEFAULT 0,   -- the owner's share of the sponsorship sold on the site's rooms
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS site_owners_user ON site_owners(user_id);

-- referral events: a click on an owner's link or badge, and a sign-up that followed it
CREATE TABLE IF NOT EXISTS referrals (
  id TEXT PRIMARY KEY,
  ref_code TEXT NOT NULL,
  kind TEXT NOT NULL,                     -- click | signup
  user_id TEXT,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS referrals_code ON referrals(ref_code, kind, at);

ALTER TABLE users ADD COLUMN referred_by TEXT;

-- the site of each indexed post, for the owner's numbers (older rows stay without it)
ALTER TABLE content_index ADD COLUMN site TEXT;
CREATE INDEX IF NOT EXISTS content_index_site ON content_index(site, created_at);
