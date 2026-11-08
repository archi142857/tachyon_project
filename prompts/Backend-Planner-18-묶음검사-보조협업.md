# 작업 4 묶음 검사 보조 협업 원문

- 날짜: 2026-11-07. 메시지별 정확한 시각은 현재 문맥에서 확인할 수 없어 적지 않았다.
- 구분: **AI 보조 에이전트 협업 기록. 사용자 직접 지시가 아니다.**
- 송수신 담당: Project / Backend / Planner 본 세션 ↔ 묶음 검사 보조 에이전트.
- 목적: 오프라인 계산 묶음의 독립 검사와 재현·격리·변조 경계 테스트 작성.
- 담당 파일: [tests/test_build_gpt.py](../tests/test_build_gpt.py), 이 기록 파일.
- 검토 입력: [묶음 계약](../planner/bundle_format.md), [생성기](../scripts/build_gpt.py), [실행 템플릿](../planner/bundle_runtime.py), [가상 학생 입력](../demo/inputs/).
- 앞선 협업: [작업 2-C 독립 검토](Backend-Planner-07-독립검토기록.md), [작업 3 후보 검사](Backend-Planner-13-후보검사-보조협업.md).

## 기록 범위와 가림

현재 대화 문맥에서 확인한 작업 4 지시·계약 질문·답변·진행 보고를 순서대로 보존했다. 본문을 요약 재작성하지 않았다. 내부 에이전트 식별자는 전송 메타데이터에서 제외하고 담당 이름으로 표시했다. 아래 메시지 본문에는 개인 경로·내부 식별자의 실제 값이 없어 본문 추가 가림은 없다. 저장소 내부 상대 경로·파일명은 그대로 두었다.

보이지 않는 메시지나 정확한 송수신 시각은 복구할 수 없으며 만들지 않았다. 도구 호출·코드·실행 출력은 지시 메시지와 구분한다. 이 기록은 아래 여덟 번째 실제 수신 안내까지를 포함한다. 이 문서 작성 후의 최종 결과 전달은 작성 시점에 아직 발생하지 않았으므로 원문으로 미리 만들지 않았다.

## 1. 수신 — 작업 4 독립 검사 배정

송신: Project / Backend / Planner 본 세션. 수신: 묶음 검사 보조 에이전트.

```text
작업4 독립검사 담당입니다. 최신AGENTS 및 planner/bundle_format.md를읽고 tests/test_build_gpt.py만작성하세요. 부모scripts/build_gpt.py,다른보조planner/bundle_runtime.py구현중입니다. build_bundle(source_root,output_dir,*,target_term)->manifest; CLI python scripts/build_gpt.py --source-root . --output-dir gpt/knowledge --target-term2027-1. 바깥3files planner_bundle.py(모듈/자료ZIPbase64내장),manifest.json,출처.md. manifest구조계약참조. build부모가전체정규편람·원본스키마/validator·라이선스포함,strictdata검증/출력안전/재현byte동일예정. 런타임run(payload,preferences=None,target_term=None)->{transcript,requirements,candidates,json,markdown};verify_bundle()->manifest. 별도빈폴더subprocess -I -S사용,환경PYTHONPATH오염/작업cwd무관/외부패키지없음,기존3가상학생+planner결과같음,실제/예상/5년이력보존,누락/변조(해시재작성해도고정규정검증유지),재생성같음/다른target차이,출력folder알수없는파일보존,개인필드미출력 등 의미있는검사를만드세요. 실자료대신기존demo가상입력사용,기본fixture전체레포복사말고필수소스/data만복사또는부모source_root실제경로를읽기전용사용가능. 검사실행은부모. 구현자에게애매한계약질문은부모보고. 이 지시/추가왕복원문은prompts/Backend-Planner-18-묶음검사-보조협업.md에마감시기록(기록파일만추가수정가능), AI기록/2026-11-07/개인경로가림. 테스트작성끝나면부모통지후파일수정멈추세요.
```

## 2. 발신 — 검사 구성과 변조 검사 계약 질문

송신: 묶음 검사 보조 에이전트. 수신: Project / Backend / Planner 본 세션.

```text
작업4 계약을 읽었습니다. test_build_gpt.py는 실제 저장소를 읽기 전용 source_root로 한 번 빌드하는 모듈 fixture와, 기존 demo/inputs 3가상입력·별도 빈 cwd의 Python -I -S subprocess 비교를 중심으로 작성하겠습니다. 해시를 다시 작성한 내장 규정 변조/ZIP 경로 공격은 생성파일의 archive/manifest 상수명 또는 런타임 검증 helper가 필요합니다. 구현 시 해당 이름을 알려주시면 테스트에서 패키지를 재봉인해도 Research 고정 규정 검증이 남는지 검사하겠습니다.
```

## 3. 수신 — 내장 상수와 manifest 계약 답변

송신: Project / Backend / Planner 본 세션. 수신: 묶음 검사 보조 에이전트.

```text
템플릿 planner/bundle_runtime.py의 상수명은 ARCHIVE_BASE64='__TTW_ARCHIVE_BASE64__', MANIFEST_SHA256='__TTW_MANIFEST_SHA256__'이며 생성기치환 뒤에도이상수명유지합니다. 재봉인시AST로상수리터럴위치치환가능. ZIP_STORED,manifest members{상대경로:{sha256,size}},archive_sha256,source_inputs{상대경로:{sha256,size}},artifacts={'출처.md':{sha256,size},'planner_bundle.py':{'role':'runtime'},'manifest.json':{'role':'manifest'}}. data/requirements 원본·schemahash검증 기존load_requirements가자식에서항상실행됩니다. source_manifest의입력sha는읽은원본별해시이며생성data의해시와혼동금지.
```

