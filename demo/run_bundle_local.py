"""고정 가상 사례의 묶음 독립 검증. 실제 GPT 실행·개인 자료 입력 도구가 아니다."""

import base64
import copy
import csv
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from urllib.parse import parse_qs, urlsplit
import zlib

ROOT = Path(__file__).resolve().parents[1]
NAMES = ("planner_bundle.py", "manifest.json", "출처.md")
DRIVER = r'''
import importlib.util, json, pathlib, sys
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("checked_bundle", pathlib.Path.cwd() / "planner_bundle.py")
bundle = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bundle)
requests = json.loads(sys.stdin.buffer.read().decode("utf-8"))
manifest = bundle.verify_bundle()
results = {}
for name, request in requests.items():
    results[name] = bundle.run(request["payload"], preferences=request["preferences"])
sys.stdout.buffer.write(json.dumps({"manifest": manifest, "results": results,
    "isolated": sys.flags.isolated, "no_site": sys.flags.no_site,
    "repository_modules_imported": any(k == "planner" or k.startswith("planner.")
        or k == "scripts" or k.startswith("scripts.") for k in sys.modules)
    }, ensure_ascii=False).encode("utf-8"))
'''


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def fixed_requests():
    """계산 출력으로 입력·기대값을 생성하지 않고 고정 가상 입력만 사용한다."""
    requests = {}
    for name in ("animal", "biology_double", "chemical_double"):
        requests[name] = {"payload": read_json(ROOT / "demo/inputs" / (name + ".json")), "preferences": None}
    biology = copy.deepcopy(requests["biology_double"]["payload"])
    biology["courses"][2]["status"] = "completed"
    requests["research_completed"] = {"payload": copy.deepcopy(biology), "preferences": None}
    biology["courses"][1]["status"] = "completed"
    requests["labs_completed"] = {"payload": copy.deepcopy(biology), "preferences": None}
    biology["coverage"] = "complete"
    biology["programs"] = [{"name": "생명과학부", "kind": "주전공"}]
    requests["single_completed"] = {"payload": copy.deepcopy(biology), "preferences": None}
    biology["courses"][1]["status"] = "in_progress"
    requests["single_progress"] = {"payload": copy.deepcopy(biology), "preferences": None}
    empty = {"schema_version": 1, "entry_year": 2025,
             "programs": [{"name": "동물생명공학전공", "kind": "주전공"}],
             "coverage": "partial", "courses": []}
    prefs = {"required_codes": ["M2177.008600"], "min_credits": 3, "max_credits": 3, "home": "200"}
    requests["round_trip"] = {"payload": empty, "preferences": prefs}
    for name in ("same_building", "avoided_time", "overlap"):
        requests[name] = copy.deepcopy(requests["round_trip"])
    requests["same_building"]["preferences"]["home"] = "302"
    requests["avoided_time"]["preferences"]["avoid_times"] = [{"day": 4, "start": 815, "end": 825}]
    requests["overlap"]["preferences"].update(
        required_codes=["M2177.008600", "5202.405"], min_credits=6, max_credits=6)
    requests["extra_fields"] = copy.deepcopy(requests["animal"])
    requests["extra_fields"]["payload"]["synthetic_extra"] = "FRONTEND_SYNTHETIC_MARKER"
    requests["extra_fields"]["payload"]["courses"][0]["synthetic_extra"] = "FRONTEND_SYNTHETIC_MARKER"
    return requests


def items(result):
    return {item["id"]: item for group in result["requirements"]["sets"] for item in group["items"]}


