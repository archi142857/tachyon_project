# Tachyon · 컨셉 11 · 팀원 디자인 확인, 주간 달력을 오늘부터 7일로

- 날짜: 2026-11-10
- 도구: Claude (claude.ai 프로젝트 세션, Claude Opus 5.5), Google Drive 연결, Artifact 읽기 시도, Claude in Chrome(링크 열기 시도 — 사람이 멈춤)
- 기록 유형: 사용자 직접 지시
- 목적: 팀원이 넣었다는 디자인을 찾아 확인하고, 주간 달력이 늘 오늘부터 보이게 바꾼다.

## 프롬프트 원문

````text
팀원이 디자인 넣어뒀다는데 확인해봐
````

(10:22) 사용자가 팀원의 Claude 아티팩트 링크를 붙임(다른 계정 것이라 여기 주소는 적지 않음, 끝 부분 `#c-paper`).

````text
종이 플래너 스타일을 아이디어로 가지고 갈 듯
````

````text
아 그리고 주간 일정 ㅂㅎ여주는 건 오늘이 항상 맨 처음에 오도록, 오늘부터 일주일을 보여주도록 바꿔줘
````

## 결과 요약

- 저장소(브랜치·PR 포함)·드라이브·공유된 아티팩트에서 팀원 디자인을 찾지 못해 사람에게 위치를 물었다. 받은 링크는 Artifact·Docs 도구로 읽히지 않았고(다른 계정 것), 크롬으로 열려던 것은 사람이 멈췄다. 디자인 방향은 사람 말대로 '종이 플래너 스타일을 아이디어로'(확정 아님)로 적었다.
- 주간 달력: '월요일부터 한 주' → '오늘 0시부터 7일(오늘이 늘 맨 앞)'. 좌우 이동 7일씩, 점 3장(21일), '이번 주' 버튼 → '오늘', 요일 글자는 날짜마다 계산. `web/src/time.js`에 `dayStart` 더함, `Dashboard.jsx`·`WeekCalendar.jsx` 고침, 시험 1개 더함. web 시험 30개 통과, 빌드 됨. '몰린 주' 경고·예시 자료는 그대로 월요일 기준.
- 화면 세션 담당 경로지만 사람이 컨셉에 바로 부탁해 컨셉이 고치고, 화면 세션에 쪽지·소통판으로 알렸다.

## 바뀐 파일

- [web/src/time.js](../web/src/time.js), [web/src/screens/Dashboard.jsx](../web/src/screens/Dashboard.jsx), [web/src/components/WeekCalendar.jsx](../web/src/components/WeekCalendar.jsx), [web/src/time.test.js](../web/src/time.test.js)
- [docs/tachyon/계획.md](../docs/tachyon/계획.md), [docs/tachyon/소통.md](../docs/tachyon/소통.md), [docs/작업_기록.md](../docs/작업_기록.md), [prompts/README.md](README.md)
