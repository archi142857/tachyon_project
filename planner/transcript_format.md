# 이수내역 입력·출력 v1 (작업 2-B)

2026-11-07. 개인정보를 제거한 구조화 입력을 정리하는 형식이다. PDF·화면 인식과 공식 졸업 사정은 포함하지 않는다. 예시는 모두 가상 자료이며 졸업 규정이 아니다.

## 입력

```json
{
  "schema_version": 1,
  "entry_year": 2025,
  "programs": [{"name": "동물생명공학전공", "kind": "주전공"}],
  "coverage": "partial",
  "courses": [
    {"code": "EXAMPLE.001", "name": "예시 생물학Ⅰ", "credits": 3,
     "category": "전필", "term": "2025-1", "status": "completed"}
  ]
}
```

- `schema_version`은 1, 생략 시 1. `entry_year`는 네 자리 정수이며 입학 연도만 받는다. 학번은 받지 않는다.
- `programs`는 `{name, kind}` 목록. 각 값은 비어 있지 않은 문자열이다. 예: 주전공·복수전공. 전공명·종류의 공식 적용 여부는 Research 자료를 연결할 때 확인한다. 빈 목록은 확인 필요.
- `coverage`: `complete`(사용자가 전체라고 명시), `partial`, `unknown`. 생략 시 `unknown`. 전체 여부는 코드가 입증하지 않는다. partial/unknown이면 전체 결과의 `needs_check=true`.
- `courses`는 목록이며 비어 있어도 된다. 각 행의 `code`, `name`, `category`, `term`은 문자열 또는 null/생략. 번호·이름은 둘 중 하나 이상 필요하다. 번호는 앞뒤 공백만 제거하며 숫자로 바꾸지 않는다.
- `credits`는 0 이상의 유한 JSON 숫자. null/생략은 확인 필요. 문자열 숫자, bool, 음수, NaN, Infinity는 입력 오류다. 0학점은 허용한다.
- `term`: `YYYY-1`, `YYYY-2`, `YYYY-S`, `YYYY-W`. 생략/null/빈 문자열은 확인 필요. 학기가 없다고 현재 학기로 추정하지 않는다.
- `status`: `completed`(취득 완료), `in_progress`(수강 중), `unknown`(미확인). 한국어 세 표현도 허용한다. 누락/null/빈 값/알 수 없는 문자열은 `unknown`과 확인 사유로 정리한다. 문자열 이외의 값은 입력 오류다. 성적·점수에서 상태를 추론하지 않는다. 미취득·취소 내역은 취득 완료로 전달하지 않아야 하며, 이 v1에는 별도 상태가 없다.
- 정의하지 않은 필드는 모든 수준에서 버린다. 성적·점수·학번·학생 이름·교수 이름·원문 메모는 계산하거나 반환·파일 저장하지 않는다. 허용된 과목명·전공명 칸의 자유 글에서 개인정보를 탐지하는 기능은 없으므로 입력을 만드는 쪽에서 먼저 제거해야 한다.

## 연결·검증 기준

