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

## 정한 것

- **Claude**: Claude가 공식으로 주는 '주소를 미리 채운 사용자 지정 커넥터 추가 창' 링크(`https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=Tachyon&connectorUrl=<주소>`)로 연다 → 추가 · 연결 → Tachyon '허락'. Claude 쪽 확인 단추는 Claude가 일부러 남긴 것(외부 링크 값 확인)이라 없앨 수 없다.
- **ChatGPT**: 주소를 미리 채우는 링크를 찾지 못했다 → 단추 한 번에 주소를 복사하고 ChatGPT 설정(`chatgpt.com/#settings`)을 연다. 붙여 넣기는 사람이.
- **Claude Code · Gemini CLI**: 주소까지 든 명령을 통째로 복사(`claude mcp add --transport http --scope user tachyon <주소>` · `gemini mcp add --transport http -s user tachyon <주소>`) → 터미널에 붙여 넣기 → 그 안에서 로그인.
- VS Code · Cursor도 원클릭 설치 링크가 있지만 지금 창에 없던 앱이라 넣지 않았다.

## 결과 요약

- `web/src/components/AiSheet.jsx`: 앱마다 한 칸(이름 · 단추 · 짧은 설명), 복사하면 그 칸 아래에 알림. 다른 앱용 주소 칸 옆에 '주소 복사'. 연결된 앱 끊기는 그대로.
- `web/src/styles.css` `.ai-pick`, 시험 `web/src/aiSheet.test.js`(링크 인코딩 · 명령 모양).
- 확인: vitest 227개 통과, vite build 통과, PC 1600×960 · 폰 390×844 화면 찍기(기본 · 입자 테마).
- 남은 것: 실제 Claude 계정으로 단추 → 창이 채워져 열리는지(무료 요금제는 사용자 지정 커넥터 1개까지, Team · Enterprise는 관리자만 추가).

## 관련 결과

- [web/src/components/AiSheet.jsx](../web/src/components/AiSheet.jsx) · [worker/13_mcp.js](../worker/13_mcp.js)(허락 화면 · DCR, 바뀐 것 없음) · [API.md AI 앱 연결](../web/API.md) · [계획 11-20 07:40 줄](../docs/tachyon/계획.md)
