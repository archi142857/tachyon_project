"""지어낸 과목·건물·예시 시간으로 확인하는 시간표 및 방향별 이동 계산."""

from copy import deepcopy
import json

import pytest

from planner.planning_types import PlanningValidationError
from planner.timetable import search_timetables


def meeting(day=0, start=540, end=600, building="A", room="101"):
    return dict(day=day, start=start, end=end, building=building, room=room)


def section(number="001", meetings=None, status=""):
    return dict(number=number, status=status, meetings=[meeting()] if meetings is None else meetings)


def course(code="EX-A", credits=3, sections=None, **extra):
    return {"code": code, "name": "예시 " + code, "credits": credits,
            "sections": [section()] if sections is None else sections,
            "requirement_ids": [], "basis": "user_requested", "priority": [2, 0, 0, 1, -1],
            "prerequisite_status": "unknown", **extra}


def candidates(courses=None, **preferences):
    return {"schema_version": 1, "target_term": "2027-1", "source_term": "2026-1", "estimated": True,
            "preferences": {"min_credits": 3, "max_credits": 3, "home": "H", **preferences},
            "candidates": [course()] if courses is None else courses,
            "reference_candidates": [], "issues": [], "goals": []}


def walks(**values):
    return [{"from": key.split("_")[0], "to": key.split("_")[1], "minutes": value}
            for key, value in values.items()]


WALKS = walks(H_A=5, A_H=6, H_B=7, B_H=8, A_B=12, B_A=20)


def codes(result):
    return {item["code"] for item in result["issues"]}


def warning_codes(plan):
    return {item["code"] for item in plan["warnings"]}


def test_directed_travel_and_shortage_use_independent_expected_totals():
    items = [course("EX-A"), course("EX-B", sections=[section(meetings=[meeting(start=610, end=670, building="B")])])]
    result = search_timetables(candidates(items, min_credits=6, max_credits=6), WALKS)
    plan, = result["plans"]
    # 집→A 5분 + A→B 12분 + B→집 8분; 10분 쉬는 시간에서 2분 부족.
    assert (plan["walk_minutes"], plan["shortage_minutes"], plan["cost"]) == (25, 2, 29)
    assert [(leg["from"], leg["to"]) for leg in plan["legs"]] == [("H", "A"), ("A", "B"), ("B", "H")]
    assert plan["legs"][1]["slack"] == -2
    assert plan["legs"][0]["slack"] is None
    assert plan["travel_complete"] and "tight_transfer" in warning_codes(plan)
    assert "fewer_than_requested_plans" in codes(result)
    assert result["search"]["complete"]


def test_reverse_direction_is_not_assumed_equal():
    items = [course("EX-A", sections=[section(meetings=[meeting(start=610, end=670)])]),
             course("EX-B", sections=[section(meetings=[meeting(building="B")])])]
    plan = search_timetables(candidates(items, min_credits=6, max_credits=6), WALKS)["plans"][0]
    assert (plan["walk_minutes"], plan["shortage_minutes"], plan["cost"]) == (33, 10, 53)


def test_second_meeting_conflict_rejects_whole_combination():
    items = [course("EX-A", sections=[section(meetings=[meeting(), meeting(day=2)])]),
             course("EX-B", sections=[section(meetings=[meeting(day=1), meeting(day=2, start=590, end=650)])])]
    result = search_timetables(candidates(items, min_credits=6, max_credits=6), WALKS)
    assert result["plans"] == []
    assert "time_conflicts" in codes(result)
    assert result["search"]["complete"]


def test_touching_classes_are_allowed_but_travel_can_be_short():
    items = [course(), course("EX-B", sections=[section(meetings=[meeting(start=600, end=660, building="B")])])]
    plan = search_timetables(candidates(items, min_credits=6, max_credits=6), WALKS)["plans"][0]
    assert plan["shortage_minutes"] == 12
    assert plan["cost"] == 49


