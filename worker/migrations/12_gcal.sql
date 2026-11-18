-- 구글 캘린더 실시간 연동(worker/12_gcal.js, 11-18) — 있던 원격 D1에 한 번 넣는다:
--   npx wrangler d1 execute tachyon --remote --file worker/migrations/12_gcal.sql
-- 새 DB는 schema.sql에 같은 것이 들어 있다.
ALTER TABLE events ADD COLUMN gcal_id TEXT;
ALTER TABLE events ADD COLUMN gcal_seen TEXT;
CREATE INDEX IF NOT EXISTS events_gcal ON events (user_id, gcal_id) WHERE gcal_id IS NOT NULL;

-- 구글 캘린더 실시간 양방향 연동(12_gcal.js, 11-18 사람 "구글/노션 캘린더랑 연동되어서 실시간으로 둘 다 반영되게"). 한 사람에 하나(구글 기본 캘린더)
CREATE TABLE IF NOT EXISTS gcal (
  user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  refresh     TEXT NOT NULL,              -- APP_SECRET으로 잠근 refresh 토큰(seal). 원문은 어디에도 안 둔다
  hook        TEXT NOT NULL,              -- 구글이 바뀜 알림을 보낼 이 사이트 주소(origin). Cron이 채널을 새로 열 때 쓴다
  channel     TEXT,                       -- 구글 알림 채널 id(무작위 UUID — 알림이 진짜인지 이것으로 안다)
  resource    TEXT,                       -- 구글이 준 resourceId
  channel_exp INTEGER,                    -- 채널이 끝나는 시각(ms). 하루 안 남으면 새로 연다
  pulled_at   INTEGER,                    -- 마지막으로 받아 온 시각(ms) → 다음엔 그 뒤에 바뀐 것만
  full_at     INTEGER,                    -- 기간 전체를 받은 시각(ms). 하루에 한 번
  error       TEXT                        -- 마지막 실패(성공하면 NULL). 'reconnect' = 토큰이 죽어 다시 연결해야 함
);
-- 일정을 지우면(어느 길로든) 그 구글 id를 남겨 12_gcal.js가 구글에서도 지운다.
-- users 참조는 걸지 않는다: 사람을 지울 때 연쇄 삭제 도중 트리거가 넣는 줄이 막히지 않게(남은 줄은 Cron이 치운다)
CREATE TABLE IF NOT EXISTS gcal_gone (
  user_id INTEGER NOT NULL,
  gcal_id TEXT NOT NULL,
  PRIMARY KEY (user_id, gcal_id)
);
CREATE TRIGGER IF NOT EXISTS events_gcal_gone AFTER DELETE ON events WHEN OLD.gcal_id IS NOT NULL
BEGIN
  INSERT OR IGNORE INTO gcal_gone (user_id, gcal_id) VALUES (OLD.user_id, OLD.gcal_id);
END;
