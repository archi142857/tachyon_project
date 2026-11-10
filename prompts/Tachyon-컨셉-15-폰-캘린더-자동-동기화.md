# Tachyon · 컨셉 15 · 달력 자동 동기화: 안드로이드 앱이 Tachyon 일정을 폰 캘린더에 바로 씀

- 날짜: 2026-11-10
- 도구: Claude (claude.ai 프로젝트 세션, Claude Opus 5.5), 웹 검색(구글 캘린더 구독 새로 받는 간격, 구글 OAuth 시험 모드·검증, 구글 캘린더 추가 링크 `cid=`), npm 레지스트리(`@capacitor/calendar` 1.0.1 패키지를 받아 쓰기 기능·안드로이드 권한 확인), 작업 공간의 헤드리스 크롬(Playwright, 가짜 폰 캘린더로 화면 확인)
- 기록 유형: 사용자 직접 지시
- 목적: 'Tachyon → 폰 달력'이 구독 주소(한 번 넣기, 구글은 몇 시간 늦음)뿐이던 것을 더 자동으로. 안 되는 것(구글 계정 하나로 양쪽 즉시)은 까닭을 사람에게 짧게 알린다.

## 프롬프트 원문

(17:52) 컨셉이 체크인 결과(서버 세션의 '폰 달력 구독 확인' 부탁 포함)를 보낸 뒤:

````text
달력도 자동으로 동기화 되게는 못 함?
````

## 정한 것 (컨셉이 답하고 바로 만듦)

- 지금도 자동인 것: 주소를 한 번 넣으면 eTL·구글·애플 → Tachyon은 15분마다, 안드로이드 앱은 열 때 폰 캘린더를 통째로 읽음. Tachyon → 폰 달력은 구독 주소(구글 캘린더는 받아 가는 간격을 구글이 정해 최대 12시간쯤 늦음).
- 안 하는 것: 구글 캘린더 권한(API)으로 양쪽 즉시 동기화 — 누구나 쓰게 하려면 구글 검증(몇 주)이 필요하고, 검증 전엔 시험 명단 100명·7일마다 다시 로그인. 처음 정한 '로그인은 이름·이메일만'을 그대로 둔다.
- 하는 것: **안드로이드 앱이 폰 안 'Tachyon' 캘린더에 직접 쓴다.** 앱의 `@capacitor/calendar`가 쓰기(createCalendar·createEvent·deleteEvent)를 지원하고 플러그인 매니페스트에 `WRITE_CALENDAR`가 있어 새 APK 없이 된다(앱은 배포 사이트를 띄움). 사람이 '폰 달력에서 보기' 창에서 켤 때만 쓰기 권한을 묻는다. 그 폰에만 있는 캘린더라 PC 구글 캘린더에는 안 보인다.
- 같이: 구글 캘린더 구독은 PC에서 주소를 붙여 넣는 대신 '구글 캘린더' 단추 한 번(`calendar.google.com/calendar/r?cid=`).

## 결과 요약

- **서버:** `worker/8_calendar_feed.js`에 `GET /api/calendar/items`(로그인) — 구독 주소(ICS)와 같은 줄(내 일정, 구글·애플·폰에서 온 것과 옮긴 것 빼고 + 안 끝낸 할 일 마감)을 ms 시각으로. 종일은 UTC 자정(안드로이드 종일 규칙), 끝 시각이 없으면 시작과 같음. ICS와 앱이 같은 쿼리(`feedRows`)를 쓴다. 시험 1개 더함.
- **앱(web/src/native.js):** `turnPushOn`(읽기·쓰기 권한 → 'Tachyon' 캘린더 만들고 맞춤), `pushToDevice`(서버 목록과 폰 일정을 메모 칸 끝 줄 `tachyon:event-12`로 짝지어 없어진 것은 지우고 바뀐 것은 지우고 다시 넣음, 동시에 두 번 안 돎), `turnPushOff`('Tachyon' 캘린더만 지움), `listenAppResume`(앱을 다시 볼 때 5분에 한 번까지). 폰 → 서버(`syncDevice`)는 'Tachyon' 캘린더를 뺀다(제자리 돌기 막기). 종일 일정은 폰이 그 지역 자정으로 돌려줘서 하루보다 작은 차이는 같은 날로 본다.
- **화면:** `CalendarSheet.jsx` — 앱이면 맨 위 '이 폰 캘린더에 바로 넣기'(켜기 / 지금 맞추기·끄기, 결과 한 줄), 웹이면 [주소 복사]·[구글 캘린더]·[폰 달력에 추가]. `App.jsx`는 앱을 열 때 폰 → 서버 다음에 폰 쓰기를 기다리지 않고 돌리고, 다시 볼 때 맞춤.
- **확인:** web 시험 7개 더함(짝 맞추기, 가짜 플러그인으로 켜기 → 그대로 → 옮김·없어짐 → 폰 → 서버에서 뺌 → 끄기, 권한 거절). 헤드리스 크롬에서 가짜 폰 캘린더로 켜기 → 'Tachyon' 캘린더에 2개(시각 일정·종일 마감), 웹 화면 단추 셋과 구글 링크. worker 138개·web 81개 통과, 빌드 됨. **실기기 확인은 남음**(팀에 안드로이드 기기·에뮬레이터가 없음).
- 문서: 계획(새 줄, 표 한 칸), `web/API.md`, 개인정보처리방침 초안(폰 캘린더에 쓰기 문단).

## 바뀐 파일

- 서버: [worker/8_calendar_feed.js](../worker/8_calendar_feed.js), [worker/test/8_calendar_feed.test.js](../worker/test/8_calendar_feed.test.js)
- 화면·앱: [web/src/native.js](../web/src/native.js), [web/src/native.test.js](../web/src/native.test.js), [web/src/components/CalendarSheet.jsx](../web/src/components/CalendarSheet.jsx), `web/src/App.jsx`, `web/src/api.js`, [web/API.md](../web/API.md)
- 문서: [docs/tachyon/계획.md](../docs/tachyon/계획.md), [docs/tachyon/개인정보처리방침_초안.md](../docs/tachyon/개인정보처리방침_초안.md), [docs/tachyon/소통.md](../docs/tachyon/소통.md), [docs/작업_기록.md](../docs/작업_기록.md), [prompts/README.md](README.md)

## 남은 일

- 안드로이드 폰에 APK(Releases '앱-시험판')를 깔아 '폰 달력에서 보기' → 켜기 → 폰 달력 앱(삼성·구글)에 'Tachyon' 캘린더가 보이는지, 종일 마감이 맞는 날에 있는지, Tachyon에서 고친 일정이 다시 열 때 바뀌는지(사람·팀원).
- 저장한 뒤 바로 폰에 넣기(지금은 열 때·다시 볼 때·'지금 맞추기')는 실기기에서 써 보고 필요하면 더한다.
