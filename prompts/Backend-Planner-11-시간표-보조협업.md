# 작업 3: 시간표 보조 에이전트 협업 원문

- 날짜: 2026-11-07.
- 분류: AI 보조 에이전트 협업. 아래 지시·질문·보고는 사용자 직접 지시가 아니다.
- 도구: Codex 보조 에이전트 협업.
- 송수신 담당: Project / Backend / Planner 본 담당, 시간표 계산 보조, 보고서 보조. 각 원문에 방향을 표시했다.
- 목적: 작업 3의 시간표 탐색·동선 계산을 나눠 구현하고 입출력·경고·요건 인정 경계를 맞춘 과정 보존.
- 결과: 시간표 계산 보조가 담당 코드·가상 자료 검증 파일의 작성을 마쳤다고 보고했고, 본 담당이 통합 검증·기록 단계에서 수정 중단을 요청했다. 이 기록을 만드는 보조는 전체 테스트의 최종 실행 결과를 직접 전달받지 않았으므로 통과 수를 쓰지 않는다.
- 담당 파일: [시간표 코드](../planner/timetable.py), [시간표 검증](../tests/test_timetable.py). 협의 기준은 [작업 3 입출력 계약](../planner/timetable_format.md), 최종 인수인계는 [Backend / Planner](../docs/sessions/Backend-Planner.md).
- 이번 기록 요청의 수정 범위: 이 파일 하나. 코드·공통 문서를 수정하지 않았다.
- 공개 가림: 사용자 환경의 절대 경로는 `[작업 저장소 절대 경로 가림]` 또는 `[허용된 TT Wizard 원본 절대 경로 가림]`으로 바꿨다. 에이전트 내부 식별자는 `[보고 보조 내부 식별자 가림]` 또는 `[본 담당 내부 식별자 가림]`으로 바꿨다. 공개 코드 경로와 공개 Git 커밋은 남겼다. 이 가림 이외에는 아래 원문의 문장·띄어쓰기·오탈자를 고치지 않았다.
- 복구 한계: 대화 일부는 문맥 압축으로 요약만 남아 있다. 특히 압축 이전에 시간표 보조가 보고서 보조에게 보냈다는 검색 메타데이터·목표 진행·구간 형식 안내는 실제 원문을 재확인할 수 없어 복구할 수 없다. 요약을 원문처럼 만들어 넣지 않았다. 아래는 현재 문맥에서 실제 원문을 확인할 수 있는 메시지다. 도구 호출 인자·실행 출력·시스템 지시는 협업 발화로 재작성하지 않았다.

## 1. 본 담당 → 시간표 보조: 최초 배정

```text
작업3 시간표 엔진을 구현하세요. 저장소 [작업 저장소 절대 경로 가림]. 최신 AGENTS.md와 planner/timetable_format.md를 반드시 읽고 계약대로 planner/timetable.py 및 tests/test_timetable.py만 작성하세요(다른 파일은 수정 금지). 저는 courses.py+PlanningValidationError를 작성, 다른 보조는 report.py 담당. TT 원본 허용 경로 [허용된 TT Wizard 원본 절대 경로 가림]만 읽을 수 있으며 기준 commit693fe91649e3aa6cf0ac244a67d38e259fe62ff2; ttwizard/models.py,evaluate.py,search.py,conflicts.py,cli.py 읽고 필요한 로직 이식시 머리에 출처 경로·커밋·MIT. 계약의 search_timetables(candidate_result,walk_rows,top_k=3), 최대3안, 과목 부분집합·분반·학점범위·required_codes·모든시간겹침·방향이동·미정null·집919A·비용walk+2shortage·검색한도/이유. include_reference는 preferences flag true일때만 참고후보 포함, 아니면 candidates만. 후보 priority[required(0)/selection(1)/user(2)/reference(3),recommended_year_distance,term_mismatch,prereq_rank,-frequency] 읽어 정렬/동점사용. goal_progress는 planned 상태만(졸업충족아님). 라이브러리 표준만. 검사도 의미있는 독립 기대값 포함. PlanningValidationError는 planner/courses.py에서 제공할 예정이나 circular import 피하려면 timetable 안 자체 별도 오류 클래스보다 공통 planner/planning_types.py 필요를 부모에게 알리세요. 코드를 완성하고 결함/테스트 범위 보고, 테스트 전체 실행은 부모가 합니다. 사용자 요청·내부요청 원문 기록은 부모가 담당합니다.
```

## 2. 본 담당 → 시간표 보조: 공통 오류 형식

```text
공통 planner/planning_types.py 생성했습니다. from planner.planning_types import PlanningValidationError; 생성자(code,path,message) 확정입니다. courses.py에서 reexport도 가능하나 공통모듈 import 바랍니다. 참조 후보 분리와 reference warnings/requirement basis 유지 부탁합니다.
```

## 3. 보고서 보조 → 시간표 보조: 보고 입력 협의

