-- the opening card of a page: an AI summary and discussion questions, made once per page (cache key = canonical URL)
CREATE TABLE IF NOT EXISTS page_cards (
  k TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL,
  questions TEXT NOT NULL,
  lang TEXT NOT NULL DEFAULT 'he',
  user_id TEXT,
  model TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_page_cards_created ON page_cards(created_at);
-- one row per use of the model (a card made, a question asked): the per-person daily limit
CREATE TABLE IF NOT EXISTS card_uses (
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_card_uses ON card_uses(user_id, kind, ts);
