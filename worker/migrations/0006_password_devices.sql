-- Password sign-in, device-bound sessions, and the anti-sharing checks on document reads.

ALTER TABLE users ADD COLUMN pass_hash TEXT;                        -- pbkdf2$iter$salt$hash
ALTER TABLE users ADD COLUMN pass_set_at INTEGER;
ALTER TABLE users ADD COLUMN pw_fails INTEGER NOT NULL DEFAULT 0;   -- wrong tries since the last good one
ALTER TABLE users ADD COLUMN locked_until INTEGER;                  -- ms; after 8 wrong tries, or a velocity lock
ALTER TABLE users ADD COLUMN must_reset INTEGER NOT NULL DEFAULT 0; -- a velocity lock: the next sign-in asks for a new password

ALTER TABLE sessions ADD COLUMN device_id TEXT;      -- the client's random id (X-Device); NULL for older clients
ALTER TABLE sessions ADD COLUMN device_name TEXT;    -- a short summary of the user agent
ALTER TABLE sessions ADD COLUMN last_seen INTEGER;
ALTER TABLE sessions ADD COLUMN last_ip_hash TEXT;
CREATE INDEX sessions_device ON sessions(user_id, device_id);

-- one row per document or file read, for the concurrency (90 s, other device, other IP) and velocity checks; pruned hourly
CREATE TABLE doc_reads (
  user_id TEXT NOT NULL,
  device_id TEXT,
  ip_hash TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX doc_reads_user ON doc_reads(user_id, at);