```text
report.py는 계약의 plans[].sections{code,name,credits,number,meetings,requirement_ids,basis}, travel_complete, known_*와 nullable totals, legs, warnings, goal_progress를 읽습니다. plan.id는 int 또는 str 허용하고 days는 렌더링에서 sections의 모든 meetings를 정렬해 사용합니다. search metadata keys(complete,nodes,max_nodes,feasible_count 등) 예정 필드 알려주세요. 공통 오류 PlanningValidationError(code,path,message) 사용합니다.
```

## 4. 본 담당 → 시간표 보조: 보고 계약과 후보 정리 상태

```text
Frontend계약 확정 plan.tt_link는 report에서추가, report통합 {json,markdown}. report 담당 [보고 보조 내부 식별자 가림] 와 세부필드 모호하면 직접 조정해주세요. known_*부분합계와 travel_complete=false/null 총값 필수. [본 담당 내부 식별자 가림] courses.py 작성완료이고 공통planning_types import가능. 후보.sections/status와모든meetings는 raw안전정리됨(잘못된시간은이엔진에서제외). partial_reference 후보선택flag contract대로.
```

## 5. 본 담당 → 시간표 보조: 건물과 방의 미정 구분

```text
TT위치판정은 건물building 기준으로 유지: building 빈값은 이동null. building은확정인데 room만빈값이면 건물간이동은계산하되 실내이동미포함/방미정 warning이면좋습니다. 같은건물0도 실내이동미포함이지 실제0분보장아님. 문서명확화는부모가합니다.
```

## 6. 본 담당 → 시간표 보조: 학기 입력 검증 요청

```text
코드 검토: target_term/source_term/estimated 현재 get만하며 직접 lowlevel입력검증없습니다. 계약 target YYYY-[12], source None 또는동형식, estimated bool을검증하고 후보있는데 source None은거부해주면 report링크단계에서늦게깨지지않습니다. 이전 방미정warning도반영부탁. 후보명/번호는허용텍스트지만 arbitrary warnings/metadata를그대로복사하지않는현구조유지. 완성되면부모에게알려주시면전체검증실행.
```

## 7. 본 담당 → 시간표 보조: 경고와 참고 정보 보존 요청

```text
Concept필수수정: 후보 warnings(특히 requirement_recognition_unconfirmed/requirement_credit_conflict/history_incomplete/estimated_offerings)와 frequency·recommended 정보가 현재 chosen_section에서탈락합니다. 저위경고는선택plan과최종보고까지보존해야하며 include_codes로ref를user_requested로고른경우에도다전공인정보류경고는남아야합니다. 후보 warnings를알려진고정code만허용해selected.sections[].warnings에보존하고 plan.warnings에한글메시지로집계해주세요. reportagent에도알립니다. 미확인선수는statusunknown유지. 같은기능재작성불필요,경계테스트추가.
```

## 8. 시간표 보조 → 본 담당: 출처 형식 질문

```text
시간표 코드는 지정 파일에 작성되어 있고 경고·권장시기·빈도 허용값 보존, 학기 검증을 추가 중입니다. courses.py에 새 requirement_sources가 보입니다. 근거 출처도 최종 보고에 필요하다면 sources의 허용 키 스키마를 알려 주세요. 임의 객체를 그대로 복사하지 않겠습니다. 테스트 파일 완성 후 즉시 검증 요청하겠습니다.
```

## 9. 본 담당 → 시간표 보조: 출처 허용 필드

```text
requirement_sources는 {요건ID:[{title:str,url:str,locator:str},...]}입니다. 키는 해당 candidate.requirement_ids에포함된것만,각source허용3키만문자열복사해주세요. 고정1.0검증에서온자료이며추가미지원키무시. chosen_section에보존하면보고근거링크연결가능. requirements_names는이번에추가하지않고 ID를표시해도계약충족합니다.
```

## 10. 보고서 보조 → 시간표 보조: 보고 구현 상태

```text
report.py 준비됐습니다. 알려주신 search/goal_progress/leg 필드 지원했고 plan.tt_link 추가해 {json,markdown} 반환합니다. selected.sections[].warnings 보존, plan.warnings와 중복 없이 병합해 JSON/Markdown 모두 표시합니다. source_term 없는 계획은 거절하며 미정 총비용 null과 known_* 별도 유지합니다. 시간표 meetings는 모든회의 그대로 days 재구성하며 겹침 보고는 방어합니다.
```

## 11. 시간표 보조 → 본 담당: 구현 및 검증 요청 보고

```text
planner/timetable.py와 tests/test_timetable.py 작성 완료했습니다. 전체 검증 부탁드립니다. 학기·estimated 사전검증, selected.sections의 고정 경고·frequency·recommended_year/term·허용3키 requirement_sources 보존, plan 경고 집계, 건물기준/방미정 경고 반영했습니다. 독립 기대값25분+2×2=29, 역방향53, 모든회의겹침, 부분집합/필수학점,미정null,참고후보flag,계획목표우선,탐색한도,비삼각방향표,개인필드차단 등 테스트를 추가했습니다. 실행 결과 전달받으면 즉시 수정합니다.
```

