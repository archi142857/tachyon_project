# 작업 3 계약 v1 (구현·검증 완료)

2026-11-07. Frontend와 공유하고 구현·검증한 입력·출력 계약이다. 고정 Research 1.0 및 이수내역 v1을 사용한다. 상태/자료 확인과 계획상의 배치를 졸업 인정으로 바꾸지 않는다. 실행 결과·한계는 [Planner 인수인계](../docs/sessions/Backend-Planner.md)에 기록한다.

## 후보 API

`build_candidates(payload, offerings, *, target_term, preferences=None, requirements_path=DEFAULT_DATA)` → 후보 객체.

preferences: `min_credits=15`, `max_credits=18`, `home="919A"`, `avoid_days=[]`(0~5), `avoid_times=[]`(`{day,start,end}`), `include_codes=[]`(사용자가 추가한 과목), `required_codes=[]`(시간표에 반드시 포함), `include_reference=false`, `target_year=null`(권장 학년 비교용, 입학연도에서 추정하지 않음), `max_nodes=100000`. 알 수 없는 키는 거부한다. 시간은 자정부터 분, 끝 시각과 다음 시작 시각이 같으면 시간 겹침은 아니다.

2-C를 내부 재실행한다. 확정 남음 목록은 `candidates`, 부분조회·다전공 등 보류 목록은 `reference_candidates`; 수동85항목은 자동 후보를 만들지 않는다. `include_codes/required_codes`로 명시한 과목은 사용자 선택 근거만 가진다. 기취득·수강중·상태 불명·반복은 후보에서 제외하고 이유를 반환한다. 선수 규정은 자연어를 파싱하지 않으며 현재 1.0의 구조화 승인 근거가 없으면 unknown으로 표시한다. 빈 선수목록을 선수 없음으로 해석하지 않는다.

target_term의 개설 자료가 있으면 사용한다. 없으면 정확히 전년도 같은 학기 자료를 예상으로 사용한다. 그것도 없으면 source_term=null·후보 없음이며 더 오래된 자료를 조용히 사용하지 않는다. 빈 미래 편람도 목록이 존재한다는 사실만으로 정상 확정 자료라고 추정하지 않는다. 개설 빈도는 **target_term의 달력연도 직전5년** 같은 학기의 제공된 이력에서 다시 계산하고 누락된 해를 별도로 표시한다. 예: 2027-1이면 2022~2026의 1학기다. preferences.target_year=2는 권장 **학년** 비교이며 이 달력연도와 무관하다. 분모5를 확률이라고 표현하지 않는다.

후보 객체 필드: `schema_version=1`, `target_term`, `source_term`, `estimated`, `preferences`, `candidates`, `reference_candidates`, `excluded`, `issues`, `goals`, `requirements_summary`. 후보 하나: `code,name,credits,category`, `sections[{number,status,meetings[{day,start,end,building,room}]}]`, `requirement_ids`, `basis`(`remaining_requirement/reference_requirement/user_requested`), `priority`(정렬용 숫자 목록), `prerequisite_status=unknown`, `frequency{years_offered,window_years,observed_years,missing_years}`, `warnings`. sections는 교수 정보 없이 새 객체로 만든다.

goals: `{id,kind,all_codes,min_count,min_credits,candidate_codes}`. kind는 all/selection. 실제 취득을 뺀 계획상의 부족량만 전달하며 수동/미확인 항목은 확정 목표로 만들지 않는다. 목표를 채운 계획도 실제 요건 충족이 아니다.

후보에는 `requirement_sources`(요건 ID별 문서 title·url·locator 목록)와 `recommended_year/recommended_term`도 포함한다. 학점 충돌 후보는 목표의 candidate_codes에서 제외하되 all_codes의 필수 의무는 남긴다. 참고 후보를 선택해도 그 의무를 계획 충족으로 바꾸지 않는다.

## 시간표 API

`search_timetables(candidate_result, walk_rows, *, top_k=3)` → `{schema_version,target_term,source_term,estimated,plans,issues,excluded_sections,search}`. walk_rows는 `[{from,to,minutes}]`로 csv.DictReader 결과도 허용한다. 방향별 값을 그대로 사용하고 역방향·좌표 추정으로 채우지 않는다. 동일한 확정 건물은0분(실내 이동 미포함). 출발/귀가 기본점은 TT cli.py search 기본919A.

후보에서 서로 다른 과목 부분집합과 과목당 분반1개를 선택한다. 학점 범위와 required_codes·피하는 요일/시간을 지킨다. 빈 회의시간·잘못된 시간·분반 내부 겹침·폐강대상은 제외하며 전체 자료 오류와 개별 미정 분반을 구분한다. 동일 요일·시작·끝·건물 중복은 TT처럼 방만 합쳐 한 회의로 센다. 다른 과목의 **회의 쌍 중 하나라도** 시간이 겹치면 불가다. 강의는 안 겹쳐도 실습 회의가 겹치면 탈락한다.

