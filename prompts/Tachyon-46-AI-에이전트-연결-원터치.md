# Tachyon-46 · AI 에이전트 연결도 원터치(앱마다 단추 하나)

- 날짜: 2026-11-20
- 도구: Claude Code (VS Code 확장, Claude Opus 5.5) — 앱마다 '주소를 미리 채운 추가' 길은 서브에이전트(web-digest)가 각 공식 문서에서 찾고, Claude 링크 형식은 공식 문서(claude.com/docs/connectors/building/directory-vs-custom.md)를 curl로 다시 확인, 화면 시험은 vitest, 빌드는 vite build, 화면 확인은 헤드리스 Chrome(CDP) 화면 찍기 + 서브에이전트(screen-check)
- 기록 유형: 사용자 직접 지시
- 목적: 'AI 에이전트 연결' 창에서 주소 복사 → 앱 설정 찾아가기 → 붙여 넣기를 하던 것을 앱마다 단추 한 번으로.

## 프롬프트 원문

11-20 07:40 ('AI 에이전트 연결' 창 화면 찍은 것과 함께)

````text
이것도 원터치로
````

11-20 07:50 (첫 판을 보고)

````text
명령을 바로 붙여넣는 화면으로 연결해줘야지
````

## 정한 것

- 첫 판(07:46)은 Claude만 채운 창으로 가고 나머지는 복사만 해서, 둘째 요청대로 **앱마다 '붙여 넣는 화면'까지 곧장** 가게 고쳤다(11-20 각 공식 문서를 curl로 다시 확인).
- **Claude**: 공식 '주소를 미리 채운 사용자 지정 커넥터 추가 창' 링크(`https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=Tachyon&connectorUrl=<주소>`) → 추가 · 연결 → Tachyon '허락'. Claude 쪽 확인 단추는 Claude가 일부러 남긴 것이라 없앨 수 없다. Claude 계정으로 로그인한 Claude Code에는 이 커넥터가 저절로 들어간다(Claude Code 문서 'Use MCP servers from claude.ai').
- **Claude Code**: 공식 딥링크로 명령이 **채워진** Claude Code를 연다 — 터미널 `claude-cli://open?q=…`, VS Code 탭 `vscode://anthropic.claude-code/open?prompt=…`. 채우는 글은 'Tachyon을 MCP 서버로 연결해 줘. 이 명령을 실행하고 …' + `claude mcp add --transport http --scope user tachyon <주소> && claude mcp login tachyon` → Enter 한 번에 추가 + 로그인. 처음엔 '!'(셸 모드)로 채웠는데, 이 노트북에서 열어 보니 미리 채운 '!'는 셸 모드로 바뀌지 않아서 말로 부탁하게 바꿨다. 터미널 링크는 홈 폴더에서 열려서 처음이면 폴더 신뢰 질문(기본값 No)이 먼저 뜬다. 링크는 그 컴퓨터에서 Claude Code에 한 번 말을 보낸 뒤부터 열린다. '명령만 복사'도 남김.
- **ChatGPT**: 주소를 채우는 링크가 없다 → 주소를 복사하고 공식 문서가 가리키는 `https://chatgpt.com/plugins`(+ → Add custom MCP server)를 연다. 옛 '설정 › 앱 › 개발자 모드' 길 대신.
- **Gemini**: 웹 Gemini 개발자 모드 `https://gemini.google.com/devmode`(+ Create new → MCP Server URL)로 바꿈 — 주소 복사 + 열기. Gemini CLI는 2026-05 Antigravity CLI로 넘어가 명령이 달라져 뺐다.
- VS Code(Copilot) · Cursor 원클릭 설치 링크는 지금 창에 없던 앱이라 넣지 않았다.

## 결과 요약

- `web/src/components/AiSheet.jsx`: 앱마다 한 칸(이름 · 단추 · 짧은 설명) — Claude · Claude Code(터미널에서 · VS Code에서) · ChatGPT · Gemini. 복사하면 그 칸 아래에 알림, 복사가 안 되면 글을 그대로 보여 줌. 다른 앱용 주소 칸 옆에 '주소 복사'. 연결된 앱 끊기는 그대로.
- `web/src/styles.css` `.ai-pick`, 시험 `web/src/aiSheet.test.js`(Claude 링크 인코딩 · Claude Code 딥링크가 '!' 명령을 그대로 담는지).
- 이 노트북(Hyprland)에서는 Claude Code가 등록한 링크 처리 파일(`~/.local/share/applications/claude-code-url-handler.desktop`)의 Exec 경로가 따옴표로 싸여 있어 xdg-open이 그 파일을 못 읽고 브라우저(새 탭)로 넘겼다 → 따옴표를 빼서 고침(노트북 설정, 저장소 밖). GNOME · KDE · macOS · Windows는 해당 없음.
- 확인: vitest 227개 통과, vite build 통과, PC 1600×960 · 폰 390×844 화면 찍기(기본 · 입자 테마).
- 남은 것: 실제 Claude 계정으로 단추 → 창이 채워져 열리는지(무료 요금제는 사용자 지정 커넥터 1개까지, Team · Enterprise는 관리자만 추가).

## 관련 결과

- [web/src/components/AiSheet.jsx](../web/src/components/AiSheet.jsx) · [worker/13_mcp.js](../worker/13_mcp.js)(허락 화면 · DCR, 바뀐 것 없음) · [API.md AI 앱 연결](../web/API.md) · [계획 11-20 07:40 줄](../docs/tachyon/계획.md)
