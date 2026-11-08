"""작업 4: 격리된 표준 라이브러리 실행·재현성·고정 규정의 실패 경계."""

import ast
import base64
import copy
import csv
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import zipfile

import pytest

from planner.courses import build_candidates
from planner.report import recommend_timetables
from planner.requirements import evaluate_requirements
from planner.transcript import normalize_transcript
from scripts import build_gpt as builder
from scripts.build_gpt import BundleBuildError, build_bundle


ROOT = Path(__file__).resolve().parents[1]
OUTER_FILES = {"planner_bundle.py", "manifest.json", "출처.md"}
ATTRIBUTION = "TT Wizard 자료: 캠퍼스 마법 지도·© OpenStreetMap 기여자, 국토지리정보원, 서울대 수강편람"
JSON_OPTIONS = {"ensure_ascii": False, "allow_nan": False}


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2, **JSON_OPTIONS) + "\n", encoding="utf-8")


def digest(raw):
    return {"sha256": hashlib.sha256(raw).hexdigest(), "size": len(raw)}


@pytest.fixture(scope="module")
def bundle(tmp_path_factory):
    output = tmp_path_factory.mktemp("bundle-baseline") / "knowledge"
    manifest = build_bundle(ROOT, output, target_term="2027-1")
    return output, manifest


@pytest.fixture(scope="module")
def original_data():
    offerings = [read_json(path) for path in sorted((ROOT / "data" / "offerings").glob("*.json"))]
    with (ROOT / "data" / "walk.csv").open(encoding="utf-8-sig", newline="") as stream:
        walks = list(csv.DictReader(stream))
    return offerings, walks


def copy_bundle(bundle, destination):
    source = bundle[0]
    destination.mkdir(parents=True)
    for name in OUTER_FILES:
        shutil.copyfile(source / name, destination / name)
    return destination


def copy_sources(bundle, destination):
    destination.mkdir(parents=True)
    for relative in bundle[1]["source_inputs"]:
        source = ROOT / relative
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
    return destination


def literal_value(text, name):
    tree = ast.parse(text)
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == name for t in node.targets):
            return ast.literal_eval(node.value)
    raise AssertionError(f"generated runtime constant missing: {name}")


def replace_literal(text, name, value):
    lines = text.splitlines(keepends=True)
    for node in ast.parse(text).body:
        if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == name for t in node.targets):
            token = node.value
            start = sum(len(line) for line in lines[:token.lineno - 1]) + token.col_offset
            end = sum(len(line) for line in lines[:token.end_lineno - 1]) + token.end_col_offset
            return text[:start] + repr(value) + text[end:]
    raise AssertionError(f"generated runtime constant missing: {name}")


def unpack(output):
    runtime = (output / "planner_bundle.py").read_text(encoding="utf-8")
    archive = base64.b64decode(literal_value(runtime, "ARCHIVE_BASE64"), validate=True)
    with zipfile.ZipFile(io.BytesIO(archive)) as stream:
        return runtime, {name: stream.read(name) for name in stream.namelist()}


def reseal(output, members):
    """비밀 서명처럼 해시를 오해하지 않도록 해시 재작성 공격을 직접 구성한다."""
    runtime = (output / "planner_bundle.py").read_text(encoding="utf-8")
    manifest = read_json(output / "manifest.json")
    archive_io = io.BytesIO()
    with zipfile.ZipFile(archive_io, "w", compression=zipfile.ZIP_STORED) as archive:
        for name, raw in sorted(members.items()):
            archive.writestr(zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0)), raw)
    archive_raw = archive_io.getvalue()
    manifest["members"] = {name: digest(raw) for name, raw in sorted(members.items())}
    manifest["archive_sha256"] = hashlib.sha256(archive_raw).hexdigest()
    for name in set(manifest["source_inputs"]) & set(members):
        manifest["source_inputs"][name] = digest(members[name])
    write_json(output / "manifest.json", manifest)
    runtime = replace_literal(runtime, "ARCHIVE_BASE64", base64.b64encode(archive_raw).decode("ascii"))
    runtime = replace_literal(runtime, "MANIFEST_SHA256", hashlib.sha256((output / "manifest.json").read_bytes()).hexdigest())
    (output / "planner_bundle.py").write_text(runtime, encoding="utf-8")


