"""기존 계산·자료를 검증해 로컬 오프라인 실행 파일 3개를 만든다.

표준 라이브러리만 사용한다. 실제 GPT 업로드/공유 기능은 없다.
기존 계산·규정 검증 코드는 원본 바이트로 보존하고 생성물을 Git에 추가하지 않는다.
"""

from __future__ import annotations

import argparse
import base64
import csv
import hashlib
import io
import json
import math
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
from urllib.parse import urlsplit
import zipfile

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from planner.requirements import load_requirements, RequirementsValidationError
from planner.transcript import normalize_transcript, TranscriptValidationError
from scripts.sync_ttwizard import OUTPUT_META_FIELDS, _validate_output_offering, SyncError

TERM = re.compile(r"[0-9]{4}-[12]\Z")
OUTPUT_NAMES = ("planner_bundle.py", "manifest.json", "출처.md")
CODE_FILES = tuple("planner/" + name + ".py" for name in (
    "__init__", "transcript", "requirements", "planning_types", "courses", "timetable", "report"
)) + ("scripts/__init__.py", "scripts/validate_requirements.py")
DATA_FILES = (
    "data/walk.csv", "data/buildings.csv", "data/likelihood.csv", "data/source_manifest.json",
    "data/README.md", "data/ODbL-1.0.txt", "LICENSE",
    "data/requirements/2025.json", "data/requirements/schema.json", "data/requirements/needs_check.json",
    "data/requirements/README.md", "data/requirements/source/README.md",
    "data/requirements/source/snu_2025_graduation_requirements.json",
) + tuple("data/requirements/reviews/" + name + ".json" for name in ("animal", "biology", "chemical", "common"))
BUILD_INPUTS = ("scripts/build_gpt.py", "planner/bundle_runtime.py", "scripts/sync_ttwizard.py")
ATTRIBUTION = "TT Wizard 자료: 캠퍼스 마법 지도·© OpenStreetMap 기여자, 국토지리정보원, 서울대 수강편람"
MAX_FILE = 32 * 1024 * 1024


class BundleBuildError(ValueError):
    def __init__(self, code, path, message):
        self.errors = [{"code": code, "path": path, "message": message}]
        super().__init__(json.dumps({"errors": self.errors}, ensure_ascii=False))


def _fail(code, message, path="bundle"):
    raise BundleBuildError(code, path, message)


def _json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2, allow_nan=False) + "\n").encode("utf-8")


def _digest(raw):
    return {"sha256": hashlib.sha256(raw).hexdigest(), "size": len(raw)}


def _linked(path):
    return path.is_symlink() or (hasattr(path, "is_junction") and path.is_junction())


def _read(root, relative):
    path = root / relative
    if any(_linked(p) for p in (path, *path.parents) if p != root and p.is_relative_to(root)):
        _fail("linked_input", "연결된 입력 파일은 묶음에 넣을 수 없습니다.")
    try:
        if not path.is_file() or path.stat().st_size > MAX_FILE:
            _fail("missing_or_large_input", "필수 입력이 없거나 파일 크기가 제한을 넘습니다.")
        return path.read_bytes()
    except OSError:
        _fail("input_read_error", "필수 입력을 읽을 수 없습니다.")


def _decode_json(raw):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                _fail("invalid_json", "JSON 키가 중복되어 있습니다.")
            result[key] = value
        return result
    try:
        return json.loads(raw.decode("utf-8-sig"), object_pairs_hook=unique,
                          parse_constant=lambda _: _fail("invalid_json", "유한하지 않은 JSON 값이 있습니다."))
    except (ValueError, UnicodeError, RecursionError):
        _fail("invalid_json", "입력 JSON 형식을 확인하세요.")


def _csv(raw, fields):
    try:
        reader = csv.DictReader(io.StringIO(raw.decode("utf-8-sig")))
        rows = list(reader)
        if reader.fieldnames != fields or any(None in row or any(v is None for v in row.values()) for row in rows):
            _fail("invalid_csv", "CSV의 허용 열과 행 길이가 일치하지 않습니다.")
        return rows
    except (csv.Error, UnicodeError):
        _fail("invalid_csv", "입력 CSV 형식을 확인하세요.")


