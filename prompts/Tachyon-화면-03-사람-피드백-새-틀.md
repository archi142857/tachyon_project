# Tachyon-화면-03 · 쪽지 확인: 사람 피드백(11-11 22:07) 화면 몫 — 꽉 찬 앱 틀·마감 글·달력·밀도 고리

- 날짜: 2026-11-11
- 도구: Claude (claude.ai, Claude Opus 5.5) — archi142857 쪽 '화면' 세션. 쪽지·패치는 Google Drive 커넥터, 코드는 Vite + React, 확인은 Vitest·헤드리스 Chrome(Playwright)·axe-core, 로컬 `wrangler dev`(로컬 D1에 지어낸 예시 자료, 로컬 확인용 임시 키), `wrangler deploy --dry-run`
- 기록 유형: 사용자 직접 지시
- 목적: 받은편지함 '화면'의 쪽지(컨셉 5개: 사람 피드백 화면 몫·패치 셋째 판·테마 합침·메모 할 일 팝업)를 처리한다.

## 프롬프트 원문

````text
쪽지 확인해
````

## 결과 요약

- **받은 일(컨셉 쪽지 `261111-2226`·`2227`·`2235`)**: 사람 피드백 가운데 화면 몫 ①~⑤ — 모든 기기에서 꽉 찬 화면·문서 전체 스크롤 없음·칸 안에서만 스크롤, 넓은 화면 왼쪽 메뉴/폰 위 탭, 폰은 덜 복잡하게, 마감 날짜·시각 늘 함께, 달력 3주 제한 없애기 + 월 보기, 날마다 밀도 고리 + 주 '고르게' 줄. ⑥ '같이'(친구·그룹·모임 시간표)는 서버 API가 나온 뒤.
- **컨셉 패치**: 셋째 판(`261111-2235_컨셉_feedback-ui-wip.patch`, main `98468f2` 위)을 `git apply --3way`로 그대로 넣어 따로 커밋했다(마감 글·밀도 셈 + 시험·DensityRing·MonthCalendar·TaskList·주간 달력·새 틀 JSX, 테마·TT Wizard 살림).
- **화면 세션이 더한 것**: 새 틀 CSS [web/src/shell.css](../web/src/shell.css)(100dvh, 넓은 화면 900px부터 왼쪽 메뉴, 1440px부터 오늘 쪽에 메모 칸까지, 폰 탭 + 하루|일정|할 일 한 칸씩, 색은 모두 테마 값). 주간 달력은 남은 높이를 시간 수로 나눠 꽉 채우고(한 시간이 30px보다 작아지면 그때 굴림), 월 칸 6주가 쪽을 채움. 폰 오늘 쪽 할 일 줄은 이름 + 마감만. 메모 팝업은 메모 칸 바로 위 가운데. 월 칸의 메모 줄이 메모 카드 클래스(`.memo`)와 이름이 겹쳐 커지던 것 고침. 월 칸·보기 막대 접근성(axe) 고침.
- **확인**: `?example`을 390×844·820×1180·1366×768·1920×1080에서 쪽 24곳 모두 문서 스크롤 없음(`scrollHeight === innerHeight`), 화면 오류 없음. 주간 4주 뒤·다음 달로 넘어감. 메모 팝업이 메모 칸과 안 겹침, 메뉴 10개 그대로, 어두운 테마('입자 밤')도 넘침 없음. axe 위반 0. 로컬 `wrangler dev`에서 `/api/events`·`/api/tasks`·`/api/memo` 200(로컬 D1에 `events.moved_to` 칸을 소통판 안내대로 더한 뒤). web 시험 120개, `wrangler deploy --dry-run` 통과.
- **계획**: '사람 피드백' 아래 앱 틀·마감 글·달력·밀도 고리 줄 `[x]`.
- **그림(지어낸 예시 자료)**: [폰 오늘·월, PC 오늘·주간](images/Tachyon-화면-03-새-틀-예시.png)

## 관련 결과

- [web/src/shell.css](../web/src/shell.css) · [web/src/screens/Dashboard.jsx](../web/src/screens/Dashboard.jsx) · [docs/tachyon/계획.md](../docs/tachyon/계획.md)