def test_subset_search_selects_required_course_and_one_section_per_course():
    items = [course("EX-A"), course("EX-B", sections=[section("001", [meeting(day=1)]), section("002", [meeting(day=2)])]),
             course("EX-C", sections=[section(meetings=[meeting(day=3)])])]
    result = search_timetables(candidates(items, min_credits=6, max_credits=6, required_codes=["EX-B"]), WALKS)
    assert len(result["plans"]) == 3
    assert result["search"]["feasible_count"] == 4
    for plan in result["plans"]:
        chosen = [s["code"] for s in plan["sections"]]
        assert len(chosen) == len(set(chosen)) == 2
        assert "EX-B" in chosen and plan["credits"] == 6


def test_missing_required_course_and_insufficient_credit_explain_zero_plans():
    result = search_timetables(candidates(required_codes=["EX-MISSING"], min_credits=6, max_credits=6), WALKS)
    assert result["plans"] == []
    assert {"required_course_unavailable", "insufficient_candidate_credits"} <= codes(result)


def test_required_credit_over_maximum_is_reported():
    items = [course(), course("EX-B", sections=[section(meetings=[meeting(day=1)])])]
    result = search_timetables(candidates(items, required_codes=["EX-A", "EX-B"]), WALKS)
    assert not result["plans"]
    assert "required_credits_exceed_maximum" in codes(result)


@pytest.mark.parametrize("bad_section,reason", [
    (section(meetings=[]), "meeting_time_unknown"),
    (section(status="폐강대상"), "unavailable_section"),
    (section(meetings=[meeting(start=600, end=600)]), "invalid_meeting"),
    (section(meetings=[meeting(day=True)]), "invalid_meeting"),
    (section(meetings=[meeting(), meeting(start=590, end=650)]), "section_internal_overlap"),
    (section(meetings=[meeting(building=123)]), "invalid_location"),
])
def test_invalid_sections_are_excluded_without_fabricating_meetings(bad_section, reason):
    result = search_timetables(candidates([course(sections=[bad_section])]), WALKS)
    assert not result["plans"]
    assert result["excluded_sections"][0]["reason"] == reason


@pytest.mark.parametrize("second_number", ["001", " 001 "])
def test_duplicate_section_numbers_are_all_excluded(second_number):
    result = search_timetables(candidates([course(sections=[section(), section(second_number)])]), WALKS)
    assert not result["plans"]
    assert {x["reason"] for x in result["excluded_sections"]} == {"duplicate_section_number"}


def test_duplicate_meetings_merge_rooms_and_count_walking_once():
    row = course(sections=[section(meetings=[meeting(room="102"), meeting(room="101"), meeting(room="102")])])
    plan = search_timetables(candidates([row]), WALKS)["plans"][0]
    assert len(plan["sections"][0]["meetings"]) == 1
    assert plan["sections"][0]["meetings"][0]["room"] == "101/102"
    assert plan["walk_minutes"] == 11


@pytest.mark.parametrize("preferences", [{"avoid_days": [0]}, {"avoid_times": [{"day": 0, "start": 599, "end": 630}]}])
def test_avoid_constraints_remove_sections(preferences):
    result = search_timetables(candidates(**preferences), WALKS)
    assert not result["plans"]
    assert result["excluded_sections"][0]["reason"] == "avoided_time"


def test_avoid_time_boundary_does_not_overlap():
    assert search_timetables(candidates(avoid_times=[{"day": 0, "start": 600, "end": 630}]), WALKS)["plans"]


def test_unknown_building_keeps_known_partial_totals_and_null_totals():
    items = [course(), course("EX-B", sections=[section(meetings=[meeting(start=610, end=670, building="")])])]
    plan = search_timetables(candidates(items, min_credits=6, max_credits=6), WALKS)["plans"][0]
    assert (plan["walk_minutes"], plan["shortage_minutes"], plan["cost"]) == (None, None, None)
    assert (plan["known_walk_minutes"], plan["known_shortage_minutes"], plan["known_cost"]) == (5, 0, 5)
    assert [leg["status"] for leg in plan["legs"]] == ["known", "unknown_location", "unknown_location"]
    assert all(plan["legs"][i]["shortage"] is None for i in (1, 2))
    assert not plan["travel_complete"]


def test_missing_direction_does_not_use_reverse_value():
    plan = search_timetables(candidates(), walks(H_A="5.5"))["plans"][0]
    assert plan["known_walk_minutes"] == 5.5 and plan["walk_minutes"] is None
    assert plan["legs"][1]["status"] == "missing_walk_time"
    assert plan["legs"][1]["minutes"] is None


