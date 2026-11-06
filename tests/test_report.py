"""가상 분반·직접 계산값으로 보고와 TT 링크 경계를 검증한다."""

import base64
import copy
import json
import zlib

import pytest

from planner.planning_types import PlanningValidationError
from planner.report import (
    ATTRIBUTION, DECODED_MAX, LINK_BASE, LINK_MAX, build_report,
    decode_timetable_link, encode_timetable_link, main,
)


def section(code="EXAMPLE.001", number="001", start=540, end=600, building="A"):
    return {"code": code, "number": number, "name": "예시 과목 " + code,
            "credits": 3, "basis": "remaining_requirement", "requirement_ids": ["example-R01"],
            "meetings": [{"day": 0, "start": start, "end": end, "building": building, "room": "101"}]}


def plan():
    # 집 H→A 5, A→B 15, B→H 7 = 27분. 10분 쉬므로 부족5, 비용37.
    return {"id": "plan-1", "credits": 6,
            "sections": [section(), section("EXAMPLE.002", "002", 610, 670, "B")],
            "travel_complete": True, "walk_minutes": 27, "shortage_minutes": 5, "cost": 37,
            "known_walk_minutes": 27, "known_shortage_minutes": 5, "known_cost": 37,
            "legs": [
                {"day": 0, "from": "H", "to": "A", "depart": None, "arrive_by": 540,
                 "minutes": 5, "slack": None, "shortage": 0, "status": "known"},
                {"day": 0, "from": "A", "to": "B", "depart": 600, "arrive_by": 610,
                 "minutes": 15, "slack": -5, "shortage": 5, "status": "known"},
                {"day": 0, "from": "B", "to": "H", "depart": 670, "arrive_by": None,
                 "minutes": 7, "slack": None, "shortage": 0, "status": "known"},
            ], "warnings": [], "selection_score": {"required_courses": 2, "planned_goals": 1},
            "goal_progress": [{"id": "example-R01", "status": "planned", "count": 2, "credits": 6,
                               "planned_codes": ["EXAMPLE.001", "EXAMPLE.002"],
                               "remaining_count": 0, "remaining_credits": 0}]}


def search_result():
    return {"schema_version": 1, "target_term": "2027-1", "source_term": "2026-1", "estimated": True,
            "plans": [plan()], "issues": [], "excluded_sections": [],
            "search": {"complete": True, "nodes": 10, "max_nodes": 1000, "feasible_count": 1,
                       "pruned_conflict": 2, "pruned_credit": 1, "n_candidates": 2,
                       "ranking": "가상 순위"}}


def link_from(data, *, compressed=False):
    raw = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if compressed:
        compressor = zlib.compressobj(wbits=-15)
        raw = compressor.compress(raw) + compressor.flush()
    return LINK_BASE + "#t=" + ("z" if compressed else "j") + base64.urlsafe_b64encode(raw).decode().rstrip("=")


def expected_link_payload():
    return [1, "2026-1", "2027-1 예상 시간표 1", [
        ["EXAMPLE.001", "001", None, "예시 과목 EXAMPLE.001"],
        ["EXAMPLE.002", "002", None, "예시 과목 EXAMPLE.002"],
    ]]


def test_link_payload_matches_tt_format_and_excludes_unrelated_fields():
    value = plan()
    value["student_name"] = "예시_반환금지"
    value["sections"][0]["instructor"] = "예시_반환금지"
    url = encode_timetable_link(value, "2026-1", "2027-1 예상 시간표 1")
    assert url.startswith(LINK_BASE + "#t=j")
    assert "=" not in url.split("#t=")[1]
    restored = decode_timetable_link(url)
    assert restored == expected_link_payload()
    assert "예시_반환금지" not in json.dumps(restored, ensure_ascii=False)


@pytest.mark.parametrize("compressed", [False, True])
def test_both_j_and_raw_deflate_z_are_decoded(compressed):
    assert decode_timetable_link(link_from(expected_link_payload(), compressed=compressed)) == expected_link_payload()


@pytest.mark.parametrize("raw", [b"not json", b"[1,", b"\xff\xfe"])
def test_invalid_json_and_utf8_are_safe_errors(raw):
    url = LINK_BASE + "#t=j" + base64.urlsafe_b64encode(raw).decode().rstrip("=")
    with pytest.raises(PlanningValidationError):
        decode_timetable_link(url)


@pytest.mark.parametrize("malformed", [
    "", "https://example.com/tt-wizard/#t=jW10", LINK_BASE + "?token=private#t=jW10",
    LINK_BASE + "#x=jW10", LINK_BASE + "#t=xW10", LINK_BASE + "#t=j%21", LINK_BASE + "#t=jA",
    "https://archi142857.github.io@invalid.example/tt-wizard/#t=jW10",
])
def test_invalid_urls_are_safe_errors(malformed):
    with pytest.raises(PlanningValidationError) as exc:
        decode_timetable_link(malformed)
    assert "token=private" not in str(exc.value)