def cli(output, args, *, cwd, payload=None, env=None):
    return subprocess.run([sys.executable, "-I", "-S", str(output / "planner_bundle.py"), *args],
                          cwd=cwd, input=None if payload is None else json.dumps(payload, **JSON_OPTIONS),
                          text=True, encoding="utf-8", capture_output=True, timeout=90, env=env)


def assert_safe_failure(result, *private_values):
    assert result.returncode == 2, result.stderr
    assert result.stdout.strip() == ""
    errors = json.loads(result.stderr)["errors"]
    assert errors and all(set(item) == {"code", "path", "message"} for item in errors)
    assert "Traceback" not in result.stderr
    for value in private_values:
        assert str(value) not in result.stderr


def direct_result(payload, offerings, walks, *, target_term="2027-1", preferences=None):
    report = recommend_timetables(payload, offerings, walks, target_term=target_term, preferences=preferences)
    return {"transcript": normalize_transcript(payload, offerings),
            "requirements": evaluate_requirements(payload, offerings),
            "candidates": build_candidates(payload, offerings, target_term=target_term, preferences=preferences),
            **report}


def test_three_outer_files_and_manifest_preserve_all_required_history_and_licenses(bundle):
    output, manifest = bundle
    assert {path.name for path in output.iterdir()} == OUTER_FILES
    assert read_json(output / "manifest.json") == manifest
    assert manifest["bundle_schema_version"] == 1
    assert manifest["requirements_version"] == "1.0"
    assert manifest["target_term"] == "2027-1"
    assert manifest["source_term"] == "2026-1"
    assert manifest["estimated"] is True
    expected_terms = [f"{year}-{season}" for year in range(2021, 2027) for season in (1, 2)]
    assert manifest["offering_terms"] == expected_terms
    assert manifest["frequency_window"] == {"years": [2022, 2023, 2024, 2025, 2026],
                                             "observed_years": [2022, 2023, 2024, 2025, 2026],
                                             "missing_years": []}
    expected_members = {"LICENSE", "data/ODbL-1.0.txt", "data/README.md", "data/walk.csv",
                        "data/buildings.csv", "data/likelihood.csv", "data/source_manifest.json",
                        "data/requirements/2025.json", "data/requirements/schema.json",
                        "data/requirements/source/snu_2025_graduation_requirements.json",
                        "scripts/validate_requirements.py", "planner/transcript.py",
                        "planner/requirements.py", "planner/courses.py", "planner/timetable.py",
                        "planner/report.py", "planner/planning_types.py"}
    expected_members.update(f"data/offerings/{term}.json" for term in expected_terms)
    assert expected_members <= set(manifest["members"])
    assert ATTRIBUTION in (output / "출처.md").read_text(encoding="utf-8")
    assert not any(key.startswith(("demo/", "tests/", ".git/", "prompts/")) for key in manifest["members"])
    assert not any("__pycache__" in key for key in manifest["members"])
    assert str(ROOT) not in json.dumps(manifest, ensure_ascii=False)


def test_embedded_archive_member_hashes_sizes_and_safe_relative_names(bundle):
    output, manifest = bundle
    runtime, members = unpack(output)
    assert set(members) == set(manifest["members"])
    for name, raw in members.items():
        assert manifest["members"][name] == digest(raw)
        assert not Path(name).is_absolute()
        assert ".." not in name.split("/")
    archive_raw = base64.b64decode(literal_value(runtime, "ARCHIVE_BASE64"))
    assert hashlib.sha256(archive_raw).hexdigest() == manifest["archive_sha256"]
    assert literal_value(runtime, "MANIFEST_SHA256") == hashlib.sha256((output / "manifest.json").read_bytes()).hexdigest()
    with zipfile.ZipFile(io.BytesIO(archive_raw)) as archive:
        assert all(info.compress_type == zipfile.ZIP_STORED for info in archive.infolist())


def test_rebuilding_same_inputs_is_byte_identical(bundle):
    output, original = bundle
    before = {name: (output / name).read_bytes() for name in OUTER_FILES}
    assert build_bundle(ROOT, output, target_term="2027-1") == original
    assert {name: (output / name).read_bytes() for name in OUTER_FILES} == before


