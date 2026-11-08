# 작업 4 오프라인 묶음 계약 v1 (구현 중)

2026-11-07. 실제 GPT 업로드·공유가 아닌 로컬 재현 묶음이다. 기존 계산 코드·Research 1.0 원본 검증을 그대로 사용한다. Frontend에 파일 구성과 API를 먼저 전달했다.

## 생성

`build_bundle(source_root, output_dir, *, target_term)`(scripts/build_gpt.py) → manifest 객체. CLI: `python scripts/build_gpt.py --target-term 2027-1 [--output-dir gpt/knowledge] [--source-root .]`.

바깥 파일은 `planner_bundle.py`, `manifest.json`, `출처.md`의 3개다. planner_bundle.py는 런타임과 기존 모듈·자료 ZIP을 base64로 내장한다. ZIP은 고정 순서·시간·권한·무압축으로 환경별 압축 차이 없이 재생성한다. 생성물은 기존 .gitignore대로 제외한다. 다른 파일이 있는 출력 폴더에는 쓰지 않으며, 기존 세 파일만 바꾼다. 검증 실패 시 기존 생성물을 바꾸지 않는다. 심볼릭 링크나 저장소 코드·자료와 겹치는 출력 위치는 거부한다.

모든 제공된 `data/offerings/YYYY-[12].json`을 보존한다. 목표 편람·정확히 전년 같은 학기뿐 아니라 이수내역의 과거 과목 식별도 같은 결과를 유지하기 위해서다. 빈도는 target_term 연도 직전5년 같은 학기의 실제 제공 여부로 산출한다. 누락된 해는 manifest에 표시하고 만들어 채우지 않는다. 목표/전년 모두 없어도 자료 부재 이유를 기존 엔진과 같이 반환한다.

필수 자료: `data/walk.csv`, `buildings.csv`, `likelihood.csv`(참고용), `source_manifest.json`, `README.md`, `ODbL-1.0.txt`; `data/requirements/2025.json`, `schema.json`, `needs_check.json`, `README.md`, `source/snu_2025_graduation_requirements.json`, `source/README.md`, `reviews/*.json`; `LICENSE`. 포함 코드는 planner의 기존 __init__/transcript/requirements/courses/timetable/report/planning_types와 scripts/__init__/validate_requirements.py다. 학생 입력·로그·캐시·비밀 파일·교수 열은 포함하지 않는다.

manifest: `bundle_schema_version=1`, `target_term`, `source_term`, `estimated`, `offering_terms`, `frequency_window`(years/observed_years/missing_years), `requirements_version=1.0`, `data_basis_year`, `source_inputs`(상대경로별 sha256/size), `members`(내장 ZIP 상대경로별 sha256/size), `archive_sha256`, `artifacts`, `reproduce`, `attribution`. 생성 시각·개인 절대경로는 넣지 않는다. manifest의 정확한 SHA256을 실행 파일에 고정하고, 실행 전 외부 manifest·내장 ZIP·전체 구성원 해시를 검증한다. 이는 우발적 변조·누락 검출이며 파일 전체와 해시를 함께 고치는 공격자의 서명 인증은 아니다.

## 실행

세 파일을 같은 빈 폴더에 놓는다. Python API를 쓸 때는 캐시 파일을 만들지 않도록 **import 전에** `sys.dont_write_bytecode = True`를 설정하거나 실행 프로세스에 `-B`를 붙인다. 설정 없이 import하면 Python의 `__pycache__`가 생길 수 있으며, 생성기는 이 파일을 임의 삭제하지 않고 같은 폴더의 재생성을 거부한다. 새 빈 폴더에 생성하거나 사용자가 자기 캐시만 정리한 뒤 재생성한다.

```python
import sys
sys.dont_write_bytecode = True
import planner_bundle
manifest = planner_bundle.verify_bundle()
result = planner_bundle.run(payload, preferences=None, target_term=manifest["target_term"])
```

- `verify_bundle()` → 검증한 manifest 사본. 코드 실행 전에 누락·해시·안전한 ZIP 경로·중복 구성원 등을 검사한다.
- `run(payload, *, preferences=None, target_term=None)` → `{transcript, requirements, candidates, json, markdown}`. target_term 생략 시 묶음의 목표학기, 다른 값은 오류다. 각 값은 기존 normalize_transcript/evaluate_requirements/build_candidates 및 build_report(search_timetables(...))와 같다.
- CLI: `python -I -S planner_bundle.py --transcript example.json [--preferences preferences.json] [--target-term 2027-1] [--format json|markdown]`. json은 위 전체객체, markdown은 보고본문이다. `--verify`는 입력 없이 manifest를 검사한다. `--transcript -`는 표준입력 JSON이다.

계산은 검증한 내장 파일만 임시 폴더에 풀어 별도 Python `-I -S` 프로세스로 실행한다. 저장소·현재 작업폴더·설치된 패키지의 planner/scripts를 가져오지 않는다. 입력은 메모리와 자식 프로세스 표준입력으로만 전달하며 묶음·임시폴더에 쓰지 않는다. 임시 추출물은 종료 시 정리한다. 표준 라이브러리만 쓰고 네트워크를 호출하지 않으며 자식 계산 프로세스의 socket 이벤트를 차단한다.

오류는 `BundleValidationError.errors`의 `{code,path,message}` 목록이며 원본 입력·개인 경로·traceback을 출력하지 않는다. 기존 계산 오류의 고정 errors는 유지한다. CLI 검증/읽기/계산 실패는 종료2다. `--help` 및 인자 사용 오류는 argparse 규칙을 따른다.

원래 모듈과 결과를 비교하는 범위는 정상 완료한 요청이다. 런타임은 입력 JSON(묶음 실행 요청 전체)에4MiB, 자식 응답에32MiB, 계산 자식 실행에120초 한도를 둔다. 한도를 넘으면 `invalid_input` 또는 `worker_failed`로 실패하며 결과 일부를 성공으로 반환하지 않는다. 입력 파일 개별 읽기도4MiB를 넘지 않도록 제한한다. 출력 한도는 자식 응답 수신 뒤 확인한다. 내장 ZIP/총 구성원은128MiB, 개별 구성원32MiB, 구성원1024개, manifest4MiB가 한도다. 생성기에서도 같은 런타임 검사를 임시 출력에 실행하고 통과해야 기존 세 파일을 교체한다.

## 검증

가상3입력·시간표 경계, 실제/예상·5년 이력·고정1.0·확인필요·링크·JSON/Markdown을 원래 모듈과 비교한다. 빈 별도 폴더와 `-I -S`로 실행하며 네트워크 차단 상태를 확인한다. 같은 입력/학기 재생성의 바이트 일치, 누락·변조·안전하지 않은 경로, 개인정보 추가 필드 비포함, 출력 폴더 보존을 검사한다. 실제 GPT의 파일지원·업로드·실행 성공은 이 검증의 범위가 아니다.
