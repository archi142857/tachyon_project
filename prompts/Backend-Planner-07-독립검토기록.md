# 2-C 독립 검토 작업 기록

- 날짜: 2026-11-07
- 분류: AI 세션 간 작업 지시·수정 요청. 사용자 직접 지시가 아니다.
- 발신: Project / Backend / Planner. 수신: 독립 검토 보조 에이전트.
- 공개 가림: 개인 실행 경로만 [개인 경로 생략]으로 바꿨다. 내부 식별자는 넣지 않았다.
- 결과: tests/test_requirements.py 작성 완료. 검토에서 발견한 줄바꿈 해시 문제와 거대 정수 오류를 planner/requirements.py에서 수정했다. 전체 250개·하위 9개 통과. 테스트 실행은 Planner가 수행했다.

## 1. 검토 배정

실제 전송·작업 완료.

```text
작업 2-C 독립 검토를 맡으세요. 저장소 D:\대학교\비교과\ChatGPT Edu 활용 상시 공모전\tt-wizard-gpt-edition의 최신 AGENTS.md, data/requirements/README.md, scripts/validate_requirements.py와 docs/sessions/Research.md를 읽고 위험한 경계 및 기대값을 검토해 주세요. 파일 수정은 아직 하지 마세요. 부모가 판정 계약/구현 후 tests/test_requirements.py 작성을 배정할 예정입니다. 범위는 고정 Research1.0 5개 자동 항목과 85 manual, 원본변조 차단, 상태·다전공·부분조회 보수 처리입니다. 다른 세션도 동시 작업 중이므로 자기 범위만. 테스트 도구는 C:\Users\[개인 경로 생략]\AppData\Local\Temp\tt-wizard-planner-deps에 설치되어 있고 elevated Python 실행 필요; 실행은 부모가 담당합니다.
```

## 2. 테스트 작성 배정

실제 전송·작업 완료.

```text
planner/requirements.py와 계약이 작성됐습니다. 해시 LF 정규화로 수정 완료, source 원본은 Research verify_provenance 그대로 검증합니다. 이제 tests/test_requirements.py만 작성해 주세요. public evaluate_requirements/load_requirements와 내부 _calculate_course_list(item, normalized_rows) 테스트; real fixed 자료는 수정 금지, 변조 사본은 tmp_path에. 중요 실제5개 정상/남음, manual85 보존(여러 전공 한번에 입력해 전체 선택), partial/unknown/program unsupported/중복/다전공, 원본/데이터+원본 동시변조와 LF/CRLF 호환, 계산필드 위조 무시, 개인정보 오류 비노출, min_credits 가상 산술, CLI. 저는 tests/fixtures/planner/requirements_cases.json + requirements_offerings.json 3학생 예시 생성 중. 파일 충돌 없이 단위테스트 작성, 실행은 부모가 합니다. 결함 발견 시 알려 주세요.
```

## 3. 가상 사례와 경계 전달

실제 전송·작업 완료.

```text
가상3사례 requirements_cases.json, requirements_offerings.json, 독립 기대값 requirements_expected.md 작성했고 직접 함수 실행으로 24/37/36항목 needs_check 및 biology 관측값을 확인했습니다. 테스트에 포함 바랍니다. source 보존과 LF hash 수정 후 엔진 실행 정상. code _calculate_course_list의 반환은 (calculation dict 또는 None, 사유 code list). 모든85항목 검사는 한 번에 모든 주전공 지정하면 common 미선택이라, primary 하나+복수 두개 조합 등을 여러 차례 돌린 union으로 확인하면 좋습니다. Research의 자유전공 예외 추가로 common 항목은 항상 home_unit_unconfirmed 표시합니다.
```

## 4. 작성 마감 요청

실제 전송·작업 완료.

```text
Concept에서 첫 배정 산출물 완료 후 통합 커밋을 준비 중입니다. 현재 파일 작성 완료되면 알려 주세요. 테스트 실행은 제가 곧 진행하겠습니다. 문서와 fixtures 독립 기대값까지 준비됐습니다. API에 min_credits/min_count 원문 최소값 반환만 추가했습니다.
```
