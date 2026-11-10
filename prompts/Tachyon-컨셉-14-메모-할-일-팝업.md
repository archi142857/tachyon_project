# Tachyon · 컨셉 14 · 메모를 더 알아서 다듬기: 할 일만 써도 '할 일로 넣을까요?'

- 날짜: 2026-11-10
- 도구: Claude (claude.ai 프로젝트 세션, Claude Opus 5.5), Google Drive 연결(세션 쪽지), GitHub REST API(`gh api`, 배포·CI 확인), 작업 공간의 헤드리스 크롬(예시 자료 화면 캡처로 확인)
- 기록 유형: 사용자 직접 지시
- 목적: 메모 팝업이 일정만 잡고 할 일 메모는 그냥 지나가던 것을 고친다. 할 일도 바로 팝업으로 넣고, AI가 메모를 일정·할 일·그냥 메모로 가린다.

## 프롬프트 원문

(16:32) 컨셉이 eTL·지도 일을 하는 중에 보냄:

````text
메모 성능이 좀 떨어지는 느낌
좀 더 알아서 잘 다듬어 줬으면 좋겠는데.
지금은 할 일만 딱 적으면 메모가 안 생김
````

## 정한 것 (사람이 "알아서"라고 해서 컨셉이 정함)

- '메모가 안 생김' = 메모는 저장되지만 팝업이 안 뜨고 일정·할 일 어디에도 안 들어가 밤 정리(01:30)까지 기다려야 하는 것으로 읽었다. 그래서 할 일 메모도 바로 **'할 일로 넣을까요?'** 팝업(이름·마감, 넣기·고치기·메모로만)을 띄운다.
- 날짜·시각 말이 없는 메모도 AI(Haiku)에게 묻는다. 다만 지난 일(~했다·~었음)과 한 글자 메모는 묻지 않는다(비용 0). AI가 없거나 늦으면 규칙(`looksLikeTodo`: '-기'·'할 것'·'해야 함'·제출·신청·전화… 끝말, 마감 말)으로 가린다.
- 이름은 쓴 말 그대로(날짜·시각 말과 '~까지'만 뗌). 11-09 회의 규칙(바꿔 쓰지 않음·쪼개지 않음·모르면 '?')은 그대로다.
- AI 세션이 같은 시각에 팝업 AI 답 칸을 6개 → 4개로 줄였다(빠르게). 그걸 지키려고 칸을 더하지 않고 `is_schedule`(참·거짓)을 `kind`(schedule·task·note)로 바꿨다. 마감 날짜도 AI에게 묻지 않고 정규식이 센다(오전·오후만 AI, 일정과 같은 규칙).
- 할 일 팝업에서 '메모로만'을 누르면 밤 정리도 그 메모를 할 일로 만들지 않는다(사람이 아니라고 했으니). 일정 팝업 '취소'는 전처럼 밤 정리가 다시 읽는다.

## 결과 요약

- **서버(3f7cef7, 배포됨):** `worker/3_memo_popup.js` — `worthAsking`, `mergePopup`의 kind 가르기, `looksLikeTodo`, `aiKind`(예전 답 `is_schedule`도 받음), `taskPopup`, 일정·할 일이 같이 쓰는 `clockOf`. 할 일 저장은 `tasks`(source `memo`, ext_id `memo:<id>` — 밤 정리가 만드는 줄과 같아 두 번 안 생김), 마감 날짜만 있으면 그날 23:59. `POST /api/memo/:id/cancel { kind: 'task' }`면 `handled = 1`. 팀원의 '일정 옮기기'(`change_id` → `moved_to`)와 내 일정 채우기(`lib/known.js`)는 그대로.
- **앱 프롬프트:** `worker/prompts/memo_popup.js` — kind 설명과 지어낸 예시(할 일 3개·그냥 메모 2개), 답 칸 `kind·title·time·place` 4개. `worker/check/haiku_latency.js`는 '일정' 대신 '종류'를 재고 할 일은 이름·마감도 잰다.
- **화면:** `MemoPopup.jsx`에 할 일 판(`TaskPopup`), 넣으면 할 일 목록을 다시 읽고 '‘…’ 할 일에 넣었어요'. 예시 모드도 같은 규칙(`examplePopup`). 예시 화면에서 '금요일까지 실험 보고서 내기' → '할 일로 넣을까요? 이름 실험 보고서 내기, 마감 11월 13일 (금)까지' → 넣기까지 확인.
- **합치기:** 올리는 사이 AI 세션(답 칸 4개)·팀원(일정 옮기기)이 같은 파일 5개를 고쳐서 부딪혔다. 둘 다 살려 합쳤다(남의 바뀐 곳은 되돌리지 않음).
- 시험: worker 137개·web 74개 모두 통과, CI 'test' 초록, Workers Builds 성공.

## 바뀐 파일

- 서버: [worker/3_memo_popup.js](../worker/3_memo_popup.js), [worker/prompts/memo_popup.js](../worker/prompts/memo_popup.js), [worker/prompts/README.md](../worker/prompts/README.md), [worker/check/haiku_latency.js](../worker/check/haiku_latency.js), [worker/test/3_memo_popup.test.js](../worker/test/3_memo_popup.test.js), [worker/test/fixtures/memo_cases.js](../worker/test/fixtures/memo_cases.js)
- 화면: [web/src/components/MemoPopup.jsx](../web/src/components/MemoPopup.jsx), `web/src/screens/Dashboard.jsx`, `web/src/api.js`, `web/src/example.js`, `web/src/logic.test.js`, [web/API.md](../web/API.md)
- 문서: [docs/tachyon/소통.md](../docs/tachyon/소통.md), [docs/작업_기록.md](../docs/작업_기록.md), [prompts/README.md](README.md)

## 남은 일

- 실제 폰에서 할 일 한 줄('조교님께 메일 보내기')을 써 보고 팝업이 뜨는지, 이름이 그대로인지 본다(사람).
- 날짜 없는 메모도 AI를 부르니 Haiku 호출이 는다. log `llm`(use `memo_popup`) 줄 수와 `popup_save`·`popup_edit`·`popup_cancel`의 kind로 할 일 팝업이 맞는 비율을 본다(AI 세션과 같이).
