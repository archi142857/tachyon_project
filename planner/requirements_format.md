# 졸업요건 대조 계약 v1 — 작업 2-C

2026-11-07. Research 1.0의 승인된 명시 목록 5개를 대조한다. 전체 졸업 사정은 수행하지 않는다. 코드·전공의 적용 범위는 Research의 `docs/졸업요건_검토.md`를 따른다.

## 실행과 입력

```python
from planner.requirements import evaluate_requirements
result = evaluate_requirements(payload, offerings)
```

`payload`는 이수내역 v1 원본 또는 정리 결과다. `offerings`는 개설 자료 문서 목록이다. 항상 `normalize_transcript`를 다시 실행한다. 외부에서 전달한 `summary`, `matched_code`, `countable_completed`, `needs_check` 등의 계산 필드는 신뢰하지 않는다. 원래 취득 상태 자체의 진실성은 학교 조회로 인증하지 않는다.

선택 인자 `requirements_path`는 기본 `data/requirements/2025.json`. 사용자 제공 경로도 동일한 고정 릴리스만 받으며, 같은 폴더의 `schema.json`과 `source/` 보존본이 필요하다. Research의 `validate`와 `verify_provenance`, 배포본/스키마 SHA256을 모두 확인한 후 계산한다. 배포본·스키마는 CRLF를 LF로 바꿔 Git/Windows 줄바꿈 차이만 허용하고, 원본 보존본은 바이트 해시를 그대로 검사한다. 1.0의 임의 수정·수동 항목 자동 승격·원본 변조·파일 누락은 전체 오류로 중단한다. 새 버전은 별도 계약 변경이 필요하다. 런타임은 표준 라이브러리만 사용하며 GPT 묶음에는 `scripts/validate_requirements.py`와 검증 자료도 포함해야 한다.

```powershell
python -m planner.requirements tests/fixtures/planner/requirements_cases.json --case biology_double --offerings tests/fixtures/planner/requirements_offerings.json
```

CLI의 `--requirements`로 고정 릴리스 사본을 지정할 수 있다. 성공 결과는 표준 출력 JSON. 파일/자료 오류는 `RequirementsValidationError.errors`, 이수내역 오류는 `TranscriptValidationError.errors`의 `{code,path,message}` 목록이며 CLI는 표준 오류 JSON·종료 코드2를 반환한다. 원래 잘못된 값이나 임의 필드명은 오류로 복사하지 않는다. 명령 인자 오류는 argparse 사용법 안내다.

## 적용·판정 기준

- 입학 연도는 2025만 지원한다. 다른 연도는 적용 요건을 선택하지 않고 `unsupported_entry_year`를 반환한다.
- 전공명과 종류를 정확히 대응한다. 별칭·학부 이름의 유사도는 사용하지 않는다. 지원되는 주전공이 정확히 하나일 때만 `common`을 참고 묶음으로 붙이며 `home_unit_unconfirmed`를 표시한다. 주전공 이름만으로 소속·입학경로를 알 수 없고 자유전공학부 등의 예외가 있기 때문이다. 타소속 복수전공만으로 교양·해당 학과 주전공 요건을 부과하지 않는다.
- 중복 전공 입력, 같은 전공의 주/복수 동시 입력, 주전공 없음/여러 개, 미지원 전공·종류는 확인 필요다. 지원되는 전공의 목록은 참고 대조할 수 있지만 최종 상태는 보류한다.
- `needs_check` 또는 `manual_review`는 항상 확인 필요이며 계산값은 null이다. 최소값 null을 0으로 바꾸지 않는다. 기타 조건·총 졸업학점·자연어 필터·대체·선수 관계도 자동 계산하지 않는다.
- 승인 목록은 `all`(모든 코드), `min_count`(최소 과목수), `min_credits`(최소 학점) 의미로 처리하고 null이 아닌 추가 과목수·학점 조건도 함께 적용한다. 해당 규칙의 필수 최소값이 null이거나 학점이 null인 과목은 계산을 보류한다. 현재 실제 5개는 all 2개와 min_count 3개다. min_credits 계산 자체는 가상 산술 검사로 검증하고 새 공식 항목으로 승격하지 않는다.
- 정상적으로 연결된 취득 완료 행만 센다. 같은 코드는 한 번만 센다. 수강 중은 별도 목록으로 표시하며 취득 합계에 넣지 않는다. 미확인·반복·규정 학점과 입력 학점의 불일치는 관련 항목을 보류한다. 규정에 적힌 권장 학년·학기는 이수 시기의 강제 조건으로 사용하지 않는다.
- `coverage != complete`이면 항목 최종 상태는 확인 필요다. 확인된 행으로 계산한 부족량은 `observed_deficit`(관측상 부족량)이며 실제 남은 요건으로 단정하지 않는다.
- 다전공(주전공 이외 전공 또는 서로 다른 여러 전공)은 과목 귀속·공통 인정·실제 승인 정보가 v1에 없어 최종 인정은 보류한다. 다전공 자체가 인정 불가라는 뜻이 아니다. 항목별 목록 대조는 참고값으로 유지한다. 승인연도 하나로 해제하는 경로는 없다.
- 같은 취득 과목이 여러 선택 요건의 명시 목록에 걸리면 해당 자동 항목에 `overlap_unresolved`를 남긴다. 문장형 필터의 숨은 중복 관계는 추측하지 않고 수동 항목으로 보존한다. 서로 다른 항목의 관측 학점을 더한 '인정 총학점'을 만들지 않는다.

