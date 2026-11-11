# Tachyon-12 · 오늘 화면(하루 고리)을 main에 넣기

- 날짜: 2026-11-11
- 도구: Claude Code (Claude 데스크톱 앱 Code 탭, Claude Fable 5) — 코드는 직접 고침, 확인은 앱 안 브라우저(예시 화면)와 vitest
- 기록 유형: 사용자 직접 지시
- 목적: 갈래 `today-ring`에 만들어 둔 오늘 화면을 main(배포)에 언제 넣을지 물었고, 사용자가 지금 넣기로 정했다.

## 프롬프트 원문

11-11 19:45 — 앞 차례 끝에 "오늘 화면을 main(배포)에 언제 넣을까요?"라고 물었고, 고를 것은 '11/13 뒤에'(권장)와 '지금 넣기'였다.

````text
지금 넣기
````

## 결과 요약

- **넣은 것**: 갈래 `today-ring`의 커밋 하나를 main 맨 위에 그대로 얹었다(f497cef). 이 저장소는 합침 커밋 없이 한 줄로 쌓아 와서 같은 방식으로 했다.
- **같이 고친 것**: 컨셉이 소통판 19:41에 알려 준 두 가지(고리 '18시'가 '18사'처럼 보임, '6시' 눈금이 글자에 붙음). 까닭은 하나였다 — 3시간마다 긴 눈금이 시각 글자에 닿았다. 눈금 길이를 모두 같게 하고 글자를 조금 바깥으로 옮겼다(5a59535).
- **확인**: 웹 시험 94개 통과, 로컬 빌드 통과, 예시 화면에서 글자와 눈금 사이가 떨어진 것을 넓은 화면·폰 폭으로 잼(가로 넘침 없음).
- **남은 것**: 실제 계정 자료로는 아직 못 봤다. 할 일 고리 · 메모 입자 · 낮밤 스위치 등은 아직 안 맡았다.

## 관련 결과

- `web/src/components/DayRing.jsx` · `web/src/components/TodayView.jsx` · `web/src/slots.js` · `web/src/slots.test.js` · `web/src/screens/Dashboard.jsx` · `web/src/styles.css`
- [docs/tachyon/계획.md](../docs/tachyon/계획.md) · [docs/tachyon/소통.md](../docs/tachyon/소통.md)
