-- Campus v2: documents are text the student writes (summary / exercise / article-as-link with abstract and summary),
-- author declaration and strikes, course meta (chat link, exam period), semester events, takedown notices.
-- No file hosting: r2_key stays for old rows only (always '' from now on), size = chars.

ALTER TABLE campus_docs ADD COLUMN body TEXT;          -- the text; lines starting with "# " are section headings
ALTER TABLE campus_docs ADD COLUMN link_url TEXT;      -- article: the public source (http(s), DOI resolved)
ALTER TABLE campus_docs ADD COLUMN sections TEXT;      -- JSON [{i, heading}], computed on write
ALTER TABLE campus_docs ADD COLUMN chars INTEGER NOT NULL DEFAULT 0;
ALTER TABLE campus_docs ADD COLUMN updated_at INTEGER;

-- per course (or per faculty/year hub when course = ''): group chat link and exam period
CREATE TABLE campus_courses (
  inst TEXT NOT NULL,
  faculty TEXT NOT NULL,
  year INTEGER NOT NULL,
  course TEXT NOT NULL DEFAULT '',
  chat_url TEXT,
  exam_until TEXT,              -- YYYY-MM-DD
  updated_by TEXT,              -- user id
  updated_by_name TEXT,
  updated_at INTEGER,
  PRIMARY KEY (inst, faculty, year, course)
);

-- semester calendar: exams, deadlines
CREATE TABLE campus_events (
  id TEXT PRIMARY KEY,
  inst TEXT NOT NULL,
  faculty TEXT NOT NULL,
  year INTEGER NOT NULL,
  course TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  date TEXT NOT NULL,           -- YYYY-MM-DD
  kind TEXT NOT NULL,           -- exam | deadline | other
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX campus_events_place ON campus_events(inst, faculty, year, date);

-- a takedown notice applied against a person's documents adds a strike; three strikes stop further publishing
ALTER TABLE users ADD COLUMN strikes INTEGER NOT NULL DEFAULT 0;

-- structured details of a takedown notice (role, place, docIds) beside the free text
ALTER TABLE contact_requests ADD COLUMN meta TEXT;

-- every person who writes in the campus identifies: name, institution, faculty, year, track (shown as name · faculty · year)
CREATE TABLE student_profiles (
  user_id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  inst TEXT NOT NULL,
  faculty TEXT NOT NULL,
  year INTEGER NOT NULL,
  track TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
-- the login email, kept from the last code sign-in so the student profile can show it (read-only)
ALTER TABLE users ADD COLUMN email TEXT;

-- takedown from inside the app: the requester's verified phone, kept beside the notice
ALTER TABLE contact_requests ADD COLUMN phone TEXT;

-- the student directory: course › lecturer › lesson
ALTER TABLE campus_docs ADD COLUMN lecturer TEXT;        -- slug
ALTER TABLE campus_docs ADD COLUMN lecturer_name TEXT;   -- as typed
ALTER TABLE campus_docs ADD COLUMN lesson_date TEXT;     -- YYYY-MM-DD
ALTER TABLE campus_docs ADD COLUMN lesson_no INTEGER;
CREATE INDEX campus_docs_lecturer ON campus_docs(inst, faculty, lecturer);

-- a second faculty (dual major)
ALTER TABLE student_profiles ADD COLUMN faculty2 TEXT;

-- the campus plan: paid until this date (YYYY-MM-DD); before that, a 14-day trial from the student profile
ALTER TABLE users ADD COLUMN campus_until TEXT;

-- a document or an image attached to other rooms as a reference («הוסף מידע»): stored once, referenced here
CREATE TABLE material_refs (
  type TEXT NOT NULL,            -- doc | media
  item_id TEXT NOT NULL,         -- the doc id, or the media post id
  src_room TEXT,                 -- the room of a media post
  room_id TEXT NOT NULL,         -- where the reference was posted
  post_id TEXT NOT NULL,         -- the ref post in that room
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (type, item_id, room_id)
);
