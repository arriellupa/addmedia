-- contact & takedown requests (notice-and-takedown, publisher opt-out, privacy requests)
CREATE TABLE contact_requests (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,          -- takedown | publisher | privacy | accessibility | other
  name TEXT,
  email TEXT NOT NULL,
  url TEXT,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER NOT NULL,
  handled_at INTEGER
);
CREATE INDEX contact_open ON contact_requests(status, created_at);
