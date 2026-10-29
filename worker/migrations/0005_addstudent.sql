-- AddStudent: a summary may be an uploaded PDF / Word file (text extracted on the client), with the safeguards
-- (author declaration, sha256 blocked after a final takedown, strikes). Fields from the founder: topic, published date,
-- and the student's track copied from the profile.

ALTER TABLE campus_docs ADD COLUMN topic TEXT;         -- נושא הסיכום
ALTER TABLE campus_docs ADD COLUMN published TEXT;     -- תאריך הפרסום, YYYY-MM-DD
ALTER TABLE campus_docs ADD COLUMN file_type TEXT;     -- pdf | docx | NULL (written text)
ALTER TABLE campus_docs ADD COLUMN sha256 TEXT;        -- hex digest of the uploaded file
ALTER TABLE campus_docs ADD COLUMN track TEXT;         -- the author's track (מגמה) at the time of writing
CREATE INDEX campus_docs_sha ON campus_docs(sha256);
CREATE INDEX campus_docs_dates ON campus_docs(inst, faculty, published, lesson_date);

-- files removed after a final takedown may not be uploaded again
CREATE TABLE blocked_hashes (
  sha256 TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  contact_id TEXT
);
