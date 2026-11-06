"""작업 2-C: 공식 1.0은 고정하고 학생 입력·산술만 가상으로 검증한다."""

import copy
import hashlib
import json
from pathlib import Path
import shutil

import pytest

from planner.requirements import (
    DEFAULT_DATA,
    RequirementsValidationError,
    _calculate_course_list,
    evaluate_requirements,
    load_requirements,
    main,
)
from planner.transcript import TranscriptValidationError, normalize_transcript


BIOLOGY = [
    ("M1410.000100", "생명과학전공실험 1", 2),
    ("M1410.000200", "생명과학전공실험 2", 2),
    ("3346.328", "생명과학특수연구 1", 1),
]
CHEMICAL_I = [
    ("458.309A", "분석화학", 3),
    ("458.202", "물리화학 2", 3),
    ("M1587.000100", "응용생화학 2", 3),
]
CHEMICAL_II = [("458.421", "화학생물공학세미나", 1)]
ENGINEERING = [("400.013", "기계공학개론", 3)]
ALL_AUTOMATIC_EXAMPLES = BIOLOGY + CHEMICAL_I + CHEMICAL_II + ENGINEERING
PROGRAMS = ["동물생명공학전공", "생명과학부", "화학생물공학부"]
APPROVED = {
    "biology-main-R06", "biology-double-R05",
    "chemical-main-R03", "chemical-main-R04", "chemical-main-R05",
}


def course(value, status="completed", **changes):
    code, name, credits = value
    row = {"code": code, "name": name, "credits": credits, "category": "전선",
           "term": "2026-1", "status": status}
    row.update(changes)
    return row


def payload(rows=None, name="생명과학부", kind="주전공", **changes):
    value = {"entry_year": 2025, "coverage": "complete",
             "programs": [{"name": name, "kind": kind}],
             "courses": [course(c) for c in BIOLOGY] if rows is None else rows}
    value.update(changes)
    return value


def offerings(values=None):
    return [{"meta": {"semester": "2026-1", "example": "가상 개설 기록"},
             "courses": [[code, name, "예시 학부", credits, "전선", []]
                         for code, name, credits in (ALL_AUTOMATIC_EXAMPLES if values is None else values)]}]


def evaluate(value=None, catalog=None, **kwargs):
    return evaluate_requirements(payload() if value is None else value,
                                 offerings() if catalog is None else catalog, **kwargs)


def items(result):
    return {item["id"]: item for group in result["sets"] for item in group["items"]}


def reasons(item):
    return {reason["code"] for reason in item["reasons"]}


def issue_codes(result):
    return {issue["code"] for issue in result["issues"]}


def copy_release(tmp_path):
    directory = tmp_path / "requirements"
    (directory / "source").mkdir(parents=True)
    for name in ("2025.json", "schema.json", "source/snu_2025_graduation_requirements.json"):
        shutil.copyfile(DEFAULT_DATA.parent / name, directory / name)
    return directory / "2025.json"


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")


def test_fixed_release_has_exact_five_approved_items_and_85_manual():
    data = load_requirements()
    all_items = [item for group in data["sets"] for section in ("requirements", "other_conditions")
                 for item in group[section]]
    automatic = {item["id"] for item in all_items if item["calculation"]["mode"] == "course_list"}
    assert automatic == APPROVED
    assert len(all_items) == 90
    assert sum(item["needs_check"] for item in all_items) == 85


def test_biology_all_three_is_five_credits_but_not_graduation():
    result = evaluate()
    item = items(result)["biology-main-R06"]
    assert item["status"] == "satisfied"
    assert item["calculation"]["count"] == 3
    assert item["calculation"]["credits"] == 5
    assert item["calculation"]["missing_codes"] == []
    assert item["remaining"] == {"credits": 0, "count": 0, "required_codes": []}
    assert result["graduation_status"] == "not_evaluated"
    assert result["needs_check"] is True
    assert result["summary"]["satisfied"] == 1
    assert all(group["total_credits_status"] == "needs_check" for group in result["sets"])


def test_biology_all_reports_exact_missing_course_and_credit():
    result = evaluate(payload([course(c) for c in BIOLOGY[:2]]))
    item = items(result)["biology-main-R06"]
    assert item["status"] == "remaining"
    assert item["calculation"]["credits"] == 4
    assert item["remaining"] == {"credits": 1, "count": 1, "required_codes": ["3346.328"]}
    assert item["calculation"]["candidate_codes"] == []


