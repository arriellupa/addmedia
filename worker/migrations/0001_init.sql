-- AddMedia — global relational data (D1)

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email_hash TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  terms_accepted_at INTEGER,
  credits_media INTEGER NOT NULL DEFAULT 0,
  credits_pin INTEGER NOT NULL DEFAULT 0,
  banned INTEGER NOT NULL DEFAULT 0,
  role TEXT NOT NULL DEFAULT 'user'
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE otp_codes (
  email_hash TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX otp_email ON otp_codes(email_hash, created_at);

-- user -> content index (right to erasure)
CREATE TABLE content_index (
  item_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX content_user ON content_index(user_id);

CREATE TABLE blocks (
  user_id TEXT NOT NULL,
  blocked_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, blocked_id)
);

-- notice & takedown
CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  item_type TEXT NOT NULL,          -- post | chat
  item_id TEXT NOT NULL,
  reporter_id TEXT,
  reason TEXT NOT NULL,             -- spam | harassment | hate | violence | sexual | intimate | minor | privacy | copyright | other
  details TEXT,
  priority INTEGER NOT NULL DEFAULT 0, -- 2 = intimate imagery / minors (48h SLA)
  status TEXT NOT NULL DEFAULT 'open', -- open | resolved
  created_at INTEGER NOT NULL,
  resolved_at INTEGER
);
CREATE INDEX reports_open ON reports(status, priority DESC, created_at);

CREATE TABLE moderation_log (
  id TEXT PRIMARY KEY,
  at INTEGER NOT NULL,
  actor TEXT NOT NULL,              -- admin | auto
  action TEXT NOT NULL,             -- hide | restore | dismiss | ban | unban | block_text | block_image | auto_hide
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  room_id TEXT,
  report_id TEXT,
  reason TEXT
);
CREATE INDEX modlog_at ON moderation_log(at DESC);

-- publisher opt-out & sensitive domains
CREATE TABLE domain_rules (
  domain TEXT PRIMARY KEY,
  no_comments INTEGER NOT NULL DEFAULT 0,
  no_ads INTEGER NOT NULL DEFAULT 0,
  disabled INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  updated_at INTEGER NOT NULL
);

-- editable Hebrew blocklist (in addition to the built-in list)
CREATE TABLE blocked_terms (
  term TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

-- house ads / sponsorships
CREATE TABLE ads (
  id TEXT PRIMARY KEY,
  advertiser TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  url TEXT NOT NULL,
  image_url TEXT,
  target_domain TEXT,               -- NULL = everywhere
  placement TEXT NOT NULL DEFAULT 'top', -- top | feed
  active INTEGER NOT NULL DEFAULT 1,
  starts_at INTEGER,
  ends_at INTEGER,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX ads_active ON ads(active, target_domain);

-- purchase ledger (append only)
CREATE TABLE purchases (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  product TEXT NOT NULL,
  amount_agorot INTEGER NOT NULL,
  provider TEXT NOT NULL,           -- test | iap | paddle | cardcom
  created_at INTEGER NOT NULL
);

INSERT INTO domain_rules (domain, disabled, note, updated_at) VALUES
  ('accounts.google.com', 1, 'login', 0),
  ('login.microsoftonline.com', 1, 'login', 0),
  ('bankhapoalim.co.il', 1, 'bank', 0),
  ('leumi.co.il', 1, 'bank', 0),
  ('discountbank.co.il', 1, 'bank', 0),
  ('mizrahi-tefahot.co.il', 1, 'bank', 0),
  ('fibi.co.il', 1, 'bank', 0),
  ('paypal.com', 1, 'payments', 0),
  ('clalit.co.il', 1, 'health', 0),
  ('maccabi4u.co.il', 1, 'health', 0),
  ('meuhedet.co.il', 1, 'health', 0),
  ('leumit.co.il', 1, 'health', 0),
  ('gov.il', 1, 'government services', 0);
