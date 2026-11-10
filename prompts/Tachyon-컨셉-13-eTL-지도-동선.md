# Tachyon · 컨셉 13 · eTL API·네이버 지도는 알아서, 수업 사이 동선은 TT Wizard 것으로

- 날짜: 2026-11-10
- 도구: Claude (claude.ai 프로젝트 세션, Claude Opus 5.5), Google Drive 연결, 웹 검색(네이버 지도 URL Scheme·웹 길찾기 주소 모양, 서울대 eTL 담당), GitHub 읽기(TT Wizard 공개 저장소 `archi142857/tt-wizard`를 읽기만), 작업 공간의 헤드리스 크롬(예시 자료 화면 캡처로 확인)
- 기록 유형: 사용자 직접 지시
- 목적: eTL API 연결과 네이버 지도 연결의 남은 결정(지도 범위, 강의자료 복사, 학교에 물을지)을 컨셉이 정하고 바로 만든다. 수업 사이 동선 안내는 TT Wizard의 걷는 시간 자료·계산을 가져다 쓴다.

## 프롬프트 원문

(15:47) 첫 줄을 보낸 뒤 컨셉이 답을 시작하자마자 멈추고 둘째 줄을 보냄:

````text
eTL이랑 네이버 지도는 알아서 해봐봐
````

````text
시간표 동선 안내는 TT Wizard 거 가져다 쓰고
````

## 정한 것 (사람이 "알아서"라고 해서 컨셉이 정함)

- 네이버 지도: 장소를 누르면 네이버 지도 앱·웹으로 열기, 캠퍼스 두 건물 사이는 네이버 지도 도보 길찾기 — 키 없이. 앱 안 지도(네이버 클라우드 키·결제 수단 등록)는 지금 안 한다.
- 강의자료: 목록 + eTL 링크만. 앱 서버에 복사하지 않는다(저작권·용량).
- 학교 규정: 지금은 묻지 않고 만든다(학교가 열어 둔 개인 토큰 기능, 연결은 선택, 각자 자기 자료만, 잠가 저장, '연결 끊기'면 바로 지움). 앱 게시 전에 eTL 담당(학부대학 디지털교육혁신센터)에 물을지 그때 다시 본다.

## 결과 요약

- **수업 사이 동선(0372e2e, 배포됨):** `web/src/campus.js` — 장소 글 → 캠퍼스 건물(수강편람 '동-호' 규칙은 TT Wizard `parse_building`), 같은 날 이어지는 두 일정 사이 걷는 시간·쉬는 시간·'N분 지각'(TT Wizard `engine.js` `evaluate` 셈·말투 그대로, 집 오가는 길은 뺌). 걷는 시간 표는 TT Wizard 자료 `data/walk.csv`·`buildings.csv`(ODbL)를 `web/scripts/campus.mjs`로 `web/src/campus/campus.json`에(따로 받는 파일 38KB), 화면에 출처. 일정 창에 '장소 · 동선' 칸(지도·걷는 시간·길 보기), 주간 달력은 지각이면 칸 위 빨간 줄(넓은 화면은 'N분 지각' 알약). 예시 자료에 오후 세 수업. web 시험 71개.
- **네이버 지도(같은 커밋):** `web/src/naverMap.js` — 앱 `nmap://place`·`nmap://search`·`nmap://route/walk`(appname = 페이지 주소), 웹 `map.naver.com/p/search/…`·`/p/directions/…/-/walk`(웹 메르카토르 좌표). 안드로이드는 intent로 앱, 없으면 웹. 실제 폰에서 눌러 보는 확인은 남음.
- **eTL API(93d0695·76d0f89, 배포됨, 표는 팀원이 원격 D1에 넣으면 열림):** `worker/9_etl.js` — 토큰 모양을 먼저 보고(비밀번호 모양은 eTL에 안 보냄) `/users/self`가 받으면 잠가 저장, 이번 학기 과목만, 과제는 ICS와 같은 줄(제출하면 끝), 공지·강의자료는 목록 + eTL 링크만, 교수가 넣은 과목 일정, 공지에 시험·휴강·보강 말이 있으면 AI(`worker/prompts/etl_notice.js`, Haiku)가 날짜를 찾아 일정(source `notice`, 고치기·지우기 됨). 토큰은 eTL 주소에만, 무료 요금제 요청 한도 안, 표가 없으면 503. 표 `etl`·`etl_items`는 소통판 제안 → 팀원 합의(16:08). 화면 메뉴 'eTL 연결·강의자료'(`EtlSheet` — '이건 eTL 비밀번호가 아니에요' 크게). worker 시험 11개 더함.
- 계획 3단계 세 줄에 작업 중·정한 것, '수업 사이 동선 안내' 줄 새로. 개인정보처리방침 초안에 eTL 줄, `web/API.md`에 9_etl.

## 바뀐 파일

- 화면: [web/src/campus.js](../web/src/campus.js), [web/src/campus/campus.json](../web/src/campus/campus.json), [web/scripts/campus.mjs](../web/scripts/campus.mjs), [web/src/naverMap.js](../web/src/naverMap.js), [web/src/components/RouteInfo.jsx](../web/src/components/RouteInfo.jsx), [web/src/components/EtlSheet.jsx](../web/src/components/EtlSheet.jsx), [web/src/campus.test.js](../web/src/campus.test.js), `web/src/components/WeekCalendar.jsx`, `EditSheets.jsx`, `screens/Dashboard.jsx`, `api.js`, `example.js`, `styles.css`, [web/README.md](../web/README.md), [web/API.md](../web/API.md)
- 서버: [worker/9_etl.js](../worker/9_etl.js), [worker/prompts/etl_notice.js](../worker/prompts/etl_notice.js), [worker/test/9_etl.test.js](../worker/test/9_etl.test.js), `worker/index.js`, `worker/2_collect_ics.js`(지우기 두 곳에 'api-' 건너뜀), [schema.sql](../schema.sql), [wrangler.toml](../wrangler.toml)
- 문서: [docs/tachyon/계획.md](../docs/tachyon/계획.md), [docs/tachyon/개인정보처리방침_초안.md](../docs/tachyon/개인정보처리방침_초안.md), [docs/tachyon/소통.md](../docs/tachyon/소통.md), [docs/작업_기록.md](../docs/작업_기록.md), [prompts/README.md](README.md)
