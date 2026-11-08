"""생성기가 자료를 내장하는 오프라인 실행 템플릿. 표준 라이브러리만 사용한다.

고정 해시는 우발적 변조를 확인한다. 이 파일과 해시를 함께 바꾸는 사람을
인증하는 서명은 아니다. 계산 모듈은 검증 후 별도 격리 프로세스에서만 읽는다.
"""

from __future__ import annotations

import argparse
import base64
from copy import deepcopy
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import stat
import subprocess
import sys
import tempfile
import zipfile


ARCHIVE_BASE64 = '__TTW_ARCHIVE_BASE64__'
MANIFEST_SHA256 = '__TTW_MANIFEST_SHA256__'

MAX_ARCHIVE_BYTES = 128 * 1024 * 1024
MAX_MEMBER_BYTES = 32 * 1024 * 1024
MAX_TOTAL_BYTES = 128 * 1024 * 1024
MAX_MEMBERS = 1024
MAX_MANIFEST_BYTES = 4 * 1024 * 1024
MAX_INPUT_BYTES = 4 * 1024 * 1024
MAX_OUTPUT_BYTES = 32 * 1024 * 1024
WORKER_TIMEOUT_SECONDS = 120
_HASH = re.compile(r"[0-9a-f]{64}\Z")
_TERM = re.compile(r"[0-9]{4}-[12]\Z")
_REQUIRED_MEMBERS = frozenset({
    "planner/__init__.py", "planner/transcript.py", "planner/requirements.py",
    "planner/courses.py", "planner/timetable.py", "planner/report.py", "planner/planning_types.py",
    "scripts/__init__.py", "scripts/validate_requirements.py", "LICENSE",
    "data/walk.csv", "data/buildings.csv", "data/likelihood.csv", "data/source_manifest.json",
    "data/README.md", "data/ODbL-1.0.txt", "data/requirements/2025.json",
    "data/requirements/schema.json", "data/requirements/needs_check.json", "data/requirements/README.md",
    "data/requirements/source/snu_2025_graduation_requirements.json", "data/requirements/source/README.md",
})
_ERRORS = {
    "bundle_invalid": ("bundle", "묶음 형식 또는 구성 검증에 실패했습니다."),
    "bundle_missing": ("bundle", "필수 묶음 파일이 없거나 읽을 수 없습니다."),
    "manifest_mismatch": ("bundle.manifest", "묶음 명세의 고정 해시가 일치하지 않습니다."),
    "archive_mismatch": ("bundle.archive", "내장 자료의 해시가 일치하지 않습니다."),
    "member_mismatch": ("bundle.members", "내장 구성원의 크기 또는 해시가 일치하지 않습니다."),
    "artifact_mismatch": ("bundle.artifacts", "출처 파일의 크기 또는 해시가 일치하지 않습니다."),
    "unsafe_archive": ("bundle.archive", "안전하지 않은 경로 또는 ZIP 구성이 있습니다."),
    "bundle_too_large": ("bundle", "묶음 크기가 허용 한도를 넘습니다."),
    "target_term_mismatch": ("target_term", "목표 학기는 묶음에 고정된 학기와 같아야 합니다."),
    "invalid_input": ("$", "입력은 허용 크기 안의 JSON 값이어야 합니다."),
    "read_error": ("$", "입력 파일 또는 표준입력을 읽을 수 없습니다."),
    "worker_failed": ("bundle.worker", "격리된 계산을 완료할 수 없습니다."),
}


class BundleValidationError(ValueError):
    """원래 값·개인 경로·traceback을 공개 오류에 담지 않는다."""

    def __init__(self, code="bundle_invalid", *, errors=None):
        if errors is None:
            code = code if code in _ERRORS else "bundle_invalid"
            path, message = _ERRORS[code]
            errors = [{"code": code, "path": path, "message": message}]
        self.errors = deepcopy(errors)
        super().__init__(json.dumps({"errors": self.errors}, ensure_ascii=False))


def _fail(code="bundle_invalid"):
    raise BundleValidationError(code) from None


def _hash(raw):
    return hashlib.sha256(raw).hexdigest()


def _json(raw):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                _fail()
            result[key] = value
        return result

    def nonfinite(_):
        _fail()

    return json.loads(raw.decode("utf-8-sig"), object_pairs_hook=unique, parse_constant=nonfinite)


