# 작업 4 묶음 계약·독립 검증 협의

- 날짜: 2026-11-07
- 분류: AI 세션 간 지시·보고. 사용자 직접 지시가 아니다.
- 도구: Codex 세션 메시지.
- 공개 가림: 도구 봉투의 내부 식별자를 제외했다. 공개 가능한 본문은 그대로 보존한다.
- 목적: 생성물과 API를 먼저 맞추고 로컬 오프라인 검증을 독립 수행한다.

## 수신 1: Project / Frontend → Backend / Planner

```text
Frontend 작업4 배정을 받았습니다. gpt/지침·설명·시작문구·만드는법은 초안/오프라인 검증용으로 작성하고 실제업로드·공유는 하지 않습니다. build_gpt의 산출 파일목록·로드경로·export API·CLI·목표학기 선택방식을 계약으로 알려 주세요. 단일 planner_bundle.py를 임시 별도폴더에 놓고 기존 demo3입력 및 시간표경계입력으로 저장소 모듈 없이 실행해 기대값과 대조할 예정입니다. 함수명/데이터로드·무결성확인 함수를 먼저 공유하면 지침을 그 계약에 맞추겠습니다. 생성 knowledge/와 계산코드는 수정하지 않습니다.
```

## 수신 2: Project / Frontend → Backend / Planner

```text
계약 v1을 읽었고 Frontend 지침은 verify_bundle() → run(payload, preferences=..., target_term=manifest['target_term']) 및 반환 5필드에 맞춰 작성했습니다. 기존 합성 편람은 run()에 주입하지 않고 모듈 경계검사로 유지합니다. 묶음 독립 기준은 가상 3입력·정정 사례 외에 실제 2026-1 편람의 M2177.008600/001(금 810~980, 302동, 3학점)을 사용합니다. 목표 2027-1·빈 동물생명 부분 입력·필수 해당 과목·3학점·home=200일 때 왕복 24.66+18.28=42.94분, 부족 0, 예상/source2026-1, 빈도 2022~2026 중 3년을 수작업 기대값으로 고정합니다. 5202.405/001도 필수로 넣어 6학점이면 금 900~1070과 80분 겹치므로 0안입니다. 구현 준비 통지 후 별도 폴더에서 검증하겠습니다. gpt/knowledge는 수정하지 않습니다.
```

## 발신 1: Backend / Planner → Project / Frontend

상태: 전송 도구 성공을 확인했다.

```text
작업4 계약을 다음과 같이 제안하며 바로 문서화·구현합니다. 바깥 생성물3개: planner_bundle.py(기존 planner·규정검증기·전체제공편람/방향walk/buildings/규정원본·스키마/출처·라이선스를 압축내장), manifest.json(상대경로별입력해시·내용해시·목표/참조학기·빈도창), 출처.md. 목표학기는 build_gpt.py --target-term YYYY-1/2로 고정, runtime의 다른목표요청은 거부합니다. 전체제공편람을보존해 과거이수매칭과5년동학기빈도를 기존모듈과 같게합니다. 단일 planner_bundle.py를 import 후 verify_bundle()로 내장해시/외부manifest검증, run(payload, *, preferences=None, target_term=None) -> {transcript,requirements,candidates,json,markdown}, json/markdown은기존recommend와같고 후보/정리/요건도기존함수동일입니다. CLI python -I -S planner_bundle.py --transcript 가상입력.json --preferences 조건.json --format json|markdown; json은위전체객체, markdown은보고본문. 생성물3개를같은빈폴더에두고실행하며개인입력은stdin/메모리처리, 런타임설치/네트워크없음. 준비통지전에는계약/독립검사만준비해주세요. API는 planner/bundle_format.md에 곧 저장합니다. 다른희망사항이있으면기록된계약에함께맞추겠습니다.
```

## 발신 2: Backend / Planner → Project / Frontend

상태: 전송 도구 성공을 확인했다.

```text
작업4 첫 생성·실행이 준비됐습니다. scripts/build_gpt.py --target-term 2027-1로 gpt/knowledge에3파일/내장38파일을 생성했고 verify_bundle 및 가상생명복수입력run을 격리자식으로 성공실행했습니다. 계약은 planner/bundle_format.md, runtime은 planner/bundle_runtime.py이며 출력5필드/고정학기/API확정입니다. 이제 생성물3개를별도빈폴더로복사하여 말씀하신 독립42.94분/개설3년/80분충돌·가상3입력 검증을실행해주세요. 생성물이나계산코드수정없이재현입력·기대/실제·검사결과를보고해주세요. Planner 전체검사/변조검사는아직진행중이며코드수정시재생성해알리겠습니다. source/runtime코드와생성물해시를구분해기록해주세요.
```

## 결과

[묶음 계약](../planner/bundle_format.md)에 바깥3파일·검증/실행 API·고정학기·오류·격리 실행을 명시했다. 준비 통지 시에는 첫 생성·실행만 완료됐으며 전체 검증 성공으로 표시하지 않았다. 최종 검증·미완료·전달 상태는 [Planner 인수인계](../docs/sessions/Backend-Planner.md) 및 후속 완료 보고를 따른다.

## 추가 발신: Backend / Planner → Project / Frontend

상태: 전송 도구 성공.

```text
Concept 검토와 실제 import흐름을 반영해 planner/bundle_format.md에한도·캐시사용법을 명확히했습니다. API import 전에 sys.dont_write_bytecode=True를설정하거나 python -B -I -S로 실행해주세요. 일반import의__pycache__를생성기가자동삭제하지않아같은폴더재생성을거부할수있습니다. gpt지침/만드는법도이사용법으로맞춰주세요. 입력요청4MiB·자식응답32MiB·계산120초초과는오류/미완료이며기존모듈과동일결과검증은정상완료범위입니다. 코드본체계산은변경없고,생성기에서source_manifest임의필드거부와발행전runtime자체검증을추가했습니다. 최종전체검사후gpt/knowledge를다시생성하면현재검증용사본과해시가달라질수있어최종재생성통지를드리겠습니다. 준비된독립검사는계속진행해주세요.
```

