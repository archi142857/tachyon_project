"""작업 3 후보 선정: 가상 개설·학생 자료로 근거와 보류 경계를 검증한다."""

import copy
import json

import pytest

from planner.courses import build_candidates, normalize_preferences
from planner.planning_types import PlanningValidationError
from planner.transcript import TranscriptValidationError


BIOLOGY = [
    ("M1410.000100", "생명과학전공실험 1", 2),
    ("M1410.000200", "생명과학전공실험 2", 2),
    ("3346.328", "생명과학특수연구 1", 1),
]
CHEMICAL = [
    ("458.309A", "분석화학", 3), ("458.202", "물리화학 2", 3),
    ("M1587.000100", "응용생화학 2", 3), ("458.308", "공정제어 및 설계", 3),
    ("458.409", "전기화학", 3), ("458.421", "화학생물공학세미나", 1),
    ("458.423", "화학산업경영", 1), ("400.013", "기계공학개론", 3),
]
USER_COURSE = ("EXAMPLE.101", "예시 선택과목", 3)
APPROVED = {"biology-main-R06", "biology-double-R05", "chemical-main-R03",
            "chemical-main-R04", "chemical-main-R05"}


def catalog(term="2027-1", courses=None):
    return {"meta": {"semester": term, "example": "실제 편람이 아닌 예시 개설 자료"},
            "courses": [[code, name, "예시 학부", credits, "전선",
                         [["001", "", [[0, 540, 600, "1", "101"]]]]]
                        for code, name, credits in (BIOLOGY + CHEMICAL + [USER_COURSE] if courses is None else courses)]}


def transcript_course(value, status="completed", **changes):
    code, name, credits = value
    result = {"code": code, "name": name, "credits": credits, "category": "전선",
              "term": "2026-1", "status": status}
    result.update(changes)
    return result


def payload(courses=None, name="생명과학부", kind="주전공", **changes):
    result = {"entry_year": 2025, "coverage": "complete",
              "programs": [{"name": name, "kind": kind}],
              "courses": [] if courses is None else courses}
    result.update(changes)
    return result


def build(value=None, catalogs=None, **kwargs):
    return build_candidates(payload() if value is None else value,
                            [catalog()] if catalogs is None else catalogs,
                            target_term=kwargs.pop("target_term", "2027-1"), **kwargs)


def candidates(result, key="candidates"):
    return {candidate["code"]: candidate for candidate in result[key]}


def issues(result):
    return {issue["code"] for issue in result["issues"]}


def test_exact_target_offerings_produce_only_approved_remaining_candidates():
    result = build()
    actual = candidates(result)
    assert set(actual) == {code for code, _, _ in BIOLOGY}
    assert result["reference_candidates"] == []
    assert result["source_term"] == "2027-1"
    assert result["estimated"] is False
    assert all(c["basis"] == "remaining_requirement" for c in actual.values())
    assert all(c["requirement_ids"] == ["biology-main-R06"] for c in actual.values())
    assert result["goals"] == [{"id": "biology-main-R06", "kind": "all",
                                "all_codes": sorted(code for code, _, _ in BIOLOGY),
                                "candidate_codes": sorted(code for code, _, _ in BIOLOGY),
                                "min_count": 3, "min_credits": 5}]
    assert result["graduation_status"] == "not_evaluated"


def test_selection_requirement_does_not_make_every_candidate_mandatory():
    result = build(payload(name="화학생물공학부"))
    goals = {goal["id"]: goal for goal in result["goals"]}
    assert goals["chemical-main-R03"]["kind"] == "selection"
    assert goals["chemical-main-R03"]["min_count"] == 3
    assert goals["chemical-main-R03"]["min_credits"] == 9
    assert goals["chemical-main-R03"]["all_codes"] == []
    assert len(goals["chemical-main-R03"]["candidate_codes"]) == 5
    assert all(c["basis"] == "remaining_requirement" for c in result["candidates"])


@pytest.mark.parametrize("coverage", ["partial", "unknown"])
def test_uncertain_requirement_candidates_are_separate_and_not_goals(coverage):
    result = build(payload(coverage=coverage))
    assert result["candidates"] == []
    assert set(candidates(result, "reference_candidates")) == {code for code, _, _ in BIOLOGY}
    assert result["goals"] == []
    assert "reference_candidates_held" in issues(result)
    assert all(c["basis"] == "reference_requirement" for c in result["reference_candidates"])


