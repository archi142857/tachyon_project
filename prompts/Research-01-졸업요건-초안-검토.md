# Research 01 — 졸업요건 초안 검토

- 날짜: 2026-11-07
- 도구: Codex
- 목적: 작업 2-A, 2025학번 7묶음의 공식 근거 검토와 계산 입력 준비

## 최초 요청 원문

```text
너는 ‘Project / Research’ 세션이다.
작업 저장소는 현재 프로젝트 안의 tt-wizard-gpt-edition이다.

docs/세션_프롬프트/Research.md를 이번 작업의 상세 지시로 읽고 따라라.
첫 작업은 2025학번 졸업요건 초안 7묶음의 공식 근거를 검토하고, 계산용 JSON·스키마·검증 코드·확인 필요 목록을 만드는 작업 2-A다.

계획만 설명하지 말고 실제 작업을 진행하라.
결과·검증·미완료·다음 과제를 docs/sessions/Research.md에 남겨라.
커밋·푸시는 하지 마라.
```

## 후속 요청 원문

```text
	졸업요건 초안 검토·계산용 자료 정리
```

## 결과와 원문 경로

최초 응답은 조사만 하고 산출물을 만들지 못했다. 후속 작업에서 프로젝트 상위 `output/snu_2025_graduation_requirements.json`을 발견했다. 앞선 '초안이 저장소에 없음'은 저장소 밖 파일까지 없다는 뜻이 아니며 이 위치를 확인하지 못했던 오류를 바로잡았다.

- [보존한 조사 결과 원본](../data/requirements/source/snu_2025_graduation_requirements.json)
- [계산 입력](../data/requirements/2025.json)
- [검토와 확인 필요 목록](../docs/졸업요건_검토.md)
- [실행 결과와 인수인계](../docs/sessions/Research.md)

딥 리서치에 사용했던 실제 프롬프트는 확보하지 못했다. 이를 재구성해 `prompts/01`로 만들지 않았다. 캡처도 제공되지 않았다.
