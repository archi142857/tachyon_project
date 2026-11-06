"""저장소의 고정 가상 3사례만 실행해 로컬 대조 기록을 만든다. GPT 실행 아님."""

import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from planner.transcript import normalize_transcript


def main():
    try:
        from planner.requirements import evaluate_requirements
    except ModuleNotFoundError as error:
        if error.name != "planner.requirements":
            raise
        evaluate_requirements = None
    offerings = [json.loads(p.read_text(encoding="utf-8"))
                 for p in sorted((ROOT / "data/offerings").glob("*.json"))]
    target = ROOT / "demo/results"
    target.mkdir(exist_ok=True)
    manifest = {"execution": "local_python_not_gpt", "example": True, "files": {}}
    for path in [ROOT / "planner/transcript.py", ROOT / "planner/requirements.py",
                 ROOT / "data/requirements/2025.json", *sorted((ROOT / "data/offerings").glob("*.json"))]:
        if path.exists():
            manifest["files"][path.relative_to(ROOT).as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
    for case in ("animal", "biology_double", "chemical_double"):
        input_path = ROOT / "demo/inputs" / f"{case}.json"
        manifest["files"][input_path.relative_to(ROOT).as_posix()] = hashlib.sha256(input_path.read_bytes()).hexdigest()
        source = json.loads(input_path.read_text(encoding="utf-8"))
        normalized = normalize_transcript(source, offerings)
        result = {
            "example": True, "execution": "local_python_not_gpt",
            "input": input_path.relative_to(ROOT).as_posix(),
            "normalized": normalized,
            "requirements_state": "executed" if evaluate_requirements else "not_ready",
            "requirements": evaluate_requirements(source, offerings) if evaluate_requirements else None,
            "timetable_state": "not_executed", "gpt_state": "not_executed",
        }
        (target / f"{case}.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(case, json.dumps(normalized["summary"], ensure_ascii=False), result["requirements_state"])
    (target / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