def test_three_chemical_selection_groups_use_independent_thresholds():
    result = evaluate(payload([course(c) for c in CHEMICAL_I + CHEMICAL_II + ENGINEERING],
                              name="화학생물공학부"))
    actual = items(result)
    for rule_id, count, credits in [("chemical-main-R03", 3, 9),
                                    ("chemical-main-R04", 1, 1),
                                    ("chemical-main-R05", 1, 3)]:
        item = actual[rule_id]
        assert item["status"] == "satisfied"
        assert item["calculation"]["count"] == count
        assert item["calculation"]["credits"] == credits
        assert item["remaining"]["required_codes"] == []
    assert result["summary"]["satisfied"] == 3
    assert "credits" not in result["summary"]


def test_selection_group_candidates_are_not_all_required_courses():
    result = evaluate(payload([course(c) for c in CHEMICAL_I[:2]], name="화학생물공학부"))
    item = items(result)["chemical-main-R03"]
    assert item["status"] == "remaining"
    assert item["remaining"] == {"credits": 3, "count": 1, "required_codes": []}
    assert item["calculation"]["missing_codes"] == []
    assert item["calculation"]["candidate_codes"] == ["458.308", "458.409", "M1587.000100"]


def test_biology_double_list_can_match_but_allocation_is_unconfirmed():
    value = payload(kind="복수전공")
    result = evaluate(value)
    assert [group["id"] for group in result["sets"]] == ["biology-double"]
    item = items(result)["biology-double-R05"]
    assert item["calculation"]["status"] == "satisfied"
    assert item["calculation"]["credits"] == 5
    assert item["status"] == "needs_check"
    assert item["remaining"] is None
    assert {"multiple_programs_unallocated", "primary_program_unconfirmed"} <= reasons(item)


def test_every_manual_item_stays_uncomputed_across_all_programs():
    seen = {}
    for name in PROGRAMS:
        for kind in ("주전공", "복수전공"):
            result = evaluate(payload([course(c) for c in ALL_AUTOMATIC_EXAMPLES], name=name, kind=kind))
            for key, item in items(result).items():
                if key not in APPROVED:
                    assert item["status"] == "needs_check"
                    assert item["calculation"] is None
                    assert item["remaining"] is None
                    assert {"manual_review", "rule_needs_check"} <= reasons(item)
                    seen[key] = item
    assert len(seen) == 85


@pytest.mark.parametrize("name, expected", [("동물생명공학전공", "animal-double"),
                                            ("화학생물공학부", "chemical-double")])
def test_double_major_does_not_inherit_its_departments_primary_or_common(name, expected):
    result = evaluate(payload(name=name, kind="복수전공"))
    assert [group["id"] for group in result["sets"]] == [expected]
    assert all(item["status"] == "needs_check" for item in items(result).values())
    assert not (set(items(result)) & APPROVED)
    assert result["graduation_status"] == "not_evaluated"


@pytest.mark.parametrize("coverage", ["partial", "unknown"])
def test_incomplete_input_preserves_observed_match_without_final_confirmation(coverage):
    result = evaluate(payload(coverage=coverage))
    item = items(result)["biology-main-R06"]
    assert item["calculation"]["status"] == "satisfied"
    assert item["calculation"]["observed_deficit"] == {"credits": 0, "count": 0}
    assert item["status"] == "needs_check"
    assert item["remaining"] is None
    assert "coverage_unconfirmed" in reasons(item)


def test_in_progress_is_not_completed_but_shown_separately():
    result = evaluate(payload([course(c) for c in BIOLOGY[:2]] + [course(BIOLOGY[2], "in_progress")]))
    item = items(result)["biology-main-R06"]
    assert item["status"] == "remaining"
    assert item["calculation"]["credits"] == 4
    assert item["calculation"]["in_progress_codes"] == ["3346.328"]
    assert item["remaining"]["credits"] == 1


@pytest.mark.parametrize("status", ["unknown", None, "미지원 예시 상태"])
def test_unknown_related_course_holds_the_requirement(status):
    result = evaluate(payload([course(c) for c in BIOLOGY[:2]] + [course(BIOLOGY[2], status)]))
    item = items(result)["biology-main-R06"]
    assert item["status"] == "needs_check"
    assert item["calculation"]["credits"] == 4
    assert item["calculation"]["uncertain_codes"] == ["3346.328"]
    assert "course_uncertain" in reasons(item)


