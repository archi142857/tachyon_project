# Tachyon-화면-04 · 공유 폴더 확인 → ③ 바우하우스를 앱 기본 옷으로

- 날짜: 2026-11-11
- 도구: Claude (claude.ai, Claude Opus 5.5) — archi142857 쪽 '화면' 세션. 받은편지함은 Google Drive 커넥터, 코드는 Vite + React, 글꼴 npm `pretendard`·`@fontsource-variable/jost`, 확인은 Vitest·헤드리스 Chrome(Playwright, 시계를 아침으로 맞춰 하루 고리 확인)·axe-core, `wrangler deploy --dry-run`, 묶음 그림은 Python(Pillow)
- 기록 유형: 사용자 직접 지시
- 목적: 받은편지함 '화면'과 소통판 새 글을 확인하고, 디자인 세션이 넘긴 ③ 바우하우스 기본 옷을 앱에 옮긴다.

## 프롬프트 원문

````text
공유 폴더
````

화면 세션이 되물음(받은편지함은 비어 있고, 컨셉이 소통판 23:23에 '사람이 옮기라고 하면 디자인 23:17 글 순서대로'라고 적어 둠): "앱 기본 디자인을 지금 ③ 바우하우스로 바꿀까요?" — 사람이 고른 답:

````text
지금 옮기기 (Recommended)
````

## 결과 요약

- **받은편지함 '화면'**: 새 쪽지 없음. 소통판 새 글 — 디자인 23:17(③ 값·모양 층·넘길 표), 23:29(모든 테마 '지금' 빨강, 사람 23:25), 23:35(하루 고리 바깥 테 B, 사람 23:34), 서버 23:27(모임 후보는 지금 뒤 시각만, 03a2348 — 화면의 다시 고르기는 그대로 둬도 같음), 컨셉 23:18·23:23.
- **1 기본 옷 값**: `styles.css` 맨 위 = tokens.css A(바우하우스). 차분한 종이는 `themes.css` 맨 앞 테마(값 그대로 + 새 이름 셋·지도 값). 다른 다섯 테마에 `--mark-class`·`--mark-task`·`--ev-mine-line`, 모든 테마의 `--now`를 빨강 계열로. `themes.js` DEFAULT '바우하우스'·BUILT_IN 일곱·KEYS, `themes.test.js`에 `--mark-class / --card` 3:1, `--now / --card`는 3 → 4.5(지금 시각 글자에도 쓰여서).
- **쓰던 기기 옮기기**: 앱을 열 때는 테마 이름을 적지 않고(테마 창에서 고를 때만 적음), `tachyon_theme_v`가 없는 기기에 '차분한 종이'가 적혀 있으면 한 번 지운다 → 새 기본. 다른 테마를 고른 기기는 그대로.
- **글꼴·주소창**: Pretendard(dynamic subset)·Jost를 앱 안에 싣는다(둘 다 OFL 1.1). theme-color·manifest 색 #ffffff.
- **2 모양 층**: [web/src/shape.css](../web/src/shape.css) = 디자인 components.css 셋째 묶음 그대로(shell.css 다음). 하루 고리 입자 ● 수업 · □ 내 일정 · ▲ 할 일을 넣어 본 자리, 지금 선 밑 바탕색 테, 바깥 테 r=114(B), 범례 넷. '같이' 범례 '노란 점' → '흰 점', 고른 그룹에 `aria-current`.
- **3 11-10에 넘긴 부품(글꼴·색 말만)**: 초점 `--focus`, 카드 제목·앱 이름·시트 제목·즉시 확인 창 제목 `--font-head`(Jost), 아이콘 버튼 `--heading`, 입력 칸·메모 칸 `--inset`, 오류는 기본 글자 + 빨간 '!' 동그라미, 켠 표시 `--accent-text`, 보내기 단추 48 + 메모 칸 초점 테두리, 즉시 확인 창 `--postit` + `--shadow`, 시트 `--raised`·`--r-sheet`, 고르기 칸 48·고른 칸 테두리(하드코딩 그림자 없앰), 스낵바 단추 48, `.tag.ok` 잉크 테두리, `.btn-line` 테두리 `--accent-text`. JSX가 드는 것(끝낸 줄 도장, 체크 칸 누르는 영역 48, 즉시 확인 창 원문 줄, 메모 간 곳 줄, 움직임)은 남겼다.
- **화면 판단**: 폰 위 탭 40px·쪽 안 고르기 34px는 꽉 찬 틀과 맞바꾼 것이라 그대로(디자인 23:17 '참고'). 주간 머리의 오늘 표시(채운 동그라미)는 월 보기와 같게 그대로.
- **확인**: web 시험 124개(테마 일곱 × 빠진 값·대비 포함), 빌드, `wrangler deploy --dry-run`. `?example` 390×844·820×1180·1366×768·1920×1080 쪽 24곳 문서 스크롤 0·화면 오류 없음, axe 위반 0(오늘·주간·월·할 일·같이·모임, 390·1366). 시계를 11/12 09:40으로 맞춰 하루 고리 ● 40 · □ 6 · ▲ 65, 지금 선 테, 바깥 테 확인. 쓰던 기기: '차분한 종이'가 적힌 기기 → 바우하우스(다시 열어도), '입자 밤' 기기 → 그대로, 새 기기 → 아무것도 안 적음, 테마 창에서 차분한 종이를 고르면 다시 열어도 남음. '같이' 예시 흐름(끌어 칠하기·되돌리기·칸 누르기) 그대로.
- **그림(지어낸 예시 자료)**: [폰 오늘·달력 월, 넓은 화면 오늘](images/Tachyon-화면-04-바우하우스-예시.png)

## 관련 결과

- [web/src/styles.css](../web/src/styles.css) · [web/src/themes.css](../web/src/themes.css) · [web/src/themes.js](../web/src/themes.js) · [web/src/shape.css](../web/src/shape.css) · [web/src/components/DayRing.jsx](../web/src/components/DayRing.jsx) · [docs/tachyon/계획.md](../docs/tachyon/계획.md)
