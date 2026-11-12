# Tachyon-24 · 그림 테마 넷(태양계 · 오선지 · 원자 모형 · 뉴모피즘)을 실제 앱 테마로

- 날짜: 2026-11-13
- 도구: Claude Code (VS Code 확장, Claude Opus 5.5) — 코드 쓰기, npm `@fontsource` 글꼴 설치(OFL-1.1, 11-13 npm에서 확인), `npx vitest run`(web 178), `npx vite build`, `npx vite`로 띄워 헤드리스 크롬으로 실제 앱 `?example`을 테마마다 1440 · 390 폭으로 찍어 확인, 로딩 화면 넷도 찍어 확인
- 기록 유형: 사용자 직접 지시
- 목적: Tachyon-20 · 22의 테마 시안 넷을 앱 테마 고르기(메뉴 → 테마)에 들어 있는 테마로 넣는다. 테마 규칙(값 블록 · BUILT_IN · 대비 점검 · 테마별 로딩 화면 · 글꼴은 앱 안에)을 지킨다.

## 프롬프트 원문

11-13 02:47

````text
일단 이것들 실제 앱 테마에 넣어줘. 규칙과 형식에 맞아야 해
````

## 한 일

- 고리 · 바탕 그림을 시안 폴더에서 앱으로 옮겨 둘이 같이 쓴다: `web/design/rings/*` · `backdrop.jsx` → `web/src/components/art/`(고리 파일 넷 · `common.jsx` · `index.js` · `Backdrop.jsx`), 그림 규칙은 `art.css`, 글꼴은 `fonts.js`(@fontsource: 함렛 · 본명조 · 오르빗 · 시네잇 · DM Serif Display · 오르비트론 · 누니토 · Noto Music). 시안의 Google Fonts 링크는 뺐다. 앱 규칙과 이름이 겹치지 않게 고리 svg = `.art`, 일정 묶음 = `.item`, 원자 껍질 = `.orbit`.
- 값: `themes.css`에 블록 넷(바우하우스의 색 이름을 빠짐없이, `--font-head` = 테마 글꼴), `themes.js` `ART_THEMES` → `BUILT_IN`. 대비 점검을 넘게 시안 색을 조금 고침(뉴모피즘 글자2 · 지금 · 강조 글자 · 같이 색을 진하게).
- 모양 층 `web/src/looks.css`(nine.css처럼 그 테마 `html[data-theme]` 안에서만): 화면 뒤 그림이 보이게 틀을 비움, 칸(유리 · 각진 테 · 네온 테 · 볼록), 제목 빛, 메뉴 · 탭 · 고르기 단추, 수업 · 내 일정 · 추천 칸, 할 일 동그라미, 메모 말풍선, 적기 칸 · 보내기, 고리 범례 모양. 수업 칸 글자는 `--ev-text`로 정해 장소 줄도 같이.
- 하루 고리: `DayRing.jsx`가 테마 이름으로 그림 고리를 고름(아니면 전처럼 입자 · 모양 고리). 바탕 그림: `Dashboard.jsx` `.shell` 첫 칸에 `ThemeBackdrop`.
- 로딩 화면 넷(`themes.js` LOADER · `loader.css`): 해와 도는 행성 · 비스듬한 오선 띠와 음표 · 원자핵과 네온 궤도 · 오목한 홈을 도는 구슬, 그 테마 글꼴의 'Tachyon'.
- 테마 창(`ThemeSheet.jsx`)에 단추 넷.
- 앱 화면에서 메모 점이 시각 글자 위에 앉아 '2●4시'로 보이던 것: 메모 점이 있는 시각 글자는 뺌(시안도 같이).
- 점검: `themes.test.js`가 새 블록 넷의 빠진 값 · 대비를 잼(통과), `design/rings.test.jsx`에 '테마 이름 = 고리 이름, 바탕 그림은 이름으로' 추가. web 178 통과, 빌드 통과.
- 문서: [테마 만드는 법](../docs/tachyon/디자인/테마_만드는_법.md)(테마 표 · 값보다 더 바뀌는 테마 · 글꼴은 앱에 실음), `web/design/README.md`(옮긴 경로).
