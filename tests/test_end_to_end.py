"""Frontend 독립 기대값: 가상 입력과 실제 로컬 편람. GPT 실행 검사는 아님."""

import copy
import json
from pathlib import Path

import pytest

from planner.transcript import normalize_transcript

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="module")
def offerings():
    return [json.loads(p.read_text(encoding="utf-8"))
            for p in sorted((ROOT / "data/offerings").glob("*.json"))]


def payload(case):
    return json.loads((ROOT / "demo/inputs" / f"{case}.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def evaluate():
    module = pytest.importorskip("planner.requirements", reason="2-C 계산 구현 전: 통합 미검증")
    return module.evaluate_requirements


def items(result):
    return {item["id"]: item for group in result["sets"] for item in group["items"]}


@pytest.mark.parametrize("case,counts,completed,progress,held", [
    ("animal", {"completed": 1, "in_progress": 1, "unknown": 1}, 3, 3, 0),
    ("biology_double", {"completed": 1, "in_progress": 1, "unknown": 1}, 2, 2, 0),
    ("chemical_double", {"completed": 2, "in_progress": 1, "unknown": 1}, 3, 0, 1),
])
def test_three_inputs_against_hand_totals(offerings, case, counts, completed, progress, held):
    source = payload(case)
    before = copy.deepcopy(source)
    result = normalize_transcript(source, offerings)
    assert source == before
    assert result["summary"]["status_counts"] == counts
    assert result["summary"]["confirmed_completed_credits"] == completed
    assert result["summary"]["in_progress_credits"] == progress
    assert result["summary"]["held_completed_rows"] == held
    assert result["needs_check"] is True
    assert all(row["matched_code"] == row["code"] for row in result["courses"])


def test_omitted_status_and_repeated_rows_remain_visible(offerings):
    animal = normalize_transcript(payload("animal"), offerings)
    assert animal["courses"][2]["status"] == "unknown"
    assert "status_unknown" in animal["courses"][2]["issues"]
    chemical = normalize_transcript(payload("chemical_double"), offerings)
    assert len(chemical["courses"]) == 4
    for index in (0, 1):
        assert "repeated_course" in chemical["courses"][index]["issues"]
        assert chemical["courses"][index]["countable_completed"] is False


@pytest.mark.parametrize("case", ["animal", "biology_double", "chemical_double"])
def test_three_cases_preserve_manual_and_partial_scope(evaluate, offerings, case):
    result = evaluate(payload(case), offerings)
    assert result["graduation_status"] == "not_evaluated"
    assert result["evaluation_scope"] == "approved_course_lists_only"
    assert result["needs_check"] is True
    selected = items(result)
    assert selected
    for item in selected.values():
        assert item["status"] == "needs_check"
        assert item["remaining"] is None
        assert item["sources"]
        assert item["reasons"]
        if item["calculation_mode"] == "manual_review":
            assert item["calculation"] is None
    assert not any(key.startswith("chemical-main") for key in selected)
    assert not any(key.startswith("biology-main") for key in selected)


def test_biology_observation_is_not_confirmed_remaining(evaluate, offerings):
    result = evaluate(payload("biology_double"), offerings)
    item = items(result)["biology-double-R05"]
    assert item["status"] == "needs_check"
    assert item["remaining"] is None
    assert item["calculation"]["counted_codes"] == ["M1410.000100"]
    assert item["calculation"]["count"] == 1
    assert item["calculation"]["credits"] == 2
    assert item["calculation"]["in_progress_codes"] == ["M1410.000200"]
    assert "3346.328" in item["calculation"]["uncertain_codes"]


def test_corrections_recalculate_without_inventing_recognition(evaluate, offerings):
    source = payload("biology_double")
    source["courses"][2]["status"] = "completed"
    result = evaluate(source, offerings)
    item = items(result)["biology-double-R05"]
    assert result["transcript_summary"]["confirmed_completed_credits"] == 3
    assert item["calculation"]["credits"] == 3
    assert item["status"] == "needs_check"
    source["courses"][1]["status"] = "completed"
    result = evaluate(source, offerings)
    item = items(result)["biology-double-R05"]
    assert item["calculation"]["credits"] == 5
    assert item["status"] == "needs_check"
    assert item["remaining"] is None


@pytest.mark.parametrize("experiment_status,status,credits,missing", [
    ("completed", "satisfied", 5, 0),
    ("in_progress", "remaining", 3, 2),
])
def test_single_program_full_declared_boundary(evaluate, offerings, experiment_status, status, credits, missing):
    # R05/R06: 전체라고 선언한 가상 경계 입력. 실제 학생의 전체 이력이 아니다.
    source = payload("biology_double")
    source["programs"] = [{"name": "생명과학부", "kind": "주전공"}]
    source["coverage"] = "complete"
    for row in source["courses"]:
        row["status"] = "completed"
    source["courses"][1]["status"] = experiment_status
    result = evaluate(source, offerings)
    item = items(result)["biology-main-R06"]
    assert item["status"] == status
    assert item["calculation"]["credits"] == credits
    assert item["remaining"]["credits"] == missing
    assert item["remaining"]["count"] == (0 if missing == 0 else 1)
    assert item["remaining"]["required_codes"] == ([] if missing == 0 else ["M1410.000200"])
    assert result["graduation_status"] == "not_evaluated"


def test_two_programs_complete_still_requires_recognition(evaluate, offerings):
    source = payload("biology_double")
    source["coverage"] = "complete"
    for row in source["courses"]:
        row["status"] = "completed"
    item = items(evaluate(source, offerings))["biology-double-R05"]
    assert item["calculation"]["credits"] == 5
    assert item["status"] == "needs_check"
    assert item["remaining"] is None
