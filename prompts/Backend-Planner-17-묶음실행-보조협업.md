# 작업 4 묶음 실행 보조 협업 기록

- 날짜: 2026-11-07
- 기록 유형: **AI 보조 에이전트 협업**. 사용자 직접 지시가 아니다.
- 송수신 담당: 부모 Backend / Planner ↔ 묶음 실행 보조.
- 도구: Codex 보조 에이전트 협업 메시지.
- 목적: 생성기가 사용하는 오프라인 런타임 템플릿을 구현하고, 검증한 내장 코드·자료만 별도 프로세스로 실행한다.
- 담당 산출물: [planner/bundle_runtime.py](../planner/bundle_runtime.py).
- 계약 참조: [planner/bundle_format.md](../planner/bundle_format.md).
- 결과: verify_bundle·run·CLI와 내장 worker를 작성했다. 런타임과 worker의 구문 검사 통과, 플레이스홀더가 각각 한 번임을 확인했다. 생성·전체 실행·테스트는 부모 담당으로 넘겼다. 기존 코드·공통 문서는 수정하지 않았고 커밋·푸시는 하지 않았다. 이 문서 작성은 아래 배정에서 별도로 허용한 기록 범위다.
- 다음 담당: 부모 Backend / Planner — 생성기 연결·별도 테스트와 통합 검증 **진행 중**. 코드 마감 뒤 추가 수정은 부모 확인 후 진행한다.

## 원문 보존과 가림

현재 작업에서 실제 수신한 지시와 실제 발신한 협업 메시지를 아래에 원문 그대로 보존했다. 메시지 본문의 문장·붙여쓰기·기호를 고쳐 쓰지 않았다. 정확한 시각은 제공되지 않아 만들지 않았다.

내부 에이전트 식별자·작업 경로는 가리고 송수신 담당을 역할 이름으로 적었다. 이 작업의 아래 메시지 본문에는 개인 환경의 절대 경로가 없어 본문 경로를 별도로 바꾸지 않았다. 명령 실행 도구에 사용한 개인 환경 경로는 협업 지시 원문이 아니므로 옮기지 않았다. 이 파일의 기록 범위는 작업 4 런타임 배정 이후이며, 이전 작업 3 기록은 [보고서 보조 협업](Backend-Planner-12-보고서-보조협업.md)에 있다.

## 1. 부모 Backend / Planner → 묶음 실행 보조: 작업 배정

- 상태: 수신·착수·구현 마감 보고. 전체 실행 검증은 부모 담당.

```text
작업4 런타임 구현 담당입니다. 최신 AGENTS 및 planner/bundle_format.md를 읽고 planner/bundle_runtime.py만 작성하세요. 기존 코드 변경 금지. 부모가 scripts/build_gpt.py 생성기를 맡고 별도 보조가tests/test_build_gpt.py작성합니다. 생성기는 본 파일의 상수 ARCHIVE_BASE64='__TTW_ARCHIVE_BASE64__', MANIFEST_SHA256='__TTW_MANIFEST_SHA256__'의 플레이스홀더를 치환해 planner_bundle.py를 만듭니다. from future 위치 등 실행 가능한 템플릿. verify_bundle()는 __file__옆manifest.json정확sha, 내장base64ZIPsha, manifest members{path:{sha256,size}}, 안전경로/중복/심링크/크기한도 검증 후 manifest반환. 출력3개 중 출처.md누락/변조도 manifest artifacts에서 hash확인(artifacts={'출처.md':{sha256,size},'planner_bundle.py':{'role':'runtime'},'manifest.json':{'role':'manifest'}};자기참조해시없음). run(payload,preferences=None,target_term=None)는검증후TemporaryDirectory에안전추출, sys.executable -I -S -c worker로기존normalize/evaluate/build_candidates/search/build_report실행하여{transcript,requirements,candidates,json,markdown}반환. worker는sys.path에추출root만추가, payload는stdin, stdoutUTF8JSON, 네트워크socket감사이벤트차단,입력파일쓰기없음. 기존errors형식보존, BundleValidationError.errors고정메시지개인값비노출. subprocess예외/비정상return은고정오류. CLI계약참조. target는manifest와같아야함. 함수는import해도local planner/scripts사용금지(자식격리). 압축zip은ZIP_STORED이지만읽는측안전제한필수. runtime source에는개인/프로젝트절대경로없음. 상태/테스트는부모실행. 이 지시와추가왕복원문을끝에prompts/Backend-Planner-17-묶음실행-보조협업.md로기록(별도기록범위승인), 날짜2026-11-07 AI기록/가림표시. 먼저코드구현후부모에게준비통지,마감뒤부모확인없이코드수정금지.
```

## 2. 묶음 실행 보조 → 부모 Backend / Planner: 구현 경계 전달

- 상태: 실제 전송·구현에 반영.

```text
런타임 계약 확인했습니다. 정확 manifest/ZIP/구성원/출처.md 해시, ZIP 경로·대소문자 중복·심링크·무압축/크기 제한을 검사하고 검증 완료 후만 추출하겠습니다. limits는 archive 128MiB/member 32MiB/total 128MiB/member 수1024, manifest4MiB/입력4MiB를 예정합니다. 생성기에서 runtime 플레이스홀더를 각각 한 번 치환하면 됩니다. 기존 모듈을 부모 프로세스에 import하지 않고 격리 자식으로만 호출합니다.
```

## 3. 묶음 실행 보조 → 부모 Backend / Planner: 코드 수정 마감

- 상태: 실제 전송. 구문 확인과 실행 테스트를 구분했다.

```text
planner/bundle_runtime.py 구현·수정 마감했습니다. 런타임/내장 worker 구문 검사 통과, 두 플레이스홀더는 각각 정확히 한 번입니다. verify_bundle/run/CLI 계약을 구현했고 기존 코드는 수정하지 않았습니다. manifest·출처·ZIP/전체 구성원 해시, 정해진 구성원 허용 목록, 경로·중복·심링크·무압축·크기 제한을 검사합니다. 검증 완료 바이트만 임시 추출하고 -I -S 자식에서 기존 5단계 API를 실행하며 socket 감사 이벤트 차단·bytecode 쓰기 금지·stdin 입력·UTF-8 JSON·고정 오류를 적용했습니다. 테스트는 부모 담당에 맡깁니다. 이제 부모 확인 없이 코드 수정하지 않고 협업 기록만 작성하겠습니다.
```

## 4. 묶음 실행 보조 → 부모 Backend / Planner: 협업 기록 인계

- 상태: 실제 전송 후 원문 추가.

```text
prompts/Backend-Planner-17-묶음실행-보조협업.md도 생성했습니다. 이번 런타임 지시와 실제 발신 보고 원문, AI 기록 구분·내부 식별자 가림, 구문 확인과 미실행 통합 테스트의 구분을 남겼습니다. 담당 산출물은 planner/bundle_runtime.py와 이 기록 두 파일이며 커밋·푸시는 없습니다.
```
