# Tachyon-AI-01 · AI 세션 시작: Claude API 키 안내, Haiku 지연 확인 준비, llm.js와 메모 즉시 팝업

- 날짜: 2026-11-09
- 도구: Claude Code (Claude Opus 5.5) — archi142857 쪽 'AI' 세션. 앱 안의 AI는 Claude API(Haiku 5.5 · Sonnet 5.5)
- 기록 유형: 사용자 직접 지시
- 목적: AI 세션이 맡은 일(Claude API 연결, 메모 즉시 팝업, 밤 정리, 시간표 사진)을 시작하고, 계획 0단계 '위험 확인: Haiku 파싱 지연'을 잴 수 있게 한다.

## 프롬프트 원문

````text
너는 Tachyon 프로젝트의 'AI' 세션이야. 1. 프로젝트 문서 Tachyon_작업_방식.md를 먼저 읽고 그 규칙대로 해. 2. 레포 archi142857/tachyon_project를 push 권한으로 붙이고 CLAUDE.md → docs/ngs/인수인계.md → docs/ngs/계획.md 순서로 읽어. 3. 네 경로: worker/llm.js, worker/3_memo_popup.js, worker/4_night.js, worker/5_timetable_photo.js, worker/prompts/. 길 연결(worker/index.js)은 서버에, DB 표는 컨셉에 쪽지로 부탁해. 4. 할 일: - Claude API 키 + 월 지출 상한. 키 만들기·상한·Cloudflare 비밀값 넣기는 내가 할 테니 단계만 안내해. - 위험 확인: Haiku 팝업 지연. '내일 3시 301동 스터디' 같은 지어낸 문장 10개를 JSON(시간·이름·장소)으로 바꾸고 중앙값 기록. 1초 넘으면 날짜·시각은 정규식 먼저. - llm.js(호출 한 곳) → 3_memo_popup.js(메모 → 팝업 후보). 프롬프트 원문은 worker/prompts/. 규칙: 쓴 말 그대로 제목, 쪼개지 않음, 모르면 '?'. - 그다음 4_night.js(01:30 밤 정리·브리핑), 5_timetable_photo.js. 5. 시작할 때 공유폴더 받은편지함 'AI'를 한 번 확인해.
````

작업 중 이어서 준 말:

````text
좋아. 작업 시작하셈. 멈추라 할 때까지 멈추지 마.
````

## 결과 요약

- 받은편지함 'AI'(팀 드라이브 세션소통)는 비어 있었다. 소통판 규칙대로 계획의 맡은 줄에 `작업 중: archi142857 11-09`를 붙이고, schema.sql 초안에 AI 쪽 의견을 소통판에 답했다.
- **Claude API 키·월 지출 상한**: 사용자가 직접 할 단계(Cloudflare 멤버 초대 → 콘솔 크레딧·워크스페이스 월 상한 → 키 만들기 → `npx wrangler secret put ANTHROPIC_API_KEY`)를 채팅으로 안내했다. 키는 채팅·파일·저장소에 쓰지 않는다.
- **[worker/llm.js](../worker/llm.js)**: Claude API를 부르는 곳 하나. `answer` 도구를 꼭 쓰게 해서 정해진 JSON으로만 받고, 시간 제한·재시도(429·5xx)·오류 구분, 사진 블록, 사용량 기록 글을 둔다. 모델은 빠른 모델 `claude-haiku-5-5`, 똑똑한 모델 `claude-sonnet-5-5`(wrangler.toml 변수로 바꿀 수 있음).
- **[worker/3_memo_popup.js](../worker/3_memo_popup.js)**: `/api/memo*`. 메모 저장·목록·삭제, 일정처럼 보이는 메모 → 팝업 후보(이름·날짜·시각·장소, 모르면 '?') → 저장(`events`, `source='memo'`, `ext_id='memo:<id>'`)·고치기·취소. 측정용 log(`popup_save`·`popup_edit`·`popup_cancel`·`llm`).
  - 날짜·시각은 처음부터 **정규식 먼저**로 만들었다(오늘·내일·모레·다음주 화요일·11/13·3시 반·저녁 7시·2시~4시 …). AI(Haiku)는 '일정인지·이름·장소'와 오전·오후 짐작만 보탠다. AI가 2.5초(`POPUP_AI_MS`) 안에 안 오거나 실패하면 규칙만으로 팝업을 만든다. 날짜·시각 말이 없는 메모는 AI를 부르지 않는다.
- **프롬프트 원문**: [worker/prompts/memo_popup.js](../worker/prompts/memo_popup.js), 설명 [worker/prompts/README.md](../worker/prompts/README.md).
- **위험 확인 'Haiku 팝업 지연' 준비**: 지어낸 메모 10개와 기대값 [worker/test/fixtures/memo_cases.js](../worker/test/fixtures/memo_cases.js), 측정 스크립트 [worker/check/haiku_latency.js](../worker/check/haiku_latency.js)(`node worker/check/haiku_latency.js`, 키는 가려진 입력으로 묻고 저장하지 않음). 가짜 API로 출력 모양만 확인했다. **실제 지연은 키가 생긴 뒤 재야 해서 아직 기록 없음**(계획의 이 줄은 아직 끝 아님).
- **테스트**: `node --test "worker/test/*.test.js"` — llm.js 9개, 3_memo_popup.js 14개, 모두 통과. DB는 schema.sql을 그대로 읽는 가짜 D1([worker/test/helpers/d1.js](../worker/test/helpers/d1.js), Node 내장 SQLite).

## 바뀐 파일

- 새로: `worker/llm.js`, `worker/3_memo_popup.js`, `worker/prompts/memo_popup.js`, `worker/prompts/README.md`, `worker/check/haiku_latency.js`, `worker/test/llm.test.js`, `worker/test/3_memo_popup.test.js`, `worker/test/fixtures/memo_cases.js`, `worker/test/helpers/d1.js`
- 고침: `docs/tachyon/계획.md`('작업 중' 표시), `docs/tachyon/소통.md`(알림·schema.sql 답)

## 남은 일

- 사용자: 키 만들기·지출 상한·Cloudflare 비밀값 → 지연 스크립트 실행 → 요약 줄을 AI 세션에 전달
- 서버 세션: `worker/index.js`에 `/api/memo*` 길 잇기, package.json에 `"type": "module"`과 테스트 명령
- AI 세션: 4_night.js(밤 정리·밀도·브리핑), 5_timetable_photo.js
