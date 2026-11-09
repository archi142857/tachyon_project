# Tachyon-AI-01 · AI 세션 시작: Claude API 키 안내, Haiku 지연 확인 준비, llm.js · 메모 즉시 팝업 · 밤 정리 · 시간표 사진

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
- **[worker/4_night.js](../worker/4_night.js)**: Cron 01:30(한국) 밤 정리 + `/api/briefing*`. 아직 정리 안 된 메모와 걸리는 시간이 빈 할 일(eTL 과제 포함)을 Sonnet에 한 번에 보내 → 할 일 후보(쓴 말 그대로, 메모 하나에 하나, `ext_id='memo:<id>'`), 걸리는 시간·지금 가능 여부. 마감 날짜는 정규식이 '메모를 쓴 시각' 기준으로 먼저 센다.
  - 밀도('서랍장', AI 없음): 하루를 3시간 칸으로 보고 마감 이른 순서대로 채워, 마감까지 남는 칸(여유)이 적은 순으로 할 일 3개. 칸이 모자라면 몇 시간 모자란지, 다 들어가도 한 주에 마감이 몰리면 '미리 시작' 경고.
  - 아침 브리핑 카드(JSON): 오늘 일정 · 할 일 3개 · 미룰 것 1개 · 경고 · 새로 생긴 할 일 → `briefings`. 주소: 브리핑 열기(밤 정리 전이면 바로 만듦), 지금 순서(대시보드 '할 일 3개'용), 지금 돌리기(시험용, 10분 3번).
- **[worker/5_timetable_photo.js](../worker/5_timetable_photo.js)**: `/api/timetable*`. 사진 → (R2) → Sonnet이 사진을 바로 읽어 수업 칸 목록 → 사용자가 확인·고침 → 학기 끝까지 주마다 `events`(`source='timetable'`)로 펼침, 다시 저장하면 그날부터의 시간표를 바꿈 → 사진은 저장·취소하면 지움. 학기 끝 기본값은 짐작(2학기 12-20)이라 화면에서 고칠 수 있게 했다.
- **프롬프트 원문 추가**: [worker/prompts/night.js](../worker/prompts/night.js), [worker/prompts/timetable_photo.js](../worker/prompts/timetable_photo.js).
- **테스트**: `node --test "worker/test/*.test.js"` — llm.js 9개, 3_memo_popup.js 14개, 4_night.js 6개, 5_timetable_photo.js 6개, 모두 35개 통과. DB는 schema.sql을 그대로 읽는 가짜 D1([worker/test/helpers/d1.js](../worker/test/helpers/d1.js), Node 내장 SQLite).
- **실제 Workers 실행 확인**: 저장소 밖 임시 설정으로 `wrangler dev`(workerd + 로컬 D1·R2)에서 세 파일의 주소를 모두 불러 봤다. 메모 쓰기·저장·고쳐 저장·취소, 브리핑·순서·지금 돌리기, 시간표 12줄 펼치기, Cron, log가 모두 동작. 가짜 키로 진짜 API에 401을 받아 AI 실패 때 규칙 팝업·브리핑이 그대로 나오는 것도 확인했다. 진짜 키로 AI 답을 받는 것은 아직 못 해 봤다.

## 바뀐 파일

- 새로: `worker/llm.js`, `worker/3_memo_popup.js`, `worker/4_night.js`, `worker/5_timetable_photo.js`, `worker/prompts/memo_popup.js`, `worker/prompts/night.js`, `worker/prompts/timetable_photo.js`, `worker/prompts/README.md`, `worker/check/haiku_latency.js`, `worker/test/llm.test.js`, `worker/test/3_memo_popup.test.js`, `worker/test/4_night.test.js`, `worker/test/5_timetable_photo.test.js`, `worker/test/fixtures/memo_cases.js`, `worker/test/helpers/d1.js`
- 고침: `docs/tachyon/계획.md`('작업 중' 표시), `docs/tachyon/소통.md`(알림·schema.sql 답)

## 남은 일

- 사용자: 키 만들기·지출 상한·Cloudflare 비밀값 → 지연 스크립트 실행 → 요약 줄을 AI 세션에 전달
- 서버 세션: `worker/index.js`에 `/api/memo*` · `/api/briefing*` · `/api/timetable*` 길과 Cron 01:30 잇기, R2 바인딩 `PHOTOS`, package.json에 `"type": "module"`과 테스트 명령
- 화면 세션: 팝업·브리핑 카드·시간표 확인 팝업 화면
- AI 세션: 진짜 키로 세 프롬프트 답 확인(지연 측정과 함께), 지연 결과에 따라 `POPUP_AI_MS` 정하기
