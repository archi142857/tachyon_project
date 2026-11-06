# 작업 2-C 구현 배정

- 날짜: 2026-11-07
- 도구: Codex
- 분류: AI 세션 간 작업 지시. 내부 채팅·메시지 ID만 가렸으며 나머지 배정 원문은 유지했다.
- 목적: 고정 Research 1.0과 이수내역 v1을 연결하는 요건 대조 구현.
- 전달 경로: Project / Concept → Project / Backend / Planner. 아래는 받은 배정 원문이며 사용자가 이 채팅에 직접 입력한 문장으로 재구성하지 않았다.
- 권한 확인: Concept 채팅의 사용자 메시지 [내부 식별자 생략]에서 “그 너네끼리 서로 명령하는 게 가능하면 그냥 알아서 진행하고 있으셈” 원문을 직접 확인했다. 여기서는 인간 원문 인용을 포함한 내부 전달 기록으로 분류한다.

## 받은 배정 원문

```text
사용자가 Project / Concept에서 “그 너네끼리 서로 명령하는 게 가능하면 그냥 알아서 진행하고 있으셈”이라고 직접 지시했습니다. 이번에는 규칙 확인 통지가 아니라 담당 작업의 실행 배정입니다. 작업 저장소: D:\대학교\비교과\ChatGPT Edu 활용 상시 공모전\tt-wizard-gpt-edition. 최신 AGENTS.md와 docs/작업_배정.md를 먼저 읽으세요. 기존 목표·담당 범위의 같은 프로젝트 세션 간 필요한 요청·결과 전달을 허용한 지시이며 커밋·푸시·외부발송·학교회신전 자동조회·실제공개 조건은 유지합니다.

사용자 승인 원문을 직접 확인해야 하면 read_thread로 hostId local, threadId [내부 식별자 생략]의 최신 turn에서 userMessage [내부 식별자 생략]를 확인하세요. 해당 사용자 지시에 근거해 필요한 담당에게 직접 질문·보고할 수 있습니다. 단순 수신확인 재전송 반복은 하지 마세요. 현재6개실행세션은 모두같은작업폴더이니 자기소유파일만수정하세요.

작업 2-C를 지금 구현·검증하세요. docs/sessions/Research.md, data/requirements/README.md, docs/졸업요건_검토.md 및 본인의 이수내역 v1을 읽고 planner/requirements.py, 판정 결과 형식, tests/test_requirements.py와 가상 기대값을 만드세요. Research 1.0 자료는 이번 단계에서 고정합니다(Research에도 변경하지 말라고 배정). 85개 manual/needs_check 항목을 충족 처리하지 않고, 승인된 명시 목록 5개와 all/min_count/min_credits를 근거대로 처리하세요. 전공/주·복수 대응·부분조회·미확인·수강 중·반복 이수·다전공 중복 인정·최소조건 null을 보수적으로 처리하고 근거/조항/이유를 반환하세요. 자동 인정 근거가 없는 중복은 확인 필요입니다. 입력 검증과 원본 변조 차단 계약도 사용하세요. Research가 해석 자료를 보낼 수 있으며 필요한 의미는 직접 질문할 수 있습니다. Planner 소유 파일만 편집하고 Research 원본·스키마는 바꾸지 마세요. 가상 사례 독립 기대값과 전체 테스트가 통과하면 본인 인수인계에 실행법·결과형식·한계·다음단계를 적고 Concept에 완료를 알려 주세요. 이번 완료 단위는 2-C입니다. 코드 작성 계획만 남기지 말고 구현하세요.
```

## 결과

- [판정 코드](../planner/requirements.py), [입출력 계약](../planner/requirements_format.md), [독립 테스트](../tests/test_requirements.py).
- [가상 3사례와 수작업 기대값](../tests/fixtures/planner/requirements_expected.md).
- [검증·한계·다음 작업 인수인계](../docs/sessions/Backend-Planner.md).
- 독립 검토로 Windows/Git 줄바꿈 차이의 릴리스 해시 문제를 보완했다. Research의 자유전공 교양 예외와 다전공 관측값/최종 인정 구분을 반영했다.
- 캡처: 없음. 자동 검증과 가상 실행 결과로 기록.
