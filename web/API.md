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
| `DELETE /api/login/me` | `{ confirm: true }` (없으면 400) | `{ ok }` + 로그인 쿠키 지움. 내 자료를 모두 지운다 → 화면은 로그인 화면에 '계정과 내 자료를 모두 지웠어요'. 메뉴 맨 끝 '계정 지우기' 창과 다시 연 설정 맨 아래, 두 번 눌러야 지움 |
| `POST /api/login/logout` | — | `{ ok }` |

- `needsSetup`은 학과·학년이 비었을 때 true. 첫 설정을 건너뛰면 화면이 이 기기(localStorage)에 적어 두고 다시 띄우지 않는다.
- 쓰기 요청은 같은 사이트에서 온 것만 받는다(`Origin` 확인).
- 쓰는 도중 어느 요청이든 401이 오면(쿠키 30일 끝) 화면 전체가 로그인으로 가고 '로그인이 끝났어요. 다시 로그인해 주세요'. 처음 열 때 서버에 닿지 않으면 로그인 화면에 '서버에 닿지 않아요…'(로그인 전 401과 구분).

## 2_collect_ics (서버 세션) — 있음 (`worker/2_collect_ics.js`)

| 요청 | 보냄 | 받음 |
| --- | --- | --- |
| `GET /api/feeds` | — | `{ ok, feeds: [{ kind, set: false } 또는 { kind, set: true, hint, count, okAt, triedAt, error, stopped }] }` |
| `PUT /api/feeds` | `{ etl?, google?, apple? }` 글 = 저장, `""`·`null` = 지우기, 칸이 없으면 그대로 | `{ ok, results, feeds }` 저장한 칸은 바로 한 번 받아 본다 |
| `POST /api/feeds/collect` | — | `{ ok, results, feeds }` 저장된 주소를 지금 다시 받는다(멈춘 주소도 한 번 더). 메뉴에서 다시 연 설정의 '지금 다시 받기' |
| `POST /api/feeds/device` | `{ events: [{ id, title, start, end, allDay, place }] }` (start·end는 ms) | `{ ok, count, same }` 안드로이드 앱이 읽은 폰 캘린더를 통째로 올린다(`native.js`). 빠진 것은 지우고, 다른 캘린더와 이름·시작이 같은 것은 뺀다(same). 온 일정은 `source: 'device'`, 고칠 수 없음 |

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
| `PATCH /api/events/:id` | `{ important, title, start, end, place }` 가운데 바꿀 것 (시각을 모르면 `start`는 날짜만, `end`는 null) | `{ event }` 캘린더에서 온 일정의 이름·시간·장소를 바꾸면 **새 id의 사본**(`source` memo, `edited` 1)이 오고 원본은 가려진다 → 고친 뒤 목록을 다시 부른다 |
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

## 3_memo_popup (AI 세션) — 있음

| 요청 | 보냄 | 받음 |
| --- | --- | --- |
| `GET /api/memo?limit=50` | — | `{ memos: [{ id, text, created_at, handled, event_id, task_id }] }` 오래된 것부터. `event_id`가 있으면 '달력에 넣었어요', `task_id`(밤 정리)면 '할 일에 넣었어요' |
| `POST /api/memo` | `{ text }` | `{ memo, popup }` · `popup` = `null`(그냥 메모), 일정 `{ title, date, time, end_time, place, by }`, 할 일 `{ kind: 'task', title, date, time, by }`(마감, 모르면 `'?'`, 11-10) |
| `POST /api/memo/:id/save` | `{ title, date, time, end_time, place, suggested, change_id?, repeat? }` · `suggested` = 받았던 popup 그대로, `change_id` = 옮길 일정(`popup.change.id`, 주면 그 일정은 달력에서 가려진다), `repeat: true` = 매주 넣기(`popup.repeat`가 있을 때 체크 칸을 켠 채 저장). 할 일은 `{ kind: 'task', title, date, time, suggested }` | `{ event }`(매주로 넣었으면 `{ event: 첫 주 일정, repeat: 넣은 횟수 }`) · 할 일은 `{ task }`(tasks source `memo`, 마감 날짜만 있으면 23:59, 없으면 마감 없음) |
| `POST /api/memo/:id/cancel` | `{ kind? }` | `{ ok }` · 일정 팝업: 메모는 남고 밤 정리가 읽는다. 할 일 팝업(`kind: 'task'`, 화면 '메모로만'): 메모로만 남고 밤 정리도 할 일로 안 만든다 |

