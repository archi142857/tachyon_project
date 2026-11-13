# 화면(web/)이 부르는 API

화면이 서버에 보내는 것은 모두 [`src/api.js`](src/api.js) 한 파일에 있다. 이 문서는 그 목록이다. **있음**은 이미 main에 올라온 것, **바람**은 화면 세션이 바라는 모양이라 맡은 세션이 정하면 이 문서와 `api.js`를 같이 고친다.

주소 길 나눔(`worker/index.js`): `/api/login*` → `worker/1_login.js`, `/api/feeds*` → `2_collect_ics.js`, `/api/memo*` → `3_memo_popup.js`, `/api/briefing*` → `4_night.js`, `/api/timetable*` → `5_timetable_photo.js`, `/api/feedback*` → `6_feedback.js`, `/api/tasks*`·`/api/events*` → `7_items.js`.

- 같은 주소에서 `/api/*`는 Worker, 나머지는 `web/dist`의 화면 파일이다.
- 로그인은 쿠키 세션(`credentials: 'same-origin'`). 401이면 화면은 로그인 화면으로 간다.
- 시각은 `schema.sql` 머리말대로 **ISO 8601 + `+09:00`**(예: `2026-11-13T15:00:00+09:00`), 종일 일정은 **날짜만**(`2026-11-13`). 모르는 값은 `null`(팝업 칸만 `'?'`). 응답은 JSON.
- 캘린더(ICS) 주소는 비밀값이라 서버가 화면에 원문을 돌려주지 않는다(끝 4자만 보이는 `masked`).
- 서버 저장소(D1) 쪽 사정이면 어느 API든 **503 `{ error, code }`**: `code` `db_limit`(무료 하루 읽기·쓰기 한도, 한국 09:00에 풀림) · `db_busy`(잠깐 바쁨). `error`는 그대로 보여 줘도 되는 한국어 안내다(11-12, 서버). `/api/health`도 이 Worker가 10분 안에 한도 오류를 봤으면 503 `{ ok: false, problem: 'limit', seen }`(한도 날엔 작은 읽기는 지나가기도 해서).
- **화면(11-12, 서버 쪽지 1104):** 503이면 `error` 글을 그대로 보이고 `code`는 `error.code`로 넘긴다(`api.js` `call` — 저장소 사정 `db_limit`·`db_busy`, 같이 쓰기·eTL 준비 중). 그 밖의 5xx는 '잠깐 문제가 생겼어요…' 한 줄. `db_limit`은 로그인 화면·스낵바·창 어디서나 '오늘 서버 사용량을 모두 소진했어요. 오전 9시부터 다시 이용할 수 있어요'(사람 11-13 00:06이 고른 문구, `DB_LIMIT_TEXT`). 로그인 화면: `?login_error=db_limit` → 같은 글, `server` → '서버에 잠깐 문제가 있어요. 잠시 뒤에 다시 해 주세요', 처음 열 때 `/api/login/me`가 503 + `code`면 서버 안내 글. eTL 창의 '준비 중' 글은 `code`가 없는 503에만.

## 1_login (서버 세션) — 있음 (`worker/1_login.js`)

| 요청 | 보냄 | 받음 |
| --- | --- | --- |
| `GET /api/login?next=/` | 화면이 이 주소로 **이동**한다 | 구글 로그인 뒤 `next`로 돌아온다. 실패하면 `/?login_error=denied·state·google·email·config·db_limit·server`(뒤 둘은 DB 실패, 11-12) |
| `GET /api/login/me` | — | `{ ok, user: { id, email, name, dept, year }, needsSetup }` · 로그인 전 401 |
| `PUT /api/login/me` | `{ dept, year }` (둘 다 있어야 한다, 학년 1~8) | `{ ok, user, needsSetup }` |
| `DELETE /api/login/me` | `{ confirm: true }` (없으면 400) | `{ ok }` + 로그인 쿠키 지움. 내 자료를 모두 지운다 → 화면은 로그인 화면에 '계정과 내 자료를 모두 지웠어요'. 메뉴 맨 끝 '계정 지우기' 창과 다시 연 설정 맨 아래, 두 번 눌러야 지움 |
| `POST /api/login/logout` | — | `{ ok }` |

- `needsSetup`은 학과·학년이 비었을 때 true. 첫 설정을 건너뛰면 화면이 이 기기(localStorage)에 적어 두고 다시 띄우지 않는다.
- 화면은 11-11부터 **학번**(입학 연도)을 목록에서 고르게 하고, 보낼 때 이번 학년도 기준 학년으로 셈해 `year`에 넣는다(26학번 = 1, '19학번 이전' = 8, 학년도는 3월에 바뀜 — `web/src/setup.js` `gradeOf`·`entryOf`). 학과는 `web/src/departments.json` 목록에서 찾아 고르거나 쓴 그대로(컨셉, 사람 요청).
- 쓰기 요청은 같은 사이트에서 온 것만 받는다(`Origin` 확인).
- 쓰는 도중 어느 요청이든 401이 오면(쿠키 30일 끝) 화면 전체가 로그인으로 가고 '로그인이 끝났어요. 다시 로그인해 주세요'. 처음 열 때 서버에 닿지 않으면 로그인 화면에 '서버에 닿지 않아요…'(로그인 전 401과 구분).

## 2_collect_ics (서버 세션) — 있음 (`worker/2_collect_ics.js`)

