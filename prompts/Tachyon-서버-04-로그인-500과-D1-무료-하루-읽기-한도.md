# Tachyon-서버-04 · 로그인 500: 무료 D1 하루 읽기 한도 초과를 찾고 줄이기

- 날짜: 2026-11-12
- 도구: Claude Code (Claude Opus 5.5) — archi142857 쪽 '서버' 세션. 배포 주소 확인에 curl(`/api/health`, 읽기만), 원인 재기에 wrangler `getPlatformProxy`(로컬 workerd D1의 `rows_read`), 시험은 Node 내장 시험(node:test), GitHub 이슈 확인에 gh(REST), D1 요금 확인에 웹 검색, 쪽지는 Google Drive 커넥터
- 기록 유형: 사용자 직접 지시
- 목적: 사람이 보낸 캡처(배포 앱 로그인 콜백이 JSON 500)의 원인을 찾아 고친다. 11/13(금) 저녁 실사용 전에 같은 일이 다시 나지 않게 한다.

## 프롬프트 원문

````text
(글 없이 화면 캡처 한 장: 배포 앱 /api/login/callback?state=…&iss=…&code=… 주소에 {"error":"서버에서 오류가 났다"} — state·code 값은 여기 옮기지 않음)
````

## 결과 요약

- **원인:** 로그인 코드가 아니라 D1. `/api/health`가 D1 오류 글을 보이게 고쳐(b5966bc) 보니 `D1_ERROR: Your account has exceeded D1's free tier daily row read limit…`. Cloudflare 계정 전체의 무료 하루 읽기 500만 줄을 한국 09:00(UTC 자정) 뒤 한 시간 반쯤에 다 썼다 → 그 뒤 DB를 쓰는 요청은 다 실패. 내일 09:00에 풀린다. 오류 자동 보고도 D1로 같은 오류를 찾다가 실패해 이슈가 생기지 않았다.
- **어디서 읽었나(로컬 workerd D1로 잼, 지어낸 일정 1232개):** 폰 캘린더 올리기(`POST /api/feeds/device`) 한 번이 82.9만 줄. 11-10에 넣은 겹침 확인이 색인 없이 '보낸 일정 수 × 그 사람 일정 전체'를 훑었다. `events (user_id, start)` 색인(원격은 dhsrua555 10:13)이 있으면 6천 줄. 다른 요청은 수백~2천 줄.
- **고침(9f6e3bf, 배포됨):** schema.sql에 그 색인과 같이 쓰기 표 6개(컨셉 쪽지 0821·1041, `TOGETHER_SQL`은 지움) · 폰 캘린더는 6시간 안 같은 목록이면 넣지 않음(2줄), 겹치게 된 폰 일정은 주소 수집 때 지움 · 로그인 콜백은 DB 실패면 `?login_error=db_limit|server` · D1 쪽 사정은 503 `{ error, code }` · 오류 보고는 '서버 D1' 하나로, D1이 안 되면 GitHub 열린 이슈로 거름.
- 사람에게는 원인·풀리는 때·Paid 선택을 바로 알렸고(직접 물은 자리), Paid로 올릴지는 컨셉 쪽지(`261112-1104_서버_사용자-…`)로 넘겼다. 화면에는 로그인 오류 글 두 값을 쪽지로 부탁.
- 확인: `npm test` 179개 통과, 배포용 빌드(dry-run), Workers Builds 성공 뒤 배포 `/api/health`가 `problem: "limit"`을 보이는 것, 콜백이 302로 돌아가는 것(curl).

## 바뀐 파일

- 새로: `worker/lib/dberror.js`, 이 기록
- 고침: `worker/index.js`(health·503), `worker/1_login.js`(콜백), `worker/2_collect_ics.js`(폰 캘린더), `worker/6_feedback.js`(D1 없이 거르기), `worker/10_together.js`(표 정의 뺌), `schema.sql`, `worker/test/`(index·1_login·2_collect_ics·6_feedback·10_together), `web/API.md`, `docs/tachyon/소통.md`
