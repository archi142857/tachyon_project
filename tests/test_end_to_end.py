"""Frontend 독립 기대값: 가상 입력과 실제 로컬 편람. GPT 실행 검사는 아님."""

import copy
import base64
import json
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
import zlib

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


@pytest.fixture
def timetable_input():
    return json.loads((ROOT / "demo/timetable_boundary.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def timetable_api():
    courses = pytest.importorskip("planner.courses", reason="작업3 후보 API 준비 전: 미검증")
    timetable = pytest.importorskip("planner.timetable", reason="작업3 시간표 API 준비 전: 미검증")
    return courses.build_candidates, timetable.search_timetables


def run_timetable(api, source):
    build_candidates, search_timetables = api
    candidates = build_candidates(source["payload"], source["offerings"],
                                  target_term=source["target_term"], preferences=source["preferences"])
    return candidates, search_timetables(candidates, source["walk_rows"])


@pytest.mark.parametrize("reverse,cost,shortage", [(False, 52.26, 4.66), (True, 42.94, 0)])
def test_timetable_hand_cost_includes_home_and_direction(timetable_api, timetable_input, reverse, cost, shortage):
    source = timetable_input
    if reverse:
        source["offerings"][0]["courses"][0][5][0][2][0][3] = "302"
        source["offerings"][0]["courses"][1][5][0][2][0][3] = "200"
    candidates, result = run_timetable(timetable_api, source)
    assert all(c["prerequisite_status"] == "unknown" for c in candidates["candidates"])
    assert len(result["plans"]) == 1
    plan = result["plans"][0]
    assert plan["credits"] == 6
    assert plan["travel_complete"] is True
    assert plan["walk_minutes"] == pytest.approx(42.94, abs=0.01)
    assert plan["shortage_minutes"] == pytest.approx(shortage, abs=0.01)
    assert plan["cost"] == pytest.approx(cost, abs=0.01)
    middle = [leg for leg in plan["legs"] if leg["depart"] == 600 and leg["arrive_by"] == 620]
    assert len(middle) == 1
    assert middle[0]["slack"] == pytest.approx(1.72 if reverse else -4.66, abs=0.01)


def test_timetable_touching_times_have_walk_shortage(timetable_api, timetable_input):
    meeting = timetable_input["offerings"][0]["courses"][1][5][0][2][0]
    meeting[1:3] = [600, 660]
    _, result = run_timetable(timetable_api, timetable_input)
    assert len(result["plans"]) == 1
    plan = result["plans"][0]
    assert plan["shortage_minutes"] == pytest.approx(24.66, abs=0.01)
    assert plan["cost"] == pytest.approx(92.26, abs=0.01)


def test_timetable_second_meeting_conflict_is_not_missed(timetable_api, timetable_input):
    timetable_input["offerings"][0]["courses"][0][5][0][2].append([1, 540, 600, "200", "예시실"])
    timetable_input["offerings"][0]["courses"][1][5][0][2].append([1, 590, 660, "302", "예시실"])
    _, result = run_timetable(timetable_api, timetable_input)
    assert result["plans"] == []
    assert result["issues"]
    assert result["search"]["complete"] is True


@pytest.mark.parametrize("missing", ["building", "direction"])
def test_timetable_unknown_is_not_zero_or_reverse(timetable_api, timetable_input, missing):
    if missing == "building":
        timetable_input["offerings"][0]["courses"][1][5][0][2][0][3:] = ["", ""]
    else:
        timetable_input["walk_rows"] = [row for row in timetable_input["walk_rows"] if row["from"] != "200"]
    _, result = run_timetable(timetable_api, timetable_input)
    assert len(result["plans"]) == 1
    plan = result["plans"][0]
    assert plan["travel_complete"] is False
    assert plan["walk_minutes"] is None
    assert plan["shortage_minutes"] is None
    assert plan["cost"] is None
    expected_known = 0 if missing == "building" else 18.28
    assert plan["known_walk_minutes"] == pytest.approx(expected_known, abs=0.01)
    assert plan["known_shortage_minutes"] == 0
    assert plan["known_cost"] == pytest.approx(expected_known, abs=0.01)
    unknown_legs = [leg for leg in plan["legs"] if leg["minutes"] is None]
    assert unknown_legs
    assert all(leg["slack"] is None and leg["shortage"] is None for leg in unknown_legs)


def test_timetable_top_three_are_distinct_real_combinations(timetable_api, timetable_input):
    course = timetable_input["offerings"][0]["courses"][1]
    original = copy.deepcopy(course[5][0])
    course[5] = [[str(index).zfill(3), original[1], copy.deepcopy(original[2])] for index in range(1, 5)]
    _, result = run_timetable(timetable_api, timetable_input)
    assert len(result["plans"]) == 3
    signatures = {tuple(sorted((section["code"], section["number"]) for section in plan["sections"]))
                  for plan in result["plans"]}
    assert len(signatures) == 3
    assert all(plan["credits"] == 6 for plan in result["plans"])


@pytest.mark.parametrize("preference,value", [("avoid_days", [0]), ("avoid_times", [{"day": 0, "start": 630, "end": 640}])])
def test_timetable_avoided_period_returns_explanation(timetable_api, timetable_input, preference, value):
    timetable_input["preferences"][preference] = value
    _, result = run_timetable(timetable_api, timetable_input)
    assert result["plans"] == []
    assert result["issues"]
    assert result["search"]["complete"] is True


def test_timetable_expected_term_and_frequency_are_not_certainty(timetable_api, timetable_input):
    timetable_input["target_term"] = "2027-1"
    timetable_input["preferences"]["target_year"] = 2
    candidates, result = run_timetable(timetable_api, timetable_input)
    assert result["source_term"] == "2026-1"
    assert result["target_term"] == "2027-1"
    assert result["estimated"] is True
    assert len(candidates["candidates"]) == 2
    for candidate in candidates["candidates"]:
        frequency = candidate["frequency"]
        assert frequency["years_offered"] == 1
        assert frequency["window_years"] == [2022, 2023, 2024, 2025, 2026]
        assert frequency["observed_years"] == [2026]
        assert frequency["missing_years"] == [2022, 2023, 2024, 2025]


def test_timetable_no_older_silent_fallback(timetable_api, timetable_input):
    timetable_input["target_term"] = "2027-1"
    timetable_input["offerings"][0]["meta"]["semester"] = "2025-1"
    candidates, result = run_timetable(timetable_api, timetable_input)
    assert candidates["source_term"] is None
    assert candidates["candidates"] == []
    assert result["plans"] == []
    assert result["issues"] or candidates["issues"]


def test_timetable_search_limit_does_not_prove_impossibility(timetable_api, timetable_input):
    timetable_input["preferences"]["max_nodes"] = 1
    _, result = run_timetable(timetable_api, timetable_input)
    assert result["search"]["complete"] is False
    assert result["issues"]


def independently_decode_timetable(url):
    # Planner의 encode/decode를 기대값 생성에 사용하지 않는다.
    token = parse_qs(urlsplit(url).fragment)["t"][0]
    packed = base64.urlsafe_b64decode(token[1:] + "=" * (-len(token[1:]) % 4))
    assert token[0] in {"j", "z"}
    return json.loads(zlib.decompress(packed, -15) if token[0] == "z" else packed)


def test_timetable_report_link_independently_round_trips_source_term(timetable_input):
    report = pytest.importorskip("planner.report", reason="작업3 보고 API 준비 전: 미검증")
    timetable_input["target_term"] = "2027-1"
    result = report.recommend_timetables(timetable_input["payload"], timetable_input["offerings"],
                                         timetable_input["walk_rows"], target_term="2027-1",
                                         preferences=timetable_input["preferences"])
    assert result["json"]["estimated"] is True
    assert len(result["json"]["plans"]) == 1
    for plan in result["json"]["plans"]:
        decoded = independently_decode_timetable(plan["tt_link"])
        assert decoded[0] == 1
        assert decoded[1] == "2026-1"
        assert "2027-1" in decoded[2] and "예상" in decoded[2]
        assert sorted((row[0], row[1], row[3]) for row in decoded[3]) == sorted(
            (s["code"], s["number"], s["name"]) for s in plan["sections"])
        assert all(row[2] is None for row in decoded[3])
    markdown = result["markdown"]
    assert "2027-1" in markdown and "2026-1" in markdown and "예상" in markdown
    assert "선수" in markdown
    assert "prerequisites_unverified" in warning_codes(result["json"]["plans"][0]["warnings"])
    assert "TT Wizard 자료: 캠퍼스 마법 지도·© OpenStreetMap 기여자, 국토지리정보원, 서울대 수강편람" in markdown


def warning_codes(values):
    return {value["code"] if isinstance(value, dict) else value for value in values}


def test_timetable_reference_and_credit_warning_survive_report(timetable_api, timetable_input):
    report = pytest.importorskip("planner.report", reason="작업3 보고 API 준비 전: 미검증")
    source = timetable_input
    source["payload"] = payload("biology_double")
    source["payload"]["courses"] = []
    # 공식 목록2학점과 달리 모의 편람3학점: 인정 가능하다는 뜻이 아니다.
    course = source["offerings"][0]["courses"][0]
    course[0:2] = ["M1410.000100", "생명과학전공실험 1"]
    source["offerings"][0]["courses"] = [course]
    source["preferences"].update(min_credits=3, max_credits=3, required_codes=["M1410.000100"], include_reference=True)
    candidates, search = run_timetable(timetable_api, source)
    assert len(search["plans"]) == 1
    expected_warnings = {"prerequisites_unverified", "requirement_recognition_unconfirmed", "requirement_credit_conflict"}
    plan = search["plans"][0]
    assert expected_warnings <= warning_codes(plan["warnings"])
    assert expected_warnings <= warning_codes(plan["sections"][0]["warnings"])
    result = report.build_report(search)
    assert expected_warnings <= warning_codes(result["json"]["plans"][0]["warnings"])
    assert expected_warnings <= warning_codes(result["json"]["plans"][0]["sections"][0]["warnings"])
    assert "선수" in result["markdown"] and "학점" in result["markdown"]
    assert "확인" in result["markdown"]
    assert "다전공" in result["markdown"] or "인정" in result["markdown"]
    for warning in result["json"]["plans"][0]["warnings"]:
        if isinstance(warning, dict) and warning.get("code") in expected_warnings:
            assert warning["message"] in result["markdown"]