| 요청 | 보냄 | 받음 |
| --- | --- | --- |
| `GET /api/feeds` | — | `{ ok, feeds: [{ kind, set: false } 또는 { kind, set: true, hint, count, okAt, triedAt, error, stopped }] }` |
| `PUT /api/feeds` | `{ etl?, google?, apple?, naver? }` 글 = 저장, `""`·`null` = 지우기, 칸이 없으면 그대로. `naver`만 글이 아니라 `{ id, password }`(네이버 아이디 + 애플리케이션 비밀번호, CalDAV로 읽기만 — 11-13 컨셉) | `{ ok, results, feeds }` 저장한 칸은 바로 한 번 받아 본다 |
| `POST /api/feeds/collect` | — | `{ ok, results, feeds }` 저장된 주소를 지금 다시 받는다(멈춘 주소도 한 번 더). 메뉴에서 다시 연 설정의 '지금 다시 받기' |
| `POST /api/feeds/device` | `{ events: [{ id, title, start, end, allDay, place }] }` (start·end는 ms) | `{ ok, count, same, unchanged? }` 안드로이드 앱이 읽은 폰 캘린더를 통째로 올린다(`native.js`). 빠진 것은 지우고, 다른 캘린더와 이름·시작이 같은 것은 뺀다(same). 6시간 안에 같은 목록이 다시 오면 DB에 넣지 않고 지난 결과에 `unchanged: true`(11-12). 온 일정은 `source: 'device'`, 고칠 수 없음 |

```js
// results[] 한 칸 (PUT·collect)
{ kind, ok, saved /* false = 저장 안 됨 */, tasks, events, count, same /* 지난번과 같음 */, error, removed }
```

- 주소 원문은 돌려주지 않는다(`hint` = 끝 4자). 칸마다 아는 모양만 받는다([캘린더 주소 찾기](../docs/tachyon/캘린더_주소_찾기.md)). 화면도 같은 규칙으로 먼저 거르고, 서버가 거절한 까닭(`error`)은 칸 아래에 그대로 보인다.
- 저장 바로 뒤 칸 아래 한 줄(`results`): eTL은 '과제 N개를 찾았어요'(일정도 있으면 ', 일정 N개'), 구글·애플은 '일정 N개를 찾았어요'. `ok: false`면 서버 문장 그대로(잠깐의 오류면 '…저장해 두고 15분 뒤에 다시 받아요').
- `saved: false`(모양이 틀리거나 이미 안 열리는 주소)는 저장이 안 된 것이라 그 칸의 오류로 보이고, 붙인 주소를 지우지 않고 남겨 고치게 한다. 첫 설정은 그 자리에서 머물고 [그대로 두고 넘어가기]를 준다.
- 메뉴에서 다시 열면 `feeds`의 지금 상태 한 줄: 'eTL 항목 N개를 받았어요'·'일정 N개를 받았어요'·'받는 중이에요', `error`는 그대로(`stopped`면 '…다시 복사해 붙여 주세요' 문장이 들어 있다).

## 7_items (서버 세션) — 있음 (`worker/7_items.js`)

| 요청 | 보냄 | 받음 |
| --- | --- | --- |
| `GET /api/tasks` | `?limit=3`(없으면 200개까지) | `{ tasks: [{ id, title, due, minutes, ready, done, source, days_left, slack_days }], warning }` 안 끝낸 할 일을 여유 적은 순(AI 세션 `4_night.js` 순서)으로, `warning` = 몰린 주 경고 한 줄 또는 null |
| `PATCH /api/tasks/:id` | `{ done, minutes, ready, title, due }` 가운데 바꿀 것 (`done`·`ready`는 true·false 또는 1·0, `minutes`는 1~1440 정수) | `{ task }` |
| `DELETE /api/tasks/:id` | — | `{ ok }` 메모·시간표에서 온 것만(캘린더에서 온 것은 409) |
| `GET /api/events?from=2026-11-09&to=2026-11-16` | 한국 날짜, `to`는 빼고 센다(최대 62일) | `{ events }` 그 기간과 겹치는 일정 |
| `PATCH /api/events/:id` | `{ important, title, start, end, place }` 가운데 바꿀 것 (시각을 모르면 `start`는 날짜만, `end`는 null) | `{ event }` 캘린더에서 온 일정의 이름·시간·장소를 바꾸면 **새 id의 사본**(`source` memo, `edited` 1)이 오고 원본은 가려진다 → 고친 뒤 목록을 다시 부른다. **시각 일정의 끝이 없으면(안 보냄·null, 시작을 옛 끝 뒤로 옮김, 종일 → 시각) 끝 = 시작 + 1시간**(11-13). 보낸 `end`가 `start`보다 앞이면 400. 끌어 옮기기는 `{ start, end }`를 놓을 때 한 번 — 쓰기 4~6줄 |
| `DELETE /api/events/:id` | — | `{ ok }` 메모·시간표에서 온 것과 고친 사본만(캘린더에서 온 것은 409). 고친 사본을 지우면 원본이 다시 보인다 |

```js
// event (schema.sql events 그대로)
{ id, title, start /* '…T15:00:00+09:00' 또는 종일이면 '2026-11-13' */, end /* 모르면 null, 종일이면 다음 날 날짜 */, place /* null */,
  source /* 'etl'|'google'|'apple'|'device'|'memo'|'timetable'|'kakao' */, important /* 0|1 */,
  edited /* 1 = 캘린더에서 온 일정을 여기서 고친 사본 */ }
```