def _finite(value, minimum, maximum=None):
    try:
        number = float(value)
        return math.isfinite(number) and number >= minimum and (maximum is None or number <= maximum)
    except (ValueError, TypeError, OverflowError):
        return False


def _source_manifest(raw):
    source = _decode_json(raw)
    def bad():
        _fail("invalid_source_manifest", "자료 출처 기록의 허용 키·상대경로·해시·집계 형식을 확인하세요.")
    if (not isinstance(source, dict)
            or set(source) != {"schema_version", "basis_year", "source_kind", "inputs", "semesters", "offerings", "counts"}
            or type(source["schema_version"]) is not int or source["schema_version"] != 1
            or type(source["basis_year"]) is not int or not 1000 <= source["basis_year"] <= 9999
            or source["source_kind"] not in ("local", "http")):
        bad()
    inputs = source["inputs"]
    csv_names = {"data/travel_slope.csv", "data/buildings.csv", "data/campus_buildings.csv",
                 "data/dorm_buildings.csv", "data/buildings_for_magicmap.csv"}
    if not isinstance(inputs, dict):
        bad()
    for name, sha in inputs.items():
        if (not isinstance(name, str) or not (name in csv_names or re.fullmatch(r"data/history/[0-9]{4}-[12]\.json", name))
                or not isinstance(sha, str) or not re.fullmatch(r"[0-9a-f]{64}", sha)):
            bad()
    semesters = source["semesters"]
    if (not isinstance(semesters, list) or any(not isinstance(t, str) or not TERM.fullmatch(t) for t in semesters)
            or len(set(semesters)) != len(semesters) or not isinstance(source["offerings"], dict)
            or set(source["offerings"]) != set(semesters)):
        bad()
    for counts in source["offerings"].values():
        if not isinstance(counts, dict) or set(counts) != {"courses", "sections"} or any(type(n) is not int or n < 0 for n in counts.values()):
            bad()
    counts = source["counts"]
    if (not isinstance(counts, dict) or set(counts) != {"semesters", "courses", "sections", "walk_rows", "buildings", "likelihood_rows"}
            or any(type(n) is not int or n < 0 for n in counts.values())):
        bad()
    return source


