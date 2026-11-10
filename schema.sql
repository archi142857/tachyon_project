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
  -- eTL 토큰은 아래 etl 표(3단계, 11-10)
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
  source    TEXT NOT NULL,                -- etl · google · apple(ICS 칸 이름) · device(앱이 읽은 폰 캘린더) · memo · timetable · kakao · notice(eTL 공지에서 찾은 시험·휴강, 고치기·지우기 됨)
  ext_id    TEXT,                         -- ICS의 UID 등. 메모에서 나온 것은 'memo:<메모 id>'(메모 하나에 하나)
  important INTEGER NOT NULL DEFAULT 0,
  moved_to  INTEGER,                      -- 메모로 '일정 변경'을 하면 옛 일정에 새 일정 id를 적는다 → 달력·브리핑에서 가린다(NULL = 보임).
                                          -- 새 일정을 지우면 NULL로 돌아온다. 11-10 추가: 있던 DB는 ALTER TABLE events ADD COLUMN moved_to INTEGER;
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
-- 의견 한도·같은 오류 찾기(6_feedback)와 수치 뽑기가 action으로 찾는다. 없으면 부를 때마다 log 전체를 읽는다.
CREATE INDEX IF NOT EXISTS log_action_at ON log (action, at);

-- eTL API(학생 개인 액세스 토큰, 선택). 사용자마다 한 줄. 담당 worker/9_etl.js (소통판 11-10 제안)
CREATE TABLE IF NOT EXISTS etl (
  user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT NOT NULL,              -- APP_SECRET으로 잠근 토큰(seal). 원문은 어디에도 안 둔다
  term        TEXT,                       -- 가져올 학기(eTL term 이름, 예 '2026년 2학기'). NULL이면 날짜로 고름
  last_try_at TEXT,
  last_ok_at  TEXT,
  last_error  TEXT,                       -- 화면에 'eTL 연결 실패'
  dead_count  INTEGER NOT NULL DEFAULT 0  -- 401(토큰 지움·만료) 연속 횟수. 2번이면 Cron이 멈춤
);

-- eTL에서 가져온 공지·강의자료 목록. 과제는 tasks(source etl)로, 공지에서 찾은 시험·휴강·보강은 events(source notice)로 간다
CREATE TABLE IF NOT EXISTS etl_items (
  id        INTEGER PRIMARY KEY,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind      TEXT NOT NULL,                -- notice(공지) · file(강의자료)
  course    TEXT NOT NULL,                -- 과목 이름(eTL 그대로)
  title     TEXT NOT NULL,
  url       TEXT,                         -- eTL 화면 주소(로그인해야 열림). 파일 내려받기 주소(검증값 붙음)는 안 넣는다
  posted_at TEXT,                         -- 올린 시각(+09:00)
  tag       TEXT,                         -- 공지를 읽은 결과: exam · cancel · makeup · none · NULL(아직 안 읽음). 공지 글 자체는 저장 안 함
  ext_id    TEXT NOT NULL,                -- 'notice-<id>' · 'file-<id>'
  UNIQUE (user_id, ext_id)
);

-- 3단계: friends, groups, group_members