- 대시보드 '할 일 3개' = `tasks` 앞 3개, `warning`은 할 일 카드 머리에 그대로. 메뉴의 '할 일 전체', 달력 맨 위 마감 줄도 같은 목록. 체크하거나 고친 뒤에는 다시 불러 순서를 새로 받는다.
- 화면 표시: `minutes` null이면 '시간 ?', `ready` 0이면 '수업·자료 뒤'(1은 `minutes`가 있을 때만 '지금 가능'), `slack_days`(소수)는 내림해서 '여유 N일', 1 미만은 '빠듯', 음수는 '시간 모자람'. 폰의 할 일 카드는 좁아서 마감·지금 가능만, '할 일 전체' 창과 PC는 걸리는 시간·여유까지.
- eTL·구글·애플·폰 캘린더에서 온 **일정**도 이름·시간·장소를 고칠 수 있다(11-10). 서버는 원본을 건드리지 않고 고친 사본(`source` memo, `ext_id` 'edit:<원본 id>')을 넣고 원본을 가린다(`moved_to`). Tachyon 안에서만 바뀌고 그 캘린더는 그대로다. 사본을 지우면 원본이 다시 보인다. 화면은 고치는 창에 이 말을 적고, 칸을 안 바꿨으면 `important`만 보낸다(사본을 안 만들게).
- 캘린더에서 온 **할 일**은 그대로 잠금: 제목·마감 고치기를 서버가 막고(409) 화면은 걸리는 시간과 '수업·자료 뒤'(ready)만 고치게 한다.
- 종일 일정은 달력 맨 위 줄에 그린다.
- 지우기: 고치는 창의 [지우기] → [한 번 더 누르면 지워요]. 캘린더에서 온 것은 버튼이 없다. 고치기·지우기가 실패하면(400·409) 서버 문장을 창 안에 보인다.

## 8_calendar_feed (서버 세션) — 있음 (`worker/8_calendar_feed.js`)

| 요청 | 보냄 | 받음 |
| --- | --- | --- |
| `GET /api/calendar` | — | `{ ok, url, webcal }` 내 구독 주소(사람마다 다른 비밀 주소) |
| `GET /api/calendar/items` | — | `{ ok, items: [{ key, title, start, end, allDay, place }] }` 구독 주소와 같은 줄을 ms 시각으로(종일은 UTC 자정, 끝 시각이 없으면 start와 같음). 안드로이드 앱이 폰 'Tachyon' 캘린더를 맞출 때(`native.js`, 11-10 컨셉) |

- 메뉴 '폰 달력에서 보기' 창: 주소 칸(읽기만) + [주소 복사] + [구글 캘린더](`calendar.google.com/calendar/r?cid=` — 구글 캘린더 웹이 추가할지 묻는다) + [폰 달력에 추가](`webcal://`, 아이폰은 구독 창이 뜬다). 안드로이드 앱에서는 맨 위에 '이 폰 캘린더에 바로 넣기'(켜기·지금 맞추기·끄기)가 있고 webcal 단추는 없다(11-10 컨셉).
- 들어가는 것: 메모·시간표·eTL 일정 + 안 끝낸 할 일 마감. 구글·애플·기기 일정은 이미 폰에 있어서 뺀다(서버 규칙).
- 주소는 화면에만 보이고 로그·오류 보고·스크린샷 어디에도 남기지 않는다.

## 4_night (AI 세션) — 있음, 화면은 아직 안 씀

- `GET /api/briefing` → 아침 브리핑 카드(2단계 화면), `GET /api/briefing/rank` → 할 일 여유 순(대시보드는 위 `/api/tasks`로 같은 순서를 받는다), `POST /api/briefing/run`.
- 카드 모양: `{ date, made_at, by, events, top3, postpone, warning, today: { event_min, task_min, extra_min, over_min }, new_tasks }`. `today`는 아래 날마다 몫의 오늘 칸과 같은 셈이다(11-11).

### 지금 정리 — 밤 01:30까지 기다리지 않고 (11-13, 사람 피드백 '할 일 바로 정리')

| 요청 | 보냄 | 받음 |
| --- | --- | --- |
| `POST /api/briefing/now` | `{}` | **정리 보기** `{ plan: { memos: [{ id, text, task, title, due, minutes, ready, answered }], tasks: [{ id, title, due, minutes, ready }] }, summary }` — 아무것도 안 바꾼다(log만). 10분에 5번까지(429). 정리할 게 없으면 AI 없이 `plan` 빈 칸 + `summary` '정리할 메모가 없어요'. AI 없음 503, AI 실패 502(`error` 글을 그대로 보이면 된다) |
| `POST /api/briefing/now` | `{ apply: plan }` | **이대로 정리하기** `{ briefing, applied: { memos, tasks, minutes }, summary }` — 받은 안을 넣고 오늘 브리핑 카드를 새로 만든다(`by: 'now'`). AI는 다시 안 부른다 |

