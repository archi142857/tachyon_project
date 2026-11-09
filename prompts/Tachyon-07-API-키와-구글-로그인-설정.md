# Tachyon-07 · Anthropic API 키, log 색인·배포, 구글 로그인(OAuth) 설정

- 날짜: 2026-11-09
- 도구: Claude Code (Claude Opus 5.5) — 브라우저(Claude Console, Google Cloud 콘솔)는 키보드 자동 조작, 비밀값은 `wrangler secret put`
- 기록 유형: 사용자 직접 지시
- 목적: 서버에 빠진 비밀값(`ANTHROPIC_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`)을 채우고, 서버 세션의 배포·색인 요청을 처리한다.

## 프롬프트 원문

````text
일단 api 키를 만들어야 할 것 같은데, 만들어줘
````

(작업 도중 사용자가 만든 키 원문을 채팅에 붙여 넣었다. 비밀값이라 여기 적지 않는다.)

Claude Code가 "키를 Worker 비밀값에 넣을까?"라고 묻자 사용자가 고른 답: `네가 넣어`

Claude Code가 "서버 세션의 배포·log 색인 요청을 할까? 구글 OAuth 클라이언트도 만들까?"라고 묻자:

````text
해줘
````

## 결과 요약

- Anthropic 키 `tachyon-worker`(사용자 계정에 묶인 키, 2027-02-28 만료)를 만들어 `ANTHROPIC_API_KEY`에 넣었다. 키는 화면에 띄우지 않고 클립보드에서 바로 넣은 뒤 클립보드 기록에서 지웠다. 새 키 모양은 `sk-ant-usr-…`.
- `schema.sql`에 `log_action_at` 색인을 더하고 로컬·원격 D1에 실행, main을 배포했다.
- Google Cloud 프로젝트 `Tachyon`(tachyon-514209) → 인증 플랫폼(외부, 테스트 중) → 웹 클라이언트 `tachyon-worker`(리디렉션: 배포 주소와 `http://localhost:8787`의 `/api/login/callback`) → `GOOGLE_CLIENT_ID`·`GOOGLE_CLIENT_SECRET`에 넣었다. 테스트 사용자 1명(dhsrua555).
- 게시(누구나 로그인)는 브랜딩에 홈페이지·개인정보처리방침 주소가 있어야 해서 아직 테스트 중이다.

## 관련 결과

- [schema.sql](../schema.sql) · [소통판 11-09 18:18·18:22·18:38 글](../docs/tachyon/소통.md)
