# Tachyon-32 · 리마인드: 고른 일정·할 일만, 메모 팝업에서 바로

- 날짜: 2026-11-16
- 도구: Claude Code (Claude 데스크톱 앱 Code 탭, Claude Opus 5.5) — node --test(서버), vitest · vite build(화면), 내장 브라우저(예시 모드로 팝업 · 고치기 창 · 폰 폭 375px 확인), wrangler(원격 D1 칸 확인)
- 기록 유형: 사용자 직접 지시
- 목적: 일정·할 일에 리마인드를 켤 수 있게 한다. 모든 일정이 아니라 사람이 고른 것만, 메모 팝업에서 바로 켜고 끈다.

## 프롬프트 원문

11-16 09:02

````text
그리고 할 일 리마인드 기능 추가해줘. 리마인드는 모든 일정에 넣지는 말고 하고 싶은 일정에만 할 수 잇게 해주고, 할 일이나 일정 모두에 추가되는 기능이야. 메모로 적어서 넣을 때, 팝업에서 바로 리마인드 할지말지 선택하게 해줘
````

## 한 일

- DB(`schema.sql`): `events.remind` · `tasks.remind` = 시작(할 일은 마감) 몇 분 전(0~1440, NULL = 안 함). 켠 줄만 읽는 부분 색인 `events_remind` · `tasks_remind`. 원격 D1에는 `ALTER TABLE … ADD COLUMN remind INTEGER` 두 줄 + 색인 두 줄.
- 서버(`worker/7_items.js`): 고치기 PATCH의 `remind`(캘린더에서 온 일정·할 일도 '중요'처럼 사본 없이), 달력 빈 칸 넣기 POST도 받는다. 새 주소 `GET /api/reminders` → 앞으로 14일 안에 울릴 것 `{ id, title, body, at }`(종일 일정은 그날 9시 기준, 끝낸 할 일 · 가려진 일정 · 지난 것은 뺌). 메모 팝업 저장(`worker/3_memo_popup.js`)도 `remind`를 받는다 — 매주 되풀이 줄까지, 할 일은 마감이 있을 때만.
- 화면: `RemindRow.jsx` — '리마인드' 체크(기본 꺼짐), 켜면 '시작 30분 전'(할 일은 '마감 1시간 전') 고르기(시각에 · 10분 · 30분 · 1시간 · 3시간 · 하루 전). 메모 팝업(일정 · 할 일), 일정 고치기, 할 일 고치기에 같이. 마감 없는 할 일은 '마감을 정하면 켤 수 있어요'.
- 알림: 안드로이드 앱이 폰에서 띄운다(`web/src/native.js` `planReminders`, 아침 알림과 같은 LocalNotifications, 번호 10000부터). 앱을 열 때 · 다시 볼 때 · 할 일·일정을 바꾼 뒤(`api.js` `widgetsChanged`) 다시 잡는다. 브라우저만 쓰면 알림은 오지 않는다고 칸 아래에 적었다. 새 APK가 아니어도 된다(아침 알림 플러그인이 이미 들어 있음).
- 규칙: '알림은 아침 브리핑 하루 1번만'에 '사람이 켠 리마인드만'을 덧붙임(`docs/tachyon/인수인계.md` · `세션_운영.md`).
- 시험: 서버 — 메모 팝업 38개(remind 저장: 매주 줄 · 마감 없는 할 일 · 틀린 값), 7_items 9개(켜고 끄기 · 남의 것 404 · 틀린 값 400 · 목록 순서 · 14일 · 끝낸 것 · 종일 9시 · 구글 일정 사본 없음). 화면 198개 · 빌드 통과.
- 남은 것: 실제 폰에서 알림이 뜨는지(에뮬레이터 · 폰 확인 전). 다른 기기(PC)에서 켠 리마인드는 폰에서 앱을 한 번 열어야 잡힌다(서버 푸시가 아니라서).

## 바뀐 파일

schema.sql · worker/index.js · worker/7_items.js · worker/3_memo_popup.js · worker/test/7_items.test.js · worker/test/3_memo_popup.test.js · web/src/components/RemindRow.jsx · web/src/components/MemoPopup.jsx · web/src/components/EditSheets.jsx · web/src/native.js · web/src/api.js · web/src/screens/Dashboard.jsx · web/src/styles.css · docs/tachyon/인수인계.md · docs/tachyon/세션_운영.md · docs/tachyon/계획.md · docs/tachyon/소통.md · docs/작업_기록.md · prompts/README.md
