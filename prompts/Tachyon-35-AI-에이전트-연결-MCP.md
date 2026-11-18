# Tachyon-35 · AI 에이전트 연결(Claude · ChatGPT · Gemini, 원격 MCP 서버)

- 날짜: 2026-11-19
- 도구: Claude Code (Claude 데스크톱 앱 Code 탭, Claude Opus 5.5) — 웹 조사(MCP 사양 2026-07-28 · OAuth 인가 · Claude · ChatGPT · Gemini의 원격 MCP 지원과 로그인 방식), node --test(가짜 D1 · 가짜 fetch), 공식 MCP SDK 클라이언트(@modelcontextprotocol/sdk 1.32, 작업 폴더 밖 임시 설치)로 발견 → 등록 → 허락 → 토큰 → 도구까지, vitest · vite build · wrangler 묶기 시험, 앱 안 브라우저(예시 모드)로 메뉴 창 확인
- 기록 유형: 사용자 직접 지시
- 목적: Tachyon이 모아 둔 일정 · 할 일 · eTL 자료를 사람이 이미 쓰는 AI 앱(Claude · ChatGPT · Gemini)이 읽고 답하고, 일정 · 할 일을 넣게 한다.

## 프롬프트 원문

11-19 00:57

````text
타키온이 정리해둔 항목들을 클로드, gpt, gemini가 읽고 답변할 수 잇으면 좋겠어. 이를테면 클로드에서 새로운 일정을 등록하려고 하면, 기존의 타키온 캘린더를 읽고 빈 시간을 알려준다던지, etl에서 받아온 자료들을 읽고 답변해준다던지 하는 식으로 현재 사용하는 ai 에이전트와 연동이 되게 하고 싶어
````

## 정한 것

- 세 앱이 같이 붙는 표준은 원격 MCP 서버 하나다(Claude: 사용자 지정 커넥터, ChatGPT: 개발자 모드 앱, Gemini: Gemini CLI). 주소는 `<배포 주소>/mcp`.
- 로그인은 OAuth 2.1(공모전.md의 '게시까지 가면' 길). 사람별 비밀 주소(빠른 길)는 Claude · ChatGPT가 OAuth를 기대해서 안 씀. Tachyon 구글 로그인 위에 Worker가 직접 로그인 서버 노릇(라이브러리 없이 lib/secret.js의 잠금으로 code · 토큰, 연결마다 `ai_links` 줄 하나 → 끊으면 바로 무효).
- 도구는 읽기 6개 + 넣기 2개. 고치기 · 지우기는 안 줌(AI가 잘못 지우는 일이 없게). 넣은 일정은 구글 캘린더로도 간다(12_gcal).
- 학교 ChatGPT Edu는 11-10 확인대로 일반 멤버에 개발자 모드가 없어 그대로는 못 붙인다(계획 3단계 줄 그대로). 개인 ChatGPT 계정 · Claude · Gemini CLI는 된다.

## 한 일

- 서버 `worker/13_mcp.js`(새 번호 파일): `/mcp`(MCP, 2026-07-28 새 방식 `server/discover`와 옛 방식 `initialize` 둘 다, JSON 답만), `/.well-known/oauth-protected-resource` · `oauth-authorization-server`, `/oauth/register`(DCR, 표 없이) · `/oauth/authorize`(Tachyon 허락 화면) · `/oauth/token`(PKCE S256, refresh), `/api/ai`(연결 목록 · 끊기). client_id가 https 주소면 그 문서(CIMD)로 돌아갈 주소를 확인.
- 도구: `get_briefing` · `get_schedule` · `find_free_time`(시각 일정 사이 빈 칸, 오늘은 지금부터, 종일 일정은 알려만 줌) · `list_tasks` · `get_etl`(공지 · 강의자료 목록, 과목 거르기) · `list_memos` · `add_event` · `add_task`. 화면이 쓰는 주소를 안에서 그대로 불러 검사 · 순서가 화면과 같다.
- `POST /api/tasks`(7_items, 할 일 바로 넣기). `index.js` 주소 잇기(토큰으로 부르는 `/mcp` · `/oauth/token` · `/oauth/register`만 다른 사이트에서 와도 받음), `wrangler.toml` `run_worker_first`에 `/mcp` · `/oauth/*` · `/.well-known/*`. 로그인 뒤 돌아갈 주소 길이 200 → 2000(허락 화면 주소가 김). 계정 지우기에 `gcal` · `gcal_gone` · `ai_links`도.
- 표 `ai_links`(`schema.sql`, 있던 DB는 `worker/migrations/13_mcp.sql`). 표가 없으면 허락 화면까지만 되고 토큰은 503 '준비 중'.
- 화면: 메뉴 'AI 에이전트 연결 (Claude · ChatGPT · Gemini)' → 주소 복사, 앱별 붙이는 법, 연결된 앱 · 끊기(`AiSheet.jsx`).
- 확인: 서버 시험 229(새 `13_mcp.test.js` 9개 — 안내 문서 · 401, 허락 화면 · 이스케이프 · 모르는 앱, 허락 · 거절 · 다른 계정 · 다른 사이트 · PKCE · code 5분, 옛 · 새 방식 · 머리글 검사, 도구 6개, 넣기 2개, refresh · 끊기 · 계정 지우기, CIMD · localhost 포트, 표 없을 때), 공식 MCP SDK 클라이언트로 처음부터 끝까지, 화면 198 · 빌드 · Worker 묶기, 예시 모드에서 메뉴 창.

## 남은 것(사람)

- ~~원격 D1에 `ai_links` 넣기(`worker/migrations/13_mcp.sql`)~~ — 11-19 01:23 사람 "Run migration"으로 넣음(넣기 전 없음 확인, 넣은 뒤 표 · 색인 · 칸 6개 확인, 표 19개 · 사이트 200).
- 실제 계정으로 Claude(또는 ChatGPT 개인 계정)에 붙여 '이번 주 빈 시간' · 'eTL 공지 요약'을 물어보기(구글 로그인 · 허락은 사람).