@pytest.mark.parametrize("data", [
    [], {}, [True, "2026-1", "예시", []], [2, "2026-1", "예시", []],
    [1, "2026-3", "예시", [["A", "001", None, "예시"]]],
    [1, "2026-1", "예시", []],
    [1, "2026-1", "예시", [["", "001", None, "예시"]]],
    [1, "2026-1", "예시", [["A", " ", None, "예시"]]],
    [1, "2026-1", "예시", [["A", "001", "예시_반환금지", "예시"]]],
    [1, "2026-1", "예시", [["A", "001", None, "예시"], ["A", "002", None, "예시"]]],
    [1, "2026-1", "예시", [["A", "001", None, "예시", []]]],
])
def test_invalid_link_payloads_rejected(data):
    with pytest.raises(PlanningValidationError) as exc:
        decode_timetable_link(link_from(data))
    assert "예시_반환금지" not in str(exc.value)


def test_decompression_bomb_and_trailing_compressed_data_are_rejected():
    bomb = link_from("x" * (DECODED_MAX + 1), compressed=True)
    assert len(bomb) < LINK_MAX
    with pytest.raises(PlanningValidationError):
        decode_timetable_link(bomb)
    good = link_from(expected_link_payload(), compressed=True)
    code = good.split("#t=z")[1]
    raw = base64.urlsafe_b64decode(code + "=" * (-len(code) % 4)) + b"garbage"
    corrupted = LINK_BASE + "#t=z" + base64.urlsafe_b64encode(raw).decode().rstrip("=")
    with pytest.raises(PlanningValidationError):
        decode_timetable_link(corrupted)


def test_link_limits_are_enforced():
    with pytest.raises(PlanningValidationError):
        decode_timetable_link(LINK_BASE + "#t=j" + "A" * LINK_MAX)
    value = plan()
    value["sections"] = [section("X" + str(i)) for i in range(1000)]
    for row in value["sections"]:
        row["name"] = "가" * 300
    with pytest.raises(PlanningValidationError):
        encode_timetable_link(value, "2026-1", "예시")


def test_report_forecast_link_uses_source_term_and_keeps_all_meetings():
    value = search_result()
    value["plans"][0]["sections"][0]["meetings"].append(
        {"day": 2, "start": 540, "end": 600, "building": "A", "room": "102"})
    before = copy.deepcopy(value)
    result = build_report(value)
    actual = result["json"]["plans"][0]
    assert actual["link_term"] == "2026-1"
    assert decode_timetable_link(actual["tt_link"]) == expected_link_payload()
    assert set(actual["days"]) == {"0", "2"}
    assert len(actual["days"]["0"]) == 2
    markdown = result["markdown"]
    assert "2027-1 시간표 후보 — 예상" in markdown
    assert "2026-1 자료를 참조한 예상" in markdown
    assert "| 수 | 09:00–10:00" in markdown
    assert "이동 부족 5분 · 비용 37" in markdown
    assert "빠듯함" in markdown and "example-R01" in markdown
    assert "실제 취득·졸업 충족 아님" in markdown
    assert markdown.rstrip().endswith(ATTRIBUTION)
    assert value == before


def test_candidate_warnings_survive_sections_plan_and_markdown():
    value = search_result()
    warnings = [
        {"code": "prerequisite_unknown", "message": "선수 이수 여부 확인 필요"},
        {"code": "recognition_pending", "message": "다전공 인정은 확인 필요"},
        {"code": "reference_only", "message": "참고 후보이며 졸업 충족 확정 아님"},
    ]
    value["plans"][0]["sections"][0]["warnings"] = warnings
    value["plans"][0]["warnings"] = warnings[:1]
    result = build_report(value)
    clean = result["json"]["plans"][0]
    assert clean["sections"][0]["prerequisite_status"] == "unknown"
    assert clean["sections"][0]["warnings"] == warnings
    assert clean["warnings"] == warnings
    assert all(warning["message"] in result["markdown"] for warning in warnings)


def test_requirement_source_and_recommendation_context_survive_report():
    value = search_result()
    row = value["plans"][0]["sections"][0]
    row["requirement_sources"] = {"example-R01": [
        {"title": "예시 규정", "url": "https://example.com/rules.pdf", "locator": "예시 2쪽", "student_name": "예시_반환금지"}]}
    row["frequency"] = {"years_offered": 2, "window_years": [2022, 2023, 2024, 2025, 2026],
                        "observed_years": [2025, 2026], "missing_years": [2022, 2023, 2024]}
    row["recommended_year"], row["recommended_term"] = 2, 1
    result = build_report(value)
    actual = result["json"]["plans"][0]["sections"][0]
    assert actual["frequency"] == row["frequency"]
    assert "예시_반환금지" not in json.dumps(result, ensure_ascii=False)
    assert "[예시 규정](<https://example.com/rules.pdf>) · 예시 2쪽" in result["markdown"]
    assert "5년 같은 학기 중 2년 개설" in result["markdown"]
    assert "권장 시기 참고: 2학년 · 1학기" in result["markdown"]


