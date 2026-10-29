# Campus v2 — API contract (server ↔ media page)

Both agents build to this file. Server: `worker/`. Client: `panel/` (media page at `panel/src/media/*`).
All texts shown to people are Hebrew. Errors: `fail(status, code, message)` as elsewhere in the worker.

## DECISION 23:21 — no file hosting. Documents are TEXT the student writes/edits in the app.
The founder decided: the campus hosts NO files (no PDF in R2). A "document" is text: a summary or an exercise the
student wrote or edited in his own words, or an article/judgment as a LINK with an abstract and the student's
summary. The client may let the student IMPORT text from a Word/PDF file **locally in the browser** (mammoth /
pdf.js) into the editor — the file never leaves the device and is never uploaded; what is saved is the edited text.
Everything about PDF upload, R2 objects, sha256/blocked_hashes of files and page text is DROPPED. Replace with:

## Documents (`campus_docs`) — text documents
- `kind`: `summary` (סיכום) | `exercise` (תרגול) | `article` (מאמר/פסק דין — קישור + תקציר + סיכום).
- POST `/v1/campus/docs?inst&faculty&year[&course]` (auth + terms), JSON body
  `{kind, title, body, link?, author: true}`:
  - `body`: the text, 20–60,000 chars, plain text with optional lines starting with `# ` as section headings
    (sections are what deep links and anchored talkbacks point at: section index 1..n). `checkText` on title (and
    a cheap profanity pass on body if cheap).
  - `author: true` required (הצהרה: «כתבתי או ערכתי את הטקסט במילותיי; לא העתקתי מצגת, הקלטה או מבחן») → else 400 `author`.
  - `article`: `link` required, http(s) or DOI (→ https://doi.org/…); hosts nevo.co.il / takdin.co.il / psakdin.co.il
    refused 400 `source`; `body` = abstract + summary (same field).
  - uploader with `strikes>=3` → 403 `strikes`. Max 50 docs per user per day.
  - response `{doc}`.
- PUT `/v1/campus/docs/:id` (owner) body `{title?, body?, link?}` → `{doc}` (edit in place; `updated_at`).
- `doc`: `{id, uid, name, place, kind, title, link?, sections: [{i, heading}], chars, ts, updatedAt, url (room url)}` —
  the body is NOT in the list; GET `/v1/campus/docs/:id` → `{doc, body}`.
- GET `/v1/campus/docs?inst&faculty&year[&course][&kind]` → `{docs, title, url, coverage: {docs, summaries, exercises, articles}}`.
- GET `/v1/campus/search?inst&faculty&year[&course]&q=` → `{hits: [{doc, section?, snippet}]}` (title first, then body LIKE, max 30).
- DELETE `/v1/campus/docs/:id` — owner or admin.
- Takedown apply: removes docs (status `removed`), strikes on authors; no hashes.
- Migration 0004: campus_docs ADD body TEXT, link_url, updated_at; (r2_key/size may stay nullable/unused); users ADD strikes.
  Keep the other tables of the contract (campus_courses, campus_events) as specified below.

## Course meta (`campus_courses`) — new
- GET `/v1/campus/course?inst&faculty&year[&course]` → `{chatUrl: string|null, examUntil: ISO date|null, updatedBy, updatedAt}`; empty object when none.
- PUT same query (auth + terms) body `{chatUrl?, examUntil?}`; `chatUrl` only `https://chat.whatsapp.com/…` or `https://t.me/…`, else 400 `chat_url`. `examUntil` null or `YYYY-MM-DD`. Logged in `mod_log` (`course_meta`).

## Semester calendar (`campus_events`) — new
- GET `/v1/campus/events?inst&faculty&year[&course]` → `{events: [{id, title, date (YYYY-MM-DD), kind: exam|deadline|other, course?, uid, name}]}` sorted by date, today onwards + last 7 days.
- POST same query (auth + terms) body `{title, date, kind, course?}` → `{event}`; title checked by `checkText`.
- DELETE `/v1/campus/events/:id` — owner or admin.
- "מצב מבחן": client treats the course as in exam mode when an `exam` event is within 10 days or `examUntil` ≥ today.

## Takedown (notice-and-removal) — new
- POST `/v1/campus/takedown` (no auth) body `{name, email, role: lecturer|institution|author|other, inst, faculty, year?, course?, docIds?: string[], reason}` → `{ok, id}`; saved as a `contacts` row kind `takedown` with `meta` JSON; rate-limited like `/v1/contact`.
- Admin: POST `/v1/admin/campus/takedown/:id/apply` body `{docIds?: string[], all?: boolean}` → removes the docs (status `removed`, R2 object deleted), inserts their sha256 into `blocked_hashes`, `UPDATE users SET strikes = strikes + 1` for each uploader, marks the contact `done`. `all: true` = every visible doc in the takedown's place (course if given, else faculty/year).
- `users.strikes` INTEGER DEFAULT 0 (ADD COLUMN in migration).

## Existing, unchanged
`/v1/campus/tree`, `/v1/me/follows` (paths `/media/campus/<inst>/<faculty>/<year>[/<course>]` and `/media/site/<host>`), `/v1/directory?campus=1`, rooms via `https://campus.addmedia.noaplate.com/<inst>/<faculty>/<year>[/<course>]` and `/doc/<id>`; `/v1/panel`, `/v1/posts` (talkbacks; a page-anchored comment is a talkback in the doc's room whose body starts with `עמ׳ N: `), `/v1/media`.

## Migration
`worker/migrations/0004_campus_v2.sql`: ALTER campus_docs ADD body, link_url, updated_at; campus_courses(inst,faculty,year,course,chat_url,exam_until,updated_by,updated_at, PK(inst,faculty,year,course)); campus_events(id PK, inst,faculty,year,course,title,date,kind,user_id,user_name,created_at); ALTER users ADD strikes INTEGER NOT NULL DEFAULT 0. SQLite: `course` in a PK cannot be NULL → store `''` for the hub.

## Deviations and precisions (server, as built — 2026-10-29)
Everything below is what `worker/` does; where the sections above disagree with each other, this wins.

**Documents (text model)**
- POST `/v1/campus/docs?inst&faculty&year[&course]` JSON `{kind, title, body, link?, author: true, lecturer?, lessonDate?, lessonNo?}`. Refusals: 400 `bad_kind`, `bad_title` (< 3 chars), `author`, `bad_course` (summary/exercise without a course), `short_body` (< 20 chars), `bad_url`, `source`, `bad_date` (lessonDate), `bad_lesson`; 413 `long_body` (over `settings.campusCharsPerDoc`, max 60,000); 422 from `checkText` on the title and the profanity pass on the body; 403 `strikes`, `student`, `quota`; 429 `rate` (50 docs/day). `author` may also come as the query `author=1`; `link` may also be `url`.
- `doc`: `{id, uid, name, place, kind, title, link?, lecturer? (slug), lecturerName?, lessonDate?, lessonNo?, sections: [{i, heading}], chars, ts, updatedAt, url, status?}`. `status` is present only when not visible: `"hold"` (the author sees his own held docs in the list and may read them; nobody else).
- GET `/v1/campus/docs/:id` → `{doc, body}`; 404 for removed/held (except the author of a held doc). PUT `{title?, body?, link?, lecturer?, lessonDate?, lessonNo?}` by the author; 403 `forbidden` otherwise, 400 `empty` when nothing is given.
- List: `coverage: {docs, summaries, exercises, articles}`. Rows written before v2 (PDF era, `body IS NULL`) are never listed.
- Search: `{hits: [{doc, section?, snippet}]}`; `section` = the index of the `# ` heading the match falls under, absent before the first heading or for a title hit; `q` < 2 chars → `{hits: []}`; `%`/`_` are literal.
- `/v1/campus/docs/:id/file` no longer exists (404 `not_found`).

**Student profile**
- GET `/v1/me/student` → `{student: {fullName, email, inst, faculty, faculty2, year, track, createdAt, updatedAt} | null, plan, quota}`. PUT body also takes `faculty2?`. Refusals: 400 `bad_name`, `bad_track`, `bad_place`; 422 from `checkText`.
- `email` is the login email, now stored in `users.email` at every code sign-in (migration adds the column; accounts that signed in before it show `null` until their next sign-in). The privacy policy must mention it.
- The gate: 403 `student` on docs POST/PUT, events POST, course PUT, `/v1/posts` in a campus room, and the websocket chat of a campus room (nack `code: "student"`). Reading, following and `/v1/panel` stay open.
- GET `/v1/me/campus` → `{student, plan, quota, holds}` (one call for the campus header). `/v1/me` GET also carries `holds` (documents of mine on hold) and the user object carries `strikes` and `campusUntil`.

**Plan and quotas**
- `plan: {active, until (YYYY-MM-DD|null), trialUntil (profile created_at + 14 days | null), price (agorot)}`. Reading the campus (docs list, single doc, search, tree with counts, lecturer archive) without `active` → 402 `plan` with `error.plan` and `error.signedIn`. Anonymous readers get 402 too (no trial without a profile). Course meta, events, the plain tree, follows and the panel stay free.
- Store: product `campus` («קמפוס · סמסטר», `price` from `settings.campusPrice`, default 2990 agorot, 182 days); checkout in test mode → `{ok, test, campusUntil}`; otherwise 501 `payments_soon`. Admin grant: POST `/v1/admin/campus/grant {userId, days?=182}` → `{ok, campusUntil}` (extends, never shortens).
- `quota: {docsPerMonth, docsThisMonth, charsPerDoc, charsTotal, charsUsed}` (`charsUsed` = chars of my non-removed docs; month = calendar month UTC). Over the monthly or total quota → 403 `quota`. Settings keys `campusDocsPerMonth`, `campusCharsPerDoc`, `campusCharsTotal`, `campusPrice`; public settings carry `campus: {docsPerMonth, charsPerDoc, charsTotal, price}`.

**Directory**
- GET `/v1/campus/tree?inst&faculty&year` → the plain tree plus `{place, courses: [{course, n, lecturers: [{lecturer (slug|null), name, n, lessons: [{date, n}]}]}]}` (visible docs only; docs without a lecturer are grouped under `lecturer: null`). Without `inst` the plain tree is returned, cached.
- GET `/v1/campus/lecturer?inst&faculty&lecturer=` (lecturer as typed or slug) → `{lecturer, docs}` across years and courses.

**Course meta / events** (unchanged from before): `PUT` or `POST`; response = the meta object (`{}` when none); `updatedBy` is the display name; 400 `chat_url`, `bad_date`, `empty`. Events: course query → that course only; hub → every event with `course`; window today − 7 days (Asia/Jerusalem); 400 `bad_title`/`bad_date`; admin deletes with the admin token as Bearer on `DELETE /v1/campus/events/:id` or `DELETE /v1/admin/campus/events/:id`.

**Takedown (hold flow)**
- POST `/v1/campus/takedown/start {email}` → `{sent, devCode?}` (same code machinery as sign-in, separate key; 429 `too_many` after 5/hour).
- POST `/v1/campus/takedown` `{name, phone, role, reason, items: [{type: doc|post|chat, id, sections?, roomId?}], email?, code?, inst?, faculty?, year?, course?, docIds?}`. Signed in (Bearer) with a stored login email → no code; otherwise `email` + `code` (400 `bad_code`). `phone`: Israeli mobile, `+972` accepted, stored as `05X-XXXXXXX` (400 `bad_phone`). Posts/chat are found by `content_index` (talkbacks, images) or by the `roomId` given (chat). Place is optional when items are given (taken from the first doc). Refusals: 400 `bad_name`, `short`, `bad_email`, `bad_place`; 429 `too_many` (5/hour per email), `abuse` (3 reverted notices from the same email or phone). Response `{ok, id, held}`. Held items: docs `status='hold'`, room items `status='hold'` (room `setStatus` now accepts `hold`; media is kept until a final removal). `mod_log` gets `hold` per item (actor `auto`).
- Admin: GET `/v1/admin/campus/takedowns` → `{takedowns: [{...contact (incl. phone, status open|handled|reverted), meta: {role, inst, faculty, year, course, docIds, items, viewer}, docs: [doc + status]}]}`. POST `.../:id/apply` `{docIds?, items?, all?}` — nothing given = every item the notice holds; `all` = every visible or held doc of the notice's place; docs → `removed`, room items → `removed`; one strike per distinct author; contact `handled`; `{ok, removed, struck}`. POST `.../:id/restore` → held items back to `visible`, contact `reverted`, `{ok, restored}`.
- There is no `notices` table: the author's notice is `holds` on `/v1/me` and `/v1/me/campus`, plus the `status: "hold"` label on his own docs.

**Attach my materials**
- GET `/v1/me/materials` → `{docs: [doc…], media: [{id, roomId, media, caption, ts, url}]}` (my visible docs, my live images).
- POST `/v1/room/attach` `{url, canonical?, title?, scope?, items: [{type: doc|media, id}]}` (auth + terms) → `{posts: [ref posts], skipped: [{id, code: not_found|already|ref_limit}]}`; 403 `ref_limit` only when every item hit the 50-rooms limit. A ref post: `kind: "ref"`, `body` = the title, `ref: {type, id, title, kind, author, link, place?, chars? | media}`; it is listed with the talkbacks (`room.posts`, `GET /v1/room/:id/posts?kind=text`), counted in `postCount`, deletable like any post, and subject to the 3-posts-per-minute limit. References are hidden (`hold`), restored or removed with the original (doc delete, takedown hold/apply/restore, image deletion by its owner). `material_refs` table in D1 (one row per material × room).

**Migration 0004** as in the file: campus_docs + `body, link_url, sections (JSON), chars, updated_at, lecturer, lecturer_name, lesson_date, lesson_no`; `campus_courses` (+ `updated_by_name`), `campus_events`, `student_profiles` (+ `faculty2`), `material_refs`; users + `strikes, email, campus_until`; contact_requests + `meta, phone`. `r2_key` is `''` for every new row; `size` = chars.

**Misc**: CORS allows `PUT`. Account erasure also deletes the student profile, the person's docs, events and material refs. The admin docs/takedowns pages link a document at `/media/campus/doc/<id>` — the UI should serve that path (or tell the server which one to use).

## DECISION 2026-10-29 12:31 — AddStudent: a standalone, light product
The students' product is its own site: **addstudent.noaplate.com** (served by the same worker; the app entry is `/student/` and the worker serves it for that host and for `/student/*`). Light theme (not dark), simple: **a directory to set the lesson** (when uploading) and **a directory to find summaries**. No command center, no address bar for other sites, no «גלישה רגילה» anywhere on that host. Same accounts, same server, same moderation/takedown/paywall.

**Files are back, with the safeguards.** A summary may be (a) written, (b) pasted, or (c) an uploaded **Word (.docx) or PDF** file with graphs and images, ≤ 15 MB. The founder decided this knowing the copyright exposure; the safeguards stay: author declaration (400 `author`), sha256 of the file in `blocked_hashes` after a final takedown (403 `blocked` on re-upload), immediate hold on a takedown notice, strikes. Text is still extracted **client-side** (mammoth / pdf.js) and posted to the server as the document's `body`, so search and the reader work the same; the original file is stored in R2 (`campus/<inst>/<faculty>/<year>/<id>.<ext>`) and served at `/v1/campus/docs/:id/file` (inline PDF; .docx as download, and the client renders .docx to HTML with images via mammoth for reading).
- POST `/v1/campus/docs` keeps the JSON path for written/pasted text; a NEW multipart-free path for files: POST `/v1/campus/docs/file?inst&faculty&year&course&lecturer&lessonDate&lessonNo&topic&title&author=1` with the raw file body (`Content-Type: application/pdf` or `application/vnd.openxmlformats-officedocument.wordprocessingml.document`; magic bytes checked: `%PDF-` / `PK\x03\x04`) → `{doc}` (status visible; `body` empty until the client posts it); then POST `/v1/campus/docs/:id/text` (owner) with the extracted text → `{ok, sections}`. `doc` gets `file: {url, type: "pdf"|"docx", size} | null`.
- Fields on every summary (from the founder): **faculty, track (מגמה/חוג) and year — filled automatically from the student profile** (the server takes them from `student_profiles`, the client shows them read-only with «שינוי» → profile); **שם השיעור** (`course`), **נושא הסיכום** (`topic`, 2–120 chars, new column; `title` = topic when title is empty), **שם המרצה** (`lecturer`), **תאריך הפרסום** (`published` YYYY-MM-DD, defaults to today; the lesson date stays optional as `lessonDate`). Migration 0005: `campus_docs ADD topic TEXT, published TEXT, file_type TEXT`; reuse `r2_key`, `size`, `sha256` (add `sha256` if missing).
- **Search**: GET `/v1/campus/search?inst&faculty[&year][&course][&lecturer][&from=YYYY-MM-DD][&to=YYYY-MM-DD][&q=]` — directory filters (lesson name, lecturer, date range) AND/OR free text over topic/title/body; `q` optional when a filter is given; hits sorted newest first; `{hits: [{doc, section?, snippet}], total}`. Year optional so a student can search the whole faculty.
- Directory for finding: GET `/v1/campus/tree?inst&faculty[&year]` returns `courses[].lecturers[].lessons[]` as now, each lesson `{date, n, topics: [..up to 5]}`.
- Paywall and student gate as before. The light theme and the simplified IA are UI matters (see the UI brief); the UI must keep /media/* (AddMedia) working unchanged.

### Deviations and precisions — AddStudent round (server, 2026-10-29 afternoon)
- **Place from the profile**: on every create (JSON and file) `faculty`, `year` and `track` come from `student_profiles`; the query `faculty` is honoured only when it equals the profile's `faculty2`; `inst` from the query, else the profile's. The doc carries `track`. Without a profile → 403 `student`.
- **Fields**: `topic` (2–120, 400 `bad_topic`), `published` (YYYY-MM-DD, default today in Israel, 400 `bad_date`), both editable by PUT; `title` falls back to `topic` (400 `bad_title` when both missing). For the file path all fields are query parameters (`inst, course, kind?, title?, topic, lecturer, lessonDate, lessonNo, published, author=1`); for the JSON path they may be in the body or the query.
- **Files**: POST `/v1/campus/docs/file` (raw body, `%PDF-` or `PK\x03\x04`, ≤ 15 MB → 413 `too_big`, 415 `bad_type`; 400 `bad_kind` for `kind=article`; 403 `blocked` when the sha256 is in `blocked_hashes`). The doc starts with `body: ""`, `chars: 0`, `sections: []` and is listed at once. `doc.file: {url, type: "pdf"|"docx", size} | null`. GET `/v1/campus/docs/:id/file` is behind the paywall (402 `plan`) like the body, served inline (pdf) or as attachment (docx), `private, max-age=3600`, CSP `default-src 'none'`, CORS `*`; a held file is served to its owner only. POST `/v1/campus/docs/:id/text` (owner, raw text) → `{ok, sections, chars}`; text longer than `charsPerDoc` is **cut**, not refused; profanity pass → 422; total-chars quota → 403 `quota`. Deleting the doc deletes the file; a final takedown deletes the file and blocks its sha256 (migration 0005 recreates `sha256` and `blocked_hashes`).
- **Search**: `GET /v1/campus/search?inst&faculty[&year][&course][&lecturer][&from][&to][&q]` → `{hits, total}`; `lecturer` as typed or slug; `from`/`to` on `COALESCE(lesson_date, published)`; `q` ≥ 2 chars searches title, topic and body; no `q` and no filter → `{hits: [], total: 0}`; bad date → 400 `bad_date`; sorted by that date desc, then creation desc; 30 hits, `total` counts all. Hit `snippet` = body excerpt (with `section`) or the title/topic.
- **Tree**: `GET /v1/campus/tree?inst&faculty[&year]` → `place.year` is absent when not given; `lessons[]` = `{date, n, topics: [≤5 distinct]}`.
- **Hosting**: `addstudent.noaplate.com` added to `wrangler.jsonc` routes as a custom domain (same as addmedia's). On that host, and for `/student/*` on any host, every GET that is not `/v1/*`, `/m/*`, `/panel/*`, `/assets/*` or a file with an extension serves `/panel/student.html` from ASSETS, falling back to `/panel/media.html` while the student page does not exist. CORS is already `*`.
- Migration `0005_addstudent.sql`: campus_docs + `topic, published, file_type, sha256, track`; indexes; `blocked_hashes`.
