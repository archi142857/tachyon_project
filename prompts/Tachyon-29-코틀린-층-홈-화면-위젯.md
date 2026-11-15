# Tachyon-29 · 안드로이드 Kotlin 층 + 홈 화면 위젯(할 일 · 오늘 일정)

- 날짜: 2026-11-15
- 도구: Claude Code (Claude 데스크톱 앱 Code 탭, Claude Opus 5.5) + 서브에이전트(Kotlin 코드 · CI 붙이기 · 코드 검토 · 에뮬레이터 시험) — 이 노트북의 Gradle 8.14.3 · JDK 21 · Android SDK로 APK 빌드(lint), 안드로이드 에뮬레이터(API 34, Pixel 런처)에서 지어낸 예시 데이터를 주는 가짜 서버(python http.server)로 확인, vitest
- 기록 유형: 사용자 직접 지시
- 목적: 11-14 '사람이 정할 것'의 폰 위젯을 넣는다. 화면은 웹 그대로, Kotlin은 앱 껍데기 안에서 위젯과 그 다리만.

## 프롬프트 원문

11-15 13:08

````text
서브 에이전트를 많이 써서 코틀린 구현을 빠르게 완료해. 위젯까지 일단 해봐
````

## 한 일

- `app/android-native/` 새 폴더: Kotlin `MainActivity`(생성된 Java 대신) + 위젯 둘 + 화면 → 위젯 다리 플러그인 `TachyonWidget.refresh()`. 새 라이브러리 없이 안드로이드 기본 부품(HttpURLConnection · org.json · SharedPreferences)만.
  - 할 일: 끝나지 않은 할 일 8개 + 마감 말('오늘 18:00' · '내일' · '3일 남음'), 동그라미 누르면 끝냄(`PATCH /api/tasks/:id`).
  - 오늘 일정: 한국 시간 오늘, 종일 먼저, 시각 순, 끝난 것 흐리게.
  - 누르면 앱 열기(안드로이드 14부터 막히는 '뒤에서 앱 열기'를 피하려고 보이지 않는 창 `WidgetTapActivity`로 받음). 로그인 전 '앱을 열어 로그인해 주세요', 인터넷 없으면 마지막 목록 + 'HH:MM에 받음'.
  - 다시 받기: 30분마다 · 새로고침 단추 · 앱을 나갈 때 · 화면에서 할 일·일정을 바꾼 뒤 1.5초(`web/src/api.js` `widgetsChanged`).
- CI: `android.yml` 4단계 `python3 android-native/apply.py android`(Kotlin 복사 · res · manifest 조각 · Gradle에 Kotlin 켜기, 두 번 돌려도 같음). Releases `앱-시험판` 올리기는 main에서 돈 것만.
- 확인: 로컬 빌드 lint 오류 0. 에뮬레이터에서 두 위젯 놓기 · 예시 줄 · 체크(가짜 서버에 PATCH 찍힘) · 줄/머리 누르면 앱 · 새로고침 · 401 → 로그인 안내 · 서버 끔 → 마지막 목록. 충돌·ANR·'뒤에서 앱 열기 막힘' 로그 없음.
- 검토·시험에서 고친 것: 줄 누르기가 안드로이드 14+에서 막힐 수 있던 것, 네트워크 시간 제한 없음(ANR 위험), 끝 시각 없는 일정 흐리게, 안내 글을 눌러도 앱이 안 열리던 것.
- 남은 것: 실제 폰(진짜 로그인 쿠키)·삼성 런처 확인, 자정 넘긴 뒤 머리 날짜는 다음 갱신(최대 30분)까지 늦을 수 있음, 위젯 색은 테마를 따라가지 않음.

## 바뀐 파일

app/android-native/** (새로) · .github/workflows/android.yml · app/README.md · web/src/api.js · web/src/api.test.js · docs/tachyon/계획.md · docs/tachyon/11-14_피드백_제안.md · docs/tachyon/소통.md · docs/작업_기록.md · prompts/README.md
