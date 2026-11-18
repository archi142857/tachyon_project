-- AI 앱 연결(worker/13_mcp.js, 11-19) — 있던 원격 D1에 한 번 넣는다:
--   npx wrangler d1 execute tachyon --remote --file worker/migrations/13_mcp.sql
-- 새 DB는 schema.sql에 같은 것이 들어 있다.
CREATE TABLE IF NOT EXISTS ai_links (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client     TEXT NOT NULL,
  host       TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S+09:00', 'now', '+9 hours')),
  used_at    TEXT
);
CREATE INDEX IF NOT EXISTS ai_links_user ON ai_links (user_id);