- 규칙은 밤 정리와 같다(`prompts/night.js`, Sonnet 한 번에 아직 정리 안 한 메모 40개·걸리는 시간이 빈 할 일 40개까지). `task: false`인 메모는 '그냥 메모'로 정리됐다고 표시만 한다(할 일 안 만듦). `answered: false`(AI가 답 안 한 메모)는 넣어도 그대로 남아 밤에 다시 읽는다.
- `due`: 메모에 쓴 날짜 말(쓴 때 기준)이 먼저, 없으면 AI 어림, 그것도 없으면 `null`. 모양은 `YYYY-MM-DD` 또는 `YYYY-MM-DDTHH:MM:SS+09:00`. `ready`: `now` = 지금 가능, `after` = 수업·자료 뒤.
- 화면은 `plan`에서 빼거나(그 줄을 안 보내면 그 메모는 그대로 남음) `title`·`due`·`minutes`를 고쳐 보낼 수 있다. 그사이 팝업으로 넣은 메모·이미 시간이 찬 할 일은 건너뛴다. 같은 안을 두 번 보내도 할 일은 한 번만 생긴다(ext_id `memo:<id>`).
- `summary` 예: '메모 2개 → 할 일 1개 · 그냥 메모 1개 · 걸리는 시간 1개 어림'.
- **화면(11-13, `TidySheet.jsx`):** 메모 카드 머리 '지금 정리'(오늘 쪽 메모 위젯 · 메모 쪽) → 창을 열면 정리 보기 → 줄마다 체크(뺀 줄은 안 보냄) → '이대로 정리하기' → 스낵바에 `summary`, 메모 · 할 일을 다시 부른다. 오류는 서버 문장 그대로. 예시 모드는 규칙으로 흉내(`example.js` `exampleTidy`).

### 날마다 몫 — 밀도 고리·주 '고르게' 줄 (11-11, 사람 요청 "날마다 밀도 고리 + 주간 밀도가 고르게")

| 요청 | 보냄 | 받음 |
| --- | --- | --- |
| `GET /api/briefing/plan?days=42` | — | `{ ok, awake: { from: '07:00', minutes: 1020 }, daily_min, guessed, warning, days: [{ date, event_min, room_min, task_min, extra_min, over_min, cram_min, items: [{ task_id, min }] }] }` 오늘부터 `days`일(1~42, 기본 42) |

- **규칙 하나(`4_night.js` `planDays`)**: 할 일 여유 순(`/api/tasks`·`/api/briefing/rank`), 몰린 주 `warning`, 브리핑의 할 일 3개·미룰 것·`today`가 모두 이 셈을 쓴다. 화면은 이 값을 그리기만 한다(화면 셈 `density.js`는 없어도 된다).
  - 하루 = 깨어 있는 7시~24시(`awake.minutes` 1020분). 오늘은 지금부터. `room_min` = 그 시간 − 시각 일정(겹침은 한 번만, 하루 종일 일정은 안 셈). `event_min` = 그날 7시~24시의 시각 일정.
  - 할 일은 마감이 이른 것부터 오늘 ~ 마지막 날에 15분씩, **가장 덜 찬 날(일정 + 나눈 할 일)부터** 나눈다. 마지막 날 = 정오 이후 마감이면 마감 날, 정오 전이면 전날. 날짜만 있는 마감은 그날 23:59, 지난 할 일은 오늘, 마감 없는 일은 2주 안. 걸리는 시간을 모르면 1시간(`guessed` = 그렇게 센 수).
  - `task_min` = 하루 편한 몫(`daily_min`, 기본 180분 — 빈 시간이 더 적으면 빈 시간) 안에서 나눈 할 일. `extra_min` = 편한 몫이 모자라 빈 시간까지 더 넣은 몫(빠듯). `over_min` = 빈 시간도 모자라 마지막 날에 넘친 몫. `cram_min` = 견주기용, 마지막 날에 몰아서 할 때의 할 일.
  - `items` = 그날 나뉜 할 일과 분(`task_id`는 `/api/tasks`의 `id`).
- **그리는 법(제안)**: 고리 한 바퀴 = `awake.minutes`. 일정 `event_min`, 할 일 `task_min`, 빠듯 `extra_min`(다른 색), 넘치면(`over_min > 0`) 붉은 테. 주 '고르게' 줄 = 날마다 `event_min + task_min + extra_min + over_min` 막대와 평균선, 옅은 테두리 = `event_min + cram_min`(몰아서 할 때).
- 여유(`slack_days`) = 마지막 날까지 편한 몫의 합 − 그 마감까지 할 양(앞 마감 것 포함), 하루 편한 몫 단위. 0보다 작으면 그 마감 앞의 날들에 `extra_min`·`over_min`이 생기고 `warning`이 '… 하루 3시간으로는 약 N시간 모자라요'가 된다.

## 3_memo_popup (AI 세션) — 있음

| 요청 | 보냄 | 받음 |
| --- | --- | --- |
| `GET /api/memo?limit=50` | — | `{ memos: [{ id, text, created_at, handled, event_id, task_id }] }` 오래된 것부터. `event_id`가 있으면 '달력에 넣었어요', `task_id`(밤 정리)면 '할 일에 넣었어요' |
| `POST /api/memo` | `{ text }` | `{ memo, popup }` · `popup` = `null`(그냥 메모), 일정 `{ title, date, time, end_time, place, by, guessed? }`, 할 일 `{ kind: 'task', title, date, time, by }`(마감, 모르면 `'?'`, 11-10) |
| `POST /api/memo/:id/save` | `{ title, date, time, end_time, place, suggested, change_id?, repeat? }` · `suggested` = 받았던 popup 그대로, `change_id` = 옮길 일정(`popup.change.id`, 주면 그 일정은 달력에서 가려진다), `repeat: true` = 매주 넣기(`popup.repeat`가 있을 때 체크 칸을 켠 채 저장). 할 일은 `{ kind: 'task', title, date, time, suggested }` | `{ event }`(매주로 넣었으면 `{ event: 첫 주 일정, repeat: 넣은 횟수 }`) · 할 일은 `{ task }`(tasks source `memo`, 마감 날짜만 있으면 23:59, 없으면 마감 없음) |
| `POST /api/memo/:id/cancel` | `{ kind? }` | `{ ok }` · 일정 팝업: 메모는 남고 밤 정리가 읽는다. 할 일 팝업(`kind: 'task'`, 화면 '메모로만'): 메모로만 남고 밤 정리도 할 일로 안 만든다 |