def test_repeated_attempts_do_not_fill_an_all_requirement_twice():
    result = evaluate(payload([course(c) for c in BIOLOGY] + [course(BIOLOGY[0])]))
    item = items(result)["biology-main-R06"]
    assert item["status"] == "needs_check"
    assert item["calculation"]["count"] == 2
    assert item["calculation"]["credits"] == 3
    assert "M1410.000100" in item["calculation"]["uncertain_codes"]


def test_regulation_credit_mismatch_is_detected_even_when_catalog_agrees_with_input():
    changed = [(BIOLOGY[0][0], BIOLOGY[0][1], 3)] + BIOLOGY[1:]
    result = evaluate(payload([course(c) for c in changed]), offerings(changed))
    item = items(result)["biology-main-R06"]
    assert item["status"] == "needs_check"
    assert "requirement_credit_conflict" in reasons(item)
    assert item["calculation"]["credits"] == 3


@pytest.mark.parametrize("year", [2024, 2026])
def test_other_entry_year_does_not_receive_2025_rules(year):
    result = evaluate(payload(entry_year=year))
    assert result["sets"] == []
    assert "unsupported_entry_year" in issue_codes(result)
    assert result["needs_check"] is True


@pytest.mark.parametrize("programs, expected", [
    ([], "primary_program_unconfirmed"),
    ([{"name": "예시 미지원 전공", "kind": "주전공"}], "unsupported_program"),
    ([{"name": "생명과학부", "kind": "부전공"}], "unsupported_program"),
    ([{"name": "생명과학부", "kind": "주전공"}] * 2, "duplicate_program"),
    ([{"name": "생명과학부", "kind": "주전공"}, {"name": "생명과학부", "kind": "복수전공"}], "conflicting_program_kind"),
    ([{"name": "생명과학부", "kind": "주전공"}, {"name": "화학생물공학부", "kind": "주전공"}], "primary_program_unconfirmed"),
])
def test_program_uncertainty_never_produces_final_satisfied(programs, expected):
    result = evaluate(payload(programs=programs))
    assert expected in issue_codes(result)
    assert all(item["status"] == "needs_check" for item in items(result).values())
    assert len({group["id"] for group in result["sets"]}) == len(result["sets"])


def test_unrecognised_home_primary_does_not_apply_double_majors_common():
    result = evaluate(payload(programs=[{"name": "예시 미지원 전공", "kind": "주전공"},
                                        {"name": "생명과학부", "kind": "복수전공"}]))
    assert [group["id"] for group in result["sets"]] == ["biology-double"]
    assert "unsupported_program" in issue_codes(result)


def test_same_course_in_multiple_selected_lists_is_not_jointly_awarded():
    result = evaluate(payload(programs=[{"name": "생명과학부", "kind": "주전공"},
                                        {"name": "생명과학부", "kind": "복수전공"}]))
    for key in ("biology-main-R06", "biology-double-R05"):
        item = items(result)[key]
        assert item["calculation"]["credits"] == 5
        assert item["status"] == "needs_check"
        assert "overlap_unresolved" in reasons(item)


def test_unknown_identity_does_not_become_a_definite_missing_course():
    result = evaluate(payload([course(("EXAMPLE.UNKNOWN", "예시 미연결", 3))]))
    item = items(result)["biology-main-R06"]
    assert "unresolved_course_identity" in issue_codes(result)
    assert item["status"] == "needs_check"
    assert item["remaining"] is None


def test_computed_input_fields_are_rebuilt_not_trusted():
    value = normalize_transcript(payload([course(BIOLOGY[0], "unknown")]), offerings())
    value["courses"][0].update(countable_completed=True, needs_check=False, issues=[],
                               matched_code=BIOLOGY[1][0], candidate_codes=[BIOLOGY[1][0]])
    value["summary"]["confirmed_completed_credits"] = 999
    result = evaluate(value)
    item = items(result)["biology-main-R06"]
    assert item["calculation"]["credits"] == 0
    assert result["transcript_summary"]["confirmed_completed_credits"] == 0
    assert item["status"] == "needs_check"


