# Tachyon-서버-02 · 공유 폴더 쪽지 처리: 날짜 따라 실패하던 시험, 앱 로그인 표·폰 캘린더·계정 지우기 손보기

- 날짜: 2026-11-10
- 도구: Claude Code (Claude Opus 5.5) — archi142857 쪽 '서버' 세션. 쪽지는 Google Drive 커넥터, 이슈 확인은 GitHub REST API(`gh api`)
- 기록 유형: 사용자 직접 지시
- 목적: 드라이브 받은편지함 '서버'의 쪽지를 처리하고, 그 사이 다른 세션·팀원이 고친 서버 파일을 확인한다.

## 프롬프트 원문

````text
공유 폴더
````

## 결과 요약

- 받은편지함 쪽지 4개(컨셉) 처리, 모두 `처리됨/`으로.
- **날짜 따라 실패하던 시험(6913f3a):** `7_items`가 할 일 순서에 넘기는 지금 시각을 `new Date()`로 만들어 시험의 고정 시각(`Date.now`)을 안 따랐다 → `new Date(Date.now())`. CI 'test' 빨간불의 원인. 시험 134개 통과.
- **남이 고친 서버 파일 읽기:** 컨셉의 `9_etl.js`(eTL API)와 `2_collect_ics.js`의 `ext_id NOT LIKE 'api-%'` 두 곳은 서버 약속과 맞아 그대로. 팀원의 앱 로그인·폰 캘린더는 두 곳을 손봤다.
  - 앱 로그인 표(`/api/login/ticket`)는 이 사이트 화면이 연 요청만 받는다(`Sec-Fetch-Site: same-origin`, 없으면 Referer). 남의 표를 링크로 열어 그 계정으로 로그인되는 것(로그인 CSRF)을 막는다. 앱 코드는 그대로.
  - 폰 캘린더는 다른 캘린더와 이름·시작이 같은 일정을 넣었다 지우지 않고 처음부터 뺀다(앱을 열 때마다 겹치는 수 × 2줄 쓰기 → 0줄). 겹침 찾기 읽기를 줄이려고 팀원에게 `events (user_id, start)` 색인을 부탁했다.
- **계정 지우기:** 새 표 `etl`·`etl_items`도 지운다. 원격 D1에 아직 없는 표는 건너뛴다.
- **계획:** '할 일·일정 API(7_items)' 줄을 끝으로 표시(시험 + 배포 log). 'ICS 수집기'·'Cron 15분'은 팀원에게 원격 D1 숫자·Cron CPU 시간을, 로그아웃·폰 달력 구독은 컨셉을 거쳐 사람에게 확인을 부탁했다.
- **개인정보처리방침 초안:** 서버 사실로 고칠 곳(폰 캘린더, Tachyon 구독 주소의 성질과 한계, 지우는 목록에 eTL)을 컨셉에 보냈다.

## 바뀐 파일

- 고침: `worker/7_items.js`, `worker/1_login.js`, `worker/2_collect_ics.js`, `worker/test/1_login.test.js`, `worker/test/2_collect_ics.test.js`, `docs/tachyon/계획.md`(7_items 줄), `docs/tachyon/소통.md`(알림·요청)
- 새로: 이 기록