## 4. 발신 — 생성기 오류 계약 질문

송신: 묶음 검사 보조 에이전트. 수신: Project / Backend / Planner 본 세션.

```text
추가 계약 확인: 생성기 build_bundle의 검증 실패 예외 클래스 이름이 아직 명세에 없습니다. 테스트에서 명확한 오류 검사를 위해 알려주세요. 출력폴더에 알 수 없는 파일이 있으면 기존 파일 전부 보존하고 실패한다는 계약으로 검사하겠습니다. 재봉인 검사는 전달한 ARCHIVE_BASE64/MANIFEST_SHA256과 members/archive 해시를 함께 갱신한 뒤 verify 성공+run 고정규정 거부를 확인할 예정입니다.
```

## 5. 수신 — 생성기 오류·자료 검증 계약 답변

송신: Project / Backend / Planner 본 세션. 수신: 묶음 검사 보조 에이전트.

```text
생성기 예외 BundleBuildError(ValueError), .errors=[{code,path,message}] 고정형으로하겠습니다. 검증/쓰기실패code 다양하지만개인원문값·경로노출없음. requirements 변조는기존 RequirementsValidationError를그대로노출해도되지만부모구현에서는BundleBuildError code=invalid_requirements로감싸는방향입니다. 메타부가키/교수칸/CSV추가칼럼은strict거부해과거비추천분반도누출없게합니다.
```

## 6. 발신 — 초안 작성·검토 진행 보고

송신: 묶음 검사 보조 에이전트. 수신: Project / Backend / Planner 본 세션.

```text
tests/test_build_gpt.py 초안을 작성했고 실제 생성기·런타임을 읽어 계약과 대조했습니다. 현재 테스트는 생성1회 baseline fixture,3가상입력의 -I -S/빈cwd 완전결과동일,오염PYTHONPATH,API/CLI·Markdown,3파일재생성,실제/예상/누락이력,출력보존,과거교수칸·meta·CSV추가열거부,누락/해시변조,재봉인한원본+규정동시변조와ZIP탈출거부까지 포함합니다. 코드검토에서 즉시확정결함은아직없고, 네트워크차단 자체를 재봉인 module에 socket 시도를 넣어 worker_failed가나오는 검사도 추가 예정입니다. 실행은 아직 하지 않았습니다.
```

## 7. 수신 — 출처 기록·생성물 검증 실패 경계 추가 요청

송신: Project / Backend / Planner 본 세션. 수신: 묶음 검사 보조 에이전트.

```text
명확한경계추가요청:source_manifest.json의최상위/inputs에개인추가키·절대경로삽입거부및기존출력보존검사해주세요. 빌더_read_source_manifest strict 허용키/원본상대경로hash검사추가완료. 생성된파일은stage에서python-I-S --verify를실행한뒤만교체하도록추가해runtime크기/구성한도초과도교체전차단합니다. 큰128MBfixture대신복사한runtime템플릿 MAX_ARCHIVE_BYTES작게바꿔selfcheck실패시기존출력보존검사로검증가능합니다. source_meta local표현수정완료. 테스트마감알려주시면전체실행합니다.
```

## 8. 수신 — 구현 마감·API 검사 캐시 안내

송신: Project / Backend / Planner 본 세션. 수신: 묶음 검사 보조 에이전트.

```text
현재생성+verify/run기본smoke성공했습니다. runtime구현마감됐고builder2검토수정반영까지완료했습니다. 테스트코드마감시바로알려주세요. 주의: 일반import는Python이__pycache__를만들수있으니API격리호출은-B플래그 또는 sys.dont_write_bytecode=True로생성물폴더에캐시를남기지않게해주십시오. 생성기미지파일보존계약은유지합니다.
```

## 결과와 검증 범위

[묶음 검사 테스트](../tests/test_build_gpt.py)를 작성했다. 위 진행 보고 이후에는 socket 생성 단계의 차단 검사, 출력 파일 일부 교체 실패 시 원상 복구, 생성기 CLI, 출처 기록의 비허용 키·절대 경로 거부, 실행 템플릿의 한도 축소에 따른 생성물 검증 실패·기존 출력 보존 검사를 추가했다. socket 검사는 외부 주소에 접속하지 않고 생성 단계의 차단만 확인하도록 작성했다. API 격리 검사에는 `sys.dont_write_bytecode=True`를 적용했다.

이 보조 에이전트는 테스트를 실행하지 않았다. 통과 여부와 최종 검사 수는 본 세션의 실행 결과로 확인해야 한다. 원본 코드·자료를 수정하지 않았고, 검사에 필요한 변조는 테스트 실행 시 만들어지는 임시 사본에서만 수행하도록 작성했다. 실제 학생 입력 대신 기존 `demo/inputs/`의 가상 자료를 사용한다.

이 작업에서 직접 수정한 파일은 `tests/test_build_gpt.py`와 이 기록뿐이다. 공통 문서·생성기·실행 템플릿을 편집하거나 커밋·푸시하지 않았다. 최종 실행 결과는 [Planner 인수인계](../docs/sessions/Backend-Planner.md)에 연결한다.
