"""고정 1.0 요건과 개인정보 없는 이수내역으로 후보 과목을 만든다.

권장시기·개설빈도는 참고 정보다. 자연어 선수/대체 및 수동 요건을 추측하지 않는다.
"""

from __future__ import annotations

from copy import deepcopy
import math
import re

from planner.planning_types import PlanningValidationError
from planner.requirements import DEFAULT_DATA, evaluate_requirements, load_requirements
from planner.transcript import normalize_transcript


TERM = re.compile(r"[0-9]{4}-[12]\Z")
DEFAULTS = {
    "min_credits": 15, "max_credits": 18, "home": "919A",
    "avoid_days": [], "avoid_times": [], "include_codes": [], "required_codes": [],
    "include_reference": False, "target_year": None, "max_nodes": 100000,
}


def _fail(code, path, message):
    raise PlanningValidationError(code, path, message)


def normalize_preferences(preferences=None):
    """v1 학생 조건. 알 수 없는 키는 원래 키를 노출하지 않고 거부한다."""
    if preferences is None:
        preferences = {}
    if not isinstance(preferences, dict) or set(preferences) - DEFAULTS.keys():
        _fail("invalid_preferences", "preferences", "지원하는 조건 필드의 객체가 필요합니다.")
    result = deepcopy(DEFAULTS)
    result.update(deepcopy(preferences))
    for key in ("min_credits", "max_credits"):
        value = result[key]
        if type(value) not in (int, float) or (isinstance(value, float) and not math.isfinite(value)) or not 0 <= value <= 100:
            _fail("invalid_credit_range", "preferences." + key, "학점 범위는 0~100의 유한 숫자여야 합니다.")
    if result["max_credits"] <= 0 or result["min_credits"] > result["max_credits"]:
        _fail("invalid_credit_range", "preferences", "최대학점은 양수이며 최소학점 이상이어야 합니다.")
    if not isinstance(result["home"], str) or not result["home"].strip():
        _fail("invalid_home", "preferences.home", "출발·귀가 지점 번호가 필요합니다.")
    result["home"] = result["home"].strip()
    if type(result["include_reference"]) is not bool:
        _fail("invalid_reference_flag", "preferences.include_reference", "참고 후보 포함 여부는 참/거짓이어야 합니다.")
    if result["target_year"] is not None and (type(result["target_year"]) is not int or not 1 <= result["target_year"] <= 10):
        _fail("invalid_target_year", "preferences.target_year", "권장 학년 비교값은 1~10 정수 또는 null입니다.")
    if type(result["max_nodes"]) is not int or not 1 <= result["max_nodes"] <= 1000000:
        _fail("invalid_search_limit", "preferences.max_nodes", "탐색 한도는 1~1000000 정수여야 합니다.")
    for key in ("include_codes", "required_codes"):
        value = result[key]
        if not isinstance(value, list) or any(not isinstance(v, str) or not v.strip() for v in value):
            _fail("invalid_course_codes", "preferences." + key, "비어 있지 않은 과목번호 문자열 목록이 필요합니다.")
        result[key] = list(dict.fromkeys(v.strip() for v in value))
    days = result["avoid_days"]
    if not isinstance(days, list) or any(type(d) is not int or not 0 <= d <= 5 for d in days):
        _fail("invalid_days", "preferences.avoid_days", "요일은 0~5 정수 목록입니다.")
    result["avoid_days"] = sorted(set(days))
    if not isinstance(result["avoid_times"], list):
        _fail("invalid_avoid_times", "preferences.avoid_times", "피하는 시간 목록이 필요합니다.")
    for i, slot in enumerate(result["avoid_times"]):
        if (not isinstance(slot, dict) or set(slot) != {"day", "start", "end"}
                or any(type(slot.get(k)) is not int for k in ("day", "start", "end"))
                or not 0 <= slot["day"] <= 5 or not 0 <= slot["start"] < slot["end"] <= 1440):
            _fail("invalid_avoid_time", f"preferences.avoid_times[{i}]", "요일0~5와 0~1440분의 시작<끝이 필요합니다.")
    return result


def _index_offerings(offerings):
    # 세부 타입 검사는 normalize_transcript가 선행했다. 여기서는 중복 학기/번호를 막는다.
    index = {}
    for document in offerings:
        term = document["meta"]["semester"].strip()
        if not TERM.fullmatch(term):
            continue  # 정규학기 계획에 계절학기 이력을 섞지 않는다.
        if term in index:
            _fail("duplicate_offering_term", "offerings", "같은 학기의 개설 문서가 반복됐습니다.")
        courses = {}
        for row in document["courses"]:
            code = row[0].strip()
            if code in courses:
                _fail("duplicate_offering_course", "offerings.courses", "같은 학기의 과목번호가 반복됐습니다.")
            courses[code] = row
        index[term] = courses
    return index


