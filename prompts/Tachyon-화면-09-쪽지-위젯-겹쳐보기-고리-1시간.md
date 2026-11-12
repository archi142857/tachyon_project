# Tachyon-화면-09 · 쪽지 0005(사람 요청 다섯) — 1시간 · 같이 눈에 띄게 · 겹쳐 보기 · 하루 고리 구분 · 오늘 위젯

- 날짜: 2026-11-13
- 도구: Claude (claude.ai, Claude Opus 5.5) — archi142857 쪽 '화면'(Frontend) 세션. 코드는 Vite + React, 확인은 Vitest·헤드리스 Chrome(Playwright)·axe-core. 쪽지는 Google Drive 연결로 읽고 옮김
- 기록 유형: 사용자 직접 지시(쪽지 처리)
- 목적: 컨셉 쪽지 `261113-0005`(사람 11-13 00:01~00:04 요청 다섯)와 서버 쪽지 `261113-0022`를 화면 몫으로 처리하고, 오늘 저녁 실사용 전/후를 나눈다.

## 프롬프트 원문

````text
쪽지 확인해
````

(쪽지 속 사람 원문은 컨셉 기록 Tachyon-컨셉-20에 있다: 끝 없으면 1시간 · 그룹 만들기가 눈에 안 들어옴 · 다 같이 되는 시간을 내 시간표에 다른 색으로 · 오늘 쪽 네 칸을 위젯처럼 끌어 옮기기와 기본 레이아웃 · 일정 끌어 옮기기 · 링에서 이어진 일정 분간)

## 결과 요약

- **⑤ 끝 없으면 1시간** [601ce27](https://github.com/archi142857/tachyon_project/commit/601ce27): `EventForm` · `popupToEvent` · 메모 팝업 · 주 달력 '끝 ?' — 서버 · AI와 같은 규칙.
- **③-가 그룹 만들기를 눈에 띄게** [2fa3a73](https://github.com/archi142857/tachyon_project/commit/2fa3a73): '같이' 맨 위 큰 '+ 그룹 만들기', 그룹이 없을 때 안내, 달력 머리 '같이 보기'(그룹이 없으면 만들기 칸이 열린 채로).
- **④ 하루 고리** [d3648f3](https://github.com/archi142857/tachyon_project/commit/d3648f3) → [659a8d8](https://github.com/archi142857/tachyon_project/commit/659a8d8): 디자인 ④ 금(30분보다 짧으면 뒤 일정 시작에 바탕색 금) + 같은 모양끼리 둘째 속 뒤집기(○ ■ △, 입자 테마는 속 빈 입자). `ringRuns()` 시험 7.
- **③-나 겹쳐 보기** [34d875b](https://github.com/archi142857/tachyon_project/commit/34d875b): 값 `--together` · `--together-bg`(테마 일곱), 디자인 넷째 묶음을 `request1113.css`로, 서버 `GET …/groups/:id/free`를 주 달력 띠로, 범례 겸 켜고 끄기 칩, 그룹 줄 '달력에 겹쳐 보기', 띠 → '〈그룹〉 모임' 팝업(메모 → 저장, 서버가 읽은 것은 `suggested`로만). 예시 모드 흉내 + 시험 3.
- **① 오늘 쪽 위젯** [08f6911](https://github.com/archi142857/tachyon_project/commit/08f6911): 디자인 넷째 묶음 ② — '배치 바꾸기' → 손잡이로 끌어 놓기 · 눌러 집고 '여기에 놓기'(끌기 없이) · ←→, 배치 넷(세 칸 = 지금 화면 · 네 칸 · 고리 크게 · 2 × 2) · 처음대로, 이 기기에 저장, 폰은 탭 그대로.
- **② 일정 끌어 옮기기**: 실사용 뒤로 미룸(모든 일정 누르기에 걸리고 캘린더 사본 · 되돌리기를 로그인 계정으로 확인해야 함. 디자인도 같은 생각).
- **확인**: web 시험 148, 빌드, 예시 모드 390 · 1024 · 1366 · 1920과 테마(바우하우스 · 차분한 종이 · 입자 밤 · 입자 낮 · 호박색 터미널)에서 흐름마다 문서 스크롤 0 · axe 위반 0. 그림은 모두 예시 자료.

## 관련 결과

- [web/src/components/DayRing.jsx](../web/src/components/DayRing.jsx) · [WeekCalendar.jsx](../web/src/components/WeekCalendar.jsx) · [TogetherPage.jsx](../web/src/components/TogetherPage.jsx) · [WidgetGrid.jsx](../web/src/components/WidgetGrid.jsx) · [web/src/todayLayout.js](../web/src/todayLayout.js) · [web/src/request1113.css](../web/src/request1113.css) · [web/src/screens/Dashboard.jsx](../web/src/screens/Dashboard.jsx)
- 소통판 [11-13 00:52 글](../docs/tachyon/소통.md)(실사용 전/후 판단)
