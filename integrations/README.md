# 가상 자료 연결 v1

2026-11-07. **모의 구현**이다. Python 표준 라이브러리와 기존 `planner.transcript.normalize_transcript`만 사용한다. 로그인·웹 요청·크롤링·정기 실행·파일 자동 저장·외부 발송·GPT Actions는 없다. 실제 학생 자료를 입력하지 않는다.

## 계획서 상태와 사건

`CourseKey(semester, code, section)`은 문자열 세 개로 대상을 구분한다. 학기는 `YYYY-1/2/S/W`, 과목번호·분반은 비어 있지 않은 문자열이다. `001`과 `1`을 합치지 않는다.

`MockSyllabusTracker("example-a", default_enabled=False)`는 한 가상 사용자의 상태를 보관한다. `refresh_selection(keys)`는 선택한 시간표와 별도 관심 과목의 합집합을 받는다. 호출자가 그 합집합을 준비해야 하며 추천 후보 목록만으로 호출하지 않는다. `set_enabled(key, bool)`의 개별 설정은 목록 갱신·삭제 후 재추가·복원 뒤에도 유지된다. 전체 알림 기본값은 생성 시 정한다.

`observe(key, status, checked_at)`는 가상 판정 한 건을 적용한다. 실제 원문이나 빈 화면을 판정하는 기능은 없다. 시각은 시간대가 있는 ISO 문자열이며 같은 시각과 과거 결과는 적용하지 않는다. 선택에서 빠진 과목의 결과도 무시한다. `observe_batch(requested, results, checked_at)`에서 요청했지만 결과가 없는 과목은 `failure`다. 배치 형식 오류는 적용 전에 전체를 거부한다.

| status | 뜻 | 마지막 정상 상태 갱신 |
| --- | --- | --- |
| unknown | 아직 확인하지 못했거나 판정 불가 | 안 함 |
| unregistered | 모의 응답이 명시적으로 미등록을 확인 | 함 |
| registered | 모의 응답이 명시적으로 등록을 확인 | 함 |
| failure | 조회 실패·응답 누락 | 안 함 |

`view(key)`는 최신 `latest/checked_at`과 마지막 정상 `last_confirmed/confirmed_at`을 따로 돌려준다. 확인 시각을 업로드 시각으로 사용하지 않는다.

| 첫 등록 발견까지의 흐름 | 사건 kind |
| --- | --- |
| 첫 관측이 registered | 기준 상태로만 기록, 사건 없음 |
| unknown/failure → registered | first_discovered |
| unregistered → (실패/판정 불가 가능) → registered | registration_confirmed |
| 이미 등록을 본 뒤 반복·실패 복구·삭제 후 재등록 | 새로운 사건 없음 |

한 사용자·학기·교과목·분반의 최초 등록 발견을 한 번만 소비한다. 알림이 꺼져 있을 때 발견한 사건은 나중에 소급해서 보내지 않는다. 꺼짐·관심 삭제는 아직 전달하지 못한 대기 사건도 제거한다. 수정·삭제 후 재등록 알림은 확장 범위다.

사건은 `event_id, owner, key, kind, checked_at, mock`을 갖는다. `event_id`는 가상 사용자와 과목 키 및 최초 등록 사건 유형의 SHA-256이며 시각을 섞지 않는다. 화면 표시 시 과목명과 공식 원문 접근 안내는 Frontend가 동일 키의 과목 자료로 결합한다. 이 코드가 원문 주소를 만들거나 실제 열림을 검증하지 않는다.

## 모의 전달과 실행 재개

`deliver(MockSink())`는 메모리 수신함에만 사건을 기록한다. 다른 전달 객체는 거부한다. `fail="before_accept"`는 수신 전 실패, `fail="after_accept"`는 수신 뒤 응답 유실이다. 실패 때 대기열을 유지하고 같은 사건 ID로 재시도한다. 수신함도 ID로 중복을 제거한다.

