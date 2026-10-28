-- The media page: operator settings, followed pages, campus documents

CREATE TABLE settings (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- a user follows a campus page (faculty/course) or any room; path is the page's stable address
CREATE TABLE follows (
  user_id TEXT NOT NULL,
  path TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, path)
);

-- articles and lecture summaries uploaded in campus mode (PDF in R2)
CREATE TABLE campus_docs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  inst TEXT NOT NULL,
  faculty TEXT NOT NULL,
  year INTEGER NOT NULL,
  course TEXT,
  kind TEXT NOT NULL,            -- article | summary
  title TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'visible'  -- visible | review | removed
);
CREATE INDEX campus_docs_place ON campus_docs(inst, faculty, year, created_at);