순위는 계획상 all 필수 남음 과목 수와 채운 명시 목표 수를 먼저, 같은 우선순위에서는 이동정보 완전성·TT 비용·안정적인 식별자 순으로 정한다. 권장시기·선수확인·5년빈도는 후보 정렬과 동점 비교의 참고이며 강제 수강 조건이 아니다. `max_nodes`를 넘으면 실제 찾은 안만 반환하고 search.complete=false·탐색한도 이유를 표시한다. 전체 최적·불가능을 입증했다고 말하지 않는다.

방향표에는 삼각부등식이 보장되지 않으므로 중간 비용만으로 가지치기하지 않는다. 학점·시간 충돌로 제외하며, 한도 내에서 실제 과목 부분집합과 분반 조합을 탐색한다. 미정 수업을 건너뛰어 앞뒤 건물을 가상 연결하지 않는다.

plan: `id,credits,sections`(code,name,credits,number,meetings,requirement_ids,basis 포함), `days`(요일별 회의 목록), `legs`(집→수업들→집), `walk_minutes`, `shortage_minutes`, `cost`, `known_walk_minutes`, `known_shortage_minutes`, `known_cost`, `travel_complete`, `warnings`, `goal_progress`, `selection_score`.

후보의 선수 미확인·다전공 인정 보류·참고 후보·규정학점 충돌·이력 누락 경고를 선택된 sections와 plan.warnings 및 최종 JSON·Markdown까지 전달한다. include_reference=true나 사용자 명시 선택은 시간표 탐색을 허용할 뿐 요건/선수 충족으로 승격하지 않는다. 시간표가 배치된다는 사실과 수강 자격·졸업 인정은 구분한다.

확정 이동에서는 비용=주간걷기+2×부족분. leg는 `day,from,to,depart,arrive_by,minutes,slack,shortage,status`. 건물이 미정이거나 방향별 이동표가 없으면 그 구간 minutes/slack/shortage=null, 총 walk_minutes/shortage_minutes/cost도 null. 건물만 확인되고 방이 미정이면 건물간 이동은 계산하되 방 미정·실내 이동 미포함을 표시한다. 알려진 부분 합계는 known_*에만 기록한다. 원본의 미정 수업 앞뒤 여유 누적은 참고 경로 계산에만 사용할 수 있고 이동0/도착가능으로 표시하지 않는다. 부분 비용을 완전한 경로보다 싸다고 확정 순위화하지 않는다.

최대3개를 반환한다. 유효안0개면 학점 부족·필수과목 미개설·시간충돌·조건 제외·탐색한도 등의 확인된 이유를 반환한다. 1~2개면 실제 수만 표시하며 가짜3안을 만들지 않는다.

## 보고 API

`build_report(search_result)` → `{json,markdown}`. json은 계획마다 `tt_link` 필드에 TT 링크를 추가한 결과. `encode_timetable_link(plan, semester, title)` 및 `decode_timetable_link(url)` 제공. TT 포맷은 `[1,학기,제목,[[번호,분반,null,과목명],...]]`, j+base64url(JSON) 또는 z+base64url(raw deflate). 셋째 칸은 색상 지정 자리이며 이 프로젝트에서는 null이다. 예상안 링크는 실제 source_term의 분반을 열고 제목·본문에 target_term 예상임을 표시한다.

Markdown은 각 안의 요일·과목·분반·시간·건물, 근거요건/사용자선택, 경로 여유·부족분·미정, 학점/비용, 예상과 참조학기, 부족 이유·검색한도를 표시한다. 끝에 `TT Wizard 자료: 캠퍼스 마법 지도·© OpenStreetMap 기여자, 국토지리정보원, 서울대 수강편람`을 둔다.

공개 통합 실행은 `recommend_timetables(payload, offerings, walk_rows, *, target_term, preferences=None, requirements_path=...)`(planner/report.py)에서 위 세 API를 연결하며 반환형은 `build_report`와 같은 `{json,markdown}`이다. 실제 학교 연결·GPT 빌더·지도 서비스 접근은 하지 않는다. 입력 오류는 `PlanningValidationError.errors`의 고정 code/path/message 목록. 사용자 원래 값·불필요한 필드명을 오류로 노출하지 않는다.

## TT 원본

참고/이식 기준: TT Wizard `693fe91649e3aa6cf0ac244a67d38e259fe62ff2`, MIT. `ttwizard/models.py`의 겹침·중복 회의, `evaluate.py`의 집→수업→집과 비용, `search.py`의 분반 탐색, `cli.py`의 기본집, `web/js/app.js`의 링크 포맷. 교수 필드는 가져오지 않는다. 이식한 파일 머리에 경로·커밋·MIT를 적고 기존 LICENSE를 유지한다. 미정 이동의 null·검색한도·과목 부분집합은 이번 프로젝트가 추가하는 경계다.