def _read_file(path, limit):
    if path.is_symlink() or not path.is_file():
        _fail("bundle_missing")
    if path.stat().st_size > limit:
        _fail("bundle_too_large")
    with path.open("rb") as stream:
        raw = stream.read(limit + 1)
    if len(raw) > limit:
        _fail("bundle_too_large")
    return raw


def _safe_name(name):
    if (not isinstance(name, str) or not name or len(name) > 240 or "\\" in name
            or any(char in name for char in '\x00:<>"|?*') or name.startswith("/") or name.endswith("/")):
        _fail("unsafe_archive")
    path = PurePosixPath(name)
    if path.as_posix() != name or any(part in ("", ".", "..") for part in name.split("/")):
        _fail("unsafe_archive")
    for part in path.parts:
        stem = part.split(".")[0].upper()
        if (part.endswith((" ", ".")) or any(ord(char) < 32 for char in part)
                or stem in {"CON", "PRN", "AUX", "NUL"}
                or re.fullmatch(r"(?:COM|LPT)[1-9]", stem)):
            _fail("unsafe_archive")
    return name


def _member_allowed(name):
    return (name in _REQUIRED_MEMBERS
            or re.fullmatch(r"data/offerings/[0-9]{4}-[12]\.json", name) is not None
            or re.fullmatch(r"data/requirements/reviews/[^/]+\.json", name) is not None)


def _entry(value):
    if (not isinstance(value, dict) or set(value) != {"sha256", "size"}
            or not isinstance(value.get("sha256"), str) or not _HASH.fullmatch(value["sha256"])
            or type(value.get("size")) is not int or not 0 <= value["size"] <= MAX_MEMBER_BYTES):
        _fail()
    return value