def test_building_known_room_unknown_is_calculated_with_warning():
    row = course(sections=[section(meetings=[meeting(room="")])])
    plan = search_timetables(candidates([row]), WALKS)["plans"][0]
    assert plan["walk_minutes"] == 11 and plan["travel_complete"]
    assert {"room_unconfirmed", "indoor_travel_excluded"} <= warning_codes(plan)


def test_same_building_zero_is_only_building_level_value_and_home_defaults_to_919a():
    row = course(sections=[section(meetings=[meeting(building="919A")])])
    data = candidates([row]); del data["preferences"]["home"]
    plan = search_timetables(data, [])["plans"][0]
    assert plan["walk_minutes"] == 0 and plan["travel_complete"]
    assert "indoor_travel_excluded" in warning_codes(plan)


def test_reference_candidates_require_explicit_flag_and_keep_basis():
    data = candidates([])
    data["reference_candidates"] = [course(basis="reference_requirement", requirement_ids=["example-reference"])]
    assert not search_timetables(data, WALKS)["plans"]
    data["preferences"]["include_reference"] = True
    plan = search_timetables(data, WALKS)["plans"][0]
    assert plan["sections"][0]["basis"] == "reference_requirement"
    assert plan["sections"][0]["requirement_ids"] == ["example-reference"]
    assert "reference_courses" in warning_codes(plan)


def test_unknown_partial_cost_does_not_outrank_known_plan():
    row = course(sections=[section("001", [meeting(building="")]), section("002")])
    result = search_timetables(candidates([row]), WALKS)
    assert [p["sections"][0]["number"] for p in result["plans"]] == ["002", "001"]


def test_required_goal_coverage_precedes_walking_cost_and_is_only_planned():
    items = [course("EX-A"), course("EX-B", sections=[section(meetings=[meeting(building="H")])])]
    data = candidates(items)
    data["goals"] = [{"id": "example-all", "kind": "all", "all_codes": ["EX-A"], "candidate_codes": ["EX-A"], "min_count": 1, "min_credits": 3}]
    result = search_timetables(data, WALKS)
    assert result["plans"][0]["sections"][0]["code"] == "EX-A"
    assert result["plans"][0]["goal_progress"][0] == {
        "id": "example-all", "status": "planned", "planned_codes": ["EX-A"], "count": 1,
        "credits": 3, "remaining_count": 0, "remaining_credits": 0,
    }
    assert "satisfied" not in json.dumps(result)


def test_selection_goal_requires_count_and_credits():
    data = candidates()
    data["goals"] = [{"id": "example-choice", "kind": "selection", "all_codes": [], "candidate_codes": ["EX-A"], "min_count": 1, "min_credits": 6}]
    progress = search_timetables(data, WALKS)["plans"][0]["goal_progress"][0]
    assert progress["status"] == "not_planned"
    assert progress["remaining_count"] == 0 and progress["remaining_credits"] == 3


def test_credit_conflicted_reference_cannot_fill_retained_all_obligation():
    data = candidates([], include_reference=True)
    data["reference_candidates"] = [course(basis="reference_requirement", warnings=["requirement_credit_conflict"])]
    data["goals"] = [{"id": "example-all", "kind": "all", "all_codes": ["EX-A"], "candidate_codes": [], "min_count": 1, "min_credits": 3}]
    plan = search_timetables(data, WALKS)["plans"][0]
    progress = plan["goal_progress"][0]
    assert progress["status"] == "not_planned"
    assert progress["planned_codes"] == [] and progress["credits"] == 0
    assert progress["remaining_count"] == 1 and progress["remaining_credits"] == 3
    assert plan["selection_score"] == {"required_courses": 0, "planned_goals": 0}


def test_search_limit_does_not_claim_impossible_or_exhaustive():
    result = search_timetables(candidates(max_nodes=1), WALKS)
    assert not result["search"]["complete"] and result["search"]["nodes"] == 1
    assert "search_limit_reached" in codes(result)
    assert result["plans"] == []


