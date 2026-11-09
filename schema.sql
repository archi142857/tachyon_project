-- Tachyon Project DB 표 (11-09 합의: 컨셉·서버·AI 세션 의견 반영)
-- 이 파일이 일을 나누는 경계다. 칸을 바꾸면 docs/tachyon/소통.md에 '알림'으로 남긴다.
-- 시각은 한국 시간 ISO 8601 글자 한 모양(2026-11-13T15:00:00+09:00) → 글자 비교로 정렬·기간 조회가 맞다.
--   ICS의 UTC(Z)·TZID 시각은 넣기 전에 +09:00로 바꾼다. 기본값도 같은 모양(KST)으로 만든다.
-- 종일 일정은 날짜만(2026-11-13), end는 ICS처럼 끝난 다음 날(11/12 하루 = 2026-11-12 ~ 2026-11-13).
-- 로컬: npm run db:local · Cloudflare: npm run db:remote

CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY,
  google_sub TEXT NOT NULL UNIQUE,        -- 구글 계정 고유 번호 (이메일은 바뀔 수 있어서 이걸로 찾는다)
  email      TEXT NOT NULL,
  name       TEXT,
  dept       TEXT,                        -- 학과
  year       INTEGER,                     -- 학년
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S+09:00', 'now', '+9 hours'))
  -- 로그인 세션은 표 없이 서명 쿠키(APP_SECRET HMAC, 30일) — worker/1_login.js
  -- 3단계: etl_token (암호화해서 저장)
);

-- 캘린더 주소: 사용자 × 칸(etl·google·apple)마다 한 줄. 담당 worker/2_collect_ics.js
CREATE TABLE IF NOT EXISTS feeds (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,              -- etl · google · apple (= 거기서 온 events/tasks의 source)
  url         TEXT NOT NULL,              -- APP_SECRET으로 잠근 주소. 원문은 어디에도 안 둔다
  last_hash   TEXT,                       -- 마지막으로 반영한 내용의 지문(같으면 건너뜀)
  last_try_at TEXT,                       -- 마지막 시도
  last_ok_at  TEXT,                       -- 마지막 성공
  last_error  TEXT,                       -- 마지막 실패 이유(성공하면 NULL) → 화면에 '이 주소 수집 실패'
  item_count  INTEGER,                    -- 마지막 반영 때 일정·할 일 수
  dead_count  INTEGER NOT NULL DEFAULT 0, -- 주소가 안 열린(401·403·404·410·ICS 아님) 연속 횟수. 2번이면 Cron이 멈춤
  UNIQUE (user_id, kind)
);

CREATE TABLE IF NOT EXISTS events (
  id        INTEGER PRIMARY KEY,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title     TEXT NOT NULL,
  start     TEXT NOT NULL,
  end       TEXT,
  place     TEXT,
  source    TEXT NOT NULL,                -- etl · google · apple(ICS 칸 이름) · device(앱이 읽은 폰 캘린더) · memo · timetable · kakao
  ext_id    TEXT,                         -- ICS의 UID 등. 메모에서 나온 것은 'memo:<메모 id>'(메모 하나에 하나)
  important INTEGER NOT NULL DEFAULT 0,
  UNIQUE (user_id, source, ext_id)
);

CREATE TABLE IF NOT EXISTS tasks (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,               -- 사용자가 쓴 말 그대로
  due        TEXT,                        -- eTL 종일 마감 과제는 '…T23:59:00+09:00'
  minutes    INTEGER,                     -- 걸리는 시간 (AI 추정, 사용자가 고칠 수 있음)
  ready      INTEGER NOT NULL DEFAULT 1,  -- 1 = 지금 시작 가능, 0 = 수업·자료 뒤
  done       INTEGER NOT NULL DEFAULT 0,  -- 완료율(날짜별)은 log의 task_done 줄(at)로 센다
  source     TEXT NOT NULL,               -- events.source와 같은 이름
  ext_id     TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%S+09:00', 'now', '+9 hours')), -- 브리핑의 '새로 생김'
  UNIQUE (user_id, source, ext_id)
);

CREATE TABLE IF NOT EXISTS memos (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S+09:00', 'now', '+9 hours')),
  handled    INTEGER NOT NULL DEFAULT 0   -- 1 = 처리 끝(즉시 팝업에서 저장했거나 밤 정리가 읽음) → 밤 정리가 다시 안 읽는다
);

CREATE TABLE IF NOT EXISTS briefings (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date    TEXT NOT NULL,                  -- 2026-11-14
  text    TEXT NOT NULL,                  -- 브리핑 카드 JSON(오늘 일정·할 일 3개·미룰 것 1개·경고)
  PRIMARY KEY (user_id, date)
);

-- 측정용 (제출 때 사용 수치를 여기서 뽑는다)
CREATE TABLE IF NOT EXISTS log (
  id      INTEGER PRIMARY KEY,
  user_id INTEGER,
  action  TEXT NOT NULL,                  -- popup_save · popup_edit · popup_cancel · task_done · briefing_open · ics_sync · ics_fail …
  detail  TEXT,
  at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S+09:00', 'now', '+9 hours'))
);

-- 3단계: friends, groups, group_members
