"""작업 2-B: 가상 과목으로 상태·연결·보류·개인정보 경계를 검증한다."""

import copy
import json
from pathlib import Path

import pytest

from planner.transcript import (
    TranscriptValidationError,
    main,
    normalize_name,
    normalize_transcript,
)


def course(**changes):
    value = {"code": "EXAMPLE.001", "name": "예시 생물학Ⅰ", "credits": 3,
             "category": "전필", "term": "2025-1", "status": "completed"}
    value.update(changes)
    return value


def transcript(courses=None, **changes):
    value = {"entry_year": 2025, "programs": [{"name": "예시 전공", "kind": "주전공"}],
             "coverage": "complete", "courses": [course()] if courses is None else courses}
    value.update(changes)
    return value


def offering(code="EXAMPLE.001", name="예시 생물학 1", credits=3):
    return [code, name, "예시 학부", credits, "교양", []]


def catalog(courses=None, semester="2025-1"):
    return {"meta": {"semester": semester},
            "courses": [offering()] if courses is None else courses}


def normalize(payload=None, offerings=None):
    return normalize_transcript(
        transcript() if payload is None else payload,
        [catalog()] if offerings is None else offerings,
    )


def issue_codes(result):
    return {issue["code"] for issue in result["issues"]}


@pytest.mark.parametrize("status, normalized", [
    ("completed", "completed"), ("취득 완료", "completed"),
    ("in_progress", "in_progress"), ("수강 중", "in_progress"),
    ("unknown", "unknown"), ("미확인", "unknown"),
    (None, "unknown"), ("", "unknown"), ("수강 취소", "unknown"),
])
def test_status_never_infers_completed(status, normalized):
    result = normalize(transcript([course(status=status)]))
    row = result["courses"][0]
    assert row["status"] == normalized
    assert row["countable_completed"] == (normalized == "completed")
    assert result["summary"]["confirmed_completed_credits"] == (3 if normalized == "completed" else 0)
    assert result["summary"]["in_progress_credits"] == (3 if normalized == "in_progress" else 0)
    assert ("status_unknown" in row["issues"]) == (normalized == "unknown")


def test_missing_status_remains_unknown_even_with_extra_grade_field():
    row = course()
    del row["status"]
    row["grade"] = "예시_제외값"
    result = normalize(transcript([row]))
    assert result["courses"][0]["status"] == "unknown"
    assert result["summary"]["confirmed_completed_credits"] == 0
    assert "grade" not in result["courses"][0]


def test_course_code_is_preserved_as_text_and_used_first():
    result = normalize(transcript([course(code=" 001.010 ", name="예시 다른 이름")]), [catalog([
        offering("001.010", "예시 원래 이름"), offering("EXAMPLE.002", "예시 다른 이름"),
    ])])
    row = result["courses"][0]
    assert row["code"] == "001.010"
    assert row["matched_code"] == "001.010"
    assert row["match_method"] == "code"
    assert row["candidate_codes"] == ["001.010"]
    assert "name_conflict" in row["issues"]
    assert row["countable_completed"] is False


def test_unknown_code_does_not_fall_back_to_known_name():
    result = normalize(transcript([course(code="EXAMPLE.MISSING")]))
    row = result["courses"][0]
    assert row["matched_code"] is None
    assert row["candidate_codes"] == []
    assert row["match_method"] == "unmatched"
    assert "code_not_found" in row["issues"]
    assert result["summary"]["confirmed_completed_credits"] == 0


@pytest.mark.parametrize("left, right", [
    ("예시 생물학Ⅰ", "예시생물학 (1)"),
    ("예시 생물학 Ⅱ", "예시 생물학 II"),
    ("예시 생물학 [III]", "예시 생물학3"),
    ("Physics(II)", "Physics II"),
    ("예시 생물학 ＸＩＩ", "예시생물학 12"),
])
def test_normalized_names_match_format_variants(left, right):
    assert normalize_name(left) == normalize_name(right)
    result = normalize(transcript([course(code=None, name=left)]), [catalog([offering(name=right)])])
    assert result["courses"][0]["matched_code"] == "EXAMPLE.001"
    assert result["courses"][0]["countable_completed"] is True


