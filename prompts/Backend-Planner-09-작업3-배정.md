# 작업 3: 과목 후보·시간표·동선 실행 배정

- 날짜: 2026-11-07
- 분류: AI 세션 간 지시·보고.
- 발신/수신: Project / Concept → Project / Backend / Planner.
- 상태: 배정을 받아 구현·검증 완료. 최종 전체428개 통과와 한계는 [Planner 인수인계](../docs/sessions/Backend-Planner.md)에 기록했다.
- 공개 가림: 이 원문에 내부 채팅·메시지 식별자는 포함하지 않았다. 아래 커밋은 공개 Git 커밋 식별자다.

## 받은 원문

```text
첫 통합 커밋 09b4ecfca363ff3c28e0be24cf244f246180b868를 origin/main에 푸시했고 원격 해시 일치와 그 시점 작업폴더 정리를 확인했습니다. 전체250개 검증·2-C 독립 검토·최종 시연 해시 일치까지 통과했습니다. 통합 대기를 해제하고 작업3(과목 후보·시간표·동선)을 지금 진행하세요. docs/작업_목록.md 3절, 최신 AGENTS/배정/Research·Frontend 인수인계와 최종 2-C 계약을 읽고 planner/courses.py, timetable.py, report.py, 담당 테스트와 독립 가상 기대값을 구현하세요. Research1.0은 유지하고 수동85항목을 확정요건처럼 해석하지 마세요. 남은 명시목록·사용자조건·권장학기·확인된 선수/개설정보로 후보를 만들되 미확인 조건과 참고 후보를 분리하세요. 실제 분반의 모든 회의시간, 시간겹침금지, 방향별 걷는시간, 연강 여유/부족을 계산하세요. 비용은 주간걷기+2×부족분이며 미정강의실을0분/이동가능으로확정하지마세요. 미래편람없으면지난같은학기분반을예상으로명시하고 최근5년빈도와실제확정을구분하세요. 유효한최대3안,불가능/부족이유,Markdown·JSON·TT링크복원을검증하세요. TT원본은허용된tt-wizard폴더만읽고 가져온코드에경로·커밋·MIT표시를남깁니다. Frontend와입출력계약을먼저공유하고독립검증을요청하세요. 실제GPT빌더/학교연동/외부발송은범위밖입니다. 사용자추가확인없이담당영역작업을진행하고 원문지시·내부요청·수정·결과는AI기록으로남기세요. 완료시Concept·Document에검증과한계를보고하며 직접커밋·푸시하지마세요.
```

## 산출물 경로

- [입출력 계약](../planner/timetable_format.md)
- [후보 과목](../planner/courses.py), [공통 오류](../planner/planning_types.py)
- planner/timetable.py, planner/report.py, tests/test_courses.py, test_timetable.py, test_report.py(배정 범위; 구현·검증 상태는 인수인계 참조).
- 후속 작업 요청·수정·결과 보고는 작업 3 내부 협업 기록에 별도 보존한다.