def test_actual_term_build_differs_from_estimate_without_losing_history(bundle, tmp_path):
    actual_dir = tmp_path / "actual"
    actual = build_bundle(ROOT, actual_dir, target_term="2026-1")
    assert actual["source_term"] == "2026-1"
    assert actual["estimated"] is False
    assert actual["offering_terms"] == bundle[1]["offering_terms"]
    assert actual["frequency_window"]["years"] == [2021, 2022, 2023, 2024, 2025]
    assert (actual_dir / "planner_bundle.py").read_bytes() != (bundle[0] / "planner_bundle.py").read_bytes()
    assert (actual_dir / "manifest.json").read_bytes() != (bundle[0] / "manifest.json").read_bytes()


def test_build_cli_explicit_source_and_output_create_three_files(tmp_path, capsys):
    output = tmp_path / "cli-output"
    assert builder.main(["--source-root", str(ROOT), "--output-dir", str(output),
                         "--target-term", "2027-1"]) == 0
    streams = capsys.readouterr()
    assert streams.err == ""
    response = json.loads(streams.out)
    assert set(response["files"]) == OUTER_FILES
    assert response["source_term"] == "2026-1"
    assert {path.name for path in output.iterdir()} == OUTER_FILES


@pytest.mark.parametrize("case", ["animal", "biology_double", "chemical_double"])
def test_three_demo_inputs_match_original_modules_in_isolated_subprocess(bundle, original_data, tmp_path, case):
    payload = read_json(ROOT / "demo" / "inputs" / f"{case}.json")
    expected = direct_result(payload, *original_data)
    result = cli(bundle[0], ["--transcript", "-"], cwd=tmp_path, payload=payload)
    assert result.returncode == 0, result.stderr
    assert result.stderr == ""
    assert json.loads(result.stdout) == expected
    assert list(tmp_path.iterdir()) == []


def test_pythonpath_and_current_directory_cannot_replace_bundled_planner(bundle, tmp_path):
    poison = tmp_path / "poison"
    poison.mkdir()
    marker = "예시_외부모듈실행금지"
    for module in ("planner", "scripts"):
        (poison / module).mkdir()
        (poison / module / "__init__.py").write_text(f"raise RuntimeError({marker!r})\n", encoding="utf-8")
    (poison / "sitecustomize.py").write_text(f"raise RuntimeError({marker!r})\n", encoding="utf-8")
    environment = dict(os.environ, PYTHONPATH=str(poison), PYTHONNOUSERSITE="1")
    payload = read_json(ROOT / "demo" / "inputs" / "animal.json")
    result = cli(bundle[0], ["--transcript", "-"], cwd=poison, payload=payload, env=environment)
    assert result.returncode == 0, result.stderr
    assert marker not in result.stdout + result.stderr
    assert json.loads(result.stdout)["requirements"]["graduation_status"] == "not_evaluated"


def test_public_api_returns_independent_manifest_and_matches_cli(bundle, tmp_path):
    script = """
import importlib.util, json, sys
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('offline_bundle', sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
manifest = module.verify_bundle()
manifest['target_term'] = '1900-1'
assert module.verify_bundle()['target_term'] == '2027-1'
payload = json.load(sys.stdin)
print(json.dumps(module.run(payload), ensure_ascii=False, allow_nan=False))
"""
    payload = read_json(ROOT / "demo" / "inputs" / "animal.json")
    result = subprocess.run([sys.executable, "-I", "-S", "-c", script, str(bundle[0] / "planner_bundle.py")],
                            cwd=tmp_path, input=json.dumps(payload, **JSON_OPTIONS), text=True, encoding="utf-8",
                            capture_output=True, timeout=90)
    cli_result = cli(bundle[0], ["--transcript", "-"], cwd=tmp_path, payload=payload)
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout) == json.loads(cli_result.stdout)


