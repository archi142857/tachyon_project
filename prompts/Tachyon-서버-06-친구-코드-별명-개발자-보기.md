# Tachyon-서버-06 · 쪽지: 친구 코드·별명(표 합의), 개발자 보기 주소

- 날짜: 2026-11-13
- 도구: Claude Code (Claude Opus 5.5) — archi142857 쪽 '서버' 세션. 쪽지는 Google Drive 커넥터, 읽기 줄 재기에 wrangler `getPlatformProxy`(로컬 workerd D1의 `rows_read`), 모델 가격 확인에 웹 검색(Claude 문서), 시험은 Node 내장 시험(node:test), 배포 확인에 gh(REST)·curl(읽기만), 표가 생겼는지 다시 보는 데 이 세션으로 돌아오는 예약(send_later)
- 기록 유형: 사용자 직접 지시
- 목적: 받은편지함 쪽지 컨셉 `261113-0034`(사람 피드백 6 '초대 쉽게'의 서버 몫)와, 그 뒤 온 `261113-0104`(사람 요청 '개발자가 보는 활동 화면')를 처리한다.

## 프롬프트 원문

````text
쪽지 확인해
````

## 결과 요약

- **친구 코드·별명(0034):**
  - 소통판에 표 둘(`profiles`·`friend_requests`)을 제안했고 dhsrua555가 00:53에 동의했다. `users`는 건드리지 않고 다시 돌려도 되는 `CREATE … IF NOT EXISTS`만 썼다.
  - `schema.sql`에 넣었고(d587bee) 원격 D1에 넣기를 부탁했다.
  - 주소: `GET /api/together`의 `me`·`requests`, `POST /code`, `PUT /nickname`, `POST /requests`(코드·별명, 서로 보내면 바로 친구, 하루 20번), 받기·거절·취소. 남에게는 별명 먼저 보이고 이메일은 안 보인다.
  - 시험까지 만들어 두었지만, 원격에 표가 없을 때 올리면 '같이' 쪽 전체가 503이 된다. 그래서 health `tables`가 18이 된 뒤에 올리려고 로컬 갈래 `friend-codes`에 두었다.
- **개발자 보기(0104), e2636af:** `GET /api/admin/summary?days=14`(새 `worker/11_admin.js`).
  - `ADMIN_EMAILS` 비밀값에 든 사람만 보고, 아니면 404다. 값은 계정 주인이 넣는다.
  - 합계만 보낸다(날마다 쓴 사람·새 사용자·메모, 행동별 횟수, 팝업 흐름, AI 횟수·토큰·대략 비용, 수집, 오류, 표 크기). 이름·이메일·글은 안 보낸다.
  - log는 행동 이름을 색인에서 건너뛰며 모아 기간 줄만 읽고, 쓰기는 없다.
- 확인: 시험 190 통과, dry-run 빌드, Workers Builds 성공, 배포 주소에서 로그인 없이 404.

## 바뀐 파일

- `schema.sql`, `worker/11_admin.js`(새로), `worker/index.js`, `worker/test/11_admin.test.js`(새로), `web/API.md`, `docs/tachyon/소통.md`, 이 기록
- 로컬 갈래 `friend-codes`(아직 안 올림): `worker/10_together.js`, `worker/test/10_together.test.js`, `web/API.md`