def _sections(raw, path):
    if not isinstance(raw, list):
        _fail("invalid_sections", path, "분반 목록이 필요합니다.")
    clean, numbers = [], set()
    for i, section in enumerate(raw):
        current = f"{path}[{i}]"
        if (not isinstance(section, list) or len(section) != 3
                or not isinstance(section[0], str) or not section[0].strip()
                or not isinstance(section[1], str) or not isinstance(section[2], list)):
            _fail("invalid_section", current, "번호·상태·회의목록의 3칸 분반이 필요합니다.")
        number = section[0].strip()
        if number in numbers:
            _fail("duplicate_section", current, "같은 과목의 분반번호가 반복됐습니다.")
        numbers.add(number)
        meetings = []
        for j, meeting in enumerate(section[2]):
            if not isinstance(meeting, list) or len(meeting) != 5:
                _fail("invalid_meeting", f"{current}.meetings[{j}]", "요일·시작·끝·건물·방의 5칸 회의가 필요합니다.")
            # 미정 시간은 None으로 보존해 시간표 엔진이 해당 분반을 제외한다.
            day, start, end, building, room = meeting
            if any(value not in (None, "") and not isinstance(value, str) for value in (building, room)):
                _fail("invalid_location", f"{current}.meetings[{j}]", "건물과 방은 문자열 또는 미정이어야 합니다.")
            meetings.append({"day": day, "start": start, "end": end,
                             "building": (building or "").strip(), "room": (room or "").strip()})
        clean.append({"number": number, "status": section[1].strip(), "meetings": meetings})
    return clean


def _frequency(code, index, target_term):
    year, season = target_term.split("-")
    window = list(range(int(year) - 5, int(year)))
    observed = [y for y in window if f"{y}-{season}" in index]
    return {"years_offered": sum(code in index[f"{y}-{season}"] for y in observed),
            "window_years": window, "observed_years": observed,
            "missing_years": [y for y in window if y not in observed]}


