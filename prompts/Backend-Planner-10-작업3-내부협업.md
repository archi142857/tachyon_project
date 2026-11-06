# 작업 3 계약 공유·수정·독립 검증 요청

- 날짜: 2026-11-07
- 분류: AI 세션 간 지시·보고. 사용자 직접 지시나 미실행 제안으로 분류하지 않는다.
- 도구: Codex 세션 메시지.
- 목적: 고정 1.0 요건 대조 이후 시간표 API를 공유하고 별도 기대값으로 검증한다.
- 공개 가림: 내부 채팅·메시지 식별자는 도구 봉투에서 제외했다. 아래 본문 원문은 유지한다. 개인 경로가 포함된 경우 개인 부분만 가린다.

## 발신 1: Backend / Planner → Project / Frontend

상태: 실제 전송 성공. 계약 공유 뒤 구현 준비 통지까지 전달했다.

```text
작업3 계약을 planner/timetable_format.md에 작성했습니다. 후보 build_candidates(payload,offerings,*,target_term,preferences=None), 시간표 search_timetables(candidate_result,walk_rows), 통합 recommend_timetables(...) 및 build_report가 예정 API입니다. 구현 진행 중입니다. 기본15~18학점·집919A, 목표학기없으면 정확히전년도같은학기만 예상, 참고요건 후보는 분리/include_reference 선택, 미정 이동은 총비용null·known_*부분합계, 실제최대3안·제한이유, TT링크는 source_term을 열도록 정했습니다. 계약을 읽고 tests/test_end_to_end.py/Frontend 소유 가상 기대값에서 방향성·회의 전체·unknown·불가능·예상/링크 복원을 독립 준비해 주세요. 계산 담당 파일은 제가 맡습니다. API 준비 시 다시 알려드리겠습니다.
```

## 발신 2: Backend / Planner → Project / Frontend

상태: 실제 전송 성공. 계약 공유 뒤 구현 준비 통지까지 전달했다.

```text
계약에 반환형과 링크명을 확정했습니다. recommend_timetables → {json,markdown}, result.json.plans[].tt_link 입니다. planner/timetable_format.md 반영했고 보고 담당에게도 전달했습니다. 후보 courses.py는 실행 가능하지만 timetable/report 구현 중이므로 통합 API 준비 통지를 기다려주세요. 말씀하신 수작업 42.94/4.66/52.26 및 역방향 기준으로 독립 검증해 주세요.
```

## 발신 3: Backend / Planner → Project / Frontend

상태: 실제 전송 성공. 계약 공유 뒤 구현 준비 통지까지 전달했다.

```text
Concept 검토를 반영해 계약 명확화: 개설빈도는 target_term 달력연도 직전5년(2027-1→2022~2026)이며 preferences.target_year=권장학년과 무관합니다. 회의쌍중 하나라도 겹치면탈락(실습만겹침 포함). 후보의선수미확인·다전공인정보류·참고·학점충돌경고를 selected sections/plan warnings/최종JSON·Markdown까지전달하고 include_reference가충족승격을뜻하지않음을 명시했습니다. 엔진·보고에도경고전파보완중이며 독립경계에포함해주세요.
```

## 발신 4: Backend / Planner → Project / Frontend

상태: 실제 전송 성공. 계약 공유 뒤 구현 준비 통지까지 전달했다.

```text
작업3 통합 API 구현을 마감했습니다. planner/courses.py·timetable.py·report.py 및 계약을 기준으로 독립검사를 지금 실행해 주세요. 중간 전체검사는426 passed,9 subtests passed였고 이후 보고서 출처·빈도 표시와 all 목표의 학점충돌 참고후보 비인정 경계가 추가돼 제가 최종 전체 재검사합니다. Frontend의26개 독립검사를 우선 실행하고 오류가 있으면 코드 수정 대신 재현 입력·기대/실제·담당 요청을 알려 주세요. 성공 후 demo 기대값·검증 기록을 갱신하고 새 검사를 포함한 개수/시점/범위를 보고해 주세요. 직접커밋 없이 마감 상태를 알려 주시면 Concept 통합 보고에 포함합니다.
```

## 수신 1: Project / Concept → Project / Backend / Planner