def test_normalization_preserves_parenthesized_content_and_english_words():
    assert normalize_name("예시 생물학(실험)") != normalize_name("예시 생물학")
    assert normalize_name("예시 CIVIL") == "예시civil"
    assert normalize_name("예시 CIV") == "예시civ"
    result = normalize(transcript([course(code=None, name="예시 생물학(실험)")]))
    assert result["courses"][0]["matched_code"] is None
    assert "name_not_found" in issue_codes(result)


def test_ambiguous_name_returns_all_codes_without_choosing_one():
    result = normalize(transcript([course(code=None)]), [catalog([
        offering("EXAMPLE.002"), offering("EXAMPLE.001"),
    ])])
    row = result["courses"][0]
    assert row["match_method"] == "ambiguous"
    assert row["matched_code"] is None
    assert row["candidate_codes"] == ["EXAMPLE.001", "EXAMPLE.002"]
    assert "name_ambiguous" in row["issues"]
    assert row["countable_completed"] is False


def test_name_uses_input_term_and_repeated_offerings_are_not_repeated_transcripts():
    result = normalize(transcript([course(code=None)]), [
        catalog([offering("EXAMPLE.001")]),
        catalog([offering("EXAMPLE.001")], "2024-1"),
        catalog([offering("EXAMPLE.002")], "2024-2"),
    ])
    assert result["courses"][0]["candidate_codes"] == ["EXAMPLE.001"]
    assert result["summary"]["confirmed_completed_credits"] == 3
    assert result["needs_check"] is False


def test_missing_catalog_term_retains_reference_match_but_holds_credits():
    result = normalize(offerings=[catalog(semester="2024-1")])
    row = result["courses"][0]
    assert row["matched_code"] == "EXAMPLE.001"
    assert "term_not_in_catalog" in row["issues"]
    assert result["summary"]["confirmed_completed_credits"] == 0


@pytest.mark.parametrize("missing", ["term", "credits", "category"])
def test_missing_data_is_not_filled_from_catalog(missing):
    row = course()
    del row[missing]
    result = normalize(transcript([row]))
    assert result["courses"][0][missing] is None
    assert missing + "_missing" in issue_codes(result)
    assert result["summary"]["confirmed_completed_credits"] == 0


def test_catalog_category_does_not_override_students_category():
    result = normalize()
    assert result["courses"][0]["category"] == "전필"
    assert result["courses"][0]["needs_check"] is False


def test_credit_mismatch_retains_input_and_is_not_counted():
    result = normalize(transcript([course(credits=2)]))
    assert result["courses"][0]["credits"] == 2
    assert "credits_conflict" in issue_codes(result)
    assert result["summary"]["held_completed_rows"] == 1
    assert result["summary"]["confirmed_completed_credits"] == 0


def test_same_term_catalog_credit_conflict_is_not_hidden_by_name_filter():
    result = normalize(transcript([course(code=None)]), [catalog([
        offering(), offering(name="예시 다른 이름", credits=2),
    ])])
    assert "credits_conflict" in issue_codes(result)
    assert result["courses"][0]["countable_completed"] is False


def test_credit_history_uses_exact_term_instead_of_latest_or_maximum():
    result = normalize(offerings=[catalog([offering(credits=4)], "2026-1"), catalog()])
    assert result["summary"]["confirmed_completed_credits"] == 3
    assert "credits_conflict" not in issue_codes(result)


@pytest.mark.parametrize("other", [
    course(), course(code=None), course(term="2026-1"),
    course(status="in_progress"), course(credits=2),
])
def test_repeated_transcript_courses_hold_all_attempts(other):
    result = normalize(transcript([course(), other]))
    assert len(result["courses"]) == 2
    assert all("repeated_course" in row["issues"] for row in result["courses"])
    assert all(not row["countable_completed"] for row in result["courses"])
    assert result["summary"]["confirmed_completed_credits"] == 0
    assert result["summary"]["in_progress_credits"] == 0


def test_repeated_unmatched_names_are_retained_for_review():
    result = normalize(transcript([
        course(code=None, name="예시 모르는 과목 I"),
        course(code=None, name="예시모르는과목1"),
    ]))
    assert len(result["courses"]) == 2
    assert all("repeated_course" in row["issues"] for row in result["courses"])