- 날짜·시각 말이 없어도 지난 일(~했다)·한 글자가 아니면 AI가 일정·할 일·그냥 메모를 가린다(AI가 없거나 실패하면 규칙: '-기'·'할 것'·'해야 함'·제출·신청·전화… 끝말, 마감 말 '까지'). 화면은 할 일이면 '할 일로 넣을까요?'(넣기·고치기·메모로만).
- 모르는 칸은 `'?'`, 화면도 '?'로 보인다. 예: `내일 3시 301동 스터디` → `{ title: '스터디', date: '2026-11-10', time: '15:00', end_time: '?', place: '301동', by: 'ai' }`.
- 시각 없이 시간대만 쓴 일정 메모(`12일 늦은 밤에 회의`)는 서버가 그날 내 일정을 읽어 그 시간대의 비어 있는 1시간을 `time`·`end_time`에 넣고 `popup.free`(= '늦은 밤')를 붙인다(11-11, AI 없이 `lib/known.js` `suggestFree`). 화면은 '‘늦은 밤’에서 비어 있는 시간으로 골랐어요' 한 줄. 빈 1시간이 없거나 시간대 말이 없으면 지금처럼 `'?'`(종일). 시간대: 아침 8~10 · 오전 9~12 · 점심 12~14 · 낮 13~17 · 오후 13~18 · 저녁 18~21 · 밤 20~24 · 늦은 밤(밤늦게·심야) 22~24.
- 메모에 길이를 쓰면(`운동 2시간`, `1시간 반`, `40분`. '2시간 뒤'는 아님) 그 길이를 쓴다(11-11, `lib/known.js` `lengthOf`·`useLength`): 빈 시간 고르기는 그 길이로(1시간보다 길면 시작 뒤 1시간까지만 시간대 안이면 됨, 자정은 안 넘음), 시작 시각만 아는 일정은 `end_time` = 시작 + 길이, 이름에서 그 말은 뺀다. 안 쓰면 지금처럼 1시간 / 끝 `'?'`.
- 매주 메모(`매주 목요일 …`, `목요일마다 …`. 격주·'2주마다'·매일은 아님)는 `popup.repeat = { until: '2026-12-14' }`(학기 끝, 시간표와 같은 `semesterEnd`)가 붙는다(11-11). 화면은 '매주 같은 요일·시간으로 12월 14일(학기 끝)까지 넣어요' 체크 칸(끌 수 있음)을 보이고, 켠 채 저장하면 `repeat: true`를 보낸다. 서버는 그날부터 학기 끝까지 주마다 일정을 한 줄씩 넣는다(`ext_id` 첫 주 `memo:<id>`, 다음부터 `memo:<id>:w1` …). 묶음은 따로 없어서 지우기·고치기는 하나씩이고, 빈 시간 확인은 첫 주만 한다.
- 저장할 때 이름·날짜는 꼭 있어야 한다(없으면 400). 그래서 화면은 이름이나 날짜가 '?'면 '저장' 대신 고치기 칸부터 연다. 시각이 '?'면 종일 일정으로 저장된다.
- **끝을 안 정한 일정은 1시간(11-13 사람 요청):** 시각이 있고 끝을 안 썼으면 `end_time` = 시작 + 1시간(자정 앞에서는 23:59)으로 채워 온다. 끝 없이 저장해도 서버가 시작 + 1시간으로 넣는다(자정을 넘으면 다음 날).
- **추천 칸 `popup.guessed`(11-13, 사람 피드백 5 '추천/고르기 명확하게'):** 사람이 쓰지 않았는데 서버가 채운 칸의 이름 배열(`'date'`·`'time'`·`'end_time'`·`'place'`, 없으면 칸 자체가 없음). `date` = 날짜 말 없이 시각만 써서 오늘·내일로 짐작, `time`·`end_time` = 빈 시간에 넣어 봄(`free`)·내 일정에서 가져옴(`from`)·1시간 끝, `place` = 내 일정에서 가져옴. 쓴 길이('2시간')로 낸 끝은 정한 것. 화면은 이 칸을 추천처럼(점선·연하게 — 디자인 규칙), 나머지는 정한 것처럼 보이면 된다. 사람이 그 칸을 고치거나 그대로 저장하면 정한 것이 된다(저장할 때 `guessed`는 안 보내도 된다).
- 고쳤는지는 서버가 `suggested`와 견줘 `log`에 남긴다(팝업 정확도). 응답이 2.5초까지 걸릴 수 있어 화면은 메모를 먼저 붙이고 '살펴보는 중…'을 보인다.
- 아직 화면에 없는 것: `DELETE /api/memo/:id`, 더 오래된 메모 불러오기(`before`).

## 6_feedback (서버 세션) — 있음 (`worker/6_feedback.js`)

| 요청 | 보냄 | 받음 |
| --- | --- | --- |
| `POST /api/feedback` | `{ kind, text, screen }` · kind = `'bug'`(버그) / `'pain'`(불편) / `'idea'`(추가) | `{ ok, issue, url }` → GitHub 이슈(종류·화면·시각·기기·'사용자 #번호'). 한 사람 하루 20개 |
| `POST /api/feedback/error` | `{ message, stack, screen }` (로그인 없어도 됨) | `{ ok, issue, duplicate }` 같은 오류는 이슈 하나 |

