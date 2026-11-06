# 시간표 독립 검증 협업 기록

2026-11-07 · 기준 커밋09b4ecf 이후. 도구 Codex. **기록 유형: AI 세션 간 지시·보고**. 사용자 직접 지시가 아니다. 아래 원문에는 개인 경로·내부 채팅 식별자가 없어 가림 없음. 미실행/준비와 실행 결과를 구분한다.

## Planner → Frontend: 계약과 독립 검증 준비 요청

```text
작업3 계약을 planner/timetable_format.md에 작성했습니다. 후보 build_candidates(payload,offerings,*,target_term,preferences=None), 시간표 search_timetables(candidate_result,walk_rows), 통합 recommend_timetables(...) 및 build_report가 예정 API입니다. 구현 진행 중입니다. 기본15~18학점·집919A, 목표학기없으면 정확히전년도같은학기만 예상, 참고요건 후보는 분리/include_reference 선택, 미정 이동은 총비용null·known_*부분합계, 실제최대3안·제한이유, TT링크는 source_term을 열도록 정했습니다. 계약을 읽고 tests/test_end_to_end.py/Frontend 소유 가상 기대값에서 방향성·회의 전체·unknown·불가능·예상/링크 복원을 독립 준비해 주세요. 계산 담당 파일은 제가 맡습니다. API 준비 시 다시 알려드리겠습니다.
```

처리: 계약을 읽고 `demo/timetable_boundary.json`, `demo/시간표_독립_기대값.md`, `tests/test_end_to_end.py`의 후속 검사를 준비했다. 입력과 수작업 값은 Planner 실행 전에 고정했다. 실제 교과 개설·학생이 아닌 모의 경계 입력이다.

## Frontend → Planner: 기대값과 반환형 협의

```text
Frontend가 작업3 계약을 읽고 독립 검증 준비를 시작했습니다. home200, 월 A200동09:00~10:00/B302동10:20~11:20 두 과목 각3학점·필수선택으로 주간걷기42.94, 부족4.66, 비용52.26을 고정할 예정이며 역방향 비용42.94와 비교합니다. 모든 회의 충돌·미정/방향누락 null·0~3안·전년도동학기 예상 및 링크의 source_term을 독립 해독하겠습니다. build_report 결과의 계획별 링크 필드명과 recommend_timetables 반환형(json/markdown인지)을 계약에 명시해 주세요. 아직 구현 준비 전은 건너뜀/미검증으로 구분하고 demo/기대값과 tests/test_end_to_end.py만 수정하겠습니다.
```

전송 성공. API 반환형을 확정한 아래 응답 수신.

## Planner → Frontend: 반환형 확정·준비 대기

```text
계약에 반환형과 링크명을 확정했습니다. recommend_timetables → {json,markdown}, result.json.plans[].tt_link 입니다. planner/timetable_format.md 반영했고 보고 담당에게도 전달했습니다. 후보 courses.py는 실행 가능하지만 timetable/report 구현 중이므로 통합 API 준비 통지를 기다려주세요. 말씀하신 수작업 42.94/4.66/52.26 및 역방향 기준으로 독립 검증해 주세요.
```

처리: 링크 복원은 Planner의 decode 함수를 사용하지 않고 표준라이브러리로 독립 검사하도록 준비했다. 준비 통지 전 파일 존재만으로 엔진 완료를 선언하지 않는다.

## Frontend → 보조 에이전트: 수작업 경계 검토

```text
새 작업3 독립 검증 준비 보조. repo planner/timetable_format.md와 demo/독립_기대값.md T01~T08를 읽고, 제안 모의2과목(각3학점, 월 A09:00~10:00 200동, B10:20~11:20 302동, home200) 전체 집→A→B→집 비용을 data/walk.csv의200→30224.66/302→20018.28로 수작업 확인해 주세요. 역방향 A302/B200, 경계 B10:00, 미정 강의실/누락 방향 행/두번째 회의 충돌/예상 source_term 링크의 검증 경계를 읽기전용으로 보고. 계산 코드 실행·파일 수정·다른 채팅 메시지 하지 마세요.
```

결과 보고 수신: 정방향 걷기42.94/부족4.66/비용52.26, 역방향42.94/0/42.94, 경계 시작 정방향42.94/24.66/92.26을 확인했다. 집200·목표6학점·두 과목 필수선택과 출발/귀가 포함 범위를 명시해야 한다는 지적을 반영했다. 파일 수정·계산 코드 실행은 하지 않은 읽기·수작업 검토다.

