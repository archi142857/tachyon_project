# 2025학번 졸업요건

검토일: 2026-11-07. 7묶음, 학점·과목 요건 53개와 기타 조건 37개를 보존했다. 형식 검사 통과는 공식 규정 전체의 사실 확인이나 학생의 졸업 가능 판정이 아니다.

| 파일 | 용도 |
| --- | --- |
| [2025.json](2025.json) | 초안 사실에 ID·검토·계산 가능 여부를 더한 입력 |
| [schema.json](schema.json) | JSON Schema Draft 2020-12의 제한된 키 집합으로 작성한 형식 |
| [source/snu_2025_graduation_requirements.json](source/snu_2025_graduation_requirements.json) | 제공된 초안의 바이트 단위 보존본 |
| [reviews/](reviews/) | 공식 자료와 대조한 90항목의 판단·근거·적용 범위 |
| [needs_check.json](needs_check.json) | 확인 또는 계산 조건 정리가 필요한 85항목 |
| [검토 문서](../../docs/졸업요건_검토.md) | 사람이 읽는 확인 필요 목록과 사용 계약 |
| [Research 인수인계](../../docs/sessions/Research.md) | 결과·검증·미완료·다음 과제 |

## 실행

```sh
python scripts/validate_requirements.py
python scripts/validate_requirements.py --strict-facts
python -m pytest tests/test_validate_requirements.py
```

검증기는 표준 라이브러리만 사용한다. 기본 검사는 구조·계산 차단 조건·원본 해시·원본 사실 보존을 검사하며 성공은 종료코드 0이다. 오류는 1, `--strict-facts`에서 확인 필요가 남으면 2다. 이 옵션은 온라인 사실 확인을 실행하지 않는다. 테스트에는 pytest를 사용하거나 `python -m unittest discover -s tests -p test_validate_requirements.py`를 실행한다.

## 계산 담당에게

- `needs_check=true`인 항목은 `확인 필요`로 반환한다. null·빈 과목목록을 0학점이나 충족으로 처리하지 않는다.
- `review.status`는 근거 검토 결과이고 `calculation.mode`는 조건을 기계적으로 표현했는지 나타낸다. 근거가 확인됐어도 문장형 조건·행정 확인이 있으면 `manual_review`다.
- `course_list`는 검증 코드의 승인 ID 5항목만 명시 과목목록으로 계산할 수 있다. 새 항목은 필수조건 검토와 코드·테스트 갱신을 함께 거쳐야 한다. `all`은 모두, `min_count`는 최소 과목수, `min_credits`는 최소 학점을 뜻하며 지정된 수치 조건은 함께 적용한다. 동일 과목은 한번만 센다. 항목 사이의 학점 합산·중복 인정까지 허용한다는 뜻은 아니다.
- `year`·`term`은 권장 학년·학기다. null은 미확인/미지정이며 선이수 의무로 바꾸지 않는다. 실제 개설이나 수강 가능을 보장하지 않는다.
- 원본 `prerequisites`·`equivalents`에는 설명문도 있다. 코드처럼 파싱하거나 대체 관계를 양방향으로 확장하지 않는다. 관계가 있는 항목은 현재 자동 계산 대상에서 제외했다.
- 공통 교양은 세 소속을 요약한 자료다. 타 소속 복수전공생에게 공통 교양이나 복수전공 학과의 주전공 교양을 자동 부과하지 않는다.
- GPA·어학시험 성적은 규정 설명에만 있다. 실제 학생 성적·식별자를 수집하거나 계산하지 않는다.

원문 필드 변경은 현 검증기가 거부한다. 사실 수정이 필요하면 보존본은 유지하고 근거·변경 내역을 갖춘 새 버전의 자료와 이관 규칙을 먼저 마련한다. 현재 1.0은 수치 수정 없이 검토 상태만 추가한 버전이다.