def _validate_data(files, terms):
    offerings = []
    for term in terms:
        document = _decode_json(files[f"data/offerings/{term}.json"])
        try:
            _validate_output_offering(document)
            meta = document["meta"]
            if meta["semester"] != term or type(meta["schema_version"]) is not int or meta["schema_version"] != 1 or meta["attribution"] != ATTRIBUTION:
                raise ValueError
            reference = meta["source"]
            if not isinstance(reference, str):
                raise ValueError
            url = urlsplit(reference)
            is_public_url = (url.scheme in ("http", "https") and bool(url.netloc) and url.username is None
                             and url.password is None and not url.query and not url.fragment
                             and url.path.endswith(f"/data/history/{term}.json"))
            if (reference != f"local:data/history/{term}.json" and not is_public_url
                    or "\\" in reference
                    or not isinstance(meta["source_sha256"], str) or not re.fullmatch(r"[0-9a-f]{64}", meta["source_sha256"])):
                raise ValueError
            if any(type(meta[key]) is not int or meta[key] < 0 for key in OUTPUT_META_FIELDS if key.endswith("courses") or key.endswith("sections")):
                raise ValueError
            if meta["undergraduate_courses"] != len(document["courses"]) or meta["undergraduate_sections"] != sum(len(c[5]) for c in document["courses"]):
                raise ValueError
            codes = set()
            for course in document["courses"]:
                if any(not isinstance(course[i], str) for i in (0, 1, 2, 4)) or not course[0].strip() or course[0].strip() in codes:
                    raise ValueError
                codes.add(course[0].strip())
                for section in course[5]:
                    if not isinstance(section[0], str) or not section[0].strip() or not isinstance(section[1], str):
                        raise ValueError
        except (SyncError, TypeError, KeyError, ValueError, IndexError, OverflowError):
            _fail("invalid_offerings", "편람의 허용 열·학기·집계·과목 형식을 확인하세요.")
        offerings.append(document)
    try:
        normalize_transcript({"entry_year": 2025, "programs": [], "coverage": "unknown", "courses": []}, offerings)
    except TranscriptValidationError:
        _fail("invalid_offerings", "편람의 학점·과목 형식 검증에 실패했습니다.")
    walks = _csv(files["data/walk.csv"], ["from", "to", "minutes"])
    pairs, points = set(), set()
    for row in walks:
        pair = (row["from"], row["to"])
        if not all(pair) or pair[0] == pair[1] or pair in pairs or not _finite(row["minutes"], 0):
            _fail("invalid_walk", "방향별 이동시간에 잘못된 값 또는 중복이 있습니다.")
        pairs.add(pair)
        points.update(pair)
    buildings = _csv(files["data/buildings.csv"], ["building", "name", "lat", "lon"])
    seen = set()
    for row in buildings:
        if not row["building"] or row["building"] in seen or not _finite(row["lat"], -90, 90) or not _finite(row["lon"], -180, 180):
            _fail("invalid_buildings", "건물 좌표 또는 번호가 올바르지 않습니다.")
        seen.add(row["building"])
    if not points.issubset(seen):
        _fail("missing_buildings", "이동표 지점의 건물 정보가 빠졌습니다.")
    _csv(files["data/likelihood.csv"], ["course_id", "name", "term", "years_offered", "last_offered", "last_sections"])
    source = _source_manifest(files["data/source_manifest.json"])
    # 원본 보존 검사는 읽어 둔 스냅샷으로 수행해 재직렬화·개행 변환을 하지 않는다.
    with tempfile.TemporaryDirectory(prefix="ttw-rule-check-") as name:
        temp = Path(name)
        for path, raw in files.items():
            if path.startswith("data/requirements/"):
                destination = temp / path
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_bytes(raw)
        try:
            load_requirements(temp / "data/requirements/2025.json")
        except RequirementsValidationError:
            _fail("invalid_requirements", "고정 1.0 규정·스키마·원본 검증에 실패했습니다.")
    return source


def _destination(source, output):
    path = Path(output).absolute()
    if any(_linked(p) for p in (path, *path.parents)):
        _fail("unsafe_output", "연결된 출력 위치에는 생성하지 않습니다.")
    path = path.resolve()
    if source.is_relative_to(path) or any(path.is_relative_to(source / p) for p in ("planner", "scripts", "data", "tests", "demo", "docs", "prompts", ".git")):
        _fail("unsafe_output", "코드·자료·기록과 겹치는 출력 위치는 사용할 수 없습니다.")
    if path.exists():
        if not path.is_dir() or any(p.name not in OUTPUT_NAMES or not p.is_file() or _linked(p) for p in path.iterdir()):
            _fail("unknown_output_files", "출력 폴더에 이 생성기가 관리하지 않는 파일이 있습니다. 빈 폴더를 지정하세요.")
    return path