def test_decimal_credit_totals_and_in_progress_separation():
    result = normalize(transcript([
        course(code="EXAMPLE.001", name="예시 하나", credits=0.1),
        course(code="EXAMPLE.002", name="예시 둘", credits=0.2),
        course(code="EXAMPLE.003", name="예시 셋", credits=3, status="in_progress"),
        course(code="EXAMPLE.004", name="예시 넷", credits=0),
    ]), [catalog([
        offering("EXAMPLE.001", "예시 하나", 0.1),
        offering("EXAMPLE.002", "예시 둘", 0.2),
        offering("EXAMPLE.003", "예시 셋", 3),
        offering("EXAMPLE.004", "예시 넷", 0),
    ])])
    assert result["summary"]["confirmed_completed_credits"] == 0.3
    assert result["summary"]["in_progress_credits"] == 3
    assert result["summary"]["status_counts"] == {"completed": 3, "in_progress": 1, "unknown": 0}


@pytest.mark.parametrize("credits", [-1, True, False, "3", [], {}, float("nan"), float("inf"), -float("inf")])
def test_invalid_credit_types_fail_whole_input(credits):
    with pytest.raises(TranscriptValidationError) as exc:
        normalize(transcript([course(), course(credits=credits)]))
    assert exc.value.errors[0]["path"] == "courses[1].credits"


@pytest.mark.parametrize("changes, path", [
    ({"entry_year": True}, "entry_year"),
    ({"entry_year": "2025"}, "entry_year"),
    ({"schema_version": True}, "schema_version"),
    ({"schema_version": 2}, "schema_version"),
    ({"coverage": None}, "coverage"),
    ({"programs": None}, "programs"),
    ({"programs": [{}]}, "programs[0].name"),
    ({"courses": {}}, "courses"),
    ({"courses": [None]}, "courses[0]"),
    ({"courses": [course(code=None, name=None)]}, "courses[0]"),
    ({"courses": [course(code=123)]}, "courses[0].code"),
    ({"courses": [course(term="2025-3")]}, "courses[0].term"),
    ({"courses": [course(status=True)]}, "courses[0].status"),
])
def test_invalid_structures_have_fixed_error_paths(changes, path):
    with pytest.raises(TranscriptValidationError) as exc:
        normalize(transcript(**changes))
    assert exc.value.errors[0]["path"] == path


@pytest.mark.parametrize("semester", ["2025-S", "2025-W"])
def test_summer_and_winter_terms_are_supported(semester):
    result = normalize(transcript([course(term=semester)]), [catalog(semester=semester)])
    assert result["summary"]["confirmed_completed_credits"] == 3


def test_partial_and_missing_programs_are_global_uncertainty_not_zeroed_rows():
    result = normalize(transcript(coverage="partial", programs=[]))
    assert issue_codes(result) == {"coverage_unconfirmed", "programs_missing"}
    assert result["needs_check"] is True
    assert result["courses"][0]["needs_check"] is False
    assert result["summary"]["confirmed_completed_credits"] == 3


def test_missing_coverage_is_unknown_and_empty_input_is_valid():
    payload = transcript([])
    del payload["coverage"]
    result = normalize(payload)
    assert result["coverage"] == "unknown"
    assert "coverage_unconfirmed" in issue_codes(result)
    assert result["summary"]["course_count"] == 0
    assert result["summary"]["confirmed_completed_credits"] == 0


def test_unknown_fields_are_removed_at_every_input_level_and_inputs_unchanged():
    marker = "예시_반환금지_표식"
    payload = transcript()
    for target in (payload, payload["programs"][0], payload["courses"][0]):
        target.update({"student_name": marker, "student_id": marker, "grade": marker,
                       "notes": {"private": marker}})
    offerings = [catalog()]
    offerings[0]["meta"]["private"] = marker
    offerings[0]["courses"][0][2] = marker
    offerings[0]["courses"][0][5] = [[marker]]
    original = copy.deepcopy((payload, offerings))
    result = normalize(payload, offerings)
    assert marker not in json.dumps(result, ensure_ascii=False)
    assert (payload, offerings) == original
    assert result == normalize(payload, offerings)
    result["programs"][0]["name"] = "변경된 예시"
    assert (payload, offerings) == original