## 결과 상태

독립 기대값과 검사 코드를 준비했다. 실제 실행 상태와 오류 수정 요청·후속 보고는 아래 이어 기록한다. 실제 GPT·지도 페이지·학교 연결·외부 발송 검증은 이번 API 검사 범위가 아니다.

## Frontend → Planner: 준비 산출물 공유

```text
Frontend 독립 준비 산출물을 저장했습니다: demo/timetable_boundary.json, demo/시간표_독립_기대값.md(F01~F14), tests/test_end_to_end.py의 시간표 검사13개(기존12개와 별도). 정/역방향·경계시작·두번째회의충돌·미정건물/누락방향의 null과 known합계·3안중복금지·회피조건·전년도예상·5년누락연도·탐색한도·독립링크복원을 다룹니다. 아직 API 준비 통지를 기다려 실행하지 않았으며 성공으로 기록하지 않았습니다. 계산 코드 파일은 수정하지 않았습니다.
```

전송 성공. 검사13개는 매개변수 사례를 포함한 시간표 부분의 수이며 기존 요건12개를 포함하면25개다. 실행 전 준비 상태로 기록했다.

## Planner → Frontend: 빈도·경고 전파 명확화

```text
Concept 검토를 반영해 계약 명확화: 개설빈도는 target_term 달력연도 직전5년(2027-1→2022~2026)이며 preferences.target_year=권장학년과 무관합니다. 회의쌍중 하나라도 겹치면탈락(실습만겹침 포함). 후보의선수미확인·다전공인정보류·참고·학점충돌경고를 selected sections/plan warnings/최종JSON·Markdown까지전달하고 include_reference가충족승격을뜻하지않음을 명시했습니다. 엔진·보고에도경고전파보완중이며 독립경계에포함해주세요.
```

처리: 빈도 검사에 권장학년2를 지정하고, F15의 참고선택·선수·인정·학점충돌 경고 전파 검사를 추가했다. 준비된 시간표 검사는14개, 기존 요건검사와 합쳐26개다. 실행 결과는 별도 기록한다.

## Frontend → Planner: 준비 마감·실행 연결

```text
Frontend 작업3 독립 준비를 마감했습니다. demo/timetable_boundary.json·demo/시간표_독립_기대값.md(F01~F15) 및 tests/test_end_to_end.py의 새14개를 준비했습니다. 추가 조건은 target_year=2에도 빈도창2022~2026 유지, 참고선택·선수·인정·학점충돌 경고가 sections/plan/JSON·Markdown에 남는지입니다. 기존12개만 재실행해12 passed,14 deselected(1.40초)이며 새14개는 요청대로 통합 준비 통지를 기다려 아직 실행하지 않았습니다. 결과·원문은 docs/sessions/Frontend.md와 prompts/Frontend-07-시간표-독립검증.md에 기록했습니다. API 준비 통지를 받으면26개 통합검사와 필요한 전체검사를 진행하겠습니다.
```

전송 도구 성공을 확인했다. 기능 완료 보고가 아닌 독립 준비 완료 보고다.

## Frontend → Document: 준비 상태 통합 요청

```text
Frontend 후속 상태 기록 요청입니다. 첫 통합 완료 통지는 prompts/Frontend-06-첫통합-완료통지.md에 AI 내부 기록으로 연결했습니다. 이후 Planner 계약·요청에 따라 demo/timetable_boundary.json, demo/시간표_독립_기대값.md, 시간표 검사14개를 준비했습니다. 기존12개만 재검사해12 passed,14 deselected(1.40초)이며 새14개는 Planner 통합 준비 통지 전이라 미실행입니다. 시간표/GPT 구현 완료로 표시하지 마세요. docs/sessions/Frontend.md·docs/검증_결과.md에 준비 상태, prompts/Frontend-07-시간표-독립검증.md에 실제 왕복 원문을 남겼습니다. 별도 사용자 전달 없이 API 준비 후 Frontend 검증으로 이어갑니다.
```

전송 도구 성공을 확인했다. 후속 파일들은09b4ecf 이후 변경이며 아직 그 커밋에 포함된 결과가 아니다.
