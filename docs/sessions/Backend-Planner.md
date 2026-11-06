# Project / Backend / Planner 인수인계

확인일: 2026-11-07. 기준 커밋: `3cfb97d179e8eaab062bcded48501ac61f7bf957`. 이번 산출물은 미커밋 상태다. 기존 공통 문서·다른 담당 변경은 보존했다.

요청 원문: [첫 요청](../../prompts/Backend-Planner-01-작업2B-시작.md), [구현 재개](../../prompts/Backend-Planner-02-이수내역-구현.md). 상세 지시: [Backend-Planner](../세션_프롬프트/Backend-Planner.md). 관련 목표는 G02·G15의 입력 기반, G04의 과목 식별, G22의 불확실성 표시다. 해당 목표 전체가 완료된 것은 아니다.

## 작업 2-B 결과

- [입력·출력 형식 v1](../../planner/transcript_format.md)을 먼저 정의하고 [정리 코드](../../planner/transcript.py)를 작성했다. 실행에는 파이썬 표준 라이브러리만 필요하다.
- 취득 완료·수강 중·미확인을 분리한다. 상태가 없거나 알 수 없으면 미확인으로 남기며 성적·점수에서 추론하지 않는다.
- 번호가 있으면 번호로만 연결한다. 번호가 없으면 공백·괄호 기호·로마 숫자를 정리한 이름으로 유일한 과목을 찾는다. 후보가 여러 개거나 없으면 확인 필요다. 해당 학기 자료를 우선한다.
- 이수구분·학점은 학생 입력을 유지한다. 학점 충돌, 누락, 과목명 충돌, 미확인 학기, 반복 이수는 확인 사유와 함께 합산을 보류한다. 재수강·동일대체·중복 인정 규칙은 추측하지 않는다.
- 취득 학점과 수강 중 학점을 따로 합산한다. 부분 입력·전체 여부 미확인은 별도 표시한다. 합계는 현재 입력 중 확인된 행의 합계이며 졸업 인정 학점이 아니다.
- 정의되지 않은 필드를 버리고 원본 입력을 변경하거나 저장하지 않는다. 오류에도 원래 값과 불필요한 필드명을 복사하지 않는다. 허용된 과목명·전공명 칸에 개인정보가 들어간 경우까지 탐지하는 기능은 없으므로 입력 제공자가 사전 제거해야 한다.

변경 파일: 위 코드·계약, [패키지 설명](../../planner/__init__.py), [가상 학생 3사례](../../tests/fixtures/planner/transcripts.json), [가상 개설 자료](../../tests/fixtures/planner/offerings.json), [수작업 기대값](../../tests/fixtures/planner/README.md), [테스트](../../tests/test_transcript.py), 요청 원문 2개, 이 인수인계 파일.

## 입출력·오류 전달

함수: `normalize_transcript(payload, offerings)`.

입력 기본 필드: `entry_year`, `programs[{name,kind}]`, `coverage`, `courses[{code,name,credits,category,term,status}]`. 과목번호는 문자열이며 `status`는 `completed / in_progress / unknown`. 명세의 한국어 3표현도 받는다. 개설 자료는 기존 `data/offerings/*.json` 문서 목록이다.

출력은 새 객체이며 각 행에 `matched_code`, `match_method`, `candidate_codes`, `issues`, `needs_check`, `countable_completed`를 붙인다. 입력의 `code`와 연결된 `matched_code`를 구분한다. 후속 판정은 `matched_code`를 사용하되 `countable_completed`와 전체 `coverage`·확인 사유를 반드시 함께 읽어야 한다. `countable_completed`만으로 특정 졸업요건을 충족 처리할 수 없다.

구조·타입 오류는 `TranscriptValidationError.errors`의 `{code,path,message}`로 반환한다. 부분 성공으로 행을 숨기지 않는다. CLI는 파일 읽기·내용 검증 실패 시 표준 오류 JSON과 종료 코드 2를 반환한다(명령 인자 사용 오류는 argparse 사용법 안내). 연결·상태 불확실성은 정상 결과 안의 같은 구조 `issues`와 행별 사유 코드로 표현한다.

## 검증

가상 3사례 수작업 기대값: 동물생명공학전공 예시는 취득 3·수강 중 1, 생명과학부 복수전공 예시는 취득 3·보류 완료행 2, 화학생물공학부 복수전공 예시는 취득 1.5·보류 완료행 2. 이수 과목은 전부 가상이며 실제 규정을 나타내지 않는다.

전체 테스트 **145개 통과(8.92초)**: 기존 자료 생성 38개, 이번 이수내역 78개, 실행 당시 Research 규정 검증 29개. 규정 테스트 통과는 학교 규정 사실이나 졸업 사정의 검증 완료를 뜻하지 않는다.

이번 검사 범위: 3상태·누락/미지원 상태, 번호 우선과 미발견 번호의 이름 대체 금지, 공백·괄호·로마 숫자, 동명 과목, 학기 우선, 반복 이수, 학점 충돌·누락·소수·0학점, 잘못된 구조·타입·유한하지 않은 수, 개인정보 필드 제외·오류 비노출, 원본 불변, CLI 성공/오류, 가상 학생 3사례. 독립 검토에서 발견한 `Physics(II)`/`Physics II` 연결 문제를 수정하고 회귀 검사에 포함했다. CLI의 animal 사례도 직접 실행해 취득 3·수강 중 1·미확인 1과목을 확인했다.

