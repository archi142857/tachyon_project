# Tachyon-31 · 시각을 쓴 메모: '까지'면 할 일, 없으면 일정

- 날짜: 2026-11-16
- 도구: Claude Code (Claude 데스크톱 앱 Code 탭, Claude Opus 5.5) — node --test(서버 시험). 실제 AI(Haiku) 답은 이 노트북에서 못 돌려(API 키는 Cloudflare 비밀값) 코드 규칙이 AI 답보다 먼저 정하게 했다
- 기록 유형: 사용자 직접 지시
- 목적: 같은 '빨래'가 AI 답에 따라 일정이 되기도 할 일이 되기도 하던 것을 규칙 하나로 정한다.

## 프롬프트 원문

11-16 08:58

````text
11시 빨래라고 하면 일정이 되고, 11시까지 빨래라고 하면 할 일이 돼. 모호함을 없애줘
````

## 한 일

- 규칙(`worker/3_memo_popup.js` `mergePopup`): 시각을 쓴 메모(지난 일 · 그냥 메모 빼고)는 AI 답보다 이 규칙이 먼저. 시각에 마감 말(까지 · 전에 · 마감 · 제출 · 내기 · 기한, 원래 있던 `DEADLINE_WORD`)이 붙으면 그 시각이 마감인 할 일, 없으면 그 시각에 하는 일정. '2시부터 4시까지'의 까지는 시각 범위라 일정.
- `taskPlan`의 '시각을 쓴 할 일은 그 시각부터 1시간' 갈래는 이제 닿지 않아 뺐다(시각을 쓰면 일정이 되므로). 시간대('월요일 오전에 …')는 그대로.
- AI 프롬프트(`worker/prompts/memo_popup.js`)에도 같은 규칙 한 줄('11시 빨래' = schedule, '11시까지 빨래' = task) — 이름 · prep을 맞추려고. 기준 글 `docs/tachyon/할일_일정_구분.md`에 한 줄.
- 시험: 서버 메모 37개 통과(새 시험: AI가 없을 때 · task라 할 때 · schedule이라 할 때 모두 '11시 빨래' = 일정, '11시까지 · 11시 전에 빨래' = 할 일, 범위의 까지 = 일정, 지난 일 = 메모). 날짜가 박혀 11-16부터 깨지던 '다음주 월요일까지 유기화학 과제' 시험은 오늘 기준으로 고침.
- 남은 것: `worker/test/11_admin.test.js` '합계'는 이번 변경 전부터 날짜에 따라 실패(서버 세션에 11-15 알림).

## 바뀐 파일

worker/3_memo_popup.js · worker/prompts/memo_popup.js · worker/test/3_memo_popup.test.js · docs/tachyon/할일_일정_구분.md · docs/tachyon/계획.md · docs/tachyon/소통.md · docs/작업_기록.md · prompts/README.md
