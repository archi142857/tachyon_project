# Tachyon-AI-02 · 공유 폴더 쪽지 처리: etl_notice 프롬프트 표, 메모 팝업 AI 답 칸 줄임

- 날짜: 2026-11-10
- 도구: Claude Code (Claude Opus 5.5) — archi142857 쪽 'AI' 세션. 앱 안의 AI는 Claude API(Haiku 5.5)
- 기록 유형: 사용자 직접 지시
- 목적: 드라이브 받은편지함 'AI'의 쪽지를 처리하고, 그 사이 바뀐 AI 쪽 파일을 확인한다.

## 프롬프트 원문

````text
공유 폴더
````

## 결과 요약

- 받은편지함 쪽지 1개(컨셉, 새 앱 프롬프트 `etl_notice.js`) 처리: [worker/prompts/README.md](../worker/prompts/README.md) 표에 `etl_notice.js`(쓰는 곳 `9_etl.js`, 빠른 모델) 줄과 '공지는 시험·휴강·보강 낱말이 있을 때만 AI에게, 한 번만 읽고, 공지 글은 저장 안 함' 설명을 더했다. 프롬프트는 규칙 셋(쓴 말 그대로·쪼개지 않음·모르면 '?')을 지키고 예시 날짜·요일도 맞아 고치지 않았다.
- 그 사이 팀원이 고친 [3_memo_popup.js](../worker/3_memo_popup.js)(내 일정으로 빈 시각·장소 채우기, `lib/known.js`, AI 호출과 나란히 돌고 일정은 AI에게 안 보냄)를 읽고 확인했다.
- **메모 팝업 AI 답 칸 6개 → 4개(67b6130):** 팀원이 단 배포본 log 두 줄(ms 1,272·996, 출력 160·154토큰, 답 조각은 `tool_use`뿐)을 보니 출력이 거의 다 answer 도구 답이고 칸마다 토큰이 든다. 그래서 [memo_popup.js](../worker/prompts/memo_popup.js)의 답을 `is_schedule·title·time·place`로 줄였다. 날짜·끝 시각은 정규식이 원래 먼저 알고, AI가 오전·오후를 바꾸면(9시 → 21:00) 끝 시각을 같이 옮기고 날짜를 안 쓴 메모는 그 시각이 다음에 오는 날로 코드가 다시 센다. 팝업 응답 모양(화면이 받는 칸)은 그대로다.
- 확인: AI 쪽 테스트 모두 통과(전체 133개 중 실패 1개는 서버의 `7_items` 날짜 의존 시험), 저장소 밖 임시 설정으로 진짜 `worker/index.js`를 거쳐 workerd에서 `/api/memo` 확인. 줄어든 지연·토큰은 배포 뒤 log로 팀원에게 부탁(소통판).

## 바뀐 파일

- 고침: `worker/3_memo_popup.js`, `worker/prompts/memo_popup.js`, `worker/prompts/README.md`, `worker/check/haiku_latency.js`, `worker/test/3_memo_popup.test.js`, `docs/tachyon/소통.md`(알림)
- 새로: 이 기록