def _verified_bundle():
    """원본 바이트를 모두 검증한 뒤 추출에 사용할 같은 바이트를 반환한다."""
    try:
        here = Path(__file__).resolve().parent
        runtime = here / "planner_bundle.py"
        if runtime.is_symlink() or not runtime.is_file() or Path(__file__).is_symlink():
            _fail("bundle_missing")
        raw_manifest = _read_file(here / "manifest.json", MAX_MANIFEST_BYTES)
        if not _HASH.fullmatch(MANIFEST_SHA256) or _hash(raw_manifest) != MANIFEST_SHA256:
            _fail("manifest_mismatch")
        manifest = _json(raw_manifest)
        if (not isinstance(manifest, dict) or type(manifest.get("bundle_schema_version")) is not int
                or manifest["bundle_schema_version"] != 1 or not isinstance(manifest.get("target_term"), str)
                or not _TERM.fullmatch(manifest["target_term"])):
            _fail()
        artifacts = manifest.get("artifacts")
        if (not isinstance(artifacts, dict) or set(artifacts) != {"출처.md", "planner_bundle.py", "manifest.json"}
                or artifacts["planner_bundle.py"] != {"role": "runtime"}
                or artifacts["manifest.json"] != {"role": "manifest"}):
            _fail()
        source_entry = _entry(artifacts["출처.md"])
        source_raw = _read_file(here / "출처.md", MAX_MEMBER_BYTES)
        if len(source_raw) != source_entry["size"] or _hash(source_raw) != source_entry["sha256"]:
            _fail("artifact_mismatch")
        if not isinstance(ARCHIVE_BASE64, str) or len(ARCHIVE_BASE64) > 4 * ((MAX_ARCHIVE_BYTES + 2) // 3):
            _fail("bundle_too_large")
        archive_raw = base64.b64decode(ARCHIVE_BASE64, validate=True)
        if len(archive_raw) > MAX_ARCHIVE_BYTES:
            _fail("bundle_too_large")
        if (not isinstance(manifest.get("archive_sha256"), str) or not _HASH.fullmatch(manifest["archive_sha256"])
                or _hash(archive_raw) != manifest["archive_sha256"]):
            _fail("archive_mismatch")
        members = manifest.get("members")
        if not isinstance(members, dict) or not 1 <= len(members) <= MAX_MEMBERS:
            _fail()
        total, folded = 0, set()
        for name, entry in members.items():
            _safe_name(name)
            if not _member_allowed(name) or name.casefold() in folded:
                _fail("unsafe_archive")
            folded.add(name.casefold())
            total += _entry(entry)["size"]
        if total > MAX_TOTAL_BYTES:
            _fail("bundle_too_large")
        if not _REQUIRED_MEMBERS.issubset(members) or not any(name.startswith("data/requirements/reviews/") for name in members):
            _fail("bundle_missing")
        offering_terms = manifest.get("offering_terms")
        expected_terms = sorted(PurePosixPath(name).stem for name in members if name.startswith("data/offerings/"))
        if offering_terms != expected_terms:
            _fail()
        verified = {}
        with zipfile.ZipFile(io.BytesIO(archive_raw)) as archive:
            infos = archive.infolist()
            if len(infos) != len(members) or len(infos) > MAX_MEMBERS:
                _fail("unsafe_archive")
            seen = set()
            for info in infos:
                name = _safe_name(info.filename)
                kind = stat.S_IFMT(info.external_attr >> 16)
                if (info.orig_filename != info.filename or name not in members or name.casefold() in seen or info.is_dir()
                        or kind not in (0, stat.S_IFREG) or info.flag_bits & 1
                        or info.compress_type != zipfile.ZIP_STORED
                        or info.file_size > MAX_MEMBER_BYTES or info.compress_size > MAX_MEMBER_BYTES
                        or info.file_size != info.compress_size):
                    _fail("unsafe_archive")
                seen.add(name.casefold())
                entry = members[name]
                if info.file_size != entry["size"]:
                    _fail("member_mismatch")
                with archive.open(info, "r") as stream:
                    raw = stream.read(MAX_MEMBER_BYTES + 1)
                if len(raw) != entry["size"] or _hash(raw) != entry["sha256"]:
                    _fail("member_mismatch")
                verified[name] = raw
        return manifest, verified
    except BundleValidationError:
        raise
    except Exception:
        _fail()


def verify_bundle():
    """외부 명세·출처와 내장 ZIP 전체를 검사하고 명세 사본을 반환한다."""
    manifest, _ = _verified_bundle()
    return deepcopy(manifest)


# -I -S의 표준 라이브러리 경로에 검증한 임시 루트 한 곳만 추가한다.
# 입력은 stdin에만 있으며 stdout에도 계산 결과 또는 고정 오류만 쓴다.
_WORKER = r'''
import csv
import json
from pathlib import Path
import sys

sys.dont_write_bytecode = True

def audit(event, args):
    if event.startswith("socket."):
        raise RuntimeError("network_disabled")

sys.addaudithook(audit)

def send(value, status):
    raw = json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":")).encode("utf-8")
    sys.stdout.buffer.write(raw)
    sys.stdout.buffer.flush()
    raise SystemExit(status)

try:
    root = Path(sys.argv[1]).resolve()
    sys.path.insert(0, str(root))
    request = json.loads(sys.stdin.buffer.read().decode("utf-8"))
    from planner.transcript import normalize_transcript, TranscriptValidationError
    from planner.requirements import evaluate_requirements, RequirementsValidationError
    from planner.courses import build_candidates
    from planner.timetable import search_timetables
    from planner.report import build_report
    from planner.planning_types import PlanningValidationError
    try:
        offerings = [json.loads(path.read_text(encoding="utf-8-sig"))
                     for path in sorted((root / "data" / "offerings").glob("*.json"))]
        with (root / "data" / "walk.csv").open(encoding="utf-8-sig", newline="") as stream:
            walk = list(csv.DictReader(stream))
        payload, preferences, target = request["payload"], request["preferences"], request["target_term"]
        requirements_path = root / "data" / "requirements" / "2025.json"
        transcript = normalize_transcript(payload, offerings)
        requirements = evaluate_requirements(payload, offerings, requirements_path=requirements_path)
        candidates = build_candidates(payload, offerings, target_term=target, preferences=preferences,
                                      requirements_path=requirements_path)
        report = build_report(search_timetables(candidates, walk))
        result = {"transcript": transcript, "requirements": requirements, "candidates": candidates,
                  "json": report["json"], "markdown": report["markdown"]}
    except (TranscriptValidationError, RequirementsValidationError, PlanningValidationError) as exc:
        send({"ok": False, "errors": exc.errors}, 2)
    send({"ok": True, "result": result}, 0)
except Exception:
    send({"ok": False, "errors": [{"code": "worker_failed", "path": "bundle.worker",
                                  "message": "격리된 계산을 완료할 수 없습니다."}]}, 2)
'''


def _valid_errors(value):
    return (isinstance(value, list) and 0 < len(value) <= 10000
            and all(isinstance(error, dict) and set(error) == {"code", "path", "message"}
                    and all(isinstance(error[key], str) and len(error[key]) <= 2000
                            for key in ("code", "path", "message")) for error in value))


def run(payload, *, preferences=None, target_term=None):
    """검증한 내장 자료만 이용해 기존 정리·요건·시간표 보고를 실행한다."""
    manifest, members = _verified_bundle()
    target = manifest["target_term"] if target_term is None else target_term
    if not isinstance(target, str) or target != manifest["target_term"]:
        _fail("target_term_mismatch")
    try:
        request = json.dumps({"payload": payload, "preferences": preferences, "target_term": target},
                             ensure_ascii=False, allow_nan=False, separators=(",", ":")).encode("utf-8")
    except Exception:
        _fail("invalid_input")
    if len(request) > MAX_INPUT_BYTES:
        _fail("invalid_input")
    try:
        with tempfile.TemporaryDirectory(prefix="ttw-bundle-") as directory:
            root = Path(directory).resolve()
            for name, raw in members.items():
                destination = root.joinpath(*PurePosixPath(name).parts)
                if not destination.resolve().is_relative_to(root):
                    _fail("unsafe_archive")
                destination.parent.mkdir(parents=True, exist_ok=True)
                with destination.open("xb") as stream:
                    stream.write(raw)
            completed = subprocess.run([sys.executable, "-I", "-S", "-c", _WORKER, str(root)],
                                       input=request, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                       cwd=root, timeout=WORKER_TIMEOUT_SECONDS, check=False)
        if completed.returncode not in (0, 2) or len(completed.stdout) > MAX_OUTPUT_BYTES:
            _fail("worker_failed")
        try:
            response = _json(completed.stdout)
        except Exception:
            _fail("worker_failed")
        if not isinstance(response, dict):
            _fail("worker_failed")
        if completed.returncode == 2 and response.get("ok") is False and _valid_errors(response.get("errors")):
            raise BundleValidationError(errors=response["errors"]) from None
        if (completed.returncode != 0 or response.get("ok") is not True
                or not isinstance(response.get("result"), dict)
                or set(response["result"]) != {"transcript", "requirements", "candidates", "json", "markdown"}):
            _fail("worker_failed")
        return response["result"]
    except BundleValidationError:
        raise
    except Exception:
        _fail("worker_failed")


def _read_input(name):
    try:
        if name == "-":
            raw = sys.stdin.buffer.read(MAX_INPUT_BYTES + 1)
        else:
            with Path(name).open("rb") as stream:
                raw = stream.read(MAX_INPUT_BYTES + 1)
        if len(raw) > MAX_INPUT_BYTES:
            _fail("invalid_input")
        return json.loads(raw.decode("utf-8-sig"))
    except BundleValidationError:
        raise
    except Exception:
        _fail("read_error")


def _print_json(value, stream):
    text = json.dumps(value, ensure_ascii=False, allow_nan=False, indent=2) + "\n"
    if hasattr(stream, "buffer"):
        stream.buffer.write(text.encode("utf-8"))
        stream.buffer.flush()
    else:
        stream.write(text)


def main(argv=None):
    parser = argparse.ArgumentParser(description="검증한 오프라인 자료로 이수내역·시간표 계산")
    parser.add_argument("--verify", action="store_true", help="묶음 검증만 실행")
    parser.add_argument("--transcript", help="이수내역 JSON 파일. -이면 표준입력")
    parser.add_argument("--preferences", help="선택 조건 JSON 파일")
    parser.add_argument("--target-term", help="묶음과 같은 목표 학기")
    parser.add_argument("--format", choices=("json", "markdown"), default="json")
    args = parser.parse_args(argv)
    if not args.verify and not args.transcript:
        parser.error("--transcript 또는 --verify가 필요합니다.")
    try:
        if args.verify:
            result = verify_bundle()
            if args.target_term is not None and args.target_term != result["target_term"]:
                _fail("target_term_mismatch")
            _print_json(result, sys.stdout)
        else:
            payload = _read_input(args.transcript)
            preferences = _read_input(args.preferences) if args.preferences else None
            result = run(payload, preferences=preferences, target_term=args.target_term)
            if args.format == "json":
                _print_json(result, sys.stdout)
            elif hasattr(sys.stdout, "buffer"):
                sys.stdout.buffer.write(result["markdown"].encode("utf-8"))
                sys.stdout.buffer.flush()
            else:
                sys.stdout.write(result["markdown"])
    except BundleValidationError as exc:
        _print_json({"errors": exc.errors}, sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