Tracker와 Sink 각각의 `snapshot()` 결과는 JSON으로 변환할 수 있다. `MockSyllabusTracker.restore(snapshot, owner="example-a")`와 `MockSink.restore(snapshot)`로 같은 상태를 복원한다. 다른 가상 사용자로 Tracker를 복원하면 거부한다. 공개 파일에는 가상 snapshot만 넣을 수 있다.

실제 저장·트랜잭션·다중 작업자 잠금은 미구현이다. 상태를 잃거나 수신 서비스가 중복 제거를 지원하지 않으면 실제 서비스의 한 번 전달을 보장할 수 없다. 현재 테스트는 두 snapshot을 유지하는 단일 실행 흐름을 검증한다. 예시 사용자 접두사와 `mock=true`는 가상 자료 약속이며 개인정보 자동 탐지 기능이 아니다.

## 이수내역 연결

`normalize_mock_academic(envelope, offerings)`는 아래 모의 봉투를 받아 기존 Planner 입력 형식 v1로 정리한다.

```python
envelope = {
    "mock": True, "owner": "example-a", "connection": "active",
    "checked_at": "2026-11-07T09:00:00+09:00",
    "courses_complete": True, "programs_complete": False,
    "payload": {"schema_version": 1, "entry_year": 2025,
                "programs": [], "courses": []},
}
```

- `connection`: active / expired / failure. 만료·실패 때 이전 payload를 새 조회 결과로 반환하지 않고 `transcript=None, coverage=unknown, needs_check=true`를 반환한다. active이지만 payload가 없는 로그인만 성공한 경우도 같다.
- `courses_complete`, `programs_complete`: 각각 bool 또는 null/생략. 두 값 모두 True일 때만 coverage=complete, 하나라도 False이면 partial, 나머지는 unknown이다. 전체 표시에는 모든 페이지·학기와 전공 조회가 끝났다는 가상 입력 근거가 필요하다. 실제 시스템의 완전성을 이 코드가 증명하지 않는다.
- payload의 coverage 주장은 위 결과로 대체한다. 정상 조회의 빈 과목 목록과 조회 실패의 None을 구분한다. 허용 필드·타입·취득 상태·중복 처리·과목 연결·학점 합산은 [Planner 계약](../planner/transcript_format.md)과 기존 함수가 담당한다.
- 반환은 mock, connection, checked_at, coverage, transcript, needs_check. 로그인 성공과 전공/이수내역 전체 조회 성공은 별개다. 전공 필드 누락이나 모호한 과목 정보는 Planner의 확인 필요를 그대로 유지한다.

`MockAcademicSession("example-a")`는 `apply(envelope, offerings)`로 위 함수를 호출하고, `view()`에서 `latest`와 `last_successful`을 따로 반환한다. 만료·실패·로그인만 성공한 결과는 latest에 반영하되 마지막 성공 자료와 그 확인 시각은 유지한다. 성공에는 부분 조회도 포함되며 coverage를 그대로 표시한다. 이전 전체 자료와 새 부분 자료를 합쳐 전체라고 만들지 않는다. 새 정상 빈 조회는 빈 목록으로 갱신한다. 다른 사용자의 입력은 거부하고 같은 시각·과거 결과는 무시한다. 정리 오류는 이전 결과를 바꾸지 않는다. 이수내역 세션은 메모리에만 있으며 영속 저장과 복원은 제공하지 않는다.

## 실행과 검증 범위

```powershell
python -m pytest tests/test_integrations_mock.py --basetemp .test-tmp/integrations-targeted
```

테스트의 자료는 모두 ‘예시’ 과목과 example-* 사용자다. 최초 확인·새 등록·불명확한 최초 발견·실패 복구·순서가 뒤바뀐 응답·결과 누락·중복 전달·응답 유실·JSON 복원·개별 끄기·계정/학기/분반 분리·부분/빈 조회·연결 만료 및 Planner 입력 연결을 검사한다. 실제 원문 접근, 인증, 정기 확인과 메시지 도착은 검증하지 않는다.
