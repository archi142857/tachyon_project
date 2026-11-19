# Tachyon-45 · 달력 연동 · eTL 토큰 원터치(로그인만 하면 나머진 알아서)

- 날짜: 2026-11-20
- 도구: Claude Code (VS Code 확장, Claude Opus 5.5) — Canvas 토큰 만들기 경로는 서브에이전트(web-digest)가 canvas-lms 소스(routes.rb · tokens_controller.rb · user_profile.rb)를 읽어 확인, 서울대 eTL 쪽은 사람의 기존 eTL 토큰으로 읽기만(`/api/v1/users/self/profile`의 calendar.ics 있음 · `/api/v1/users/self/tokens/…` 경로 없음) curl, 서버 시험은 node --test(가짜 eTL · 가짜 구글), 화면 시험은 vitest, 화면 확인은 헤드리스 Chrome(CDP) 화면 찍기 + 서브에이전트(screen-check), 빌드는 vite build, APK는 GitHub Actions
- 기록 유형: 사용자 직접 지시
- 목적: eTL 토큰 만들기 · 캘린더 주소 복사 같은 손일을 없애고, 로그인 한 번(앱) 또는 로그인 + 한 번 누르기(PC)로 끝나게 한다. 앱 안에서 막혀 있던 구글 캘린더 연결도 앱에서 되게.

## 프롬프트 원문

11-20 01:18

````text
달력 연동과 etl 토큰 가져오는게 원터치로 바로바로 됏으면 좋겠어. 백그라운드로 브라우저를 돌리던지 해서 로그인만 하면 나머진 알아서 가져올 수 잇게 해줘. 안된다고만 하지 말고 우회 방법이라도 찾아서 원터치마능로 다 해결되게 해줘
````

## 정한 것

- 서버가 학생 아이디 · 비밀번호로 대신 로그인하는 길(서버에서 브라우저 돌리기)은 쓰지 않았다: 계획.md '비밀번호는 절대 받지 않음' · 방침 초안과 어긋나고, 서울대 2단계 인증이 걸리면 서버가 못 넘는다. 대신 **학생이 서울대 화면에 직접 로그인하고, 그 eTL 화면 안에서 Tachyon 글이 토큰을 만든다** — 비밀번호는 Tachyon에 오지 않는다.
- 안드로이드 앱: 앱 안 창(WebView, `app/android-native/.../EtlPlugin.kt`)에 eTL을 띄우고 eTL 쪽이 뜰 때마다 화면이 준 글(`web/src/etlToken.js` `grab`)을 돌린다 → 토큰 · 캘린더 주소 → 창이 닫히고 연결 끝. 돌릴 글은 화면이 주므로 eTL 사정이 바뀌어도 APK를 다시 만들 필요 없다.
- PC 브라우저: 다른 사이트(eTL) 화면에 글을 넣을 수 있는 길은 북마크(확장 프로그램 말고)뿐이라 'Tachyon eTL 연결' 북마크 — 처음 한 번 즐겨찾기 줄로 끌어다 놓고, 이후엔 eTL 로그인 뒤 한 번 누르기. Tachyon이 연 eTL 창이면 Tachyon에 바로 보내고(postMessage, 보낸 곳 확인) 닫힌다, 아니면 Tachyon 탭으로 옮겨 `#etl=`(주소 뒤 # — 서버로 안 가고 읽자마자 지움).
- 토큰 만들기: 2024년 뒤 Canvas는 `POST /api/v1/users/self/tokens`(token[…], 학생은 만료 120일 안), 그 전은 `POST /profile/tokens`(access_token[…]) — 서울대 eTL은 앞 경로가 없어 뒤쪽일 것(소스 버전 추정, 실제 로그인으로는 아직 확인 못 함). 둘 다 시도하고 응답의 `visible_token`을 쓴다. 세션 요청이라 CSRF(`_csrf_token` 쿠키)를 머리 · 본문에, `while(1);` 접두는 떼고 읽는다.
- 서버: 토큰만 들어와도 eTL `/users/self/profile`의 `calendar.ics`로 eTL 캘린더 주소를 같이 넣는다(이미 있으면 그대로) → 직접 토큰을 붙여 넣는 사람도 달력 주소 복사가 없어진다.
- 구글 캘린더(앱): 앱 안 화면은 구글이 동의 창을 막아서 '브라우저에서 하세요'였던 것을, 폰 브라우저로 2분짜리 서명 표와 함께 열고 끝나면 `tachyon://gcal`로 앱에 돌아오게. 웹은 시작한 사람과 돌아온 사람이 같아야 하는 검사를 그대로 둔다(state 쿠키를 서명해 사용자 id를 담음).

## 결과 요약

- 앱: 메뉴 'eTL 연결 · 강의자료'와 첫 설정 '캘린더 연결'에 **eTL 로그인하고 바로 연결**(새 APK부터). 옛 APK에서는 '새 앱을 받으면 로그인만으로 돼요' + 직접 넣기.
- PC: 같은 자리에 '컴퓨터에서 한 번에' 세 줄(북마크 끌어다 놓기 · eTL 열기 · 누르기). 폰 웹 브라우저는 예전처럼 직접 넣기(앱 · PC에서는 '직접 토큰 넣기'로 접힘).
- 첫 설정 '캘린더 연결' 위에 eTL 원터치와 구글 캘린더 연결 칸(메뉴의 구글 연동 칸과 같은 부품).
- 시험: 서버 247개(새: 토큰 → eTL 달력 같이 넣기 · 주소가 있으면 안 묻기 · 프로필에 주소 없어도 연결, 앱 구글 연결 표 · 돌아가는 주소 · 남의 쿠키 막기), 화면 225개(새: grab이 옛 경로로 넘어가기 · CSRF · 로그인 전 아무것도 안 만들기 · 앱 글 · 북마크 세 경우 · 받은 것 모양 확인), vite build.
- 남은 것: 새 APK로 실제 서울대 로그인 끝까지, PC 북마크 실제로, 앱에서 구글 연결 실제로(계획.md 11-20 줄).

## 관련 결과

- [web/src/etlToken.js](../web/src/etlToken.js) · [web/src/native.js](../web/src/native.js) · [EtlSheet.jsx](../web/src/components/EtlSheet.jsx) · [CalendarSheet.jsx](../web/src/components/CalendarSheet.jsx) · [Setup.jsx](../web/src/screens/Setup.jsx)
- [app/android-native/kotlin/com/tachyonproject/app/EtlPlugin.kt](../app/android-native/kotlin/com/tachyonproject/app/EtlPlugin.kt) · [app/README.md](../app/README.md)
- [worker/9_etl.js](../worker/9_etl.js) `linkCalendar` · [worker/12_gcal.js](../worker/12_gcal.js) `POST /api/gcal/app` · [web/API.md](../web/API.md)
- [계획 11-20 줄](../docs/tachyon/계획.md) · [방침 초안 eTL](../docs/tachyon/개인정보처리방침_초안.md)