- 날짜·시각 말이 없어도 지난 일(~했다)·한 글자가 아니면 AI가 일정·할 일·그냥 메모를 가린다(AI가 없거나 실패하면 규칙: '-기'·'할 것'·'해야 함'·제출·신청·전화… 끝말, 마감 말 '까지'). 화면은 할 일이면 '할 일로 넣을까요?'(넣기·고치기·메모로만).
- 모르는 칸은 `'?'`, 화면도 '?'로 보인다. 예: `내일 3시 301동 스터디` → `{ title: '스터디', date: '2026-11-10', time: '15:00', end_time: '?', place: '301동', by: 'ai' }`.
- 시각 없이 시간대만 쓴 일정 메모(`12일 늦은 밤에 회의`)는 서버가 그날 내 일정을 읽어 그 시간대의 비어 있는 1시간을 `time`·`end_time`에 넣고 `popup.free`(= '늦은 밤')를 붙인다(11-11, AI 없이 `lib/known.js` `suggestFree`). 화면은 '‘늦은 밤’에서 비어 있는 시간으로 골랐어요' 한 줄. 빈 1시간이 없거나 시간대 말이 없으면 지금처럼 `'?'`(종일). 시간대: 아침 8~10 · 오전 9~12 · 점심 12~14 · 낮 13~17 · 오후 13~18 · 저녁 18~21 · 밤 20~24 · 늦은 밤(밤늦게·심야) 22~24.
- 메모에 길이를 쓰면(`운동 2시간`, `1시간 반`, `40분`. '2시간 뒤'는 아님) 그 길이를 쓴다(11-11, `lib/known.js` `lengthOf`·`useLength`): 빈 시간 고르기는 그 길이로(1시간보다 길면 시작 뒤 1시간까지만 시간대 안이면 됨, 자정은 안 넘음), 시작 시각만 아는 일정은 `end_time` = 시작 + 길이, 이름에서 그 말은 뺀다. 안 쓰면 지금처럼 1시간 / 끝 `'?'`.
- 매주 메모(`매주 목요일 …`, `목요일마다 …`. 격주·'2주마다'·매일은 아님)는 `popup.repeat = { until: '2026-12-14' }`(학기 끝, 시간표와 같은 `semesterEnd`)가 붙는다(11-11). 화면은 '매주 같은 요일·시간으로 12월 14일(학기 끝)까지 넣어요' 체크 칸(끌 수 있음)을 보이고, 켠 채 저장하면 `repeat: true`를 보낸다. 서버는 그날부터 학기 끝까지 주마다 일정을 한 줄씩 넣는다(`ext_id` 첫 주 `memo:<id>`, 다음부터 `memo:<id>:w1` …). 묶음은 따로 없어서 지우기·고치기는 하나씩이고, 빈 시간 확인은 첫 주만 한다.
- 저장할 때 이름·날짜는 꼭 있어야 한다(없으면 400). 그래서 화면은 이름이나 날짜가 '?'면 '저장' 대신 고치기 칸부터 연다. 시각이 '?'면 종일 일정으로 저장된다.
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

## 9_etl (컨셉 세션, 11-10) — `worker/9_etl.js`, 화면은 메뉴 'eTL 연결·강의자료'(`EtlSheet.jsx`)