def test_include_reference_retains_reference_label_and_never_confirms_goals():
    result = build(payload(coverage="partial"), preferences={"include_reference": True})
    assert result["candidates"] == []
    assert len(result["reference_candidates"]) == 3
    assert result["goals"] == []
    assert "reference_candidates_held" not in issues(result)
    assert all("requirement_recognition_unconfirmed" in c["warnings"] for c in result["reference_candidates"])


@pytest.mark.parametrize("name,kind", [
    ("동물생명공학전공", "주전공"), ("동물생명공학전공", "복수전공"),
    ("화학생물공학부", "복수전공"),
])
def test_manual_only_programs_do_not_create_automatic_candidates(name, kind):
    result = build(payload(name=name, kind=kind))
    assert result["candidates"] == []
    assert result["reference_candidates"] == []
    assert result["goals"] == []
    assert "no_candidates" in issues(result)


def test_every_program_uses_only_five_approved_ids_for_candidates():
    seen = set()
    for name in ("동물생명공학전공", "생명과학부", "화학생물공학부"):
        for kind in ("주전공", "복수전공"):
            result = build(payload(name=name, kind=kind))
            for candidate in result["candidates"] + result["reference_candidates"]:
                assert set(candidate["requirement_ids"]) <= APPROVED
                seen.update(candidate["requirement_ids"])
    assert seen == APPROVED


def test_already_satisfied_list_does_not_get_recommended_again():
    value = payload([transcript_course(c) for c in BIOLOGY])
    result = build(value, [catalog("2026-1"), catalog()])
    assert result["candidates"] == []
    assert result["reference_candidates"] == []
    assert result["goals"] == []


@pytest.mark.parametrize("status,expected", [
    ("completed", "already_completed"), ("in_progress", "in_progress"),
    ("unknown", "transcript_uncertain"), (None, "transcript_uncertain"),
])
def test_recorded_courses_are_excluded_even_if_user_requests_them(status, expected):
    code = BIOLOGY[0][0]
    result = build(payload([transcript_course(BIOLOGY[0], status)]), [catalog("2026-1"), catalog()],
                   preferences={"include_codes": [code], "required_codes": [code], "include_reference": True})
    assert code not in candidates(result)
    assert code not in candidates(result, "reference_candidates")
    excluded = {item["code"]: item["reasons"] for item in result["excluded"]}
    assert expected in excluded[code]


def test_repeated_course_is_held_and_not_recommended_as_missing():
    code = BIOLOGY[0][0]
    row = transcript_course(BIOLOGY[0])
    result = build(payload([row, copy.deepcopy(row)]), [catalog("2026-1"), catalog()],
                   preferences={"include_codes": [code]})
    assert code not in candidates(result)
    assert code not in candidates(result, "reference_candidates")
    assert {item["code"]: item["reasons"] for item in result["excluded"]}[code] == ["transcript_uncertain"]


def test_ambiguous_past_name_holds_all_matching_codes():
    first = ("EXAMPLE.201", "예시 같은 이름", 3)
    second = ("EXAMPLE.202", "예시 같은 이름", 3)
    value = payload([transcript_course(first, code=None)])
    result = build(value, [catalog("2026-1", [first, second]), catalog(courses=[first, second])],
                   preferences={"include_codes": [first[0], second[0]]})
    assert result["candidates"] == []
    excluded = {item["code"]: item["reasons"] for item in result["excluded"]}
    assert excluded[first[0]] == ["transcript_uncertain"]
    assert excluded[second[0]] == ["transcript_uncertain"]


@pytest.mark.parametrize("field", ["include_codes", "required_codes"])
def test_user_can_add_course_without_manufacturing_graduation_requirement(field):
    result = build(payload(name="동물생명공학전공"), preferences={field: [USER_COURSE[0]]})
    candidate = candidates(result)[USER_COURSE[0]]
    assert candidate["basis"] == "user_requested"
    assert candidate["requirement_ids"] == []
    assert result["goals"] == []
    assert result["graduation_status"] == "not_evaluated"


def test_user_selected_reference_keeps_recognition_warning():
    code = BIOLOGY[0][0]
    result = build(payload(coverage="partial"), preferences={"include_codes": [code]})
    candidate = candidates(result)[code]
    assert candidate["basis"] == "user_requested"
    assert "requirement_recognition_unconfirmed" in candidate["warnings"]
    assert result["goals"] == []


def test_unoffered_required_code_is_reported_without_substitution():
    result = build(preferences={"required_codes": ["EXAMPLE.MISSING"]})
    assert "EXAMPLE.MISSING" not in candidates(result)
    assert {"code": "EXAMPLE.MISSING", "reasons": ["not_offered_in_source_term"]} in result["excluded"]