- 시각·기기(User-Agent)는 서버가 붙인다. 화면은 `screen` 뒤에 `· Android · 홈 화면 앱 · 412×915`처럼 앱 모양·화면 크기를 붙인다(이름·이메일 없음).
- 서버가 이메일·전화번호·긴 숫자·주소(URL)를 지우고 올린다. 화면에도 '개인 정보는 쓰지 마세요'를 붙였다(저장소를 공개하면 누구나 본다).
- 4xx(하루 한도 등)는 서버 문장을 창 안에 그대로, 연결 끊김은 '보내지 못했어요. 잠시 뒤에 다시 해 주세요'. `GITHUB_TOKEN`이 없으면 서버는 이슈 없이 `log`에만 남긴다.
- 모든 요청 공통(`api.js`): 5xx는 서버가 스스로 보고하므로 화면은 '잠깐 문제가 생겼어요. 잠시 뒤에 다시 해 주세요'만, 4xx는 서버 문장(`error`) 그대로.
- 화면 오류는 `main.jsx`가 `error`·`unhandledrejection`을 받아 보낸다. 한 번 열었을 때 같은 메시지는 한 번만, 다 합쳐 5개까지, 실패해도 다시 보내지 않는다.

## 9_etl (컨셉 세션, 11-10) — `worker/9_etl.js`, 화면은 메뉴 'eTL 연결·강의자료'(`EtlSheet.jsx`)·'TT Wizard 시간표'(`TtwSheet.jsx`, 11-11)

| 요청 | 보냄 | 받음 |
| --- | --- | --- |
| `GET /api/etl` | | `{ ok, connected, last_ok_at, last_error, dead, counts: { notice, file } }` (토큰은 안 돌려줌) |
| `PUT /api/etl` | `{ token }` | 짧거나 띄어쓰기 있는 글(비밀번호 모양)은 400으로 eTL에 보내지도 않음. eTL `/users/self`가 받으면 저장하고 바로 한 번 받음 → 위 상태 + `result { ok, courses, tasks, notices, files, calendar, classes, ai }`(classes = 수강편람에서 시간표를 찾은 과목 수) |
| `DELETE /api/etl` | | `{ ok, connected: false }` — 토큰·목록·과목 일정 지움(eTL ICS 주소가 없으면 과제도) |
| `POST /api/etl/collect` | | 위 상태 + `result`(1분 안에 받았으면 `{ ok, recent: true }`) |
| `GET /api/etl/items` | | `{ notices: [{ id, course, title, url, posted_at, tag }], files: [...] }` 새 것 먼저, 100개까지. tag = exam·cancel·makeup·none |
| `POST /api/etl/ttwizard` | `{ link, save? }` | TT Wizard 시간표 링크(`…#t=<글>`, `#ttw=`, 글만도 됨 — `worker/ttwizard.js`, 11-11 컨셉). `save` 없으면 살펴보기 `{ ok, sem, title, classes: [{ title, found, custom, times: [{ day: '월', start, end(분), place }] }], from, until, replaces }`, `save: true`면 오늘부터 학기 끝까지 매주 넣기 `{ ok, saved, classes, from, until }` — 시간표 사진과 같은 `source 'timetable'`(오늘부터의 시간표 줄과 앞으로의 eTL 수업 `api-class-`를 지우고 새로). 지금은 `2026-2` 학기만. 깨진 링크·다른 학기는 400 |
| `GET /api/etl/ttwizard` | | 앞으로 2주의 매주 수업(시간표·eTL 수업) → `{ ok, link, count, matched }` — TT Wizard에서 여는 주소(수강편람에서 이름·시각이 맞으면 강좌, 아니면 직접 넣은 일정). 수업이 없으면 404 |

- 원격 D1에 `etl`·`etl_items` 표가 아직 없으면 모두 503(화면: 'eTL 연결은 준비 중이에요').
- 수업 시간표는 events(source `etl`, ext_id `api-class-…`, 잠김, 이름 = 과목 이름, 장소 = '39동 409호') — 수업 사이 동선이 바로 쓴다. 과제는 tasks(source `etl`, ICS와 같은 줄), 공지에서 찾은 시험·휴강·보강은 events(source `notice` — 잠기지 않아 고치기·지우기 됨), 교수가 넣은 과목 일정은 events(source `etl`, ext_id `api-calendar-…`, 잠김).

## 10_together (서버 세션, 11-11) — 있음, 원격 D1에 표가 생기기 전에는 503 (`worker/10_together.js`)

친구 · 그룹 · 그룹별 모임 시간표(when2meet 모양). 모두 로그인 필요. **남에게는 빈/바쁨만** 간다(일정 이름·장소·출처·이메일은 안 보냄). 친구·그룹은 **초대 링크로만** 맺는다(이메일로 사람 찾기 없음). 표가 아직 없으면 모든 요청이 503 `'같이 쓰기를 준비 중이에요…'`.