| 요청 | 보냄 | 받음 |
| --- | --- | --- |
| `GET /api/etl` | | `{ ok, connected, last_ok_at, last_error, dead, counts: { notice, file } }` (토큰은 안 돌려줌) |
| `PUT /api/etl` | `{ token }` | 짧거나 띄어쓰기 있는 글(비밀번호 모양)은 400으로 eTL에 보내지도 않음. eTL `/users/self`가 받으면 저장하고 바로 한 번 받음 → 위 상태 + `result { ok, courses, tasks, notices, files, calendar, classes, ai }`(classes = 수강편람에서 시간표를 찾은 과목 수) |
| `DELETE /api/etl` | | `{ ok, connected: false }` — 토큰·목록·과목 일정 지움(eTL ICS 주소가 없으면 과제도) |
| `POST /api/etl/collect` | | 위 상태 + `result`(1분 안에 받았으면 `{ ok, recent: true }`) |
| `GET /api/etl/items` | | `{ notices: [{ id, course, title, url, posted_at, tag }], files: [...] }` 새 것 먼저, 100개까지. tag = exam·cancel·makeup·none |

- 원격 D1에 `etl`·`etl_items` 표가 아직 없으면 모두 503(화면: 'eTL 연결은 준비 중이에요').
- 수업 시간표는 events(source `etl`, ext_id `api-class-…`, 잠김, 이름 = 과목 이름, 장소 = '39동 409호') — 수업 사이 동선이 바로 쓴다. 과제는 tasks(source `etl`, ICS와 같은 줄), 공지에서 찾은 시험·휴강·보강은 events(source `notice` — 잠기지 않아 고치기·지우기 됨), 교수가 넣은 과목 일정은 events(source `etl`, ext_id `api-calendar-…`, 잠김).

## 아직 화면이 없는 것 (2단계)

- 아침 브리핑 카드: `GET /api/briefing` (AI, 있음). 시안 3개는 캔버스에 있고, 고르는 것은 디자인 결정과 같이 미뤄짐(컨셉 11-09 23:56).
- 시간표 사진: `POST /api/timetable` → 확인 팝업 → `POST /api/timetable/save` / `cancel` (AI, 있음). 올리는 곳에 "이름·학번이 보이면 가리고 올려 주세요" 한 줄을 꼭 넣는다(사진이 그대로 Claude API로 감, 컨셉 11-09 19:50 · 개인정보처리방침 초안 1절). eTL을 연결하면 시간표가 저절로 들어오니(컨셉 d53b360) 사진은 eTL을 안 쓰는 사람용.
- 디자인 '② 차분한 종이'([가이드](../docs/tachyon/디자인/디자인_가이드.md)·`tokens.css`·`components.css`): 11/16 회의 뒤, 11/25 동결 전에 화면 세션이 옮긴다(계획 '디자인 가이드를 화면에 적용'). 그때 컨셉·dhsrua555가 더한 클래스(`.late-*` `.route-*` `.map-link` `.warn-box` `.etl-*` `.seg` `.feed-*` `.btn-line` `.tag.ok` `.task.done`)와 Pretendard 불러오기도 같이.

## 빌드·배포

- `wrangler.toml`의 `[build]`가 `wrangler dev`·`wrangler deploy` 때마다 `web/`을 빌드하고, `[assets]`가 `web/dist`를 내보낸다. `/api/*`는 늘 Worker가 먼저 받고(`run_worker_first`), 그 밖의 없는 주소는 `index.html`(한 페이지 앱).
- `web/public/_headers`가 `dist`로 들어간다: `sw.js`·`index.html`은 `no-cache`, `/assets/*`는 1년.
- 서비스 워커(`web/public/sw.js`)는 `/api/*`를 저장하지 않는다.
- 화면만 고칠 때: `npm --prefix web run dev`(5173, `/api`는 `wrangler dev`의 8787로 넘긴다).