def test_markdown_and_preferences_match_original_execution(bundle, original_data, tmp_path):
    payload = read_json(ROOT / "demo" / "inputs" / "animal.json")
    # 사용자 지정은 가상 학생의 선택이다. 실제 재학·신청 기록을 뜻하지 않는다.
    preferences = {"min_credits": 1, "max_credits": 3, "include_codes": ["3346.328"], "max_nodes": 1000}
    preferences_path = tmp_path / "preferences.json"
    write_json(preferences_path, preferences)
    expected = direct_result(payload, *original_data, preferences=preferences)
    result = cli(bundle[0], ["--transcript", "-", "--preferences", str(preferences_path), "--format", "markdown"],
                 cwd=tmp_path, payload=payload)
    assert result.returncode == 0, result.stderr
    assert result.stdout.rstrip("\r\n") == expected["markdown"].rstrip("\r\n")
    assert ATTRIBUTION in result.stdout


def test_bundle_does_not_store_or_return_extra_student_fields(bundle, tmp_path):
    payload = read_json(ROOT / "demo" / "inputs" / "animal.json")
    marker = "예시_학번이름성적_비공개표식"
    for target in (payload, payload["programs"][0], payload["courses"][0]):
        target.update(student_name=marker, student_id=marker, grade=marker, note={marker: marker})
    before = {name: (bundle[0] / name).read_bytes() for name in OUTER_FILES}
    result = cli(bundle[0], ["--transcript", "-"], cwd=tmp_path, payload=payload)
    assert result.returncode == 0, result.stderr
    assert marker not in result.stdout + result.stderr
    assert list(tmp_path.iterdir()) == []
    assert {name: (bundle[0] / name).read_bytes() for name in OUTER_FILES} == before


def test_unknown_output_file_causes_failure_and_all_existing_files_are_preserved(bundle, tmp_path):
    output = copy_bundle(bundle, tmp_path / "knowledge")
    (output / "user_notes.txt").write_text("예시 사용자 파일", encoding="utf-8")
    before = {path.name: path.read_bytes() for path in output.iterdir()}
    with pytest.raises(BundleBuildError):
        build_bundle(ROOT, output, target_term="2027-1")
    assert {path.name: path.read_bytes() for path in output.iterdir()} == before


def test_output_overlapping_source_is_rejected_without_touching_source(bundle, tmp_path):
    source = copy_sources(bundle, tmp_path / "source")
    before = (source / "planner" / "transcript.py").read_bytes()
    with pytest.raises(BundleBuildError):
        build_bundle(source, source / "planner", target_term="2027-1")
    assert (source / "planner" / "transcript.py").read_bytes() == before


def test_partial_output_replace_failure_restores_previous_bundle(bundle, tmp_path, monkeypatch):
    output = copy_bundle(bundle, tmp_path / "output")
    before = {name: (output / name).read_bytes() for name in OUTER_FILES}
    original_replace = builder.os.replace
    calls = 0

    def fail_second_replace(source, destination):
        nonlocal calls
        calls += 1
        if calls == 2:
            raise OSError("예시_쓰기실패_원문비노출")
        return original_replace(source, destination)

    monkeypatch.setattr(builder.os, "replace", fail_second_replace)
    with pytest.raises(BundleBuildError) as exc:
        build_bundle(ROOT, output, target_term="2026-1")
    assert "예시_쓰기실패_원문비노출" not in str(exc.value)
    assert {name: (output / name).read_bytes() for name in OUTER_FILES} == before


@pytest.mark.parametrize("failure", ["missing_code", "missing_source", "professor_column", "extra_metadata", "extra_csv_column"])
def test_invalid_build_inputs_fail_before_existing_bundle_changes(bundle, tmp_path, failure):
    source = copy_sources(bundle, tmp_path / "source")
    output = copy_bundle(bundle, tmp_path / "output")
    before = {name: (output / name).read_bytes() for name in OUTER_FILES}
    marker = "예시_원문반환금지"
    if failure == "missing_code":
        (source / "planner" / "transcript.py").unlink()
    elif failure == "missing_source":
        (source / "data" / "requirements" / "source" / "snu_2025_graduation_requirements.json").unlink()
    elif failure in ("professor_column", "extra_metadata"):
        path = source / "data" / "offerings" / "2021-1.json"
        data = read_json(path)
        if failure == "professor_column":
            data["courses"][0][5][0].insert(1, marker)
        else:
            data["meta"][marker] = marker
        write_json(path, data)
    else:
        path = source / "data" / "walk.csv"
        lines = path.read_text(encoding="utf-8-sig").splitlines()
        lines[0] += "," + marker
        lines[1] += "," + marker
        path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    with pytest.raises(BundleBuildError) as exc:
        build_bundle(source, output, target_term="2027-1")
    assert marker not in str(exc.value)
    assert str(source) not in str(exc.value)
    assert {name: (output / name).read_bytes() for name in OUTER_FILES} == before


