-- 공부방(worker/14_study.js, 11-19) — 있던 원격 D1에 한 번 넣는다:
--   npx wrangler d1 execute tachyon --remote --file worker/migrations/14_study.sql
-- 새 DB는 schema.sql에 같은 것이 들어 있다.
CREATE TABLE IF NOT EXISTS study (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id  TEXT NOT NULL,                -- eTL 과목 id
  course     TEXT NOT NULL,                -- 과목 이름
  exam       TEXT,                         -- 사용자가 말한 시험 이름(중간고사 …). NULL = 아직 범위를 안 물음
  exam_date  TEXT,                         -- YYYY-MM-DD
  scope_note TEXT,                         -- 사용자가 말한 범위 그대로
  data       TEXT NOT NULL DEFAULT '{"turn":0,"files":[],"wrong":[]}', -- 자료 목록·범위·읽은 쪽·개념 지도·결과·오답 노트(14_study.js 머리말)
  updated_at TEXT,
  PRIMARY KEY (user_id, course_id)
);
