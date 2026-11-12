# Tachyon-화면-07 · 공유 폴더 확인 → 로그인 오류 글(db_limit · server)과 503 안내

- 날짜: 2026-11-12
- 도구: Claude (claude.ai, Claude Opus 5.5) — archi142857 쪽 '화면'(Frontend) 세션. 받은편지함은 Google Drive 커넥터, 코드는 Vite + React, 확인은 Vitest(fetch 바꿔 끼우기)·헤드리스 Chrome(Playwright, `/api/login/me` 답을 가짜로)·axe-core
- 기록 유형: 사용자 직접 지시(받은편지함의 서버 쪽지를 처리)
- 목적: 받은편지함 '화면'과 소통판 새 글을 확인하고, 서버 쪽지 `261112-1104`(로그인 오류 글에 `db_limit` · `server`, API 503 `code`)를 붙인다.

## 프롬프트 원문

````text
공유 폴더
````

## 결과 요약

- **받은편지함 '화면'**: 서버 쪽지 `261112-1104` 하나. 소통판 새 글 — 서버 11:04(로그인 500 = 무료 D1 하루 읽기 한도, 한국 09:00에 풀림, 9f6e3bf), 컨셉 11:32(사람에게 유료 여부 물음), dhsrua555 10:10(메모 팝업 나누기·어림 — 화면 파일 `MemoPopup.jsx`·`styles.css`·`Dashboard.jsx`·`example.js`·`api.js`·`logic.test.js`를 고침. 읽었고 테마 값만 써서 그대로 둠).
- **로그인 오류 글**: `loginErrorText`에 `db_limit` → '오늘 서버 사용량이 다 차서 오전 9시에 다시 돼요', `server` → '서버에 잠깐 문제가 있어요. 잠시 뒤에 다시 해 주세요'.
- **503 안내**: `call()`이 503이면 서버 `error` 글을 그대로 쓰고 `code`를 `error.code`로 넘긴다(저장소 사정 `db_limit`·`db_busy`, 같이 쓰기·eTL 준비 중 — 같이 쓰기 '준비 중' 문장도 이제 제대로 보인다). 처음 열 때 `/api/login/me`가 503 + `code`면 로그인 화면에 그 안내 글('서버에 닿지 않아요' 대신). eTL 창의 '준비 중'은 `code` 없는 503에만.
- **시험**: `web/src/api.test.js` 다섯 개(로그인 글, 503 + code, 503 준비 중, 500·글 없는 503, 4xx) — web 129 통과.
- **확인**: 로그인 화면에서 `?login_error=db_limit`·`server`, `/api/login/me` 503 db_limit 세 경우의 글, axe 위반 0(로그인·첫 설정), 네 크기 쪽 24곳 문서 스크롤 0·오류 없음.

## 이어서: 문구 바꾸기(11-13 00:06)

````text
오늘 서버 사용량이 다 차서 오전 9시에 다시 돼요

이거 문구 별로임.

오늘 서버 사용량을 모두 소진했어요. 오전 9시부터 다시 이용할 수 있어요. 로 바꿔줘
````

- `db_limit` 글을 '오늘 서버 사용량을 모두 소진했어요. 오전 9시부터 다시 이용할 수 있어요'로(`DB_LIMIT_TEXT`, 앱의 다른 안내처럼 끝 마침표는 뺌). 로그인 화면뿐 아니라 쓰는 도중 503 `db_limit`(스낵바·창, 처음 열 때 `/api/login/me`)도 서버 글 대신 같은 글을 보이게 했다. `db_busy`는 서버 글 그대로. 시험 하나 더함(web 130).

## 관련 결과

- [web/src/api.js](../web/src/api.js) · [web/src/api.test.js](../web/src/api.test.js) · [web/src/App.jsx](../web/src/App.jsx) · [web/API.md](../web/API.md)