def test_missing_target_uses_exact_previous_year_same_term_as_estimate():
    result = build(catalogs=[catalog("2026-1"), catalog("2026-2", [])])
    assert result["source_term"] == "2026-1"
    assert result["estimated"] is True
    assert "estimated_offerings" in issues(result)
    assert all("estimated_offerings" in c["warnings"] for c in result["candidates"])


def test_exact_target_is_preferred_over_prior_term_with_different_sections():
    target, prior = catalog(), catalog("2026-1")
    target["courses"][0][5][0][0] = "007"
    prior["courses"][0][5][0][0] = "099"
    result = build(catalogs=[prior, target])
    assert candidates(result)[BIOLOGY[0][0]]["sections"][0]["number"] == "007"
    assert result["estimated"] is False


def test_older_other_season_and_future_data_are_not_fallbacks():
    result = build(catalogs=[catalog("2025-1"), catalog("2026-2"), catalog("2028-1")])
    assert result["source_term"] is None
    assert result["candidates"] == []
    assert result["reference_candidates"] == []
    assert "offerings_unavailable" in issues(result)


def test_empty_target_catalog_is_flagged_and_not_silently_replaced_by_prior():
    result = build(catalogs=[catalog("2026-1"), catalog(courses=[])])
    assert result["source_term"] == "2027-1"
    assert result["candidates"] == []
    assert "empty_offerings" in issues(result)


def test_frequency_uses_only_target_preceding_five_same_seasons_and_marks_gaps():
    code = BIOLOGY[0][0]
    history = [catalog("2021-1"), catalog("2022-1"), catalog("2023-1", []),
               catalog("2024-2"), catalog("2025-1"), catalog("2026-1"),
               catalog("2026-S"), catalog("2027-1"), catalog("2028-1")]
    result = build(catalogs=history)
    frequency = candidates(result)[code]["frequency"]
    assert frequency == {"years_offered": 3, "window_years": [2022, 2023, 2024, 2025, 2026],
                         "observed_years": [2022, 2023, 2025, 2026], "missing_years": [2024]}
    assert "history_incomplete" in candidates(result)[code]["warnings"]
    assert "probability" not in frequency


def test_full_five_year_history_has_no_missing_year_warning():
    result = build(catalogs=[catalog(f"{year}-1") for year in range(2022, 2028)])
    candidate = candidates(result)[BIOLOGY[0][0]]
    assert candidate["frequency"]["years_offered"] == 5
    assert candidate["frequency"]["missing_years"] == []
    assert "history_incomplete" not in candidate["warnings"]


def test_recommended_year_is_optional_and_never_a_forced_eligibility_rule():
    result = build(preferences={"target_year": 1})
    actual = candidates(result)
    assert set(actual) == {code for code, _, _ in BIOLOGY}
    assert actual["3346.328"]["recommended_year"] == 3
    assert actual["3346.328"]["recommended_term"] is None
    assert all(c["prerequisite_status"] == "unknown" for c in actual.values())
    assert all("prerequisites_unverified" in c["warnings"] for c in actual.values())
    assert "prerequisites_unverified" in issues(result)


def test_user_course_has_null_recommended_year_and_no_fake_prerequisite_clearance():
    result = build(preferences={"include_codes": [USER_COURSE[0]]})
    candidate = candidates(result)[USER_COURSE[0]]
    assert candidate["recommended_year"] is None
    assert candidate["recommended_term"] is None
    assert candidate["prerequisite_status"] == "unknown"


def test_catalog_credit_conflict_is_reference_only_and_removed_from_goal_candidates():
    conflicting = [(BIOLOGY[0][0], BIOLOGY[0][1], 3)] + BIOLOGY[1:]
    result = build(catalogs=[catalog(courses=conflicting)])
    code = BIOLOGY[0][0]
    assert code not in candidates(result)
    assert "requirement_credit_conflict" in candidates(result, "reference_candidates")[code]["warnings"]
    assert code not in result["goals"][0]["candidate_codes"]


def test_default_preferences_are_independent_and_normalized_without_mutation():
    original = {"include_codes": [" EXAMPLE.101 ", "EXAMPLE.101"],
                "required_codes": [" EXAMPLE.101 "], "avoid_days": [3, 0, 3],
                "home": " 919A ", "avoid_times": [{"day": 1, "start": 540, "end": 600}]}
    before = copy.deepcopy(original)
    result = normalize_preferences(original)
    assert original == before
    assert result["include_codes"] == ["EXAMPLE.101"]
    assert result["avoid_days"] == [0, 3]
    assert result["home"] == "919A"
    assert result["min_credits"] == 15 and result["max_credits"] == 18
    result["avoid_times"][0]["day"] = 5
    assert original == before
    result["include_codes"].append("EXAMPLE.202")
    assert normalize_preferences()["include_codes"] == []