def build_candidates(payload, offerings, *, target_term, preferences=None, requirements_path=DEFAULT_DATA):
    """근거 있는 남음 후보와 확인이 필요한 참고 후보를 분리한다."""
    if not isinstance(target_term, str) or not TERM.fullmatch(target_term):
        _fail("invalid_target_term", "target_term", "목표 학기는 YYYY-1 또는 YYYY-2 형식입니다.")
    prefs = normalize_preferences(preferences)
    transcript = normalize_transcript(payload, offerings)
    evaluation = evaluate_requirements(payload, offerings, requirements_path=requirements_path)
    rules = load_requirements(requirements_path)
    rule_by_id = {r["id"]: r for s in rules["sets"] for r in s["requirements"]}
    index = _index_offerings(offerings)
    prior = f"{int(target_term[:4])-1}-{target_term[-1]}"
    source_term = target_term if target_term in index else (prior if prior in index else None)
    estimated = source_term != target_term
    issues, excluded = [], []
    if source_term is None:
        issues.append({"code": "offerings_unavailable", "message": "목표학기와 전년도 같은 학기 자료가 없습니다."})
    elif estimated:
        issues.append({"code": "estimated_offerings", "message": "전년도 같은 학기 분반을 사용한 예상안입니다."})
    if source_term and not index[source_term]:
        issues.append({"code": "empty_offerings", "message": "사용할 개설 문서의 과목목록이 비어 있습니다. 완전한 편람인지 확인하세요."})
    if evaluation["issues"]:
        issues.append({"code": "requirements_uncertain", "message": "요건 적용에 확인이 남았습니다. 참고 후보는 확정 미이수가 아닙니다."})
    issues.append({"code": "prerequisites_unverified", "message": "현행 자료에 자동 검증 가능한 선수 관계가 없습니다. 수강 가능을 확정하지 않습니다."})

    # 어떤 취득 상태든 이미 기록된 코드를 미래 미이수라고 조용히 다시 추천하지 않는다.
    held = {}
    for row in transcript["courses"]:
        codes = set(row["candidate_codes"]) | {row["code"], row["matched_code"]}
        reason = "already_completed" if row["countable_completed"] else ("in_progress" if row["status"] == "in_progress" and not row["needs_check"] else "transcript_uncertain")
        for code in codes - {None}:
            held.setdefault(code, set()).add(reason)

    desired = {}
    goals = []
    for group in evaluation["sets"]:
        for item in group["items"]:
            calculation = item["calculation"]
            if calculation is None or item["status"] == "satisfied":
                continue
            deficit = calculation["observed_deficit"]
            if not deficit["credits"] and not deficit["count"]:
                continue  # 관측상 목록을 이미 채운 보류 항목을 반복 추천하지 않는다.
            rule = rule_by_id[item["id"]]
            reference = item["status"] != "remaining"
            missing = calculation["missing_codes"] if rule["rule"] == "all" else calculation["candidate_codes"]
            for course in rule["courses"]:
                if course["code"] not in missing:
                    continue
                value = desired.setdefault(course["code"], {"items": [], "course": course, "user": False})
                value["items"].append({"id": item["id"], "reference": reference, "rule": rule["rule"],
                                       "sources": deepcopy(item["sources"])})
            if not reference:
                goals.append({"id": item["id"], "kind": "all" if rule["rule"] == "all" else "selection",
                              "all_codes": missing if rule["rule"] == "all" else [],
                              "candidate_codes": missing, "min_count": deficit["count"] or 0,
                              "min_credits": deficit["credits"]})
    for code in prefs["include_codes"] + prefs["required_codes"]:
        desired.setdefault(code, {"items": [], "course": None, "user": False})["user"] = True

    candidates, references = [], []
    available = index.get(source_term, {})
    for code, context in desired.items():
        if code in held:
            excluded.append({"code": code, "reasons": sorted(held[code])})
            continue
        if code not in available:
            excluded.append({"code": code, "reasons": ["not_offered_in_source_term"]})
            continue
        raw = available[code]
        if not isinstance(raw[4], str):
            _fail("invalid_category", "offerings.courses.category", "과목 이수구분은 문자열이어야 합니다.")
        metadata = context["course"]
        warnings = ["prerequisites_unverified"]
        definite = any(not item["reference"] for item in context["items"])
        reference = bool(context["items"]) and not definite and not context["user"]
        if metadata and metadata["credits"] != raw[3]:
            reference = True
            warnings.append("requirement_credit_conflict")
            # 이 번호를 넣었다고 목표 학점이 채워지는 것으로 계산하지 않는다.
            for goal in goals:
                if code in goal["candidate_codes"]:
                    goal["candidate_codes"] = [c for c in goal["candidate_codes"] if c != code]
        basis = "reference_requirement" if reference else ("remaining_requirement" if definite else "user_requested")
        if context["items"] and any(item["reference"] for item in context["items"]):
            warnings.append("requirement_recognition_unconfirmed")
        if estimated:
            warnings.append("estimated_offerings")
        frequency = _frequency(code, index, target_term)
        if frequency["missing_years"]:
            warnings.append("history_incomplete")
        is_all = any(i["rule"] == "all" and not i["reference"] for i in context["items"])
        rank = 3 if reference else (0 if is_all else 1 if definite else 2)
        year = metadata.get("year") if metadata else None
        term = metadata.get("term") if metadata else None
        distance = abs(year - prefs["target_year"]) if year is not None and prefs["target_year"] is not None else 99
        term_match = 0 if term == int(target_term[-1]) else 1 if term is not None else 2
        candidate = {
            "code": code, "name": raw[1].strip(), "credits": raw[3], "category": raw[4].strip(),
            "sections": _sections(raw[5], "offerings.sections"),
            "requirement_ids": [item["id"] for item in context["items"]],
            "requirement_sources": {item["id"]: item["sources"] for item in context["items"]},
            "basis": basis, "priority": [rank, distance, term_match, 1, -frequency["years_offered"]],
            "prerequisite_status": "unknown", "frequency": frequency,
            "recommended_year": year, "recommended_term": term, "warnings": warnings,
        }
        (references if reference else candidates).append(candidate)
    candidates.sort(key=lambda c: (c["priority"], c["code"]))
    references.sort(key=lambda c: (c["priority"], c["code"]))
    if references and not prefs["include_reference"]:
        issues.append({"code": "reference_candidates_held", "message": "확인 필요 요건의 참고 후보를 기본 탐색에서 제외했습니다."})
    if not candidates and not (prefs["include_reference"] and references):
        issues.append({"code": "no_candidates", "message": "확정된 미이수 후보가 없거나 개설/이수 상태가 확인되지 않았습니다. 사용자 선택 과목을 추가할 수 있습니다."})
    return {
        "schema_version": 1, "target_term": target_term, "source_term": source_term, "estimated": estimated,
        "preferences": prefs, "candidates": candidates, "reference_candidates": references,
        "excluded": excluded, "issues": issues, "goals": goals,
        "requirements_summary": deepcopy(evaluation["summary"]),
        "graduation_status": evaluation["graduation_status"],
    }
