# Tachyon-화면-05 · 공유 폴더 확인 → 로고 A18-1 · 앱 아이콘 I1 붙이기

- 날짜: 2026-11-12
- 도구: Claude (claude.ai, Claude Opus 5.5) — archi142857 쪽 '화면'(Frontend) 세션. 받은편지함은 Google Drive 커넥터, 코드는 Vite + React, 확인은 Vitest·헤드리스 Chrome(Playwright)·axe-core, `wrangler deploy --dry-run`
- 기록 유형: 사용자 직접 지시(소통판의 디자인 세션 요청 — 사람 11-12 00:15 "반영해 줘" — 을 처리)
- 목적: 받은편지함 '화면'과 소통판 새 글을 확인하고, 디자인 세션이 넘긴 로고·앱 아이콘을 앱에 붙인다.

## 프롬프트 원문

````text
공유 폴더
````

## 결과 요약

- **받은편지함 '화면'**: 새 쪽지 없음. 소통판 새 글 — 컨셉 23:50(③ 판 배포 확인, 사람에게는 세션을 사이드바 이름으로: 화면 = Frontend), 디자인 00:20(요청: 로고 A18-1 · 앱 아이콘 I1 바꿔 넣기, 사람 00:15 "반영해 줘"), 디자인 00:24(로고 점 색 고침, 사람 00:21 "라이트 모드에서 빨간 점이 좀 까매 보임").
- **아이콘**: 디자인 [로고/](../docs/tachyon/디자인/로고/README.md)의 여섯 개(`icon.svg`·`icon-maskable.svg`·`icon-192.png`·`icon-512.png`·`icon-maskable-512.png`·`apple-touch-icon.png`)를 `web/public/icons/`에 같은 이름으로 덮어씀(어두운 타일 + 띠 + 빨간 점). 아이콘을 저장본에서 먼저 꺼내는 서비스 워커라 `sw.js` CACHE를 v2로.
- **로고**: [web/src/components/Logo.jsx](../web/src/components/Logo.jsx) = 디자인 초안(00:24 판) + `light-dark()`를 못 읽는 브라우저용 `fill` 속성(없으면 점이 검게 나옴). 위 막대(첫 설정 · 폰) 24, 넓은 화면 왼쪽 메뉴 26, 로그인 40. 띠가 담긴 칸의 왼쪽 벽에 닿게 하는 CSS 다섯 줄은 `shell.css` 끝.
- **확인**: web 시험 124, 빌드, `wrangler deploy --dry-run`. 로고 왼쪽 끝과 칸의 벽 사이 0px — 폰 위 막대 · 첫 설정 위 막대 · 넓은 화면 왼쪽 메뉴 · 로그인 칸. 점 색은 밝은 테마 #ec4227, 어두운 테마('입자 밤') #ff5545. `?example` 네 크기 쪽 24곳 문서 스크롤 0·화면 오류 없음, axe 위반 0(오늘·주간·월·할 일·같이·모임·로그인·첫 설정, 390·1366).

## 이어서: 파비콘과 하루 고리 오류(같은 날 00:39)

````text
파비콘도 반영이 안됐고, 오류도 있는 것 같은디
````

(사람이 붙인 배포 주소 화면 그림은 실제 일정·메모가 보여서 기록에 넣지 않았다.)

- **하루 고리의 긴 막대**: 메모로 넣은 일정(□)이 고리 위에서 아래로 긴 막대로 그려졌다. 메모 카드 class `.memo { height: 100% }`가 하루 고리의 `<rect class="ev memo">`에도 걸려(SVG에서는 CSS height가 사각형 높이) 높이가 그림 전체(272)가 됐다. 타임라인·주간 달력의 메모 일정 칸도 같은 규칙으로 `display: flex`·여백이 붙어 글이 밀렸다. 월 칸(`.mline.memo`)에서 한 번 막았던 같은 겹침이라, 이번에는 카드 이름을 `memo-card`로 바꿔 뿌리를 없앴다. 확인: 시계를 토요일 8시로 맞춰 예시 메모 일정('알바')이 오늘이 되게 하고 — 배포본(고치기 전)은 사각형 높이 272·칸 flex, 고친 판은 42개 모두 5.5·칸 block.
- **파비콘**: 서버의 `icon.svg`는 새것인데, 브라우저가 파비콘·홈 화면 아이콘을 주소별로 따로 쥐고 있어 같은 이름이면 옛 그림을 계속 보인다. `index.html`(파비콘·애플 아이콘)·`manifest`·`sw.js`의 아이콘 주소에 `?v=2`를 붙였다.
- **확인**: web 시험 124, 빌드, 네 크기 쪽 24곳 문서 스크롤 0·오류 없음, axe 위반 0(로그인·첫 설정 포함), 메모 카드(넓은 화면 오늘 쪽 메모 칸·폰 메모 쪽) 그대로.

## 관련 결과

- [web/src/components/Logo.jsx](../web/src/components/Logo.jsx) · [web/public/icons/](../web/public/icons/) · [web/public/sw.js](../web/public/sw.js) · [web/src/shell.css](../web/src/shell.css)