def test_invalid_value_and_unknown_field_names_are_not_echoed_in_errors():
    marker = "예시_오류반환금지"
    payload = transcript([course(credits=marker)])
    payload[marker] = marker
    with pytest.raises(TranscriptValidationError) as exc:
        normalize(payload)
    assert marker not in str(exc.value)
    assert exc.value.errors[0]["path"] == "courses[0].credits"


@pytest.mark.parametrize("offerings", [
    {}, [None], [{"meta": {}, "courses": []}],
    [catalog(courses=[[]])], [catalog(courses=[offering() + ["예시 추가 칸"]])],
    [catalog(courses=[offering(credits=True)])],
])
def test_malformed_catalog_is_rejected(offerings):
    with pytest.raises(TranscriptValidationError):
        normalize(offerings=offerings)


def test_empty_catalog_holds_every_course():
    result = normalize(offerings=[])
    assert "code_not_found" in issue_codes(result)
    assert result["summary"]["confirmed_completed_credits"] == 0


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8-sig")


def test_cli_reads_bom_and_case_bundle_with_catalog_directory(tmp_path, capsys):
    input_path = tmp_path / "example.json"
    catalogs_path = tmp_path / "offerings"
    catalogs_path.mkdir()
    write_json(input_path, {"example": transcript()})
    write_json(catalogs_path / "2025-1.json", catalog())
    assert main([str(input_path), "--case", "example", "--offerings", str(catalogs_path)]) == 0
    streams = capsys.readouterr()
    assert streams.err == ""
    assert json.loads(streams.out)["summary"]["confirmed_completed_credits"] == 3


@pytest.mark.parametrize("failure", ["malformed_json", "invalid_input", "missing_file", "missing_case"])
def test_cli_failures_return_json_without_echoing_private_values(tmp_path, capsys, failure):
    marker = "예시_외부반환금지"
    input_path = tmp_path / (marker + ".json")
    offerings_path = tmp_path / "offerings.json"
    write_json(offerings_path, catalog())
    arguments = [str(input_path), "--offerings", str(offerings_path)]
    if failure == "malformed_json":
        input_path.write_text("{" + marker, encoding="utf-8")
    elif failure == "invalid_input":
        write_json(input_path, transcript([course(credits=marker)]))
    elif failure == "missing_case":
        write_json(input_path, {})
        arguments.extend(["--case", marker])
    assert main(arguments) == 2
    streams = capsys.readouterr()
    assert streams.out == ""
    assert marker not in streams.err
    assert json.loads(streams.err)["errors"]


@pytest.mark.parametrize("case, completed, ongoing, held, codes", [
    ("animal", 3, 1, 0, ["EXAMPLE.001", "EXAMPLE.002", "EXAMPLE.005"]),
    ("biology_double", 3, 0, 2, ["EXAMPLE.001", None, None]),
    ("chemical_double", 1.5, 0, 2, ["EXAMPLE.005", "EXAMPLE.005", "EXAMPLE.006", "EXAMPLE.002"]),
])
def test_three_synthetic_students(case, completed, ongoing, held, codes):
    fixtures = Path(__file__).parent / "fixtures" / "planner"
    examples = json.loads((fixtures / "transcripts.json").read_text(encoding="utf-8"))
    offerings = json.loads((fixtures / "offerings.json").read_text(encoding="utf-8"))
    result = normalize_transcript(examples[case], [offerings])
    assert result["summary"]["confirmed_completed_credits"] == completed
    assert result["summary"]["in_progress_credits"] == ongoing
    assert result["summary"]["held_completed_rows"] == held
    assert [row["matched_code"] for row in result["courses"]] == codes
    assert result["coverage"] == "partial"
    assert result["needs_check"] is True
    if case == "animal":
        assert result["courses"][2]["status"] == "unknown"
    if case == "biology_double":
        assert result["courses"][1]["candidate_codes"] == ["EXAMPLE.003", "EXAMPLE.004"]
        assert "code_not_found" in result["courses"][2]["issues"]
    if case == "chemical_double":
        assert all("repeated_course" in row["issues"] for row in result["courses"][:2])
        assert "credits_conflict" in result["courses"][3]["issues"]