미검증 범위: 실제 학생 자료, PDF·표 인식, 학교 로그인, 학과별 공식 인정·재수강 규칙, 졸업 판정, 시간표·동선, 실제 GPT 연결. 이번에는 이 기능들을 구현하지 않았다.

실행 예시:

```powershell
python -m planner.transcript tests/fixtures/planner/transcripts.json --case animal --offerings tests/fixtures/planner/offerings.json
python -m pytest --basetemp .test-tmp/planner
```

이 환경은 `python`이 PATH에 없고 `py`의 등록 경로도 실행되지 않아, Codex가 제공한 Python 3.12.14로 검증했다. 테스트 도구는 `requirements-dev.txt` 범위의 pytest 9.2.0을 별도 임시 폴더에 설치했다. 기존 `.test-tmp`의 사용자별 접근 권한이 달라 이번 실행만 담당별 외부 임시 폴더를 사용했다. 다른 담당의 임시 폴더는 정리하지 않았다. 실제 성공한 명령:

```powershell
& 'C:\Program Files\WindowsApps\OpenAI.CodexPrimaryRuntime.v26-1105-1297-0_26.1105.1297.0_x64__3k8sg7r9htsxt\dependencies\python\python.exe' -c 'import sys; sys.path.insert(0, r"C:\Users\이영표\AppData\Local\Temp\tt-wizard-planner-deps"); import pytest; raise SystemExit(pytest.main(["--basetemp", r"C:\Users\이영표\AppData\Local\Temp\tt-wizard-planner-tests", "-p", "no:cacheprovider"]))'
```

## Research 자료 상태와 다음 한 과제

시작 시 `data/requirements/`에는 안내만 있었다. 작업 중 다른 담당이 `2025.json`, `schema.json`, `needs_check.json`, `reviews/`, `source/`, `scripts/validate_requirements.py`를 작성하는 것을 확인했다. 자료 스키마는 `basis.entry_year`, `sets`, `schema_version`, `provenance`를 사용한다. 전체 테스트에서 해당 규정 검증 29개가 통과했지만 아직 이 세션에서 규정 사실 검토·판정 통합을 수행하지 않았다. 마지막 파일 확인 시 Research 최종 인수인계는 없었고 자료 README도 갱신 전이었다. Research 최종 인수인계와 검증 범위를 받고 적용 버전을 고정해야 한다.

**다음 한 과제: 작업 2-C, `planner/requirements.py`의 졸업요건 대조.**

- 입력: 이번 v1 정리 결과, Research의 2025학번 7묶음 규정·스키마·검증 결과·공식 출처·미확인 목록. 전공 이름·종류를 `sets`에 연결할 대응표와 동일대체·중복 인정 근거도 필요하다.
- 산출물: 요건마다 충족/남음/확인 필요, 남은 학점·과목, 적용 학번·전공, 출처·조항, 판정 근거를 반환하는 코드와 `tests/test_requirements.py`.
- 완료 기준: 독립 수작업 기대값과 3사례를 대조하고 수강 중·미확인·중복·출처 없는 규정을 확정 충족 처리하지 않는다. 부분 이수내역으로 전체 졸업 가능을 확정하지 않는다. 규정의 `needs_check`가 결과까지 유지되어야 한다.
- 학과 회신이 필요한 규정은 확인 필요로 남기고, 근거가 확보된 부분의 계산은 진행한다. 학교 로그인 연결은 2-C 구현의 선행 조건이 아니다.

후속 시간표·동선은 2-C 뒤 진행한다. 시간 겹침은 불가, 이동 부족 시간은 표시, 미정 강의실은 이동 0분으로 단정하지 않음, 다음 학기 자료가 없으면 예상 표시, 3안이 불가능하면 실제 가능한 안과 이유만 반환하는 기준을 유지한다.

## 다른 담당에게

- **Integrations:** 개인정보 없는 구조화 이수내역을 v1로 전달한다. 상태·전체 조회 여부를 모르면 unknown을 사용한다. 성적을 상태로 변환하거나 부분 조회를 complete로 만들지 않는다. 실제 학교 연결은 이번에 구현하지 않았다.
- **Frontend:** 정리된 표를 한 번 확인받는 흐름에 상태·보류 사유·입력 범위를 표시한다. 가상 예시의 계산값을 졸업 판정으로 표현하지 않는다. GPT 지침·demo는 이번에 수정하지 않았다.
- **Research:** 최종 자료 버전·검증 결과·전공 대응과 인정 관계를 다음 작업에 전달해 달라. 형식 검증과 공식 근거 확인의 범위를 구분해야 한다.
- **Document:** README·현재 상태·작업 기록에 2-B 완료 범위를 반영하고 요청 원문 2개를 프롬프트 목록에 추가한다. 2-C·시간표 추천·GPT 묶음·실제 GPT 연결·효과 측정은 아직 이번 산출물에 없다.
- **Concept:** 기존 작업 2 입력 명세에 status와 coverage를 추가한 계약을 공유한다. 학교 전체·규정 판정·자동 연결을 완료로 확대하지 않는다.

현재 누적 범위는 작업 1 자료 준비와 이번 2-B 이수내역 정리다. 다른 담당의 병행 결과는 각 최종 인수인계에서 확인해야 한다. 커밋·푸시는 하지 않았다.

제안 커밋 메시지: `[작업 2-B] 이수내역 상태 구분과 과목 연결·가상 검증 구현`
