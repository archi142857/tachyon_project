# web — Tachyon 화면 (PWA)

폰·PC·패드가 같은 주소로 여는 웹앱이다. 폰에서는 '홈 화면에 추가'로 앱처럼 연다. Vite + React. 나중에 같은 코드를 Capacitor로 감싸 앱으로도 내므로 브라우저에만 있는 기능에 기대지 않는다(서비스 워커·'홈 화면에 추가'는 앱 안에서 저절로 꺼진다).

## 흐름

1. **로그인**: '학교 구글 계정으로 로그인' → `/api/login`(이름·이메일만). 서울대 구글 계정(@snu.ac.kr)으로 하라고 안내만 하고 막지는 않는다. 실패하면 돌아와 까닭을 한 줄로 보인다. 서버 없이 보려면 '예시로 둘러보기'.
2. **첫 설정**: 처음엔 두 장(11-11) — ① 학과·학번(학과는 칸 밑 목록에서 쓰는 대로 좁혀 고르기·목록에 없으면 쓴 그대로, 학번은 목록. 둘 다 넣거나 둘 다 비움) ② 캘린더. 메뉴에서 다시 열면 한 장. 캘린더(ICS) 주소 칸 3개(eTL·구글·애플, 찾는 법 한 줄씩과 '자세히'). 주소는 칸마다 모양을 먼저 확인하고, 저장하면 서버가 바로 한 번 받아 본 결과('과제 3개를 찾았어요')를 보인다. 모두 건너뛸 수 있고(이 기기에 기억), 메뉴의 '캘린더 주소·학과'에서 다시 연다.
3. **대시보드**(시안 A, 손그림 2): 왼쪽 위 할 일 3개, 왼쪽 아래 메모(나와의 채팅), 오른쪽 주간 달력, 맨 아래 긴 메모 칸. 폰은 위에 할 일|메모, 아래 달력.
   - 일정처럼 보이는 메모를 보내면 메모 옆에 **'이대로 저장할까요?'** 팝업(저장 / 고치기 / 취소). 모르는 칸은 '?'. 할 일만 쓴 메모는 **'할 일로 넣을까요?'**(이름·마감, 넣기 / 고치기 / 메모로만 — 11-10 컨셉).
   - 할 일 3개는 서버가 준 여유 순서와 경고 한 줄. 체크 → 끝(5초 동안 되돌리기). 할 일·일정은 눌러서 고친다.
   - 주간 달력: 좌우 화살표·밀기로 3주(아래 점), 과제 마감은 맨 위 줄, 중요한 일정은 굵은 테두리, 지금 시각 줄.
   - 위 막대의 '의견'(버그/불편/추가 → GitHub 이슈), 햄버거 메뉴(할 일 전체, 캘린더 주소·학과, 홈 화면에 추가, 의견, 로그아웃).
   - 화면 오류는 저절로 보고된다(같은 오류는 한 번만).

## 실행

```bash
# 서버와 같이 (저장소 맨 위에서): wrangler가 web/을 빌드해서 함께 내보낸다
npm install && npm run db:local && npm run dev      # http://localhost:8787

# 화면만 고칠 때
cd web && npm install
npm run dev        # http://localhost:5173/?example  ← 서버 없이 예시 자료로 (/api는 8787로 넘긴다)
npm test           # 시각·할 일 표시·달력 칸·주소 확인·서버 모양 다루기·예시 팝업
npm run build      # dist/
```

서버와 주고받는 모양은 [API.md](API.md). 배포는 `wrangler.toml`의 `[build]`·`[assets]`가 맡는다(`web/dist`, `/api/*`는 Worker 먼저).

## 파일