def test_unknown_location_does_not_become_zero_or_complete_cost():
    value = search_result()
    value["plans"][0].update(travel_complete=False, walk_minutes=None, shortage_minutes=None, cost=None,
                              known_walk_minutes=5, known_shortage_minutes=0, known_cost=5)
    value["plans"][0]["sections"][1]["meetings"][0]["building"] = ""
    for leg in value["plans"][0]["legs"][1:]:
        leg.update(minutes=None, slack=None, shortage=None, status="unknown_location")
    value["plans"][0]["warnings"] = [{"code": "unknown_location", "message": "이동 위치 확인 필요"}]
    result = build_report(value)
    assert result["json"]["plans"][0]["cost"] is None
    assert "총계는 확인 필요" in result["markdown"]
    assert "부분 비용 5" in result["markdown"]
    assert "건물 미정" in result["markdown"]
    assert "이동 위치 확인 필요" in result["markdown"]


@pytest.mark.parametrize("count", [0, 1, 2, 3])
def test_actual_number_of_plans_only(count):
    value = search_result()
    value["plans"] = [plan() for _ in range(count)]
    if not count:
        value["issues"] = [{"code": "insufficient_credits", "message": "후보 학점이 부족합니다."}]
    result = build_report(value)
    assert len(result["json"]["plans"]) == count
    assert f"찾은 안: {count}개" in result["markdown"]
    assert result["markdown"].count("## ") == count
    if not count:
        assert "후보 학점이 부족합니다." in result["markdown"]


def test_search_limit_is_not_reported_as_infeasibility_proof():
    value = search_result()
    value["search"]["complete"] = False
    result = build_report(value)
    assert "전체 최적 또는 불가능을 확정하지 않습니다" in result["markdown"]
    assert result["json"]["search"]["complete"] is False
    assert result["json"]["search"]["pruned_credit"] == 1


def test_unknown_fields_and_markdown_markup_are_not_rendered_as_raw_markup():
    value = search_result()
    marker = "예시_반환금지"
    value["student_name"] = marker
    value["plans"][0]["private"] = marker
    value["plans"][0]["sections"][0]["instructor"] = marker
    value["plans"][0]["sections"][0]["name"] = "<script>예시</script>|[링크]"
    result = build_report(value)
    assert marker not in json.dumps(result, ensure_ascii=False)
    assert "<script>" not in result["markdown"]
    assert "&lt;script&gt;" in result["markdown"]
    assert "\\|\\[링크\\]" in result["markdown"]


@pytest.mark.parametrize("failure", ["duplicate", "overlap", "too_many", "missing_source", "bad_estimate", "nan", "unknown_zero"])
def test_malformed_report_rejected(failure):
    value = search_result()
    if failure == "duplicate":
        value["plans"][0]["sections"].append(section())
    elif failure == "overlap":
        value["plans"][0]["sections"][1]["meetings"][0]["start"] = 590
    elif failure == "too_many":
        value["plans"] *= 4
    elif failure == "missing_source":
        value["source_term"] = None
    elif failure == "bad_estimate":
        value["estimated"] = False
    elif failure == "nan":
        value["plans"][0]["cost"] = float("nan")
    else:
        value["plans"][0]["legs"][0]["status"] = "unknown_location"
    with pytest.raises(PlanningValidationError):
        build_report(value)


def test_cli_reads_files_and_outputs_markdown_without_writing_results(tmp_path, capsys, monkeypatch):
    import planner.report as module
    transcript = tmp_path / "input.json"
    catalog = tmp_path / "offerings.json"
    walk = tmp_path / "walk.csv"
    prefs = tmp_path / "preferences.json"
    for path, data in ((transcript, {"example": True}), (catalog, {"meta": {}}), (prefs, {"min_credits": 6})):
        path.write_text(json.dumps(data), encoding="utf-8-sig")
    walk.write_text("from,to,minutes\nH,A,5\n", encoding="utf-8-sig")
    seen = {}
    def fake(payload, offerings, walk_rows, **kwargs):
        seen.update(payload=payload, offerings=offerings, walk_rows=walk_rows, kwargs=kwargs)
        return build_report(search_result())
    monkeypatch.setattr(module, "recommend_timetables", fake)
    assert main(["--transcript", str(transcript), "--offerings", str(catalog), "--walk", str(walk),
                 "--target-term", "2027-1", "--preferences", str(prefs), "--format", "markdown"]) == 0
    output = capsys.readouterr()
    assert output.err == ""
    assert "예상" in output.out
    assert seen["walk_rows"] == [{"from": "H", "to": "A", "minutes": "5"}]
    assert seen["kwargs"]["preferences"] == {"min_credits": 6}
    assert len(list(tmp_path.iterdir())) == 4


def test_cli_missing_file_returns_safe_json(tmp_path, capsys):
    marker = "예시_반환금지"
    path = str(tmp_path / (marker + ".json"))
    assert main(["--transcript", path, "--offerings", path, "--walk", path, "--target-term", "2027-1"]) == 2
    output = capsys.readouterr()
    assert output.out == ""
    assert marker not in output.err
    assert json.loads(output.err)["errors"][0]["code"] == "read_error"
