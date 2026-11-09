# 화면(web/)이 부르는 API

화면이 서버에 보내는 것은 모두 [`src/api.js`](src/api.js) 한 파일에 있다. 이 문서는 그 목록이다. **있음**은 이미 main에 올라온 것, **바람**은 화면 세션이 바라는 모양이라 맡은 세션이 정하면 이 문서와 `api.js`를 같이 고친다.

주소 길 나눔(`worker/index.js`): `/api/login*` → `worker/1_login.js`, `/api/feeds*` → `2_collect_ics.js`, `/api/memo*` → `3_memo_popup.js`, `/api/briefing*` → `4_night.js`, `/api/timetable*` → `5_timetable_photo.js`, `/api/feedback*` → `6_feedback.js`, `/api/tasks*`·`/api/events*` → `7_items.js`.

- 같은 주소에서 `/api/*`는 Worker, 나머지는 `web/dist`의 화면 파일이다.
- 로그인은 쿠키 세션(`credentials: 'same-origin'`). 401이면 화면은 로그인 화면으로 간다.
- 시각은 `schema.sql` 머리말대로 **ISO 8601 + `+09:00`**(예: `2026-11-13T15:00:00+09:00`), 종일 일정은 **날짜만**(`2026-11-13`). 모르는 값은 `null`(팝업 칸만 `'?'`). 응답은 JSON.
- 캘린더(ICS) 주소는 비밀값이라 서버가 화면에 원문을 돌려주지 않는다(끝 4자만 보이는 `masked`).

## 1_login (서버 세션) — 있음 (`worker/1_login.js`)

| 요청 | 보냄 | 받음 |
| --- | --- | --- |
| `GET /api/login?next=/` | 화면이 이 주소로 **이동**한다 | 구글 로그인 뒤 `next`로 돌아온다. 실패하면 `/?login_error=denied·state·google·email·config` |
| `GET /api/login/me` | — | `{ ok, user: { id, email, name, dept, year }, needsSetup }` · 로그인 전 401 |
| `PUT /api/login/me` | `{ dept, year }` (둘 다 있어야 한다, 학년 1~8) | `{ ok, user, needsSetup }` |
| `POST /api/login/logout` | — | `{ ok }` |

- `needsSetup`은 학과·학년이 비었을 때 true. 첫 설정을 건너뛰면 화면이 이 기기(localStorage)에 적어 두고 다시 띄우지 않는다.
- 쓰기 요청은 같은 사이트에서 온 것만 받는다(`Origin` 확인).

## 2_collect_ics (서버 세션) — 있음 (`worker/2_collect_ics.js`)

| 요청 | 보냄 | 받음 |
| --- | --- | --- |
| `GET /api/feeds` | — | `{ ok, feeds: [{ kind, set: false } 또는 { kind, set: true, hint, count, okAt, triedAt, error }] }` |
| `PUT /api/feeds` | `{ etl?, google?, apple? }` 글 = 저장, `""`·`null` = 지우기, 칸이 없으면 그대로 | `{ ok, results, feeds }` 저장한 칸은 바로 한 번 받아 본다 |

- 주소 원문은 돌려주지 않는다(`hint` = 끝 4자). 칸마다 아는 모양만 받는다([캘린더 주소 찾기](../docs/tachyon/캘린더_주소_찾기.md)). 화면도 같은 규칙으로 먼저 거르고, 서버가 거절한 까닭(`error`)은 칸 아래에 그대로 보인다.
- 결과 줄: eTL은 '과제 N개를 찾았어요', 나머지는 '일정 N개를 찾았어요', 실패는 '이 주소로 읽지 못했어요 (까닭)', 아직이면 '받는 중이에요'.

## 7_items (서버 세션) — 있음 (`worker/7_items.js`)

| 요청 | 보냄 | 받음 |
| --- | --- | --- |
| `GET /api/tasks` | — | `{ tasks: [{ id, title, due, minutes, ready, done, source, slack_days? }], warning }` 안 끝낸 할 일을 여유 적은 순(AI 세션 `4_night.js` 순서)으로, `warning` = 몰린 주 경고 한 줄 또는 null |
| `PATCH /api/tasks/:id` | `{ done, minutes, ready, title, due }` 가운데 바꿀 것 | `{ task }` |
| `GET /api/events?from=2026-11-09&to=2026-11-16` | 한국 날짜, `to`는 빼고 센다(최대 62일) | `{ events }` 그 기간과 겹치는 일정 |
| `PATCH /api/events/:id` | `{ important, title, start, end, place }` 가운데 바꿀 것 (시각을 모르면 `start`는 날짜만, `end`는 null) | `{ event }` |