def check_oracles(results):
    """묶음 실행 전에 문서로 고정한 산술·상태·링크 기준만 대조한다."""
    for name, counts, completed, progress, held in (
        ("animal", {"completed": 1, "in_progress": 1, "unknown": 1}, 3, 3, 0),
        ("biology_double", {"completed": 1, "in_progress": 1, "unknown": 1}, 2, 2, 0),
        ("chemical_double", {"completed": 2, "in_progress": 1, "unknown": 1}, 3, 0, 1),
    ):
        result = results[name]
        summary = result["transcript"]["summary"]
        assert summary["status_counts"] == counts, name
        assert summary["confirmed_completed_credits"] == completed, name
        assert summary["in_progress_credits"] == progress, name
        assert summary["held_completed_rows"] == held, name
        assert all(r["code"] == r["matched_code"] for r in result["transcript"]["courses"]), name
        for item in items(result).values():
            assert item["status"] == "needs_check" and item["remaining"] is None, name
        assert not any(i.startswith("chemical-main") for i in items(result)), name
    chemical = results["chemical_double"]["transcript"]["courses"]
    assert len(chemical) == 4
    assert all("repeated_course" in chemical[i]["issues"] and not chemical[i]["countable_completed"] for i in (0, 1))
    for name, credits, count in (("biology_double", 2, 1), ("research_completed", 3, 2), ("labs_completed", 5, 3)):
        item = items(results[name])["biology-double-R05"]
        assert item["calculation"]["credits"] == credits and item["calculation"]["count"] == count
        assert item["status"] == "needs_check" and item["remaining"] is None
    for name, status, credits, remaining in (("single_completed", "satisfied", 5, 0), ("single_progress", "remaining", 3, 2)):
        item = items(results[name])["biology-main-R06"]
        assert item["status"] == status and item["calculation"]["credits"] == credits
        assert item["remaining"] == {"credits": remaining, "count": 0 if remaining == 0 else 1,
                                      "required_codes": [] if remaining == 0 else ["M1410.000200"]}
    for name, result in results.items():
        assert result["requirements"]["graduation_status"] == "not_evaluated", name
        for item in items(result).values():
            assert item["sources"], name
            if item["calculation_mode"] == "manual_review":
                assert item["calculation"] is None and item["remaining"] is None and item["reasons"], name
    route = results["round_trip"]
    assert route["json"]["target_term"] == "2027-1" and route["json"]["source_term"] == "2026-1"
    assert route["json"]["estimated"] is True and route["json"]["search"]["complete"] is True
    assert len(route["json"]["plans"]) == 1
    plan = route["json"]["plans"][0]
    assert plan["credits"] == 3 and plan["travel_complete"] is True
    assert (plan["walk_minutes"], plan["shortage_minutes"], plan["cost"]) == (42.94, 0, 42.94)
    assert [(leg["from"], leg["to"], leg["minutes"]) for leg in plan["legs"]] == [("200", "302", 24.66), ("302", "200", 18.28)]
    section = plan["sections"][0]
    assert len(plan["sections"]) == 1 and section["number"] == "001" and section["code"] == "M2177.008600"
    assert section["basis"] == "user_requested" and section["prerequisite_status"] == "unknown"
    assert section["meetings"] == [{"day": 4, "start": 810, "end": 980, "building": "302", "room": "1"}]
    assert section["frequency"] == {"years_offered": 3, "window_years": [2022, 2023, 2024, 2025, 2026],
                                    "observed_years": [2022, 2023, 2024, 2025, 2026], "missing_years": []}
    token = parse_qs(urlsplit(plan["tt_link"]).fragment)["t"][0]
    raw = base64.urlsafe_b64decode(token[1:] + "=" * (-len(token[1:]) % 4))
    if token[0] == "z":
        raw = zlib.decompress(raw, -15)
    else:
        assert token[0] == "j"
    linked = json.loads(raw)
    assert linked[0:2] == [1, "2026-1"] and "2027-1" in linked[2] and "예상" in linked[2]
    assert linked[3] == [["M2177.008600", "001", None, "인공지능 개론"]]
    same = results["same_building"]["json"]["plans"][0]
    assert (same["walk_minutes"], same["shortage_minutes"], same["cost"]) == (0, 0, 0)
    for name in ("avoided_time", "overlap"):
        value = results[name]["json"]
        assert value["plans"] == [] and value["issues"] and value["search"]["complete"] is True, name
    assert results["extra_fields"] == results["animal"]
    assert "FRONTEND_SYNTHETIC_MARKER" not in json.dumps(results, ensure_ascii=False)
    return linked


def compare_original(requests, results):
    """동일성은 독립 정답 검사와 구분한다. 계산 알고리즘을 복제하지 않는다."""
    sys.path.insert(0, str(ROOT))
    from planner.transcript import normalize_transcript
    from planner.requirements import evaluate_requirements
    from planner.courses import build_candidates
    from planner.timetable import search_timetables
    from planner.report import build_report
    offerings = [read_json(p) for p in sorted((ROOT / "data/offerings").glob("*.json"))]
    with (ROOT / "data/walk.csv").open(encoding="utf-8", newline="") as stream:
        walk = list(csv.DictReader(stream))
    for name, request in requests.items():
        payload, prefs = request["payload"], request["preferences"]
        candidates = build_candidates(payload, offerings, target_term="2027-1", preferences=prefs)
        expected = {"transcript": normalize_transcript(payload, offerings),
                    "requirements": evaluate_requirements(payload, offerings), "candidates": candidates,
                    **build_report(search_timetables(candidates, walk))}
        assert results[name] == expected, "기존 모듈과 묶음 결과 불일치: " + name


def invoke(folder, args, value, env):
    return subprocess.run([sys.executable, "-I", "-S", *args], cwd=folder,
                          input=json.dumps(value, ensure_ascii=False).encode("utf-8"),
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env, timeout=180)