```text
작업3 계약 초안을 읽기전용으로검토했고 아래3개만명확화해주세요. (1) preferences.target_year는권장학년인데빈도설명에서도target_year를써달력연도와혼동됩니다. 빈도는target_term의연도로2027-1이면2022~2026을사용한다고명시하고 학년2와구분하세요. (2) '다른과목의모든회의시간이겹치면불가'는회의쌍중하나라도겹치면불가라는뜻으로명확히하세요. 강의는안겹치고실습만겹치는분반은탈락해야합니다. (3) 후보의선수미확인/다전공인정보류/참고후보경고를선택된plan과최종JSON·Markdown까지전달한다는계약을명시하세요. include_reference=true가요건충족확정이나선수충족으로바뀌면안됩니다. 현재구현이이미맞으면문구와의미있는경계검사만보완하고같은기능을다시만들지마세요. Frontend와공유한계약에도반영하고이요청·결과를AI기록으로남겨주세요. 기존작업3범위·1.0고정·직접커밋금지는유지하며별도수신확인회신은필요없습니다.
```

## 수신 2: Project / Frontend → Project / Backend / Planner

```text
Frontend 작업3 독립 준비를 마감했습니다. demo/timetable_boundary.json·demo/시간표_독립_기대값.md(F01~F15) 및 tests/test_end_to_end.py의 새14개를 준비했습니다. 추가 조건은 target_year=2에도 빈도창2022~2026 유지, 참고선택·선수·인정·학점충돌 경고가 sections/plan/JSON·Markdown에 남는지입니다. 기존12개만 재실행해12 passed,14 deselected(1.40초)이며 새14개는 요청대로 통합 준비 통지를 기다려 아직 실행하지 않았습니다. 결과·원문은 docs/sessions/Frontend.md와 prompts/Frontend-07-시간표-독립검증.md에 기록했습니다. API 준비 통지를 받으면26개 통합검사와 필요한 전체검사를 진행하겠습니다.
```

## 결과

달력연도/권장학년, 한 회의쌍의 겹침, 불확실성 경고의 전 구간 보존을 [계약](../planner/timetable_format.md)에 명시하고 구현·경계 검사를 추가했다. Frontend 준비 보고의 미실행 범위와 실제 통합 결과는 구분한다. 최종 결과는 [인수인계](../docs/sessions/Backend-Planner.md)와 후속 완료 보고에 기록한다. 보조 에이전트 원문은 11~13 기록에 분리했다.

## 추가 복원 수신 1: Project / Frontend → Backend / Planner

상태: 발신 세션 도구 기록에서 전송 완료된 본문을 확인했다. 위 최종 준비 보고보다 먼저 받은 메시지다.

```text
Frontend가 작업3 계약을 읽고 독립 검증 준비를 시작했습니다. home200, 월 A200동09:00~10:00/B302동10:20~11:20 두 과목 각3학점·필수선택으로 주간걷기42.94, 부족4.66, 비용52.26을 고정할 예정이며 역방향 비용42.94와 비교합니다. 모든 회의 충돌·미정/방향누락 null·0~3안·전년도동학기 예상 및 링크의 source_term을 독립 해독하겠습니다. build_report 결과의 계획별 링크 필드명과 recommend_timetables 반환형(json/markdown인지)을 계약에 명시해 주세요. 아직 구현 준비 전은 건너뜀/미검증으로 구분하고 demo/기대값과 tests/test_end_to_end.py만 수정하겠습니다.
```

## 추가 복원 수신 2: Project / Frontend → Backend / Planner

상태: 발신 세션 도구 기록에서 전송 완료된 본문을 확인했다. 위 최종 준비 보고보다 먼저 받은 메시지다.

```text
Frontend 독립 준비 산출물을 저장했습니다: demo/timetable_boundary.json, demo/시간표_독립_기대값.md(F01~F14), tests/test_end_to_end.py의 시간표 검사13개(기존12개와 별도). 정/역방향·경계시작·두번째회의충돌·미정건물/누락방향의 null과 known합계·3안중복금지·회피조건·전년도예상·5년누락연도·탐색한도·독립링크복원을 다룹니다. 아직 API 준비 통지를 기다려 실행하지 않았으며 성공으로 기록하지 않았습니다. 계산 코드 파일은 수정하지 않았습니다.
```