```js
// event (schema.sql events 그대로)
{ id, title, start /* '…T15:00:00+09:00' 또는 종일이면 '2026-11-13' */, end /* 모르면 null, 종일이면 다음 날 날짜 */, place /* null */,
  source /* 'etl'|'google'|'apple'|'device'|'memo'|'timetable'|'kakao' */, important /* 0|1 */ }
```

- 대시보드 '할 일 3개' = `tasks` 앞 3개, `warning`은 할 일 카드 머리에 그대로. 메뉴의 '할 일 전체', 달력 맨 위 마감 줄도 같은 목록. 체크하거나 고친 뒤에는 다시 불러 순서를 새로 받는다.
- 화면 표시: `minutes` null이면 '시간 ?', `ready` 0이면 '수업·자료 뒤'(1은 `minutes`가 있을 때만 '지금 가능'), `slack_days`가 오면 '여유 N일'·음수면 '시간 모자람'.
- eTL·구글·애플에서 온 것은 그 캘린더가 원본이라 이름·시간·장소·마감 고치기를 서버가 막는다(409). 화면도 그런 항목은 고치기 칸을 잠그고, 일정은 '중요' 표시만, 할 일은 걸리는 시간만 고치게 한다.
- 종일 일정은 달력 맨 위 줄에 그린다.

## 4_night (AI 세션) — 있음, 화면은 아직 안 씀

- `GET /api/briefing` → 아침 브리핑 카드(2단계 화면), `GET /api/briefing/rank` → 할 일 여유 순(대시보드는 위 `/api/tasks`로 같은 순서를 받는다), `POST /api/briefing/run`.

## 3_memo_popup (AI 세션) — 있음

| 요청 | 보냄 | 받음 |
| --- | --- | --- |
| `GET /api/memo?limit=50` | — | `{ memos: [{ id, text, created_at, handled, event_id, … }] }` 오래된 것부터. `event_id`가 있으면 '달력에 넣었어요' |
| `POST /api/memo` | `{ text }` | `{ memo, popup }` · `popup` = `null`(일정 아님) 또는 `{ title, date, time, end_time, place, by }` |
| `POST /api/memo/:id/save` | `{ title, date, time, end_time, place, suggested }` · `suggested` = 받았던 popup 그대로 | `{ event }` |
| `POST /api/memo/:id/cancel` | — | `{ ok }` · 메모는 남고 밤 정리가 읽는다 |

- 모르는 칸은 `'?'`, 화면도 '?'로 보인다. 예: `내일 3시 301동 스터디` → `{ title: '스터디', date: '2026-11-10', time: '15:00', end_time: '?', place: '301동', by: 'ai' }`.
- 저장할 때 이름·날짜는 꼭 있어야 한다(없으면 400). 그래서 화면은 이름이나 날짜가 '?'면 '저장' 대신 고치기 칸부터 연다. 시각이 '?'면 종일 일정으로 저장된다.
- 고쳤는지는 서버가 `suggested`와 견줘 `log`에 남긴다(팝업 정확도). 응답이 2.5초까지 걸릴 수 있어 화면은 메모를 먼저 붙이고 '살펴보는 중…'을 보인다.
- 아직 화면에 없는 것: `DELETE /api/memo/:id`, 더 오래된 메모 불러오기(`before`).

## 6_feedback (서버 세션) — 바람

| 요청 | 보냄 | 받음 |
| --- | --- | --- |
| `POST /api/feedback` | `{ kind, text, screen, device, at }` · kind = `'bug'`(버그) / `'inconvenience'`(불편) / `'idea'`(추가) | `{ ok }` → GitHub 이슈(라벨 + 화면 이름·시각·기기) |
| `POST /api/feedback/error` | `{ message, stack, screen, device, at }` | 204. 화면은 같은 오류를 한 번만 보낸다. 서버도 같은 오류는 이슈 하나로 |

`device` 예: `Android · 홈 화면 앱 · 412×915` (이름·이메일 없음). `at`은 `+09:00`.

## 아직 화면이 없는 것 (2단계)

- 아침 브리핑 카드: `GET /api/briefing` (AI, 있음).
- 시간표 사진: `POST /api/timetable` → 확인 팝업 → `POST /api/timetable/save` / `cancel` (AI, 있음).

## 빌드·배포

- `wrangler.toml`의 `[build]`가 `wrangler dev`·`wrangler deploy` 때마다 `web/`을 빌드하고, `[assets]`가 `web/dist`를 내보낸다. `/api/*`는 늘 Worker가 먼저 받고(`run_worker_first`), 그 밖의 없는 주소는 `index.html`(한 페이지 앱).
- `web/public/_headers`가 `dist`로 들어간다: `sw.js`·`index.html`은 `no-cache`, `/assets/*`는 1년.
- 서비스 워커(`web/public/sw.js`)는 `/api/*`를 저장하지 않는다.
- 화면만 고칠 때: `npm --prefix web run dev`(5173, `/api`는 `wrangler dev`의 8787로 넘긴다).