@pytest.mark.parametrize("preferences", [
    [], {"private_note": "예시_비노출"}, {"min_credits": True}, {"max_credits": float("inf")},
    {"min_credits": -1}, {"max_credits": 0}, {"min_credits": 19, "max_credits": 18},
    {"min_credits": "15"}, {"home": " "}, {"home": 1}, {"include_reference": 1},
    {"target_year": True}, {"target_year": 0}, {"max_nodes": True}, {"max_nodes": 0},
    {"include_codes": "EXAMPLE.101"}, {"required_codes": [None]}, {"avoid_days": [True]},
    {"avoid_days": [6]}, {"avoid_times": {}},
    {"avoid_times": [{"day": 0, "start": 600, "end": 600}]},
    {"avoid_times": [{"day": 0, "start": 540, "end": 600, "private": "예시_비노출"}]},
])
def test_invalid_preferences_fail_with_safe_structured_errors(preferences):
    with pytest.raises(PlanningValidationError) as exc:
        normalize_preferences(preferences)
    assert "예시_비노출" not in str(exc.value)
    assert "private_note" not in str(exc.value)
    assert set(exc.value.errors[0]) == {"code", "path", "message"}


@pytest.mark.parametrize("term", [None, True, 2027, "2027-S", "2027-3", "2027-1 예시_비노출"])
def test_invalid_target_terms_fail_without_echoing_raw_value(term):
    with pytest.raises(PlanningValidationError) as exc:
        build(target_term=term)
    assert exc.value.errors[0]["code"] == "invalid_target_term"
    assert "예시_비노출" not in str(exc.value)


def test_duplicate_catalog_terms_are_rejected():
    with pytest.raises(PlanningValidationError) as exc:
        build(catalogs=[catalog(), catalog()])
    assert exc.value.errors[0]["code"] == "duplicate_offering_term"


def test_duplicate_course_in_one_catalog_is_rejected():
    with pytest.raises(PlanningValidationError) as exc:
        build(catalogs=[catalog(courses=BIOLOGY + BIOLOGY[:1])])
    assert exc.value.errors[0]["code"] == "duplicate_offering_course"


@pytest.mark.parametrize("bad_sections", [None, {}, [["001", ""]], [["001", "", []], ["001", "", []]],
                                           [["001", "", [[0, 540, 600, "1"]]]],
                                           [["001", "", [[0, 540, 600, True, "101"]]]]])
def test_malformed_selected_sections_fail_safely(bad_sections):
    document = catalog()
    document["courses"][0][5] = bad_sections
    with pytest.raises(PlanningValidationError):
        build(catalogs=[document])


def test_bad_transcript_is_not_bypassed_by_candidate_generation():
    with pytest.raises(TranscriptValidationError):
        build(payload([transcript_course(BIOLOGY[0], credits=True)]))


def test_forged_normalization_flags_cannot_clear_uncertain_past_course():
    code = BIOLOGY[0][0]
    row = transcript_course(BIOLOGY[0], "unknown")
    row.update(countable_completed=False, needs_check=False, issues=[],
               matched_code=None, candidate_codes=[])
    result = build(payload([row]), [catalog("2026-1"), catalog()],
                   preferences={"include_codes": [code], "include_reference": True})
    assert code not in candidates(result)
    assert code not in candidates(result, "reference_candidates")
    assert {item["code"]: item["reasons"] for item in result["excluded"]}[code] == ["transcript_uncertain"]


def test_privacy_unknown_fields_input_immutability_and_output_independence():
    marker = "예시_보존하지않을정보"
    value, documents = payload(), [catalog()]
    value.update(student_name=marker, student_id=marker, grades={marker: marker})
    value["programs"][0]["note"] = marker
    documents[0]["meta"]["private"] = marker
    documents[0]["courses"][0][2] = marker
    before = copy.deepcopy((value, documents))
    result = build(value, documents)
    assert marker not in json.dumps(result, ensure_ascii=False)
    assert (value, documents) == before
    assert result == build(value, documents)
    result["candidates"][0]["sections"][0]["meetings"][0]["building"] = "변경 예시"
    assert (value, documents) == before


def test_rule_evidence_is_attached_to_remaining_candidate():
    result = build()
    candidate = candidates(result)[BIOLOGY[0][0]]
    sources = candidate["requirement_sources"]["biology-main-R06"]
    assert sources and all(source["title"] and source["url"] and source["locator"] for source in sources)
