# Tachyon 안드로이드 앱

배포된 사이트(`capacitor.config.json`의 `server.url`)를 그대로 띄우는 껍데기다. 화면을 고치면 앱도 바로 바뀌고, 앱을 다시 만들 필요가 없다.
앱이라서 되는 것은 둘이다.

| 기능 | 화면 쪽 | 서버 쪽 |
|---|---|---|
| 폰 캘린더 읽기(주소 없이) | `web/src/native.js` `syncDevice` | `worker/2_collect_ics.js` `POST /api/feeds/device` |
| 구글 로그인(폰 브라우저로 나갔다가 `tachyon://login`으로 돌아옴) | `web/src/native.js` `appLogin` | `worker/1_login.js` 앱 로그인 |

## 만들기

이 폴더에는 설정만 있고 `android/` 폴더는 없다. [.github/workflows/android.yml](../.github/workflows/android.yml)이 매번 새로 만든다.

1. `npm install` → `npx cap add android` (안드로이드 프로젝트 생성 + 플러그인 연결)
2. `AndroidManifest.xml`에 `tachyon://` 주소로 앱이 열리게 한 줄 넣기
3. 앱 아이콘·첫 화면을 Tachyon 것으로: [`android-res/res/`](android-res/res)를 덮어쓴다(기본 `splash.png`는 지움). 그림은 웹 아이콘(`web/public/icons/icon.svg`)과 같고, 바꾸려면 `python3 app/android-res/make_icons.py`로 다시 만든다(Pillow).
4. `./gradlew assembleDebug` → `app-debug.apk`

`app/`이나 그 워크플로를 고쳐 main에 올리면 돌고, GitHub Actions 화면에서 손으로 돌릴 수도 있다.
APK는 그 실행의 Artifacts와 Releases의 `앱-시험판`에 올라간다.

## 설치

폰에서 Releases의 `tachyon.apk`를 받아 연다(처음에는 '출처를 알 수 없는 앱' 허용이 필요하다).

## 아직 안 되는 것

- 새 APK로 바꿀 때는 앱을 지우고 다시 깐다(시험용 서명 열쇠가 만들 때마다 달라서). 화면만 바뀐 것은 다시 깔 필요가 없다.
- 아이폰·아이패드: 같은 설정으로 `npx cap add ios`는 되지만, 기기에 깔려면 맥과 애플 개발자 서명이 필요하다. 그 전에는 사파리 '홈 화면에 추가' + 캘린더 주소 연결을 쓴다.
- 캘린더 종류별(구글·삼성·iCloud) 실기기 확인은 아직 안 했다 → `docs/tachyon/계획.md`.