| 요청 | 보냄 | 받음 |
| --- | --- | --- |
| `GET /api/together` | — | `{ ok, friends: [{ id, name }], groups: [{ id, name, owner, members }] }` (owner = 내가 방장, members = 인원) |
| `POST /api/together/invite` | — | 친구 초대 `{ ok, code, url, expiresAt }`. `url` = `<사이트>/?join=<code>`(7일, 여러 사람이 써도 됨). 카톡 등으로 보낸다. 한 사람이 살아 있는 링크 20개까지(429) |
| `GET /api/together/join/:code` | — | 미리 보기 `{ ok, kind: 'friend'\|'group', from: { name }, mine, group?: { name, members } }` · 없는 링크 404, 지난 링크 410 |
| `POST /api/together/join` | `{ code }` | `{ ok, kind: 'friend', friend: { id, name } }` 또는 `{ ok, kind: 'group', group: { id, name }, already? }` · 내 친구 링크 400, 그룹 30명·내 그룹 20개 넘으면 409 |
| `DELETE /api/together/friends/:id` | — | `{ ok }` 둘 다에서 끊김 · 친구 아니면 404 |
| `POST /api/together/groups` | `{ name }` (40자) | `{ ok, group: { id, name, owner: true, members: 1 } }` |
| `GET /api/together/groups/:id` | — | `{ ok, group: { id, name, owner }, members: [{ id, name, owner, me }], meets: [{ id, title, from, to, length, mine }] }` · 멤버가 아니면 404 |
| `PATCH /api/together/groups/:id` | `{ name }` | 방장만(403) |
| `POST /api/together/groups/:id/invite` | — | 그룹 초대 링크(멤버 누구나), 모양은 친구 초대와 같다 |
| `POST /api/together/groups/:id/members` | `{ friendId }` | 내 친구를 바로 넣기 `{ ok, member }` · 친구가 아니면 404(그 사람은 링크로) |
| `DELETE /api/together/groups/:id/members/me` | — | 나가기. 방장이 나가면 가장 먼저 들어온 멤버가 방장, 마지막 사람이면 그룹을 지움 |
| `DELETE /api/together/groups/:id/members/:userId` | — | 내보내기(방장만) |
| `POST /api/together/groups/:id/meets` | `{ title, from, to, dayStart, dayEnd, slot, length }` | 모임 시간표 만들기 `{ ok, meet }`. 날짜 `YYYY-MM-DD`(끝 날 포함, 14일까지, 다 지난 날짜는 안 됨), 하루 `'09:00'`~`'22:00'`(기본), `slot` 15·30·60분(기본 30), `length` 모임 길이(분, slot 단위, 기본 60) · 틀리면 400 + 알아듣는 문장 |
| `GET /api/together/meets/:id` | — | 아래 '모임 시간표 응답' |
| `GET /api/together/groups/:id/free?from=2026-11-16&days=7&start=08:00&end=24:00` | — | 내 달력에 겹쳐 그릴 '다 같이 빈 시간'(11-13). 기본 오늘부터 7일(14일까지), 08:00~24:00, 30분 칸. `{ ok, group: { id, name }, from, days, dayStart, dayEnd, slot: 30, members, known, slots: [{ start, free }], together: [{ start, end }] }` — `known` = 달력(시각 있는 일정)이 있어 셀 수 있는 사람, `free` = 그 칸이 빈 사람 수, `together` = `known` 모두가 빈 이어진 구간(같은 날 안). **사람 수만** 온다(이름·일정 없음). 바쁨 셈은 모임 시간표와 같다(시각 일정만, 끝 없으면 1시간). 멤버가 아니면 404, 틀린 값은 400. 읽기만 |
| `PUT /api/together/meets/:id/marks` | `{ marks: [{ start, state }] }` | 내 칸 칠하기. `state` `'free'`(된다)·`'busy'`(안 된다)·`null`(달력대로 되돌림), `start`는 응답 `slots[].start` 그대로 · 응답은 GET과 같음(바로 다시 그리면 됨) |
| `DELETE /api/together/meets/:id` | — | 만든 사람이나 방장만(`meet.canDelete`) |

**모임 시간표 응답:** `{ ok, meet: { id, groupId, group, title, from, to, dayStart, dayEnd, slot, length, canDelete }, members: [{ id, name, me, known }], known, unknown, slots: [{ start, free, who, me, mark }], best: [{ start, end, free, who }] }`

- `slots`는 시간 순(날짜마다 dayStart~dayEnd를 slot분씩). `free` = 그 칸에 되는 사람 수, `who` = 그 사람들 `id`(이름은 `members`에서), `me` = 내 칸 `'free'|'busy'`, `mark` = 내가 칠한 칸이면 `'free'|'busy'`, 아니면 `null`(달력대로).
- 빈/바쁨 정하기: 칠한 칸이 먼저. 안 칠한 칸은 그 사람 달력에 **시각이 있는** 일정이 겹치면 바쁨(종일 일정·마감은 바쁨 아님, 옮긴 일정은 뺌). 달력이 없는 사람(시각 있는 일정이 하나도 없음)은 when2meet처럼 **칠한 '된다' 칸만** 된다.
- `known: false` = 달력도 칠한 칸도 없는 사람(아직 모름). 셈에 안 들어간다 → 화면은 '아직 안 칠한 사람 N명'.
- `best` = 모임 길이만큼 같은 날 이어진 칸 가운데 처음부터 끝까지 되는 사람이 많은 순, 겹치지 않게 3개까지(시간 순으로 줌). 되는 사람이 0이면 없음.
- 칸 진하기는 `free / known`으로 그리면 된다(디자인 '같이' 쪽, 컨셉 11-11 22:27).
- **화면(11-13, 겹쳐 보기):** 주 달력에 `together` 구간을 띠로 그린다(`WeekCalendar.jsx`). 주를 넘기거나 내 일정이 다시 오면 그 주 `from`으로 다시 받는다(7일, 기본 08:00~24:00). `known < members`면 칩에 'n/m명'. 404면 겹쳐 보기를 끈다. 띠를 누르면 메모 하나를 보내고(`POST /api/memo`) 팝업 칸은 고른 시각 그대로, 받은 popup은 `suggested`로만 저장에 보낸다.
- **화면(11-11, `TogetherPage.jsx`·`MeetGrid.jsx`·`JoinSheet.jsx`):** 쪽 '같이' = 친구(초대 링크 복사·보내기, 끊기는 두 번) · 그룹(만들기, 멤버, 초대 링크, 친구 넣기, 나가기·내보내기는 두 번, 방장만 이름 바꾸기) · 모임 시간표(만들기 폼, 진하기 = `free / known`, 노란 점 = 내가 되는 칸, '보기'에서 칸을 누르면 되는 사람 이름, '내 칸 칠하기'에서 누르거나 끌어서 `PUT …/marks` 한 번, '달력대로 되돌리기'). 지난 칸은 옅게·칠하지 않고, 후보에 지난 시각이 섞이면 같은 규칙(`web/src/meet.js`)으로 지금부터 다시 고른다. 503이면 서버 문장만. `?join=<code>`는 로그인 전에 받아 두었다가(`sessionStorage`) 대시보드에서 '초대 받기' 창(미리 보기 → 받기, 404·410은 알아듣는 문장). 예시 모드는 `togetherExample.js`(지어낸 친구 둘·그룹·모임).

