# Tachyon-서버-01 · 서버 세션 시작: 주소 나누기, 구글 로그인, ICS 수집기 + 15분 Cron

- 날짜: 2026-11-09
- 도구: Claude Code (Claude Opus 5.5) — archi142857 쪽 '서버' 세션. 실행 확인에 Node 내장 시험(node:test)과 wrangler·Miniflare(로컬 workerd + D1)를 씀
- 기록 유형: 사용자 직접 지시
- 목적: 서버 세션이 맡은 일(Cloudflare 연결, eTL ICS 위험 확인, 구글 로그인, ICS 수집기·Cron)을 시작한다.

## 프롬프트 원문

````text
너는 Tachyon 프로젝트의 '서버' 세션이야. 1. 프로젝트 문서 Tachyon_작업_방식.md를 먼저 읽고 그 규칙대로 해(맡은 경로·쪽지·레포 올리기·비밀값). 2. 레포 archi142857/tachyon_project를 push 권한으로 붙이고 CLAUDE.md → docs/ngs/인수인계.md → docs/ngs/계획.md 순서로 읽어. 3. 네 경로: wrangler.toml, package.json, .github/, worker/index.js, worker/lib/, worker/1_login.js, worker/2_collect_ics.js, worker/6_feedback.js. 다른 경로는 맡은 세션에 쪽지로 부탁해. 4. 할 일(계획 0~1단계): - Cloudflare Workers 프로젝트 + 레포 연결(main에 올리면 배포). 계정·로그인·비밀값 넣기는 내가 할 테니 단계만 짧게 안내해. - 위험 확인: Worker에서 eTL ICS 받기. 주소는 내가 Cloudflare 비밀값으로 넣고, 너는 이벤트 수만 보여 줘. - 구글 로그인(이름·이메일만) → users 행. 회의 때 만들던 로그인 작업이 어디 있는지 먼저 나한테 물어봐. - ICS 수집기(반복 일정 펼치기, ext_id로 중복 없음) + 15분 Cron. 5. 시작할 때 공유폴더 받은편지함 '서버'를 한 번 확인해.
````

작업 중 이어서 준 말:

````text
좋아. 작업 시작하셈. 멈추라 할 때까지 멈추지 마.
````

````text
Continue from where you left off.
````

## 결과 요약

- 시작할 때 팀 드라이브에 세션소통 폴더가 아직 없어 받은편지함을 못 봤다(뒤에 생겨서 AI 세션 쪽지 2개를 처리함). 회의 때 로그인 작업의 위치는 사용자에게 물었다(답 기다림).
- 일하는 동안 팀원(dhsrua555)이 Cloudflare 계정·D1(아시아)·수동 배포와 **eTL ICS 위험 확인**(Cron·미국 서버 포함 모두 200)을 먼저 끝냈고, main 자동 배포는 Workers Builds로 잇는 중이다. 그래서 같은 일을 하지 않았다: 만들던 GitHub Actions 배포와 eTL 개수 확인 주소는 빼고, [server.yml](../.github/workflows/server.yml)은 시험·빌드만 한다.
- 팀 공유 파일은 조금씩만 고쳤다: [worker/index.js](../worker/index.js)(주소 → 번호 파일 `handle(request, env, ctx, user)`, 없는 번호 파일은 501, Cron 2개, `/api/health` 그대로), [wrangler.toml](../wrangler.toml)(Cron·변수·로그), [package.json](../package.json)(`type: module`, `test`, ical.js).
- **[worker/1_login.js](../worker/1_login.js)**: 구글 기본 범위(이름·이메일)만, state·PKCE, `google_sub`로 users 행 만들기, 서명 쿠키 30일(표 없음), 내 정보·첫 설정(학과·학년)·로그아웃. 비밀값 `APP_SECRET`·`GOOGLE_CLIENT_ID`·`GOOGLE_CLIENT_SECRET`은 사람이 넣는다.
- **[worker/2_collect_ics.js](../worker/2_collect_ics.js)** + [worker/lib/ics.js](../worker/lib/ics.js): 주소 세 칸(eTL·구글·애플) 저장(잠가서)·목록·지금 받기, eTL 과제 → `tasks`, 나머지 → `events`. ical.js로 반복 일정 펼치기(빠진 날·옮긴 날 반영, 오래된 매일·매주 반복은 건너뛰기), 지난 30일~앞 6개월, `+09:00` 시각·종일은 날짜만, 바뀐 줄만 쓰기, 15분 Cron(오래된 주소부터).
- DB: schema.sql 초안(팀원)에 맞췄고, 필요한 `feeds` 표·`source` 이름·종일 일정 끝 규칙은 [소통판](../docs/tachyon/소통.md)에 답으로 요청했다.
- 확인: `npm test` 76개 통과(서버 41 · AI 35). 배포용 빌드(`wrangler deploy --dry-run`)와, 로컬 workerd + D1에서 저장 → 다시 받기(바뀐 줄 0) → Cron까지 실제로 돌려 봤다. 큰 지어낸 구글 캘린더로 CPU를 재 보니 무료 한도(10ms)에 걸릴 수 있어 소통판에 적었다.

## 관련 결과

- [worker/index.js](../worker/index.js) · [worker/1_login.js](../worker/1_login.js) · [worker/2_collect_ics.js](../worker/2_collect_ics.js) · [worker/lib/](../worker/lib/)
- 시험: [worker/test/](../worker/test/) (`1_login`·`2_collect_ics`·`index`·`auth`·`ics`, [helpers/server.js](../worker/test/helpers/server.js))
- [wrangler.toml](../wrangler.toml) · [package.json](../package.json) · [server.yml](../.github/workflows/server.yml) · [소통판](../docs/tachyon/소통.md)
