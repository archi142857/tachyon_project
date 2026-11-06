# 2-C 내부 협업 원문 기록

- 날짜: 2026-11-07
- 분류: AI 세션 간 작업 지시·수정 요청·결과 보고. 사용자 직접 지시가 아니다.
- 발신: Project / Backend / Planner.
- 범위: 이번 2-C 진행 중 실제 보낸 메시지. 사용자 채팅 ID·개인 경로는 공개 기록에서 가렸다. 동작 확인은 도구의 전송 성공 결과를 기준으로 한다.
- 관련 파일: [판정 코드](../planner/requirements.py), [계약](../planner/requirements_format.md), [인수인계](../docs/sessions/Backend-Planner.md).

## 1. 수신: Project / Research

상태: 실제 전송 성공. Research에서 다전공 보류·교양 소속 예외에 대한 해석을 회신했고 계약에 반영했다.

```text
2-C 구현을 시작했고 Research 1.0 데이터·검증 계약을 읽었습니다. 5항목의 개별 목록 충족과 요건 간 중복 인정은 구분할 예정입니다. 특히 복수전공 포함 시 이수내역 v1에는 과목별 귀속·승인연도가 없어, 전공 목록에 다전공이 있으면 관련 명시목록의 단순 계산을 참고값으로 남기되 확정 충족은 보류하는 해석이 적절한지 확인해 주세요. 부분 조회는 계산된 하한·관측상 부족량을 표시하고 최종 상태는 확인 필요로 둘 예정입니다. common은 지원되는 주전공이 하나 명시된 경우에만 선택하고, 타소속 복수전공만 있으면 자동 부과하지 않습니다. data/requirements와 검증 코드는 수정하지 않습니다. 해석 보완은 문서 경로 또는 회신으로 부탁합니다.
```

## 2. 수신: Project / Frontend

상태: 실제 전송 성공. Frontend가 독립 기대값과 통합 테스트를 작성해 12개 통과를 보고했다.

```text
2-C 판정 API를 준비 중입니다. 예정 공개 함수는 evaluate_requirements(payload, offerings, *, requirements_path=...)이며 원본 이수내역 v1 또는 그 정리 결과를 받아 개설 자료로 다시 정리합니다(외부 countable_completed/summary를 신뢰하지 않음). 고정 Research 1.0 자료를 형식·원본 보존·릴리스 해시로 검증합니다. 결과는 항목별 satisfied/remaining/needs_check, 근거·이유, 취득 완료로 확인된 관측값과 부족량을 구분하며 부분조회·다전공 중복승인 미확인은 확정 판정을 보류합니다. 상세 계약을 planner/requirements_format.md에 곧 작성하겠습니다. 우선 독립 기대 사례를 준비해 주세요. 판정 결과를 실제 졸업 가능으로 표현하지 않습니다.
```

## 3. 수신: Project / Frontend

상태: 실제 전송 성공. Frontend가 독립 기대값과 통합 테스트를 작성해 12개 통과를 보고했다.

```text
planner/requirements.py와 planner/requirements_format.md가 작성되어 API 연결 가능합니다(검증 진행 중, 완료 아님). evaluate_requirements(payload, offerings, *, requirements_path=...) → sets[].items[]의 status/calculation/remaining/reasons 및 sources/evidence. 별도 승인목록 대조만 수행하며 graduation_status=not_evaluated. partial/다전공 등은 최종 needs_check, 관측상 부족량은 calculation.observed_deficit입니다. Research 추가 해석을 반영해 common은 지원 주전공 1개여도 home_unit_unconfirmed(자유전공 예외)로 표시합니다. Python 실행 환경은 docs/sessions/Backend-Planner.md 기존 명령 참고. 독립 테스트에서 결함 발견 시 재현 입력과 기대 결과를 알려 주세요.
```