## 11_admin (서버 세션, 11-13) — 있음, 개발자만 (`worker/11_admin.js`)

사람 요청 11-13 01:03 '사용자 활동을 개발자가 보는 화면'. 화면은 메뉴 '개발자 보기'를 이 주소가 200일 때만 보인다.

| 주소 | 보냄 | 받음 |
|---|---|---|
| `GET /api/admin/summary?days=14` | days 1~30(오늘 포함, 기본 14) | 아래 합계. **개발자가 아니면(로그인 안 함 포함) 404**. 개발자 = 런타임 비밀값 `ADMIN_EMAILS`(쉼표로 이은 이메일)에 든 로그인 이메일, 값이 없으면 아무도 못 봄 · days가 틀리면 400 |

- 받음: `{ ok, from, to, days, activeUsers, daily: [{ day, users, newUsers, memos, actions }], actions: [{ action, total, days: { 'YYYY-MM-DD': n } }], popup: { memos, saved, edited, cancelled }, ai: { calls, failures, failuresByUse, input, output, costUsd, byModel: [{ model, use, calls, avgMs, input, output, costUsd }] }, collect: { ics: { ok, fail }, etl: { ok, fail }, device, night: { ok, fail } }, errors: { reports, feedback }, tables: { users, events, tasks, memos, log_about }, rowsRead }`
- `users`·`activeUsers` = 무엇이든 한 사람 수(Cron·밤 정리·AI 호출·오류 보고 줄은 빼고). 사람 번호·이름·이메일·메모 글·일정 이름은 오지 않는다.
- `costUsd`는 토큰 × 목록 가격(Claude 문서 11-13: Haiku 5.5 입력 $0.10·출력 $0.50, Sonnet 5.5 $2·$10 / 백만 토큰)으로 어림한 값이다. 캐시·10만 토큰 넘는 프롬프트 값은 따지지 않는다.
- `tables.log_about`은 log 번호 끝이다(지운 줄도 세어 대략). `rowsRead`는 이 합계를 만드느라 D1이 읽은 줄이다. 기간 log 줄 × 2쯤 + 1천쯤이고, 무료 하루 읽기는 500만이다.

## 아직 화면이 없는 것 (2단계)

- 아침 브리핑 카드: `GET /api/briefing` (AI, 있음). 시안 3개는 캔버스에 있고, 고르는 것은 디자인 결정과 같이 미뤄짐(컨셉 11-09 23:56).
- 시간표 사진: `POST /api/timetable` → 확인 팝업 → `POST /api/timetable/save` / `cancel` (AI, 있음). 올리는 곳에 "이름·학번이 보이면 가리고 올려 주세요" 한 줄을 꼭 넣는다(사진이 그대로 Claude API로 감, 컨셉 11-09 19:50 · 개인정보처리방침 초안 1절). eTL을 연결하면 시간표가 저절로 들어오니(컨셉 d53b360) 사진은 eTL을 안 쓰는 사람용.
- 디자인 '② 차분한 종이'([가이드](../docs/tachyon/디자인/디자인_가이드.md)·`tokens.css`·`components.css`): 11/16 회의 뒤, 11/25 동결 전에 화면 세션이 옮긴다(계획 '디자인 가이드를 화면에 적용'). 그때 컨셉·dhsrua555가 더한 클래스(`.late-*` `.route-*` `.map-link` `.warn-box` `.etl-*` `.seg` `.feed-*` `.btn-line` `.tag.ok` `.task.done`)와 Pretendard 불러오기도 같이.

## 빌드·배포

- `wrangler.toml`의 `[build]`가 `wrangler dev`·`wrangler deploy` 때마다 `web/`을 빌드하고, `[assets]`가 `web/dist`를 내보낸다. `/api/*`는 늘 Worker가 먼저 받고(`run_worker_first`), 그 밖의 없는 주소는 `index.html`(한 페이지 앱).
- `web/public/_headers`가 `dist`로 들어간다: `sw.js`·`index.html`은 `no-cache`, `/assets/*`는 1년.
- 서비스 워커(`web/public/sw.js`)는 `/api/*`를 저장하지 않는다.
- 화면만 고칠 때: `npm --prefix web run dev`(5173, `/api`는 `wrangler dev`의 8787로 넘긴다).