def test_inputs_unchanged_and_private_fields_not_returned():
    marker = "예시_반환금지_정보"
    value, catalog = payload(), offerings()
    for target in (value, value["programs"][0], value["courses"][0]):
        target.update(student_name=marker, student_id=marker, grade=marker, unknown={marker: marker})
    before = copy.deepcopy((value, catalog))
    result = evaluate(value, catalog)
    assert (value, catalog) == before
    assert marker not in json.dumps(result, ensure_ascii=False)
    assert result == evaluate(value, catalog)


def test_rule_sources_clause_and_review_evidence_are_preserved():
    result = evaluate()
    actual = items(result)["biology-main-R06"]
    source = next(item for group in load_requirements()["sets"] for item in group["requirements"]
                  if item["id"] == actual["id"])
    assert actual["sources"] == source["sources"]
    assert actual["evidence"] == source["review"]["evidence"]
    assert actual["original_pointer"] == source["original_pointer"]
    assert all(item["locator"] for item in actual["sources"])


@pytest.mark.parametrize("newline", [b"\n", b"\r\n"])
def test_release_accepts_git_lf_and_windows_crlf(tmp_path, newline):
    path = copy_release(tmp_path)
    for filename in (path, path.parent / "schema.json"):
        filename.write_bytes(filename.read_bytes().replace(b"\r\n", b"\n").replace(b"\n", newline))
    assert load_requirements(path)["schema_version"] == "1.0"


@pytest.mark.parametrize("changed", ["data", "schema", "source", "missing_source"])
def test_release_rejects_tampered_or_missing_files(tmp_path, changed):
    path = copy_release(tmp_path)
    source = path.parent / "source" / "snu_2025_graduation_requirements.json"
    if changed == "data":
        data = json.loads(path.read_text(encoding="utf-8"))
        data["sets"][0]["requirements"][0]["min_credits"] += 1
        write_json(path, data)
    elif changed == "schema":
        schema = path.parent / "schema.json"
        schema.write_bytes(schema.read_bytes() + b" ")
    elif changed == "source":
        source.write_bytes(source.read_bytes() + b" ")
    else:
        source.unlink()
    with pytest.raises(RequirementsValidationError):
        evaluate(requirements_path=path)


def test_data_and_original_changed_together_still_fail_frozen_release(tmp_path):
    path = copy_release(tmp_path)
    source_path = path.parent / "source" / "snu_2025_graduation_requirements.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    original = json.loads(source_path.read_text(encoding="utf-8"))
    for document in (data, original):
        document["sets"][0]["requirements"][0]["min_credits"] += 1
    write_json(source_path, original)
    data["provenance"]["sha256"] = hashlib.sha256(source_path.read_bytes()).hexdigest()
    write_json(path, data)
    with pytest.raises(RequirementsValidationError) as exc:
        load_requirements(path)
    assert exc.value.errors[0]["code"] == "ruleset_release_mismatch"


def test_manual_cannot_be_promoted_by_input_flags(tmp_path):
    path = copy_release(tmp_path)
    data = json.loads(path.read_text(encoding="utf-8"))
    item = data["sets"][0]["requirements"][0]
    item["needs_check"] = False
    item["calculation"]["mode"] = "course_list"
    write_json(path, data)
    with pytest.raises(RequirementsValidationError):
        evaluate(requirements_path=path)


def test_extreme_untrusted_rule_number_fails_as_structured_error(tmp_path):
    path = copy_release(tmp_path)
    data = json.loads(path.read_text(encoding="utf-8"))
    data["sets"][0]["requirements"][0]["min_credits"] = 10 ** 400
    write_json(path, data)
    with pytest.raises(RequirementsValidationError):
        load_requirements(path)


def synthetic_rule(rule="min_credits", minimum=3, count=None):
    return {"rule": rule, "min_credits": minimum, "min_count": count,
            "courses": [{"code": "EXAMPLE.1", "credits": 1}, {"code": "EXAMPLE.2", "credits": 2}]}


def synthetic_rows(values):
    all_values = [("EXAMPLE.1", "예시 하나", 1), ("EXAMPLE.2", "예시 둘", 2)]
    return normalize_transcript(payload([course(all_values[index]) for index in values]),
                                offerings(all_values))["courses"]


