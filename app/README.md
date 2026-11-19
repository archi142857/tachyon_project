# Tachyon 안드로이드 앱

배포된 사이트(`capacitor.config.json`의 `server.url`)를 그대로 띄우는 껍데기다. 화면을 고치면 앱도 바로 바뀌고, 앱을 다시 만들 필요가 없다.
앱이라서 되는 것은 셋이다.

| 기능 | 화면 쪽 | 서버 쪽 |
|---|---|---|
| 폰 캘린더 읽기(주소 없이) | `web/src/native.js` `syncDevice` | `worker/2_collect_ics.js` `POST /api/feeds/device` |
| 구글 로그인(폰 브라우저로 나갔다가 `tachyon://login`으로 돌아옴) | `web/src/native.js` `appLogin` | `worker/1_login.js` 앱 로그인 |
| eTL 원터치(11-20): 앱 안 창에서 서울대 로그인만 → 토큰 · eTL 달력 주소를 eTL 쪽에서 만들어 옴(`EtlPlugin.kt`, 돌릴 글은 화면이 줌) | `web/src/etlToken.js` `grab` · `native.js` `etlLogin` | `PUT /api/etl`(토큰 → 달력 주소도) |
| 구글 캘린더 연동(11-20, 폰 브라우저로 나갔다가 `tachyon://gcal`로 돌아옴) | `web/src/native.js` `gcalInApp` | `worker/12_gcal.js` `POST /api/gcal/app` |
| 홈 화면 위젯(할 일 · 오늘 일정, 아래 칸) | `web/src/api.js` `widgetsChanged` | 있던 `/api/tasks` · `/api/events` 그대로 |

## 만들기

이 폴더에는 설정만 있고 `android/` 폴더는 없다. [.github/workflows/android.yml](../.github/workflows/android.yml)이 매번 새로 만든다.

1. `npm install` → `npx cap add android` (안드로이드 프로젝트 생성 + 플러그인 연결)
2. `AndroidManifest.xml`에 `tachyon://` 주소로 앱이 열리게 한 줄 넣기
3. 앱 아이콘·첫 화면을 Tachyon 것으로: [`android-res/res/`](android-res/res)를 덮어쓴다(기본 `splash.png`는 지움). 그림은 웹 아이콘(`web/public/icons/icon.svg`)과 같고, 바꾸려면 `python3 app/android-res/make_icons.py`로 다시 만든다(Pillow).
4. Kotlin 층 · 위젯 붙이기: `python3 android-native/apply.py android` (아래 칸)
5. `./gradlew assembleDebug` → `app-debug.apk`

`app/`이나 그 워크플로를 고쳐 main에 올리면 돌고, GitHub Actions 화면에서 손으로 돌릴 수도 있다.
APK는 그 실행의 Artifacts에 올라가고, main에서 돈 것만 Releases의 `앱-시험판`에도 올라간다.

## 홈 화면 위젯 (`android-native/`, 11-15)

화면은 여전히 웹(React)이고, Kotlin은 위젯과 그 다리만 맡는다. 새 라이브러리 없이 안드로이드 기본 부품만 쓴다.

- **할 일**: 끝나지 않은 할 일 8개(여유 적은 순)와 마감 말('오늘 18:00' · '내일' · '3일 남음'). 오른쪽 동그라미를 누르면 끝내고 목록에서 빠진다.
- **오늘 일정**: 한국 시간 오늘. 종일 먼저, 그다음 시각 순, 끝난 것은 흐리게.
- 줄이나 머리를 누르면 앱이 열린다. 앱에서 로그인한 쿠키를 그대로 쓴다 → 로그인 전이면 '앱을 열어 로그인해 주세요', 인터넷이 없으면 마지막 목록 + 'HH:MM에 받음'.
- 다시 받는 때: 30분마다(안드로이드가 정함) · 새로고침 단추 · 앱을 나갈 때 · 화면에서 할 일·일정을 바꾼 뒤 1.5초(`TachyonWidget.refresh()`).

| 파일 | 하는 일 |
|---|---|
| `apply.py` | 생성된 프로젝트에 아래를 붙임: Kotlin 복사(생성된 `MainActivity.java` 지움) · `res/` 복사 · manifest 조각 넣기 · Gradle에 Kotlin 켜기. 두 번 돌려도 같음 |
| `kotlin/.../MainActivity.kt` | 앱 시작(위젯 다리 등록, 앱을 나갈 때 위젯 갱신) |
| `widget/TachyonApi.kt` · `WidgetStore.kt` · `WidgetRefresh.kt` | 서버에서 받기 · 마지막 결과 저장 · 받아서 두 위젯 다시 그리기 |
| `widget/TasksWidget*.kt` · `TodayWidget*.kt` | 위젯 두 개(틀 + 목록 줄) |
| `widget/WidgetTapActivity.kt` | 줄·체크 누름을 받는 보이지 않는 창(안드로이드 14부터 뒤에서 앱 열기가 막혀서) |
| `widget/WidgetPlugin.kt` | 화면 → 위젯 다리(`TachyonWidget.refresh()`) |
| `EtlPlugin.kt` | eTL 원터치 창(`TachyonEtl.open({ url, script })`): 앱 안 WebView에 eTL → 로그인하면 eTL 쪽에서 script를 돌려 `TachyonEtl.done(JSON)`으로 받고 닫힘 |
| `res/` · `AndroidManifest-application.xml` | 위젯 모양(밝은·어두운 카드) · 등록 |

이 노트북에서 만들어 보기(JDK 21 + Android SDK. 위젯만 볼 때는 2·3단계를 빼도 된다):

```bash
cd app && npm install && npx cap add android
python3 android-native/apply.py android
cd android && ./gradlew assembleDebug
```

## 설치

폰에서 Releases의 `tachyon.apk`를 받아 연다(처음에는 '출처를 알 수 없는 앱' 허용이 필요하다).

## 아직 안 되는 것

- 새 APK로 바꿀 때는 앱을 지우고 다시 깐다(시험용 서명 열쇠가 만들 때마다 달라서). 화면만 바뀐 것은 다시 깔 필요가 없다.
- 위젯: 실제 폰·런처(삼성 등)별 확인은 아직. 자정을 넘긴 뒤 머리 날짜·흐리게는 다음 갱신(최대 30분)까지 늦을 수 있다.
- 아이폰·아이패드: 같은 설정으로 `npx cap add ios`는 되지만, 기기에 깔려면 맥과 애플 개발자 서명이 필요하다. 그 전에는 사파리 '홈 화면에 추가' + 캘린더 주소 연결을 쓴다.
- 캘린더 종류별(구글·삼성·iCloud) 실기기 확인은 아직 안 했다 → `docs/tachyon/계획.md`.