## 12. 시간표 보조 → 보고서 보조: 보존 필드 연결 보고

```text
시간표 코드/테스트 작성 완료. metadata 보존 필드 warnings(알려진5코드),frequency(4키),recommended_year/term,requirement_sources({requirement_id:[title,url,locator]})추가됐습니다. plan.warnings에도고정한글메시지집계. room_unconfirmed/indoor_travel_excluded 경고도추가됐습니다. 부모에게전체테스트요청했습니다.
```

## 13. 본 담당 → 시간표 보조: 학점 충돌 과목의 목표 인정 경계

```text
courses.py에서 요건 원자료와 대상 학기 학점이 다른 코드는 참고 후보로 바꾸고 goals.candidate_codes에서 제거합니다. goals.all_codes는 필수 의무 보존을 위해 유지합니다. all 목표 진척 계산도 candidate_codes에 포함된 코드만 인정하고, all_codes 전체 의무는 유지하여 참고 후보로 충족 확정하지 않도록 해 주세요. 의미 있는 경계 검사 추가 부탁합니다. 구현 끝나면 알려 주세요. 부모가 전체 테스트 실행합니다.
```

## 14. 시간표 보조 → 본 담당: 학점 충돌 경계 수정 보고

```text
all 목표 진척도 candidate_codes 교집합만 인정하도록 수정 완료했습니다. all_codes의 전체 의무수는 유지하며,학점충돌 참고후보가 실제시간표에들어가도 planned_codes=[],credits0,남은과목1/학점3,not_planned가되는독립경계검사를추가했습니다. 현재파일검증가능합니다.
```

## 15. 시간표 보조 → 본 담당: 탐색 및 미정 이동 설명

```text
현재 탐색은 max_nodes 내 모든 실제과목부분집합·분반을 반복 스택으로검사하며 비용가지치기는사용하지않습니다. 방향표에삼각부등식이보장되지않아 추가과목을거친경로가더쌀수있기때문입니다. unknown 앞뒤로가상연결하지않고실제인접구간만 known_*에더합니다. 모든미정은총계null. 이 동작을계약/인수인계에남겨주세요.
```

## 16. 시간표 보조 → 본 담당: 분반 중복 경계 마감 보고

```text
추가경계검사1개반영:공백정리후동일한분반번호도중복으로제외해동일계획을여러안처럼반환하지않도록했습니다. 이제지정파일수정마쳤습니다. 테스트진행가능합니다.
```

## 17. 보고서 보조 → 시간표 보조: 보고 구현 마감

```text
보고 최종 마감했습니다. requirement_sources(정의된 title/url/locator만), frequency(4키),recommended_year/term을 JSON에 보존하고 Markdown에 문서·조항 링크와 이력·권장시기 참고를 추가했습니다. 부모 전체 검증에 전달했고 이후 수정은 먼저 통보 후 진행할 예정입니다.
```

## 18. 시간표 보조 → 본 담당: 작업 종료 보고

```text
지정된 두 파일을 완성했습니다.

- `planner/timetable.py`: 과목·분반 조합, 모든 수업 겹침, 방향별 이동, 미정 총계 `null`, 최대 3안, 탐색한도·제외 이유 구현.
- `tests/test_timetable.py`: 직접 계산한 비용, 참고 후보·학점 충돌, 경고·출처 보존, 입력 경계 검증 추가.

표준 라이브러리만 사용하고 TT 출처·MIT를 표시했습니다. 전체 테스트 실행은 부모에게 요청했습니다. 커밋·푸시는 하지 않았습니다.
```

## 19. 본 담당 → 시간표 보조: 코드 수정 중단

```text
마감 확인했습니다. 이제 통합검증/기록 중이므로 파일 수정 멈춰 주세요. 마지막 공백 분반번호 경계까지 실행 수에 포함됐는지 확인하겠습니다. 이후 발견 사항은 제안으로 보고해 주세요.
```

## 20. 본 담당 → 시간표 보조: 이번 원문 기록 추가 요청

```text
코드 수정 없이 기록만 요청합니다. 본인에게 실제 전달된 작업3 지시·질문·수정요청과 실제 보낸 결과보고 원문을 prompts/Backend-Planner-11-시간표-보조협업.md에 보존해 주세요. 날짜2026-11-07, AI 보조 에이전트 협업(사용자 직접지시 아님), 송수신 담당, 목적, 결과, 담당 파일 링크를 명시합니다. 이 추가 요청도 기록합니다. 개인 사용자 경로·내부 식별자는 가리고 가림 사실을 명시하되 원문을 요약 재작성하지 마세요. 원문을 볼 수 없는 부분은 복구할 수 없다고 명확히 적고 만들지 마세요. 공통문서·코드는 손대지 말고 파일만 만든 뒤 보고하세요.
```

## 21. 시간표 보조: 기록 작업 진행 안내

```text
현재 확인할 수 있는 협업 원문을 기록하겠습니다. 복구할 수 없는 부분과 경로를 가린 부분도 명시하겠습니다.
```