@pytest.mark.parametrize("rule, minimum, count, selected, expected, deficit", [
    ("min_credits", 3, None, [0], "remaining", {"credits": 2, "count": None}),
    ("min_credits", 3, None, [0, 1], "satisfied", {"credits": 0, "count": None}),
    ("min_credits", 1, 2, [0], "remaining", {"credits": 0, "count": 1}),
    ("min_count", 3, 1, [0], "remaining", {"credits": 2, "count": 0}),
    ("all", 3, None, [1], "remaining", {"credits": 1, "count": 1}),
])
def test_generic_arithmetic_applies_all_nonnull_thresholds(rule, minimum, count, selected, expected, deficit):
    result, why = _calculate_course_list(synthetic_rule(rule, minimum, count), synthetic_rows(selected))
    assert why == []
    assert result["status"] == expected
    assert result["observed_deficit"] == deficit


@pytest.mark.parametrize("kind", ["minimum", "count", "empty", "course_credit"])
def test_unknown_minimum_and_empty_all_do_not_vacuously_satisfy(kind):
    rule = synthetic_rule("all")
    if kind == "minimum":
        rule["min_credits"] = None
    elif kind == "count":
        rule.update(rule="min_count", min_count=None)
    elif kind == "empty":
        rule["courses"] = []
    else:
        rule["courses"][0]["credits"] = None
    result, why = _calculate_course_list(rule, synthetic_rows([0, 1]))
    assert result is None
    assert why


def test_cli_success_and_private_error_are_structured(tmp_path, capsys):
    input_path, catalog_path = tmp_path / "input.json", tmp_path / "offerings.json"
    write_json(input_path, {"example": payload()})
    write_json(catalog_path, offerings()[0])
    arguments = [str(input_path), "--case", "example", "--offerings", str(catalog_path)]
    assert main(arguments) == 0
    streams = capsys.readouterr()
    assert streams.err == ""
    assert items(json.loads(streams.out))["biology-main-R06"]["status"] == "satisfied"
    marker = "예시_오류반환금지"
    write_json(input_path, {"example": payload([course(BIOLOGY[0], credits=marker)])})
    assert main(arguments) == 2
    streams = capsys.readouterr()
    assert streams.out == ""
    assert marker not in streams.err
    assert json.loads(streams.err)["errors"][0]["path"] == "courses[0].credits"


def test_invalid_payload_fails_without_echoing_value():
    marker = "예시_학생정보반환금지"
    with pytest.raises(TranscriptValidationError) as exc:
        evaluate(payload(entry_year=marker))
    assert marker not in str(exc.value)


@pytest.mark.parametrize("case, expected_sets, check_count", [
    ("animal", ["common", "animal-main"], 24),
    ("biology_double", ["common", "animal-main", "biology-double"], 37),
    ("chemical_double", ["common", "biology-main", "chemical-double"], 36),
])
def test_three_synthetic_students_match_independent_expected_values(case, expected_sets, check_count):
    fixtures = Path(__file__).parent / "fixtures" / "planner"
    cases = json.loads((fixtures / "requirements_cases.json").read_text(encoding="utf-8"))
    catalog = json.loads((fixtures / "requirements_offerings.json").read_text(encoding="utf-8"))
    result = evaluate(cases[case], [catalog])
    assert [group["id"] for group in result["sets"]] == expected_sets
    assert result["summary"] == {"satisfied": 0, "remaining": 0, "needs_check": check_count}
    assert result["graduation_status"] == "not_evaluated"
    assert result["needs_check"] is True
    if case == "animal":
        assert result["transcript_summary"]["confirmed_completed_credits"] == 2
        assert not (APPROVED & set(items(result)))
    elif case == "biology_double":
        item = items(result)["biology-double-R05"]
        assert item["calculation"]["count"] == 1
        assert item["calculation"]["credits"] == 2
        assert item["calculation"]["in_progress_codes"] == ["M1410.000200"]
        assert item["calculation"]["uncertain_codes"] == ["3346.328"]
        assert item["calculation"]["observed_deficit"] == {"credits": 3, "count": 2}
        assert item["remaining"] is None
    else:
        item = items(result)["biology-main-R06"]
        assert item["calculation"]["status"] == "satisfied"
        assert item["calculation"]["credits"] == 5
        assert result["transcript_summary"]["confirmed_completed_credits"] == 5
        assert "multiple_programs_unallocated" in reasons(item)
        assert not any(key.startswith("chemical-main") for key in items(result))
