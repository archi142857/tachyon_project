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

## 이어서: 11-10 저녁 체크인 (AI 세션이 스스로 예약한 확인, 사람 요청 아님)

- 쓴 도구: Claude Code(Claude Opus 5.5)의 웹 검색·웹 읽기(Claude API 공식 문서), git, node 시험, `wrangler deploy --dry-run`(묶기만, 배포 안 함), 구글 드라이브(받은편지함).
- 팀원 글(17:53, 시험 준비 모드 측정)에 '5.5 모델은 생각이 기본으로 켜짐'이 있어 앱 안 호출 넷을 공식 문서와 맞춰 봤다. API primer 'Forcing tool use'에 **Sonnet 5.5는 `tool_choice` any·tool이 400**이라고 적혀 있다. 밤 정리·시간표 사진은 Sonnet이고 answer 도구를 강제해 왔으니 부를 때마다 실패했을 것이다(밤 정리는 AI가 실패해도 규칙 브리핑은 만들고, 오늘 01:30이 첫 실제 실행이라 아직 아무도 못 봤다).
- 고침(73b6057): [worker/llm.js](../worker/llm.js)가 Sonnet 5.5에는 `tool_choice: auto` + `thinking: between_tools`(앞 생각 끔, disabled는 400)로 보낸다. 도구 없이 글로 JSON을 쓰면 그것을 읽고, 없으면 다시 시도. 표에 없는 모델이 400으로 tool_choice·thinking을 탓하면 그 칸만 바꿔 한 번 더. Haiku 5.5(팝업·eTL 공지)는 그대로 강제(강제 호출은 생각을 건너뜀). 밤 정리 max_tokens 4000 → 8000(시간 제한 120초), 시간표 사진 3000 → 6000.
- 컨셉이 사람 요청으로 고친 3f7cef7(할 일 팝업, `kind`)과 팀원의 9710247(`moved_to`)을 읽었다. 고칠 것 없음. 드라이브 쪽지 1개(컨셉 16:47) 처리됨으로.
- 확인: worker 시험 143개 모두 통과(새 시험 5개: Sonnet·Haiku 보내는 모양, 모델 표, tool_choice·thinking 400 뒤 다시 보내기, 글 속 JSON). 진짜 API 호출은 팀원 log로 확인 부탁(소통판) — 01:30 밤 정리의 `llm`·`llm_fail` 줄.
- 고친 파일: `worker/llm.js`, `worker/4_night.js`, `worker/5_timetable_photo.js`, `worker/prompts/README.md`, `worker/test/llm.test.js`, `docs/tachyon/소통.md`, 이 기록

## 이어서: 11-11 아침 체크인 (AI 세션이 스스로 예약한 확인, 사람 요청 아님)

- 쓴 도구: Claude Code(Claude Opus 5.5), git, node 시험, 구글 드라이브(받은편지함 비어 있음).
- 01:30 밤 정리 log는 아직 안 왔다(팀원에게 다시 부탁, 소통판 11-11 10:46). '[오류]' 이슈는 없었지만 AI 실패는 `llm_fail`로만 남는다.
- 팀원이 내 파일에 더한 빈 시간·길이·매주(7d46d7c·3b550d9)를 읽었다. 고칠 것 없음.
- 지어낸 메모로 돌려 보다 찾은 것(e1accf6): '3일 뒤에'·'3일 후에'는 '에' 때문에 날짜를 못 읽었다 → 고침. '2주 뒤'·'일주일 뒤'·'2시간 뒤'·'30분 있다가'도 읽는다(5분 단위로 올림). worker 시험 149개 통과, 배포 성공.
- 고친 파일: `worker/3_memo_popup.js`, `worker/test/3_memo_popup.test.js`, `worker/prompts/README.md`, `docs/tachyon/소통.md`, 이 기록

## 이어서: 11-11 오후 체크인 (AI 세션이 스스로 예약한 확인, 사람 요청 아님)

- 쓴 도구: Claude Code(Claude Opus 5.5), git, node(지어낸 메모 약 40개를 규칙만으로 돌려 봄), 구글 드라이브(받은편지함 비어 있음).
- 밤 정리 log는 아직 안 옴(팀원 바쁨, 급하지 않다고 다시 적음). 서버 파일·schema는 아침 뒤로 안 바뀜.
- 고침(49d4394): 주말·다음 달 N일, 12월에 쓴 '5일'(13월 문제), AI 없이도 날짜 + 시간대 말이면 일정 팝업, 할 일 이름의 '마감'·시간대, 역 출구 장소. worker 시험 151개 통과, 배포 성공.
- 고친 파일: `worker/3_memo_popup.js`, `worker/test/3_memo_popup.test.js`, `worker/prompts/README.md`, `docs/tachyon/소통.md`, 이 기록

## 이어서: 11-11 저녁 체크인 (AI 세션이 스스로 예약한 확인, 사람 요청 아님)

- 쓴 도구: Claude Code(Claude Opus 5.5), git, node 시험, 구글 드라이브(받은편지함 비어 있음, 서버 받은편지함에 쪽지 1개 — 처음 만든 쪽지는 시각을 잘못 적어 휴지통으로 옮기고 다시 씀).
- 밤 정리 쪽 규칙을 지어낸 할 일·일정으로 돌려 봄. 고침(7ac3ba5): 걸리는 시간 채우기를 다가오는 마감부터, 지난 할 일 경고에 개수와 '끝났으면 체크', 브리핑에 여러 날 이어지는 하루 종일 일정. worker 시험 152개 통과, 배포 성공.
- 찾았지만 서버 파일이라 쪽지로 넘긴 것: eTL 주소만 붙이면 지난 30일 과제가 열린 할 일로 들어와 첫날 할 일 3칸을 차지함.
- 고친 파일: `worker/4_night.js`, `worker/test/4_night.test.js`, `docs/tachyon/소통.md`, 이 기록