@pytest.mark.parametrize("kind", ["top_extra", "input_extra", "input_absolute", "source_absolute"])
def test_source_manifest_private_keys_and_absolute_paths_are_rejected(bundle, tmp_path, kind):
    source = copy_sources(bundle, tmp_path / "source")
    output = copy_bundle(bundle, tmp_path / "output")
    before = {name: (output / name).read_bytes() for name in OUTER_FILES}
    path = source / "data" / "source_manifest.json"
    document = read_json(path)
    marker = "예시_출처기록비공개"
    example_absolute_path = f"C:/example-private/{marker}.json"
    if kind == "top_extra":
        document[marker] = {"private": example_absolute_path}
    elif kind == "input_extra":
        document["inputs"][marker] = "0" * 64
    elif kind == "input_absolute":
        document["inputs"][example_absolute_path] = "0" * 64
    else:
        document["source_kind"] = example_absolute_path
    write_json(path, document)
    with pytest.raises(BundleBuildError) as exc:
        build_bundle(source, output, target_term="2027-1")
    assert marker not in str(exc.value)
    assert example_absolute_path not in str(exc.value)
    assert {name: (output / name).read_bytes() for name in OUTER_FILES} == before


def test_generated_runtime_limit_failure_preserves_previous_bundle(bundle, tmp_path):
    source = copy_sources(bundle, tmp_path / "source")
    output = copy_bundle(bundle, tmp_path / "output")
    before = {name: (output / name).read_bytes() for name in OUTER_FILES}
    path = source / "planner" / "bundle_runtime.py"
    template = path.read_text(encoding="utf-8")
    original = "MAX_ARCHIVE_BYTES = 128 * 1024 * 1024"
    assert original in template
    path.write_text(template.replace(original, "MAX_ARCHIVE_BYTES = 1024", 1), encoding="utf-8")
    with pytest.raises(BundleBuildError):
        build_bundle(source, output, target_term="2027-1")
    assert {name: (output / name).read_bytes() for name in OUTER_FILES} == before


def test_missing_history_is_not_fabricated_and_older_term_is_not_fallback(bundle, tmp_path):
    source = copy_sources(bundle, tmp_path / "source")
    (source / "data" / "offerings" / "2026-1.json").unlink()
    output = tmp_path / "output"
    manifest = build_bundle(source, output, target_term="2027-1")
    assert manifest["source_term"] is None
    assert manifest["frequency_window"]["missing_years"] == [2026]
    assert "2026-1" not in manifest["offering_terms"]
    assert "data/offerings/2026-1.json" not in manifest["members"]
    result = cli(output, ["--transcript", "-"], cwd=tmp_path,
                 payload=read_json(ROOT / "demo" / "inputs" / "animal.json"))
    assert result.returncode == 0, result.stderr
    candidate_result = json.loads(result.stdout)["candidates"]
    assert candidate_result["source_term"] is None
    assert candidate_result["candidates"] == []
    assert any(issue["code"] == "offerings_unavailable" for issue in candidate_result["issues"])


@pytest.mark.parametrize("filename", ["manifest.json", "출처.md"])
def test_missing_bundle_companion_fails_before_execution(bundle, tmp_path, filename):
    output = copy_bundle(bundle, tmp_path / "broken")
    (output / filename).unlink()
    result = cli(output, ["--verify"], cwd=tmp_path)
    assert_safe_failure(result, tmp_path)