def verify_bundle_copy(bundle_dir):
    requests = fixed_requests()
    artifact_hashes = {name: digest(bundle_dir / name) for name in NAMES}
    manifest = read_json(bundle_dir / "manifest.json")
    assert manifest["target_term"] == "2027-1", "이 고정 검증은 2027-1 묶음 전용입니다."
    source_hashes = {name: digest(ROOT / name) for name in manifest["source_inputs"]}
    assert all(source_hashes[name] == value["sha256"] for name, value in manifest["source_inputs"].items()), "묶음 원본이 이미 바뀌었습니다. Planner 재생성 후 실행하세요."
    frontend_files = ["demo/run_bundle_local.py", "demo/묶음_독립_기대값.md", *["demo/inputs/" + name + ".json" for name in ("animal", "biology_double", "chemical_double")]]
    frontend_hashes = {name: digest(ROOT / name) for name in frontend_files}
    with tempfile.TemporaryDirectory(prefix="tt-wizard-frontend-bundle-") as temp:
        base = Path(temp)
        folder = base / "clean"
        folder.mkdir()
        for name in NAMES:
            shutil.copyfile(bundle_dir / name, folder / name)
        poison = base / "poison"
        poison.mkdir()
        for name in ("planner", "scripts"):
            module = poison / name
            module.mkdir()
            (module / "__init__.py").write_text('raise RuntimeError("FRONTEND_POISON_IMPORTED")\n', encoding="utf-8")
        env = dict(os.environ, PYTHONPATH=str(poison), PYTHONDONTWRITEBYTECODE="1")
        batch = invoke(folder, ["-c", DRIVER], requests, env)
        assert batch.returncode == 0, batch.stderr.decode("utf-8", errors="replace")
        observed = json.loads(batch.stdout)
        assert observed["isolated"] == 1 and observed["no_site"] == 1 and not observed["repository_modules_imported"]
        assert observed["manifest"] == manifest
        results = observed["results"]
        linked = check_oracles(results)
        compare_original(requests, results)
        cli = invoke(folder, ["planner_bundle.py", "--transcript", "-", "--format", "json"], requests["biology_double"]["payload"], env)
        assert cli.returncode == 0 and json.loads(cli.stdout) == results["biology_double"]
        cli_md = invoke(folder, ["planner_bundle.py", "--transcript", "-", "--format", "markdown"], requests["biology_double"]["payload"], env)
        assert cli_md.returncode == 0 and cli_md.stdout.decode("utf-8") == results["biology_double"]["markdown"]
        errors = {}
        for mode, code in (("target", "target_term_mismatch"), ("missing", "bundle_missing"), ("tampered", "manifest_mismatch")):
            broken = base / mode
            broken.mkdir()
            for name in NAMES:
                shutil.copyfile(folder / name, broken / name)
            args = ["planner_bundle.py", "--transcript", "-"]
            if mode == "target":
                args += ["--target-term", "2026-1"]
            elif mode == "missing":
                (broken / "manifest.json").unlink()
            else:
                with (broken / "manifest.json").open("ab") as stream:
                    stream.write(b" ")
            error = invoke(broken, args, requests["extra_fields"]["payload"], env)
            message = error.stderr.decode("utf-8")
            assert error.returncode == 2 and error.stdout == b"", mode
            fixed = json.loads(message)
            assert code in [item["code"] for item in fixed["errors"]], mode
            assert "Traceback" not in message and "FRONTEND_SYNTHETIC_MARKER" not in message and str(base) not in message
            errors[mode] = {"exit_code": error.returncode, **fixed}
        assert sorted(p.name for p in folder.iterdir()) == sorted(NAMES)
        assert {name: digest(folder / name) for name in NAMES} == artifact_hashes
    assert not base.exists(), "검증용 임시 폴더 정리가 끝나지 않았습니다."
    assert {name: digest(bundle_dir / name) for name in NAMES} == artifact_hashes, "검사 중 생성물이 바뀌었습니다."
    assert {name: digest(ROOT / name) for name in source_hashes} == source_hashes, "검사 중 계산 원본이 바뀌었습니다."
    assert {name: digest(ROOT / name) for name in frontend_hashes} == frontend_hashes, "검사 중 검증 입력이 바뀌었습니다."
    return {"example": True, "execution": "local_isolated_python_not_gpt", "target_term": "2027-1",
            "source_term": "2026-1", "estimated": True, "artifacts": artifact_hashes,
            "source_inputs": source_hashes, "frontend_files": frontend_hashes,
            "verification": {"positive_requests": len(requests), "oracle_ids": ["B" + str(i).zfill(2) for i in range(1, 15)],
                "original_module_equality": True, "cli_json_markdown_equality": True,
                "isolated_no_site": True, "poison_pythonpath_not_imported": True,
                "clean_folder_unchanged": True, "temporary_folder_removed": True,
                "network_blocking_independently_tested": False, "real_gpt_tested": False},
            "decoded_route_link": linked, "errors": errors, "cases": results}


def main():
    output = verify_bundle_copy(ROOT / "gpt/knowledge")
    (ROOT / "demo/bundle_verification.json").write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(output["verification"], ensure_ascii=False))


if __name__ == "__main__":
    main()
