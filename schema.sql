-- Tachyon Project DB 표 (초안 2026-11-09, 팀 합의 전)
-- 이 파일이 일을 나누는 경계다. 칸을 바꾸면 docs/tachyon/소통.md에 '알림'으로 남긴다.
-- 시각은 ISO 8601 글자(예: 2026-11-13T15:00:00+09:00), 종일 일정은 날짜만(2026-11-13).
-- 로컬: npm run db:local · Cloudflare: npm run db:remote

CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY,
  google_sub TEXT NOT NULL UNIQUE,        -- 구글 계정 고유 번호 (이메일은 바뀔 수 있어서 이걸로 찾는다)
  email      TEXT NOT NULL,
  name       TEXT,
  dept       TEXT,                        -- 학과
  year       INTEGER,                     -- 학년
  ics_urls   TEXT NOT NULL DEFAULT '[]',  -- JSON 배열. 비밀값이라 로그·화면·이슈에 그대로 찍지 않는다
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
  -- 3단계: etl_token (암호화해서 저장)
);

CREATE TABLE IF NOT EXISTS events (
  id        INTEGER PRIMARY KEY,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title     TEXT NOT NULL,
  start     TEXT NOT NULL,
  end       TEXT,
  place     TEXT,
  source    TEXT NOT NULL,                -- etl · ics · device(앱이 읽은 폰 캘린더) · memo · timetable · kakao
  ext_id    TEXT,                         -- ICS의 UID 등. 같은 걸 다시 받아도 한 줄로 남게
  important INTEGER NOT NULL DEFAULT 0,
  UNIQUE (user_id, source, ext_id)
);

CREATE TABLE IF NOT EXISTS tasks (
  id      INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title   TEXT NOT NULL,                  -- 사용자가 쓴 말 그대로
  due     TEXT,
  minutes INTEGER,                        -- 걸리는 시간 (AI 추정, 사용자가 고칠 수 있음)
  ready   INTEGER NOT NULL DEFAULT 1,     -- 1 = 지금 시작 가능, 0 = 수업·자료 뒤
  done    INTEGER NOT NULL DEFAULT 0,
  source  TEXT NOT NULL,
  ext_id  TEXT,
  UNIQUE (user_id, source, ext_id)
);

CREATE TABLE IF NOT EXISTS memos (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  handled    INTEGER NOT NULL DEFAULT 0   -- 밤 정리가 읽었으면 1
);

CREATE TABLE IF NOT EXISTS briefings (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date    TEXT NOT NULL,                  -- 2026-11-14
  text    TEXT NOT NULL,
  PRIMARY KEY (user_id, date)
);

-- 측정용 (제출 때 사용 수치를 여기서 뽑는다)
CREATE TABLE IF NOT EXISTS log (
  id      INTEGER PRIMARY KEY,
  user_id INTEGER,
  action  TEXT NOT NULL,                  -- popup_save · popup_edit · popup_cancel · task_done · briefing_open · collect_fail …
  detail  TEXT,
  at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 3단계: friends, groups, group_members
