# Tachyon-화면-01 · 화면 세션 시작: 대시보드 시안 3개 → A, 색 참고(Dropbox), PWA 틀·첫 설정·예시 자료 대시보드

- 날짜: 2026-11-09
- 도구: Claude (claude.ai, Claude Opus 5.5) — archi142857 쪽 '화면' 세션. 시안은 claude.ai 디자인 캔버스(비공개), 색 참고 사이트는 Claude in Chrome으로 열어 봄. 코드는 Vite + React, 확인은 Vitest와 헤드리스 Chrome(Playwright), `wrangler deploy --dry-run`·`wrangler dev`
- 기록 유형: 사용자 직접 지시
- 목적: 화면 세션이 맡은 일(대시보드 시안 → 고른 시안으로 PWA 틀과 예시 자료 화면, 첫 설정)을 시작한다.

## 프롬프트 원문

````text
너는 Tachyon 프로젝트의 '화면' 세션이야. 1. 프로젝트 문서 Tachyon_작업_방식.md를 먼저 읽고 그 규칙대로 해. 2. 레포 archi142857/tachyon_project를 push 권한으로 붙이고 CLAUDE.md → docs/ngs/인수인계.md → docs/ngs/계획.md, 손그림 docs/ngs/스케치_구조.png·스케치_화면.png를 봐. 3. 네 경로: web/. API 모양은 작업 방식 문서 4절을 따르고, 필요한 API는 서버·AI에 쪽지로 부탁해. 4. 할 일: - 대시보드 시안 3개(PC·폰, 할 일 3개·주간 달력·메모, 메모 즉시 팝업)를 그림으로 짧게 먼저 보여 줘. 내가 고른 것만 만든다. - 고른 시안으로 PWA 틀(manifest·아이콘, 홈 화면에 추가) + 가짜 데이터 화면. 가짜 데이터엔 '예시'라고 적어. 회의 때 만들던 로그인 화면 틀이 있으면 잇고, 없으면 Vite + React. - 첫 설정(학과·학년 + ICS 주소 칸 3개, 건너뛰기). 5. 시작할 때 공유폴더 받은편지함 '화면'을 한 번 확인해.
````

````text
좋아. 작업 시작하셈. 멈추라 할 때까지 멈추지 마.
````

````text
A로 ㄱㄱ
색은 좀 바꾸자. 프로그램명은 Tachyon으로
````

````text
Continue from where you left off.
````

````text
이제부터 링크 주면 스타일 참고해봐
https://brand.dropbox.com/
````

## 결과 요약

- **시안**: 손그림 2장대로 PC·폰 대시보드 시안 3개를 캔버스에 그렸다(A 손그림 그대로 · B 달력 크게 · C 메모 크게, 팝업 모양도 셋 다 다름). 사용자가 **A**를 골랐다. 이름은 Tachyon.
- **색**: 첫 색 3안(청록·밤하늘·주황) 뒤에 사용자가 Dropbox 브랜드 페이지를 참고로 줬다. 페이지를 열어 핵심 색(코코넛 #F7F5F2 · 그래파이트 #1E1919 · 파랑 #0061FE)과 짝 색, 각진 모양을 보고 A 폰에 3안(코코넛·그래파이트·짝 색)을 다시 칠했다. 로고·전용 글꼴은 쓰지 않는다. 고르기 전까지 코드는 '코코넛'으로 칠했다(`web/src/styles.css`의 `:root` 한 곳).
- **로그인 화면 틀**: 레포·공유 드라이브에서 회의 때 만들던 화면 틀을 찾지 못해 Vite + React로 시작했다.
- **web/**: PWA(manifest·아이콘·서비스 워커, 아이폰 안내 포함), 로그인 화면, 첫 설정(학과·학년 + eTL·구글·애플 주소 칸, 찾는 법 한 줄씩과 '자세히', 칸마다 모양 확인, 건너뛰기), 대시보드 A(할 일 3개 · 메모 · 주간 달력 · 아래 긴 메모 칸 · 메모 즉시 팝업 저장/고치기/취소 · 눌러서 고치기 · 햄버거 메뉴 · 의견 버튼 · 화면 오류 자동 보고). 서버 없이 '예시로 둘러보기'(지어낸 '예시' 자료).
- **서버·AI와 맞춤**: 이미 올라온 `/api/login*`(서버), `/api/memo*`·`/api/briefing/rank`(AI)의 실제 모양에 맞췄다. 아직 없는 `/api/events`·`/api/tasks`(7_items)·`/api/feedback`(6_feedback)은 바라는 모양을 [web/API.md](../web/API.md)에 적고 쪽지로 부탁했다.
- **팀 공유 파일**: `wrangler.toml`에 `[build]`(dev·deploy 때 web 빌드)와 `[assets] directory = "web/dist"`, 한 페이지 앱 처리, `/api/*`는 Worker 먼저를 넣었다. `web/index.html`은 빈 화면 대신 앱 입구가 됐다. 소통판에 알림.
- **확인**: Vitest 27개 통과. 헤드리스 Chrome으로 폰(390×844)·PC(1280×800)에서 예시 흐름(첫 설정 오류 → 건너뛰기 → 대시보드 → 메모 '내일 3시 301동 스터디' → 팝업 → 저장 → 달력에 들어감 → 메뉴·할 일 전체·의견)을 돌려 콘솔 오류 없음, 서비스 워커 등록 확인. `wrangler deploy --dry-run` 성공, `wrangler dev`에서 화면·한 페이지 앱·`/api/health`·`/api/login/me`(401) 길 확인, 로그인 실패(`?login_error=config`) 화면 확인.
- **아직**: 실제 폰에서 '홈 화면에 추가'(배포 뒤), 7_items·6_feedback이 생기면 실제 자료로 확인, 색 고르기, 아침 브리핑 카드·시간표 사진 화면(2단계).

## 관련 결과

- [web/README.md](../web/README.md) · [web/API.md](../web/API.md) · [web/src/](../web/src/)
- 캡처(예시 자료): [PC](images/Tachyon-화면-01-PC-예시.png) · [폰](images/Tachyon-화면-01-폰-예시.png)
- [wrangler.toml](../wrangler.toml)