@pytest.mark.parametrize("filename", ["manifest.json", "출처.md", "planner_bundle.py"])
def test_tampered_manifest_attribution_or_archive_is_rejected(bundle, tmp_path, filename):
    output = copy_bundle(bundle, tmp_path / "broken")
    path = output / filename
    if filename == "planner_bundle.py":
        text = path.read_text(encoding="utf-8")
        encoded = literal_value(text, "ARCHIVE_BASE64")
        altered = ("A" if encoded[0] != "A" else "B") + encoded[1:]
        path.write_text(replace_literal(text, "ARCHIVE_BASE64", altered), encoding="utf-8")
    else:
        path.write_bytes(path.read_bytes() + b" ")
    result = cli(output, ["--verify"], cwd=tmp_path)
    assert_safe_failure(result, tmp_path)


def test_resealed_source_and_rule_tampering_still_fails_fixed_research_validation(bundle, tmp_path):
    output = copy_bundle(bundle, tmp_path / "resealed")
    _, members = unpack(output)
    rules_path = "data/requirements/2025.json"
    source_path = "data/requirements/source/snu_2025_graduation_requirements.json"
    rules, original = json.loads(members[rules_path]), json.loads(members[source_path])
    for document in (rules, original):
        document["sets"][0]["requirements"][0]["min_credits"] += 1
    members[source_path] = json.dumps(original, **JSON_OPTIONS).encode("utf-8")
    rules["provenance"]["sha256"] = hashlib.sha256(members[source_path]).hexdigest()
    members[rules_path] = json.dumps(rules, **JSON_OPTIONS).encode("utf-8")
    reseal(output, members)
    # 무결성 해시는 공격자가 재작성할 수 있어도 고정 규정 검증을 해제할 수 없다.
    result = cli(output, ["--transcript", "-"], cwd=tmp_path,
                 payload=read_json(ROOT / "demo" / "inputs" / "animal.json"))
    assert_safe_failure(result, tmp_path)
    assert json.loads(result.stderr)["errors"][0]["code"] in {
        "ruleset_release_mismatch", "provenance_mismatch", "invalid_requirements",
    }


def test_resealed_unsafe_zip_path_is_rejected_without_extracting_outside(bundle, tmp_path):
    output = copy_bundle(bundle, tmp_path / "unsafe")
    _, members = unpack(output)
    members["../escaped.txt"] = b"example must not escape"
    reseal(output, members)
    result = cli(output, ["--verify"], cwd=tmp_path)
    assert_safe_failure(result, tmp_path)
    assert not (tmp_path / "escaped.txt").exists()


def test_worker_blocks_socket_creation_even_in_resealed_module(bundle, tmp_path):
    output = copy_bundle(bundle, tmp_path / "network-check")
    _, members = unpack(output)
    # 외부 주소에 연결하지 않는다. socket 생성 단계에서 audit 차단을 검증한다.
    members["planner/__init__.py"] += b"\nimport socket as _example_socket\n_example_socket.socket()\n"
    reseal(output, members)
    verified = cli(output, ["--verify"], cwd=tmp_path)
    assert verified.returncode == 0, verified.stderr
    result = cli(output, ["--transcript", "-"], cwd=tmp_path,
                 payload=read_json(ROOT / "demo" / "inputs" / "animal.json"))
    assert_safe_failure(result, tmp_path)
    assert json.loads(result.stderr)["errors"][0]["code"] == "worker_failed"


def test_runtime_rejects_different_target_and_bad_input_without_private_echo(bundle, tmp_path):
    payload = read_json(ROOT / "demo" / "inputs" / "animal.json")
    result = cli(bundle[0], ["--transcript", "-", "--target-term", "2026-1"], cwd=tmp_path, payload=payload)
    assert_safe_failure(result, tmp_path)
    marker = "예시_학생정보오류비노출"
    payload["courses"][0]["credits"] = marker
    result = cli(bundle[0], ["--transcript", "-"], cwd=tmp_path, payload=payload)
    assert_safe_failure(result, marker, tmp_path)


@pytest.mark.parametrize("target", ["2027-S", "2027-3", None, "2027-1 예시_원문비노출"])
def test_build_target_validation_is_structured_and_does_not_create_output(tmp_path, target):
    output = tmp_path / "new-output"
    with pytest.raises(BundleBuildError) as exc:
        build_bundle(ROOT, output, target_term=target)
    assert "예시_원문비노출" not in str(exc.value)
    assert not output.exists()