def test_no_unsafe_cost_pruning_for_nontriangle_directed_table():
    items = [course("EX-A", sections=[section(meetings=[meeting(start=600, end=660)])]),
             course("EX-B", sections=[section(meetings=[meeting(start=540, end=550, building="B")])])]
    result = search_timetables(candidates(items, min_credits=3, max_credits=6, required_codes=["EX-A"]), walks(H_A=100, A_H=1, H_B=1, B_A=1))
    assert {s["code"] for s in result["plans"][0]["sections"]} == {"EX-A", "EX-B"}
    assert result["plans"][0]["cost"] == 3
    assert result["search"]["feasible_count"] == 2


def test_priority_is_used_as_tie_break_after_equal_cost():
    data = candidates([course("EX-A", priority=[2, 2, 0, 1, -1]), course("EX-Z", priority=[2, 1, 0, 1, -1])])
    assert search_timetables(data, WALKS)["plans"][0]["sections"][0]["code"] == "EX-Z"


def test_known_warnings_metadata_sources_preserved_without_private_extras():
    data = candidates([course(warnings=["requirement_recognition_unconfirmed", "requirement_credit_conflict", "estimated_offerings", "history_incomplete", "private-secret"],
                              requirement_ids=["example-rule"],
                              requirement_sources={"example-rule": [{"title": "예시 규정", "url": "https://example.test/rule", "locator": "예시 조항", "private": "private-secret"}], "private-secret": []},
                              frequency={"years_offered": 1, "window_years": [2022, 2023, 2024, 2025, 2026], "observed_years": [2026], "missing_years": [2022, 2023, 2024, 2025], "private": "private-secret"},
                              recommended_year=2, recommended_term=1, professor="private-secret")])
    result = search_timetables(data, WALKS)
    plan = result["plans"][0]; chosen = plan["sections"][0]
    assert chosen["basis"] == "user_requested"
    assert "requirement_recognition_unconfirmed" in warning_codes(plan)
    assert chosen["recommended_year"] == 2 and chosen["recommended_term"] == 1
    assert chosen["frequency"]["years_offered"] == 1
    assert chosen["requirement_sources"]["example-rule"][0]["title"] == "예시 규정"
    assert set(chosen["warnings"]) <= warning_codes(plan)
    assert "private-secret" not in json.dumps(result)
    assert chosen["prerequisite_status"] == "unknown"


@pytest.mark.parametrize("minutes", [True, -1, float("nan"), float("inf"), "private-secret"])
def test_invalid_walk_values_raise_structured_errors_without_echo(minutes):
    with pytest.raises(PlanningValidationError) as caught:
        search_timetables(candidates(), walks(H_A=minutes))
    assert caught.value.errors[0]["path"] == "walk_rows[0].minutes"
    assert "private-secret" not in str(caught.value)


def test_conflicting_duplicate_directed_walk_values_are_rejected():
    with pytest.raises(PlanningValidationError) as caught:
        search_timetables(candidates(), walks(H_A=5) + walks(H_A=6))
    assert caught.value.errors[0]["code"] == "conflicting_walk_time"


@pytest.mark.parametrize("key,value", [("target_term", "private-secret"), ("source_term", None), ("estimated", 1), ("schema_version", True)])
def test_top_level_metadata_is_validated_early(key, value):
    data = candidates(); data[key] = value
    with pytest.raises(PlanningValidationError) as caught:
        search_timetables(data, WALKS)
    assert "private-secret" not in str(caught.value)


@pytest.mark.parametrize("top_k", [0, 4, True, 1.5])
def test_only_one_to_three_real_plans_may_be_requested(top_k):
    with pytest.raises(PlanningValidationError):
        search_timetables(candidates(), WALKS, top_k=top_k)


def test_search_is_deterministic_and_does_not_mutate_inputs():
    data = candidates(); original = deepcopy(data); walk_original = deepcopy(WALKS)
    first = search_timetables(data, WALKS)
    assert first == search_timetables(data, WALKS)
    assert data == original and WALKS == walk_original


def test_no_candidates_and_no_source_returns_explanation_not_empty_plan():
    data = candidates([], min_credits=0, max_credits=0); data["source_term"] = None
    result = search_timetables(data, [])
    assert not result["plans"] and "no_usable_courses" in codes(result)
