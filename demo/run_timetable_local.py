"""고정 모의 시간표 경계만 실행한다. 실제 학생·실제 강좌·GPT 시연이 아니다."""

import copy
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from planner.report import recommend_timetables


def main():
    source_path = ROOT / "demo/timetable_boundary.json"
    source = json.loads(source_path.read_text(encoding="utf-8"))
    files = [*sorted((ROOT / "planner").glob("*.py")), source_path,
             ROOT / "demo/run_timetable_local.py", ROOT / "tests/test_end_to_end.py",
             ROOT / "demo/시간표_독립_기대값.md", ROOT / "scripts/validate_requirements.py",
             ROOT / "data/requirements/2025.json", ROOT / "data/requirements/schema.json",
             ROOT / "data/requirements/source/snu_2025_graduation_requirements.json"]
    def hashes():
        return {p.relative_to(ROOT).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
    snapshot = hashes()
    output = {"example": True, "execution": "local_python_not_gpt", "catalog": "synthetic_boundary_only",
              "note": "모의 강좌의 링크는 형식 검사 대상이며 실제 지도 페이지에서 열림을 검증하지 않았다.",
              "files": snapshot, "cases": {}}
    for name in ("forward", "reverse", "touching", "unknown_building", "estimated"):
        value = copy.deepcopy(source)
        a, b = value["offerings"][0]["courses"]
        if name == "reverse":
            a[5][0][2][0][3], b[5][0][2][0][3] = "302", "200"
        elif name == "touching":
            b[5][0][2][0][1:3] = [600, 660]
        elif name == "unknown_building":
            b[5][0][2][0][3:] = ["", ""]
        elif name == "estimated":
            value["target_term"] = "2027-1"
        result = recommend_timetables(value["payload"], value["offerings"], value["walk_rows"],
                                      target_term=value["target_term"], preferences=value["preferences"])
        output["cases"][name] = result
        print(name, [{key: plan[key] for key in ("credits", "walk_minutes", "shortage_minutes", "cost", "travel_complete")}
                     for plan in result["json"]["plans"]])
    if hashes() != snapshot:
        raise RuntimeError("검사 중 관련 파일이 바뀌어 결과 저장을 보류합니다.")
    (ROOT / "demo/timetable_verification.json").write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
