# Tachyon-34 · 구글 캘린더 실시간 양방향 연동(노션 캘린더 포함)

- 날짜: 2026-11-18
- 도구: Claude Code (Claude 데스크톱 앱 Code 탭, Claude Opus 5.5) — 서브에이전트로 구글 캘린더 API 공식 문서 조사(알림 채널 · updatedMin · 권한 · 시험 모드 토큰 7일), node --test(가짜 구글을 fetch로 바꿔 끼움), vitest · vite build, 앱 안 브라우저(예시 모드)로 연결 창 · 돌아옴 알림 확인, wrangler로 원격 D1 칸 읽기만
- 기록 유형: 사용자 직접 지시
- 목적: 구글 캘린더(그리고 그걸 보여 주는 노션 캘린더)와 Tachyon 일정을 양쪽으로 바로 맞춘다.

## 프롬프트 원문

11-18 10:41

````text
구글/노션 캘린더랑 연동되어서 실시간으로 둘 다 반영되게 해줘
````

## 정한 것

- 노션 캘린더는 공개 API가 없고 연결된 구글 캘린더를 그대로 보여 준다 → 구글 기본 캘린더와 맞추면 노션에도 보인다.
- 계획.md '캘린더 직접 읽기' 표의 "서버가 구글 캘린더 API로 … 안 쓴다"를 사람 요청으로 바꿈. 구글 앱 검증 전 제약(시험 모드면 7일마다 다시 연결, 게시하면 '확인 안 된 앱' 경고 · 100명)은 그대로라 사람이 고른다.
- 로그인(openid email profile)은 그대로 두고, 캘린더 권한(`calendar.events`)은 메뉴에서 따로 연결할 때만 묻는다.

## 한 일

- 서버 `worker/12_gcal.js`(새 번호 파일, `/api/gcal*`, 30분 Cron):
  - 연결: 구글 동의 화면 → refresh 토큰을 APP_SECRET으로 잠가 `gcal` 표에 → 처음 맞추기 · 알림 채널(events.watch) 열기.
  - 구글 → Tachyon: 구글이 `/api/gcal/push`로 바뀜을 알리면 `updatedMin` 뒤 바뀐 것만(지운 것 포함) 받는다. 처음 · 하루 한 번은 기간 전체(지난 30일 ~ 6개월)를 받아 옛 ICS로 받은 구글 일정을 API 것으로 바꾼다.
  - Tachyon → 구글: 쓰기 요청이 끝날 때마다(`index.js`) 기간 안 일정의 지금 내용을 마지막으로 맞춘 내용(`events.gcal_seen`)과 견줘 넣기 · 고치기, 지운 일정은 트리거가 `gcal_gone`에 남긴 id로 구글에서도 지운다. 구글 batch(한 요청에 50개).
  - Tachyon이 넣은 구글 일정 id는 'tc…'(먼저 정해 두어 두 번 안 들어감). 둘 다 바뀌면 구글이 이긴다(맞출 때 Tachyon 것을 먼저 보냄).
  - 끊기: Tachyon이 넣은 구글 일정 지우기 · 알림 채널 닫기 · 토큰 폐기 · 받아 온 구글 일정 지우기(구글 ICS 주소가 있으면 다음 수집 때 다시).
- 연동 중에는: 구글 ICS 주소 수집을 건너뛰고(`2_collect_ics`), 구글 일정도 사본 없이 고치고 지우며(`7_items`), 구독 주소 · 폰 'Tachyon' 캘린더에는 할 일 마감만(`8_calendar_feed`, 겹치지 않게).
- 표: `events.gcal_id · gcal_seen`, `gcal`, `gcal_gone` + 지우기 트리거(`schema.sql`, 있던 DB는 `worker/migrations/12_gcal.sql`). 표가 없으면 기능은 꺼진 채(연결 단추 '준비 중').
- 화면: 메뉴 '구글 캘린더 연동·폰 달력'(옛 '폰 달력에서 보기') 맨 위 연동 칸(연결 · 지금 맞추기 · 끊기, 앱 안에서는 구글이 로그인 창을 막아 브라우저에서 하라고 안내), 구글에서 돌아오면 한 줄 알림, 화면에 돌아올 때(30초에 한 번까지) 맞추고 일정을 다시 받음.
- 확인: 서버 시험 220(새 `12_gcal.test.js` 6개 — 넣기 · 안 바뀌면 구글에 안 물음 · 고치기 · 지우기 트리거, 전체 받기 · 알림 뒤 바뀐 것만 · 구글에서 지움, 연동 중 구글 일정 고치기 · 지우기, 연결 state · 토큰 잠금 · 끊기, batch 결과 읽기), 화면 198 · 빌드, 예시 모드에서 연동 칸 · 돌아옴 알림.

## 남은 것(사람)

- 원격 D1에 표 넣기(`worker/migrations/12_gcal.sql`) — 리마인드 칸(Tachyon-32)도 아직 없음.
- Google Cloud 콘솔: Calendar API 켜기, 동의 화면에 `calendar.events` 권한, 승인된 리디렉션 URI에 `<배포 주소>/api/gcal/callback`, 시험 사용자 추가(7일마다 다시 연결) 또는 게시(경고 · 100명).
- 실제 구글 계정으로 끝까지 해 보기(가짜 구글로만 시험함).

## 바뀐 파일

worker/12_gcal.js · worker/test/12_gcal.test.js · worker/migrations/12_gcal.sql · schema.sql · worker/index.js · wrangler.toml · worker/2_collect_ics.js · worker/7_items.js · worker/8_calendar_feed.js · web/src/api.js · web/src/components/CalendarSheet.jsx · web/src/screens/Dashboard.jsx · web/API.md · docs/tachyon/계획.md · docs/tachyon/소통.md · docs/작업_기록.md · prompts/README.md