## 출력

최상위 `schema_version=1`, `evaluation_scope=approved_course_lists_only`, `graduation_status=not_evaluated`, `ruleset`(버전·해시·기준연도), `entry_year`, `programs`, `coverage`, `transcript_summary`, `transcript_issues`, `issues`, `sets`, `summary`, `needs_check`.

각 묶음은 `id/name/kind/unit/applies_to`, `total_credits`(참고 규정값), `total_credits_status=needs_check`, `items`. total_credits가 null이든 숫자든 전체학점 판정은 하지 않는다.

각 항목:

- `id/name/section/rule`, `min_credits/min_count`(원래 최소조건, null 유지), `status`: `satisfied`(목록 요건 충족), `remaining`(목록 요건 남음), `needs_check`(확인 필요).
- `needs_check`, `reasons`: `{code,message}` 목록. 전역 적용·조회 문제와 항목 자체의 이유를 함께 전달한다.
- `sources`: 원문 문서·URL·조항. `evidence`: Research 검토 근거·적용 범위. `original_pointer`, `review_status`, `calculation_mode`, `note`로 원본을 추적한다.
- `calculation`: 수동 항목은 null. 자동 항목은 `status`, `counted_codes/count/credits`, `in_progress_codes`, `uncertain_codes`, `missing_codes`(all만), `candidate_codes`(선택군만), `observed_deficit: {credits,count}`. 확인 사유가 있으면 calculation.status도 needs_check일 수 있다. 관측상 조건을 채웠더라도 최종 status는 다전공·부분조회 등 때문에 needs_check일 수 있다.
- `remaining`: 최종 상태가 satisfied/remaining인 경우만 `{credits,count,required_codes}`. 선택군의 미이수 후보 전체를 필수로 표시하지 않는다. 확인 필요면 null.

상태가 satisfied여도 승인된 그 목록에 대한 결과다. `graduation_status`는 언제나 not_evaluated이며, 비선택 전공을 포함한 학교 전체 규정을 검사했다고 표시하지 않는다. 전체 summary는 상태별 항목 수만 반환하며 전공 간 학점 합계는 없다.

## 검증 입력

`tests/fixtures/planner/requirements_cases.json`은 가상 학생 3사례다. `requirements_offerings.json`은 공식 목록의 번호·과목명을 참고한 가상 개설 기록이며 실제 편람·학생 자료가 아니다. 독립 기대값과 경계 검사는 `tests/test_requirements.py`. 공식 자료를 수정해 가짜 성공 사례를 만들지 않는다.