| 파일 | 하는 일 |
| --- | --- |
| `src/main.jsx` | 시작, 화면 오류 자동 보고, 서비스 워커 등록 |
| `src/App.jsx` | 화면 흐름(로그인 → 첫 설정 → 대시보드) |
| `src/api.js` | 서버 주소 전부. 예시 모드면 `example.js` 자료를 쓴다 |
| `src/example.js` | 지어낸 예시 자료와 예시 모드용 팝업 흉내(진짜 판단은 서버의 정규식 + Claude) |
| `src/time.js` | 한국 시간 계산·글, 서버 시각 글자(`+09:00`) |
| `src/tasks.js` | 할 일 표시(걸리는 시간·여유·준비) |
| `src/layout.js` | 달력에서 겹치는 일정 나란히 놓기, 시간 축 |
| `src/setup.js` | 캘린더 주소 찾는 법·확인 규칙([캘린더 주소 찾기](../docs/tachyon/캘린더_주소_찾기.md)) |
| `src/campus.js` | 수업 사이 동선: 장소 글 → 캠퍼스 건물, 이어지는 일정 사이 걷는 시간·쉬는 시간·'N분 지각'(TT Wizard evaluate와 같은 셈·말투). 표는 `src/campus/campus.json`(TT Wizard `data/walk.csv`·`buildings.csv`, ODbL — 화면에 출처). 자료가 바뀌면 `node web/scripts/campus.mjs` |
| `src/routeMap.js` | 하루 동선 지도(TT Wizard 요일 동선 지도를 작게): 그날 캠퍼스 건물 번호 핀, 걷는 길(`src/campus/route_paths.json`, ODbL), 건물 점. 바탕 지도는 없음(`src/campus/README.md`). 화면은 `components/DayRouteMap.jsx` |
| `src/naverMap.js` | 네이버 지도(키 없음): 장소 열기, 두 건물 사이 도보 길찾기. 안드로이드는 앱 없으면 웹, 아이폰은 앱 먼저 열어 보고 웹 |
| `src/screens/` | Login, Setup, Dashboard |
| `src/components/` | 위 막대, 할 일, 메모, 팝업, 주간 달력, 메모 칸, 시트들 |
| `src/styles.css` | 색(맨 위 `:root` 한 곳)과 모양 |
| `src/themes.css` | 테마마다 값 묶음(메뉴 → 테마) |
| `src/components/TogetherPage.jsx` · `MeetGrid.jsx` · `JoinSheet.jsx` · `src/meet.js` · `src/togetherExample.js` | '같이' 쪽: 친구·그룹·모임 시간표(when2meet 모양), 초대 링크 받기, 후보 고르기, 예시 자료 |
| `src/shell.css` | 앱 틀: 100dvh 꽉 찬 화면, 문서는 안 굴리고 칸 안에서만, 넓은 화면(900px~) 왼쪽 메뉴 · 폰 위 탭, 오늘 쪽 칸 배치, 주·월 달력, 밀도 고리, 할 일 쪽. 색은 모두 `var(--…)`라 테마를 따른다 |
| `src/shape.css` | ③ 바우하우스 모양 층(디자인 `components.css` 셋째 묶음 그대로): 하루 고리 ● □ ▲·바깥 테, 달력 칸 앞 모양, 월 보기 모양, 밀도 고리 색, '같이' 쪽 흰 점·후보 칩. shell.css 다음에 부른다 |
| `src/particles.css` · `src/themeName.js` | 입자 테마('입자 밤'·'입자 낮')에서만 하루 고리를 팀원 시연(9판) 입자 모양으로 — 모두 동그라미, 구간마다 뜻 색, 고르면 커지고 빛남, 돋아나는 움직임, 지금 = 바깥 테를 도는 빨간 입자와 꼬리(사람 11-12 07:11). 다른 테마는 ③ ● □ ▲. `themeName.js`의 `useParticles()`가 지금 테마를 읽는다. particles.css는 shape.css 다음에 부른다 |
| `public/` | `manifest.webmanifest`, `sw.js`, `_headers`, `icons/` |

## 정한 것

- 색은 `styles.css`의 `:root` 한 곳(기본 테마 '③ 바우하우스', 11-11부터), 다른 테마(11-11까지의 기본 '② 차분한 종이' 포함)는 `themes.css`. 새 색 값 이름을 만들면 `themes.css` 각 블록에도 넣는다(`themes.test.js`가 잰다). 앱을 열 때는 테마 이름을 적지 않고 테마 창에서 고를 때만 적는다 — 다음에 기본이 바뀌어도 고르지 않은 기기는 새 기본을 따른다.
- 글꼴은 앱 안에 싣는다(바깥 글꼴 주소를 부르지 않음): 본문 Pretendard(`pretendard`, 화면에 나온 글자 조각만 받는 dynamic subset), 바우하우스 제목·날짜·숫자 Jost(`@fontsource-variable/jost`). 둘 다 SIL OFL 1.1 — [디자인 가이드 '글꼴'](../docs/tachyon/디자인/디자인_가이드.md).
- 로고(A18-1)와 앱 아이콘(I1)의 원본은 디자인 세션의 [docs/tachyon/디자인/로고/](../docs/tachyon/디자인/로고/README.md)(11-12 사람이 고름). 앱 안 로고는 `src/components/Logo.jsx`(띠가 담긴 칸의 왼쪽 벽에 닿게, CSS는 `shell.css` 끝). 아이콘을 바꾸면 여섯 개를 `public/icons/`에 같은 이름으로 덮어쓰고 `public/sw.js`의 CACHE 숫자를 올린다(아이콘을 저장본에서 먼저 꺼내서).
- 서비스 워커는 화면 파일만 저장하고 `/api`(개인 자료)는 저장하지 않는다.
- 예시 자료는 모두 지어낸 것이고 화면 위에 '예시 자료'가 뜬다. 캘린더 주소는 화면 기록·오류 보고에 넣지 않는다.
- 앱(Capacitor)으로 감쌀 때는 `VITE_API_BASE`에 서버 주소를 넣고 빌드한다.