1. `normalize_transcript(payload, offerings)`에 개설 자료 문서 목록을 전달한다. 각 문서는 기존 `data/offerings/*.json`의 `{meta: {semester}, courses: [[code, name, dept, credits, category, sections], ...]}` 형식이다. 계산에는 번호·과목명·학점·학기만 사용한다.
2. 번호가 있으면 번호로만 연결한다. 번호 미발견 시 이름으로 대체하지 않는다. 번호가 같아도 이름·학점이 다르면 확인 필요다. 입력 학기에 기록이 있으면 그 학기 기록으로 대조하고, 없으면 다른 학기 기록을 참고하되 확인 필요로 둔다.
3. 번호가 없으면 이름을 유니코드 NFKC로 정리하고 공백·괄호 기호를 없앤다. 괄호 속 내용은 보존한다. 끝의 로마 숫자 I~XII(한글 뒤 또는 독립된 접미사)는 1~12로 정리한다. 정리된 이름에 연결된 서로 다른 번호가 하나일 때만 연결한다. 입력 학기의 후보를 우선하며, 0개/여러 개면 미연결/모호함으로 반환한다. 유사도·별칭·동일대체 인정은 추측하지 않는다.
4. 입력 학점은 개설 자료로 채우거나 덮어쓰지 않는다. 누락·불일치·개설 기록 내부 학점 충돌은 확인 필요다. 이수구분도 원래 입력값을 유지하며, 누락은 확인 필요다. 편람의 이수구분을 학생에게 적용되는 구분으로 단정하지 않는다.
5. 입력에서 같은 연결 번호가 반복되면 모든 관련 행을 보류한다. 미연결 행은 동일 입력 번호 또는 정리한 이름의 반복을 표시한다. 완전히 같은 행도 삭제하지 않는다. 재수강·중복 인정 규칙은 다음 단계에서 근거를 받아 처리한다.
6. 구조·타입 오류는 전체 입력을 거부한다. `TranscriptValidationError.errors`는 `{code, path, message}` 목록이며 경로는 고정 필드명·행 번호만 포함한다. 오류에 원래 값이나 알 수 없는 필드명을 넣지 않는다. 일부 정상 행만 성공 결과로 내보내지 않는다.

## 출력과 다음 계산의 경계

최상위: `schema_version`, `entry_year`, `programs`, `coverage`, `courses`, `summary`, `issues`, `needs_check`.

각 행: `row`(0부터), `code`(입력 번호), `name`, `credits`, `category`, `term`, `status`, `matched_code`, `match_method`(`code`, `name`, `unmatched`, `ambiguous`), `candidate_codes`, `issues`(고정 사유 코드 목록), `needs_check`, `countable_completed`.

`status`는 입력의 취득 상태이고 `needs_check`는 연결·자료의 불확실성이다. 취득 완료라도 연결이 모호하면 `countable_completed=false`. 확인 사유가 없고 completed인 행만 true다. 이는 **이 입력에서 확인된 취득 학점의 단순 합산 대상**이며 특정 졸업요건 인정 결과가 아니다.

`summary`는 `course_count`, `status_counts`, `confirmed_completed_credits`, `in_progress_credits`, `held_completed_rows`를 반환한다. in_progress_credits도 확인 사유가 없는 수강 중 행만 합산한다. 보류 행은 합산하지 않으며 원래 행을 반환한다. 소수 학점은 십진수로 합산한다. 합계 0을 졸업요건 충족이나 실제 총 취득 학점 0으로 해석하지 않는다.

`issues`는 `{code, path, message}` 목록이며 행별 사유에도 대응한다. `needs_check`는 행·전체의 확인 필요를 뜻한다. 부분 입력이나 전공 미확인은 정상 행의 단순 합산을 막지 않지만 전체 판정에 전달되어야 한다. 함수는 입력을 변경하지 않고 파일·네트워크에 쓰지 않는다.

## 실행

```python
from planner.transcript import normalize_transcript
result = normalize_transcript(payload, offerings)
```

```powershell
python -m planner.transcript tests/fixtures/planner/transcripts.json --case animal --offerings tests/fixtures/planner/offerings.json
python -m pytest --basetemp .test-tmp/planner
```

CLI는 입력 JSON 하나와 개설 JSON 파일 또는 폴더들을 받는다. 예시 묶음에 한해 `--case`로 입력을 선택한다. 결과는 표준 출력, 파일 읽기·내용 검증 오류는 표준 오류의 JSON이며 실패 종료 코드는 2다. 명령 인자 사용 오류는 argparse의 사용법 안내를 출력한다. 실제 입력·결과는 저장소에 저장하지 않는다. Frontend는 행별 상태·확인 사유와 coverage를 함께 보여 주고, Integrations는 개인정보를 제거한 상태·학점·원래 이수구분을 이 형식으로 전달한다.
