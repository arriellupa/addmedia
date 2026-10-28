# Campus v2 — API contract (server ↔ media page)

Both agents build to this file. Server: `worker/`. Client: `panel/` (media page at `panel/src/media/*`).
All texts shown to people are Hebrew. Errors: `fail(status, code, message)` as elsewhere in the worker.

## Documents (`campus_docs`) — changed
- `kind`: `summary` (סיכום שכתב הסטודנט) | `exercise` (תרגול עצמי שכתב) | `article` (מאמר/פסק דין — קישור בלבד, בלי קובץ).
- POST `/v1/campus/docs?inst&faculty&year[&course]&kind&title[&pages]` (auth + terms):
  - `summary`/`exercise`: body = PDF (≤15MB). Requires query `author=1` (הצהרת מחבר) → else 400 `author`. Server computes sha256; if in `blocked_hashes` → 403 `blocked` ("הקובץ הוסר בעבר לבקשת בעל הזכויות"). Uploader with `strikes>=3` → 403 `strikes`. Response `{doc}`.
  - `article`: body = JSON `{url, abstract?, summary?}`; `url` must be http(s) (a DOI like `10.1000/x` is turned into `https://doi.org/…`); no file. Response `{doc}`. Not allowed for hosts `nevo.co.il`, `takdin.co.il`, `psakdin.co.il` → 400 `source` ("קשרו למקור הציבורי: court.gov.il או כתב העת").
- `doc` object: `{id, uid, name, place, kind, title, size, pages?, ts, file?, url (room url), link? (article url), abstract?, summary?, textReady: boolean}`.
- GET `/v1/campus/docs?inst&faculty&year[&course][&kind]` → `{docs, title, url, coverage: {docs: n, summaries: n, articles: n}}`.
- POST `/v1/campus/docs/:id/text` (owner only; body = plain text ≤ 200,000 chars, extracted client-side with pdf.js, pages separated by `\f`) → `{ok}`; stored in `campus_doc_text`.
- GET `/v1/campus/docs/:id/text?page=N` → `{page, text}` (public, visible docs).
- GET `/v1/campus/search?inst&faculty&year[&course]&q=` → `{hits: [{doc, page?, snippet}]}` (title match first, then text LIKE over `campus_doc_text`, max 30).
- DELETE `/v1/campus/docs/:id` — owner or admin (unchanged).

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
`worker/migrations/0004_campus_v2.sql`: ALTER campus_docs ADD link_url, abstract, summary, sha256, pages; CREATE campus_doc_text(doc_id PK, text); blocked_hashes(sha256 PK, created_at, contact_id); campus_courses(inst,faculty,year,course,chat_url,exam_until,updated_by,updated_at, PK(inst,faculty,year,course)); campus_events(id PK, inst,faculty,year,course,title,date,kind,user_id,user_name,created_at); ALTER users ADD strikes INTEGER NOT NULL DEFAULT 0. SQLite: `course` in a PK cannot be NULL → store `''` for the hub.