def build_bundle(source_root, output_dir, *, target_term):
    if not isinstance(target_term, str) or not TERM.fullmatch(target_term) or int(target_term[:4]) < 1000:
        _fail("invalid_target_term", "목표 학기는 YYYY-1 또는 YYYY-2 형식이어야 합니다.")
    source = Path(source_root).resolve()
    output = _destination(source, output_dir)
    directory = source / "data/offerings"
    if _linked(directory) or not directory.is_dir():
        _fail("missing_offerings", "정규학기 편람 폴더가 필요합니다.")
    terms = sorted(p.stem for p in directory.iterdir() if p.suffix == ".json" and TERM.fullmatch(p.stem))
    if not terms:
        _fail("missing_offerings", "최소 한 정규학기 편람이 필요합니다.")
    files = {path: _read(source, path) for path in CODE_FILES + DATA_FILES}
    files.update({f"data/offerings/{term}.json": _read(source, f"data/offerings/{term}.json") for term in terms})
    build_inputs = {path: _read(source, path) for path in BUILD_INPUTS}
    for path in CODE_FILES:
        try:
            compile(files[path], path, "exec")
        except (SyntaxError, ValueError):
            _fail("invalid_code", "묶을 계산 코드의 문법을 확인하세요.")
    source_manifest = _validate_data(files, terms)
    year, season = int(target_term[:4]), target_term[-1]
    prior = f"{year-1}-{season}"
    source_term = target_term if target_term in terms else prior if prior in terms else None
    window = list(range(year-5, year))
    observed = [y for y in window if f"{y}-{season}" in terms]
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_STORED) as archive:
        for path, raw in sorted(files.items()):
            info = zipfile.ZipInfo(path, (1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            info.compress_type = zipfile.ZIP_STORED
            archive.writestr(info, raw)
    archive_bytes = buffer.getvalue()
    guide = ("# 로컬 오프라인 계산 묶음\n\n실제 GPT에 업로드·공유하거나 학교와 연결한 결과가 아닙니다.\n\n"
             f"목표학기 {target_term}, 참조학기 {source_term or '없음'}, 규정 1.0. 세 파일을 같은 폴더에 둡니다.\n\n"
             "```sh\npython -I -S planner_bundle.py --verify\npython -I -S planner_bundle.py --transcript example.json --format json\n"
             "python -I -S planner_bundle.py --transcript example.json --preferences preferences.json --format markdown\n```\n\n"
             "example.json은 개인정보를 제거한 이수내역 v1이며 파일로 묶지 않습니다. run(payload, preferences=None)은 "
             "transcript/requirements/candidates/json/markdown을 반환합니다. 입력 상태를 임의로 취득으로 바꾸지 마세요.\n\n"
             "Python API는 import 전에 sys.dont_write_bytecode = True를 설정하거나 Python에 -B를 붙이세요. "
             "일반 import로 __pycache__가 생기면 재생성은 빈 폴더를 사용하거나 자신의 캐시만 정리한 뒤 하세요. "
             "생성기는 알 수 없는 파일을 삭제하지 않습니다. 입력4MiB·자식응답32MiB·자식계산120초 한도를 넘으면 "
             "오류이며 계산 완료로 표시하지 않습니다.\n\n"
             "코드는 MIT, 프로젝트 구성 데이터베이스는 ODbL 1.0이며 원자료별 조건을 유지합니다. 내장 LICENSE, "
             "data/ODbL-1.0.txt, data/README.md, 규정의 sources/review와 보존 원본을 함께 유지했습니다. "
             "[서울대 수강편람](https://sugang.snu.ac.kr/) · [캠퍼스 마법 지도](https://moreadorecampus.com/) · "
             "[OpenStreetMap](https://www.openstreetmap.org/copyright) · [국토지리정보원](https://map.ngii.go.kr/).\n\n"
             "교수 열·실제 학생 자료·원시 높이 자료를 포함하지 않습니다. 승인된 5목록만 대조하며 수동85항목은 확인 필요입니다. "
             "개설 빈도는 참고이며 확률이나 수강 보장이 아닙니다. 미정 이동 총계는 null입니다.\n\n"
             "학생이 만든 비공식 도구예요. 졸업 사정은 학과와 마이스누에서 최종 확인하세요. 다른 사람의 성적표는 올리지 마세요.\n\n"
             "manifest는 입력 바이트·내장파일 해시와 재현 명령을 기록합니다. 실행 파일의 고정 manifest 해시로 "
             "우발적 변조·누락을 검사하며 전자서명 인증은 아닙니다. 모든 제공 편람을 보존해 과거 이수 식별을 유지합니다.\n\n" + ATTRIBUTION + "\n").encode("utf-8")
    manifest = {
        "bundle_schema_version": 1, "target_term": target_term, "source_term": source_term,
        "estimated": source_term != target_term, "offering_terms": terms,
        "frequency_window": {"years": window, "observed_years": observed, "missing_years": [y for y in window if y not in observed]},
        "requirements_version": "1.0", "data_basis_year": source_manifest["basis_year"],
        "source_inputs": {path: _digest(raw) for path, raw in sorted({**files, **build_inputs}.items())},
        "members": {path: _digest(raw) for path, raw in sorted(files.items())},
        "archive_sha256": hashlib.sha256(archive_bytes).hexdigest(),
        "artifacts": {"출처.md": _digest(guide), "planner_bundle.py": {"role": "runtime"}, "manifest.json": {"role": "manifest"}},
        "reproduce": {"build": f"python scripts/build_gpt.py --target-term {target_term} --output-dir gpt/knowledge",
                      "verify": "python -I -S planner_bundle.py --verify",
                      "run": "python -I -S planner_bundle.py --transcript example.json --format json"},
        "attribution": ATTRIBUTION,
    }
    manifest_raw = _json_bytes(manifest)
    try:
        template = build_inputs["planner/bundle_runtime.py"].decode("utf-8-sig")
        for marker in ("__TTW_ARCHIVE_BASE64__", "__TTW_MANIFEST_SHA256__"):
            if template.count(marker) != 1:
                _fail("invalid_template", "실행 템플릿의 치환 위치가 올바르지 않습니다.")
        runtime = template.replace("__TTW_ARCHIVE_BASE64__", base64.b64encode(archive_bytes).decode("ascii"))
        runtime = runtime.replace("__TTW_MANIFEST_SHA256__", hashlib.sha256(manifest_raw).hexdigest()).encode("utf-8")
        compile(runtime, "planner_bundle.py", "exec")
    except (UnicodeError, SyntaxError, ValueError):
        _fail("invalid_template", "실행 템플릿을 생성할 수 없습니다.")
    outputs = {"planner_bundle.py": runtime, "manifest.json": manifest_raw, "출처.md": guide}
    try:
        # 생성·검증을 모두 마친 뒤, 지정된 세 파일만 교체한다. 다른 파일 삭제는 없다.
        output = _destination(source, output)
        output.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="ttw-build-", dir=output.parent) as name:
            staged = Path(name)
            for filename, raw in outputs.items():
                (staged / filename).write_bytes(raw)
            # 런타임과 같은 한도·구성 검사를 쓰기 전 실행한다. 검증 불가 묶음으로 기존 파일을 교체하지 않는다.
            try:
                checked = subprocess.run([sys.executable, "-I", "-S", str(staged / "planner_bundle.py"), "--verify"],
                                         cwd=staged, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=60, check=False)
            except (OSError, subprocess.TimeoutExpired):
                _fail("bundle_self_check_failed", "생성 묶음의 독립 검증을 완료할 수 없습니다.")
            if checked.returncode != 0:
                _fail("bundle_self_check_failed", "생성 묶음이 런타임의 구성·크기·해시 검증을 통과하지 못했습니다.")
            output.mkdir(exist_ok=True)
            old = {filename: (output / filename).read_bytes() if (output / filename).exists() else None for filename in outputs}
            try:
                for filename in outputs:
                    os.replace(staged / filename, output / filename)
            except OSError:
                for filename, raw in old.items():
                    path = output / filename
                    if raw is None:
                        path.unlink(missing_ok=True)
                    else:
                        path.write_bytes(raw)
                raise
    except OSError:
        _fail("output_write_error", "생성 파일을 안전하게 저장하지 못했습니다.")
    return manifest


def main(argv=None):
    parser = argparse.ArgumentParser(description="검증 가능한 로컬 오프라인 계산 묶음 생성")
    parser.add_argument("--source-root", type=Path, default=ROOT)
    parser.add_argument("--output-dir", type=Path, default=ROOT / "gpt/knowledge")
    parser.add_argument("--target-term", required=True)
    args = parser.parse_args(argv)
    try:
        manifest = build_bundle(args.source_root, args.output_dir, target_term=args.target_term)
    except BundleBuildError as exc:
        print(json.dumps({"errors": exc.errors}, ensure_ascii=False), file=sys.stderr)
        return 2
    except (OSError, ValueError):
        print(json.dumps({"errors": [{"code": "build_error", "path": "bundle", "message": "묶음 생성 입력과 저장 위치를 확인하세요."}]}, ensure_ascii=False), file=sys.stderr)
        return 2
    print(json.dumps({"files": list(OUTPUT_NAMES), "target_term": manifest["target_term"], "source_term": manifest["source_term"], "members": len(manifest["members"])}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
