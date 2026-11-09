# Tachyon · 컨셉 05 · 앱 이름을 모든 곳에서 Tachyon으로

- 날짜: 2026-11-09
- 도구: Claude (claude.ai 프로젝트 세션, Claude Opus 5.5), Google Drive 연결
- 기록 유형: 사용자 직접 지시
- 목적: 앱 임시 이름 NGS를 저장소·드라이브·프로젝트 문서·컴퓨터 폴더에서 Tachyon으로 바꾼다.

## 프롬프트 원문

````text
앱 이름 NGS로 되어 있는 거 다 Tachyon으로 바꿔줘
````

````text
깃허브, 컴퓨터 폴더, 등등 모든 곳에서
````

## 결과 요약

저장소: `docs/ngs/` → `docs/tachyon/`, `prompts/NGS-*` → `prompts/Tachyon-*`(내용은 그대로, 제목·링크만), 살아 있는 문서(README·AGENTS.md·CLAUDE.md·계획·인수인계·세션 운영·작업 기록·프롬프트 목록·worker/prompts 설명·schema.sql 주석·.gitattributes)의 앱 이름과 경로를 바꿨다. 커밋 머리말 규칙은 `[Tachyon]`, 프롬프트 기록 이름은 `Tachyon-NN`·`Tachyon-<세션>-NN`. 목록에 빠져 있던 Tachyon-AI-01 줄을 더했다. 바꾼 뒤 저장소 안 상대 링크를 모두 검사해 깨진 곳이 없음을 확인했다.

바꾸지 않은 것: 프롬프트 원문 속 'NGS'(원문 그대로 규칙), 소통판 옛 글(덧붙이기만 규칙, 맨 위에 옛 이름 안내 한 줄), 이미 올라간 커밋 메시지(강제 푸시 금지), 작업 기록의 '앱 임시 이름 NGS'라는 사실 한 줄.

## 바뀐 파일

- [README](../README.md), [AGENTS.md](../AGENTS.md), [CLAUDE.md](../CLAUDE.md), [계획](../docs/tachyon/계획.md), [인수인계](../docs/tachyon/인수인계.md), [세션 운영](../docs/tachyon/세션_운영.md), [소통판](../docs/tachyon/소통.md), [작업 기록](../docs/작업_기록.md), [프롬프트 목록](README.md), `prompts/Tachyon-*`, `worker/prompts/README.md`, `schema.sql`, `.gitattributes`
