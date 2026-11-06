"""분반·과목 부분집합과 방향별 동선을 계산한다.

Adapted from TT Wizard ttwizard/models.py, conflicts.py, evaluate.py,
search.py and cli.py at 693fe91649e3aa6cf0ac244a67d38e259fe62ff2 (MIT).
겹침·중복 회의 병합·집→수업→집·walk + 2 * shortage 규칙을 사용한다.
이 프로젝트는 미정 구간을 null로 반환하고 과목 부분집합·탐색한도를 추가한다.
저작권·허가 전문은 저장소 LICENSE에 보존한다. 교수 필드는 이식하지 않는다.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from decimal import Decimal
import math
import re

from planner.planning_types import PlanningValidationError

_WARNING_MESSAGES = {
    "prerequisites_unverified": "선수·수강 자격은 별도로 확인해야 합니다.",
    "requirement_credit_conflict": "규정 학점과 개설 학점이 달라 해당 요건 인정은 확인이 필요합니다.",
    "requirement_recognition_unconfirmed": "참고 요건 또는 다전공의 인정 범위는 확인이 필요합니다.",
    "estimated_offerings": "전년도 같은 학기 개설 자료를 사용한 예상 과목입니다.",
    "history_incomplete": "최근 5년 같은 학기 개설 이력 중 제공되지 않은 해가 있습니다.",
}


def _fail(path, message, code="invalid_planning_input"):
    raise PlanningValidationError(code, path, message)


def _number(value, path, *, string=False):
    if type(value) not in (int, float) and not (string and isinstance(value, str)):
        _fail(path, "0 이상의 유한 숫자가 필요합니다.")
    try:
        number = float(value)
    except (ValueError, OverflowError):
        _fail(path, "0 이상의 유한 숫자가 필요합니다.")
    if not math.isfinite(number) or number < 0:
        _fail(path, "0 이상의 유한 숫자가 필요합니다.")
    return number


def _text(value, path):
    if not isinstance(value, str) or not value.strip():
        _fail(path, "비어 있지 않은 문자열이 필요합니다.")
    return value.strip()


def _codes(value, path):
    if not isinstance(value, list):
        _fail(path, "문자열 목록이 필요합니다.")
    return [_text(code, f"{path}[{i}]") for i, code in enumerate(value)]


def _rounded(value):
    result = round(float(value), 8)
    return int(result) if result.is_integer() else result


def _overlaps(a, b):
    return a["day"] == b["day"] and a["start"] < b["end"] and b["start"] < a["end"]


def _time_valid(meeting):
    return (isinstance(meeting, dict)
            and type(meeting.get("day")) is int and 0 <= meeting["day"] <= 5
            and type(meeting.get("start")) is int and type(meeting.get("end")) is int
            and 0 <= meeting["start"] < meeting["end"] <= 1440)


def _preferences(result):
    prefs = result.get("preferences")
    if not isinstance(prefs, dict):
        _fail("preferences", "후보 생성 단계의 조건 객체가 필요합니다.")
    minimum = _number(prefs.get("min_credits", 15), "preferences.min_credits")
    maximum = _number(prefs.get("max_credits", 18), "preferences.max_credits")
    if minimum > maximum:
        _fail("preferences", "최소 학점은 최대 학점보다 클 수 없습니다.")
    home = _text(prefs.get("home", "919A"), "preferences.home")
    required = set(_codes(prefs.get("required_codes", []), "preferences.required_codes"))
    reference = prefs.get("include_reference", False)
    if type(reference) is not bool:
        _fail("preferences.include_reference", "참/거짓 값이 필요합니다.")
    days = prefs.get("avoid_days", [])
    if not isinstance(days, list) or any(type(d) is not int or not 0 <= d <= 5 for d in days):
        _fail("preferences.avoid_days", "요일은 0~5 정수 목록이어야 합니다.")
    times = prefs.get("avoid_times", [])
    if not isinstance(times, list) or any(not _time_valid(t) for t in times):
        _fail("preferences.avoid_times", "피하는 시간의 요일·시작·끝을 확인하세요.")
    max_nodes = prefs.get("max_nodes", 100000)
    if type(max_nodes) is not int or max_nodes < 1:
        _fail("preferences.max_nodes", "탐색한도는 1 이상의 정수여야 합니다.")
    return {"min_credits": Decimal(str(minimum)), "max_credits": Decimal(str(maximum)),
            "home": home, "required_codes": required, "include_reference": reference,
            "avoid_days": set(days), "avoid_times": times, "max_nodes": max_nodes}


def _walk_table(rows):
    if not isinstance(rows, (list, tuple)):
        _fail("walk_rows", "방향별 이동시간 행 목록이 필요합니다.")
    table = {}
    for i, row in enumerate(rows):
        path = f"walk_rows[{i}]"
        if not isinstance(row, dict):
            _fail(path, "이동시간 행은 객체여야 합니다.")
        key = (_text(row.get("from"), path + ".from"), _text(row.get("to"), path + ".to"))
        minutes = _number(row.get("minutes"), path + ".minutes", string=True)
        if key in table and table[key] != minutes:
            _fail(path, "같은 방향에 서로 다른 이동시간이 있습니다.", "conflicting_walk_time")
        table[key] = minutes
    return table


def _section(section, prefs):
    """개별 미정/잘못된 회의는 해당 분반 전체를 보류한다."""
    if not isinstance(section, dict):
        return None, "invalid_section"
    number = section.get("number")
    if not isinstance(number, str) or not number.strip():
        return None, "invalid_section_number"
    if section.get("status", "") != "":
        return None, "unavailable_section"
    raw_meetings = section.get("meetings")
    if not isinstance(raw_meetings, list) or not raw_meetings:
        return None, "meeting_time_unknown"
    merged = {}
    for meeting in raw_meetings:
        if not _time_valid(meeting):
            return None, "invalid_meeting"
        if any(meeting.get(key) is not None and not isinstance(meeting.get(key), str)
               for key in ("building", "room")):
            return None, "invalid_location"
        building, room = (meeting.get("building") or "").strip(), (meeting.get("room") or "").strip()
        key = (meeting["day"], meeting["start"], meeting["end"], building)
        if key not in merged:
            merged[key] = {"day": key[0], "start": key[1], "end": key[2], "building": building, "room": room}
        elif room:
            rooms = set(filter(None, merged[key]["room"].split("/")))
            rooms.add(room)
            merged[key]["room"] = "/".join(sorted(rooms))
    meetings = sorted(merged.values(), key=lambda m: (m["day"], m["start"], m["end"], m["building"]))
    if any(_overlaps(a, b) for i, a in enumerate(meetings) for b in meetings[i+1:]):
        return None, "section_internal_overlap"
    if any(m["day"] in prefs["avoid_days"] or any(_overlaps(m, t) for t in prefs["avoid_times"])
           for m in meetings):
        return None, "avoided_time"
    return {"number": number.strip(), "meetings": meetings}, None


def _candidate_list(result, prefs):
    raw = result.get("candidates")
    references = result.get("reference_candidates", [])
    if not isinstance(raw, list) or not isinstance(references, list):
        _fail("candidates", "확정·참고 후보 목록이 필요합니다.")
    candidates, excluded, seen = [], [], set()
    source = raw + (references if prefs["include_reference"] else [])
    for i, course in enumerate(source):
        path = f"candidates[{i}]"
        if not isinstance(course, dict):
            _fail(path, "후보 과목은 객체여야 합니다.")
        code = _text(course.get("code"), path + ".code")
        if code in seen:
            _fail(path + ".code", "같은 과목번호 후보가 반복됐습니다.")
        seen.add(code)
        name = _text(course.get("name"), path + ".name")
        credits = _number(course.get("credits"), path + ".credits")
        priority = course.get("priority", [2, 0, 0, 1, 0])
        if (not isinstance(priority, list) or not priority
                or any(type(x) not in (int, float) for x in priority)):
            _fail(path + ".priority", "숫자로 구성된 후보 순위가 필요합니다.")
        try:
            if any(not math.isfinite(x) for x in priority):
                _fail(path + ".priority", "후보 순위는 유한한 숫자여야 합니다.")
        except OverflowError:
            _fail(path + ".priority", "후보 순위는 유한한 숫자여야 합니다.")
        req_ids = _codes(course.get("requirement_ids", []), path + ".requirement_ids")
        raw_sources = course.get("requirement_sources", {})
        if not isinstance(raw_sources, dict):
            _fail(path + ".requirement_sources", "요건별 출처 객체가 필요합니다.")
        sources = {}
        for req_id in req_ids:
            if req_id not in raw_sources:
                continue
            rows = raw_sources[req_id]
            if not isinstance(rows, list) or any(not isinstance(row, dict) or any(not isinstance(row.get(key), str) for key in ("title", "url", "locator")) for row in rows):
                _fail(path + ".requirement_sources", "출처에는 문서명·URL·위치 문자열이 필요합니다.")
            sources[req_id] = [{key: row[key] for key in ("title", "url", "locator")} for row in rows]
        basis = course.get("basis", "user_requested")
        if basis not in ("remaining_requirement", "reference_requirement", "user_requested"):
            _fail(path + ".basis", "지원하는 후보 근거가 아닙니다.")
        raw_warnings = course.get("warnings", [])
        if not isinstance(raw_warnings, list):
            _fail(path + ".warnings", "후보 경고는 목록이어야 합니다.")
        warnings = sorted({code for code in raw_warnings if isinstance(code, str) and code in _WARNING_MESSAGES})
        frequency = course.get("frequency")
        if frequency is not None:
            if not isinstance(frequency, dict):
                _fail(path + ".frequency", "개설 빈도 객체가 필요합니다.")
            offered = frequency.get("years_offered")
            if type(offered) is not int or not 0 <= offered <= 5:
                _fail(path + ".frequency.years_offered", "개설 연수는 0~5 정수여야 합니다.")
            clean_frequency = {"years_offered": offered}
            for key in ("window_years", "observed_years", "missing_years"):
                values = frequency.get(key)
                if not isinstance(values, list) or any(type(y) is not int or not 0 <= y <= 9999 for y in values):
                    _fail(path + ".frequency." + key, "개설 이력 연도 목록이 필요합니다.")
                clean_frequency[key] = list(values)
            frequency = clean_frequency
        recommendations = {}
        for key, maximum in (("recommended_year", 8), ("recommended_term", 2)):
            value = course.get(key)
            if value is not None and (type(value) is not int or not 1 <= value <= maximum):
                _fail(path + "." + key, "권장 학년·학기는 허용 범위의 정수 또는 미정이어야 합니다.")
            recommendations[key] = value
        sections = course.get("sections")
        if not isinstance(sections, list):
            _fail(path + ".sections", "분반 목록이 필요합니다.")
        numbers = Counter(s["number"].strip() for s in sections if isinstance(s, dict) and isinstance(s.get("number"), str))
        clean = []
        for section in sections:
            number = section.get("number") if isinstance(section, dict) else None
            value, reason = _section(section, prefs)
            if isinstance(number, str) and numbers[number.strip()] > 1:
                value, reason = None, "duplicate_section_number"
            if reason:
                excluded.append({"code": code, "number": number if isinstance(number, str) else None, "reason": reason})
            else:
                clean.append(value)
        if not sections:
            excluded.append({"code": code, "number": None, "reason": "no_sections"})
        candidates.append({"code": code, "name": name, "credits": credits, "priority": list(priority),
                           "requirement_ids": req_ids, "requirement_sources": sources, "basis": basis,
                           "sections": sorted(clean, key=lambda s: s["number"]),
                           "prerequisite_status": "unknown", "warnings": warnings,
                           "frequency": frequency, **recommendations})
    candidates.sort(key=lambda c: (c["code"] not in prefs["required_codes"], c["priority"], len(c["sections"]), c["code"]))
    return candidates, excluded


def _goals(raw):
    if not isinstance(raw, list):
        _fail("goals", "계획 목표 목록이 필요합니다.")
    goals = []
    for i, goal in enumerate(raw):
        path = f"goals[{i}]"
        if not isinstance(goal, dict) or goal.get("kind") not in ("all", "selection"):
            _fail(path, "명시 목록 계획 목표가 필요합니다.")
        clean = {"id": _text(goal.get("id"), path + ".id"), "kind": goal["kind"]}
        for key in ("all_codes", "candidate_codes"):
            clean[key] = set(_codes(goal.get(key, []), path + "." + key))
        for key in ("min_count", "min_credits"):
            value = goal.get(key)
            clean[key] = None if value is None else _number(value, path + "." + key)
        if clean["min_count"] is not None and not clean["min_count"].is_integer():
            _fail(path + ".min_count", "최소 과목수는 정수여야 합니다.")
        goals.append(clean)
    return goals


def _goal_progress(goals, sections):
    credits = {s["code"]: s["credits"] for s in sections}
    progress, required = [], set()
    for goal in goals:
        obligations = goal["all_codes"] if goal["kind"] == "all" else goal["candidate_codes"]
        codes = obligations & goal["candidate_codes"]
        selected = sorted(codes & credits.keys())
        amount = sum((Decimal(str(credits[c])) for c in selected), Decimal(0))
        minimum_count = max(len(obligations) if goal["kind"] == "all" else 0, goal["min_count"] or 0)
        remaining_count = max(minimum_count-len(selected), 0)
        remaining_credits = None if goal["min_credits"] is None else _rounded(max(Decimal(str(goal["min_credits"]))-amount, 0))
        valid = bool(obligations) and (goal["kind"] == "all" or goal["min_count"] is not None or goal["min_credits"] is not None)
        planned = remaining_count == 0 and remaining_credits in (0, None)
        progress.append({"id": goal["id"], "status": ("planned" if planned else "not_planned") if valid else "needs_check",
                         "planned_codes": selected, "count": len(selected), "credits": _rounded(amount),
                         "remaining_count": _rounded(remaining_count), "remaining_credits": remaining_credits})
        if goal["kind"] == "all":
            required.update(selected)
    return progress, {"required_courses": len(required), "planned_goals": sum(p["status"] == "planned" for p in progress)}


def _evaluate(sections, table, home, goals):
    by_day = defaultdict(list)
    warnings = []
    for section in sections:
        for meeting in section["meetings"]:
            by_day[meeting["day"]].append({**meeting, "code": section["code"], "name": section["name"], "number": section["number"]})
    days = {str(day): sorted(meetings, key=lambda m: (m["start"], m["end"], m["code"])) for day, meetings in sorted(by_day.items())}
    legs, walk, shortage, complete = [], Decimal(0), Decimal(0), True
    for day, meetings in days.items():
        stops = [{"building": home, "end": None}] + meetings + [{"building": home, "start": None}]
        for previous, following in zip(stops, stops[1:]):
            frm, to = previous["building"], following["building"]
            depart, arrive = previous["end"], following["start"]
            if not frm or not to:
                minutes, slack, late, status = None, None, None, "unknown_location"
            else:
                minutes = 0 if frm == to else table.get((frm, to))
                if minutes is None:
                    slack, late, status = None, None, "missing_walk_time"
                else:
                    minutes = _rounded(minutes)
                    slack = None if depart is None or arrive is None else _rounded_signed(Decimal(arrive-depart)-Decimal(str(minutes)))
                    late, status = max(0, -slack) if slack is not None else 0, "known"
                    walk += Decimal(str(minutes))
                    shortage += Decimal(str(late))
            complete &= status == "known"
            legs.append({"day": int(day), "from": frm or None, "to": to or None, "depart": depart,
                         "arrive_by": arrive, "minutes": minutes, "slack": slack, "shortage": late, "status": status})
    if not complete:
        warnings.append({"code": "travel_incomplete", "message": "미정 위치 또는 누락 이동시간이 있어 총 이동·부족·비용은 미확정입니다."})
    if shortage:
        warnings.append({"code": "tight_transfer", "message": "알려진 경로에서 이동 여유가 부족한 구간이 있습니다."})
    if any(s["basis"] == "reference_requirement" for s in sections):
        warnings.append({"code": "reference_courses", "message": "확정 인정되지 않은 참고 후보가 포함된 계획입니다."})
    if any(s.get("prerequisite_status") != "satisfied" for s in sections):
        warnings.append({"code": "prerequisites_unconfirmed", "message": "선수·수강 자격 확인이 남은 과목이 있습니다."})
    if any(m["building"] for s in sections for m in s["meetings"]):
        warnings.append({"code": "indoor_travel_excluded", "message": "이동시간은 건물 기준이며 실내 이동을 포함하지 않습니다. 같은 건물의 0분도 실제 이동 0분을 보장하지 않습니다."})
    if any(m["building"] and not m["room"] for s in sections for m in s["meetings"]):
        warnings.append({"code": "room_unconfirmed", "message": "건물은 확인됐으나 방이 미정인 수업이 있습니다. 건물간 이동만 계산했습니다."})
    for code in sorted({code for s in sections for code in s["warnings"]}):
        warnings.append({"code": code, "message": _WARNING_MESSAGES[code]})
    goal_progress, score = _goal_progress(goals, sections)
    known_cost = walk + 2 * shortage
    return {"credits": _rounded(sum((Decimal(str(s["credits"])) for s in sections), Decimal(0))),
            "sections": sections, "days": days, "legs": legs,
            "walk_minutes": _rounded(walk) if complete else None,
            "shortage_minutes": _rounded(shortage) if complete else None,
            "cost": _rounded(known_cost) if complete else None,
            "known_walk_minutes": _rounded(walk), "known_shortage_minutes": _rounded(shortage),
            "known_cost": _rounded(known_cost), "travel_complete": bool(complete), "warnings": warnings,
            "goal_progress": goal_progress, "selection_score": score}


def _rounded_signed(value):
    return _rounded(value)


def search_timetables(candidate_result, walk_rows, *, top_k=3):
    """최대 3개의 실제 찾은 계획을 반환한다. 한도 도달을 불가능 증명으로 쓰지 않는다."""
    if not isinstance(candidate_result, dict) or type(candidate_result.get("schema_version")) is not int or candidate_result["schema_version"] != 1:
        _fail("candidate_result", "후보 형식 버전 1 객체가 필요합니다.")
    if type(top_k) is not int or not 1 <= top_k <= 3:
        _fail("top_k", "반환할 안 수는 1~3이어야 합니다.")
    for key in ("target_term", "source_term"):
        term = candidate_result.get(key)
        if key == "source_term" and term is None:
            continue
        if not isinstance(term, str) or not re.fullmatch(r"[0-9]{4}-[12]", term):
            _fail(key, "학기는 YYYY-1 또는 YYYY-2 형식이어야 합니다.")
    if type(candidate_result.get("estimated")) is not bool:
        _fail("estimated", "예상 여부는 참/거짓 값이어야 합니다.")
    prefs = _preferences(candidate_result)
    table = _walk_table(walk_rows)
    courses, excluded = _candidate_list(candidate_result, prefs)
    if (candidate_result["candidates"] or candidate_result.get("reference_candidates")) and candidate_result.get("source_term") is None:
        _fail("source_term", "후보가 있으면 분반을 가져온 학기가 필요합니다.")
    goals = _goals(candidate_result.get("goals", []))
    issues = []

    def issue(code, message):
        if code not in {entry["code"] for entry in issues}:
            issues.append({"code": code, "message": message})

    for entry in candidate_result.get("issues", []):
        if isinstance(entry, dict) and isinstance(entry.get("code"), str) and isinstance(entry.get("message"), str):
            issue(entry["code"], entry["message"])
    available = {c["code"] for c in courses if c["sections"]}
    required_missing = prefs["required_codes"] - available
    if required_missing:
        issue("required_course_unavailable", "반드시 포함할 과목 중 사용할 수 있는 분반이 없는 과목이 있습니다.")
    courses = [c for c in courses if c["sections"]]
    if not courses:
        issue("no_usable_courses", "사용할 수 있는 시간·분반을 가진 후보가 없습니다.")
    if sum((Decimal(str(c["credits"])) for c in courses), Decimal(0)) < prefs["min_credits"]:
        issue("insufficient_candidate_credits", "사용 가능한 후보의 학점 합계가 최소 목표보다 작습니다.")
    if sum((Decimal(str(c["credits"])) for c in courses if c["code"] in prefs["required_codes"]), Decimal(0)) > prefs["max_credits"]:
        issue("required_credits_exceed_maximum", "반드시 포함할 과목의 학점 합계가 최대 목표를 넘습니다.")
    if excluded:
        issue("sections_excluded", "시간 미정·잘못된 회의·개설 상태·피하는 시간 등으로 제외된 분반이 있습니다.")

    stats = {"complete": True, "nodes": 0, "max_nodes": prefs["max_nodes"], "feasible_count": 0,
             "pruned_conflict": 0, "pruned_credit": 0, "n_candidates": len(courses),
             "ranking": "계획상 필수과목 수 → 채운 목표 수 → 이동정보 완전성 → TT 비용 → 후보 동점 기준 → 식별자"}
    suffix = [Decimal(0)] * (len(courses)+1)
    for i in range(len(courses)-1, -1, -1):
        suffix[i] = suffix[i+1] + Decimal(str(courses[i]["credits"]))
    kept = []
    stack = [] if required_missing else [(0, (), Decimal(0))]
    while stack:
        if stats["nodes"] >= prefs["max_nodes"]:
            stats["complete"] = False
            break
        index, chosen, credit = stack.pop()
        stats["nodes"] += 1
        if credit > prefs["max_credits"] or credit + suffix[index] < prefs["min_credits"]:
            stats["pruned_credit"] += 1
            continue
        if index == len(courses):
            if not chosen:
                continue
            plan = _evaluate(list(chosen), table, prefs["home"], goals)
            stats["feasible_count"] += 1
            score = plan["selection_score"]
            advisory = tuple(sorted(tuple(s["priority"]) for s in chosen))
            identifiers = tuple(sorted((s["code"], s["number"]) for s in chosen))
            rank = (-score["required_courses"], -score["planned_goals"], not plan["travel_complete"],
                    plan["known_cost"], advisory, identifiers)
            kept.append((rank, plan))
            kept.sort(key=lambda value: value[0])
            del kept[top_k:]
            continue
        course = courses[index]
        if course["code"] not in prefs["required_codes"]:
            stack.append((index+1, chosen, credit))
        for section in reversed(course["sections"]):
            if any(_overlaps(a, b) for a in section["meetings"] for s in chosen for b in s["meetings"]):
                stats["pruned_conflict"] += 1
                continue
            chosen_section = {key: course[key] for key in ("code", "name", "credits", "requirement_ids", "requirement_sources", "basis", "priority", "prerequisite_status", "warnings", "frequency", "recommended_year", "recommended_term")}
            chosen_section.update(number=section["number"], meetings=section["meetings"])
            stack.append((index+1, chosen+(chosen_section,), credit+Decimal(str(course["credits"]))))
    if not stats["complete"]:
        issue("search_limit_reached", "탐색한도에 도달했습니다. 찾은 안만 제시하며 최적·불가능을 확정하지 않습니다.")
    if stats["pruned_conflict"]:
        issue("time_conflicts", "모든 회의시간을 대조해 시간이 겹치는 조합을 제외했습니다.")
    plans = []
    for i, (_, plan) in enumerate(kept, 1):
        plan["id"] = i
        plans.append(plan)
    if not plans:
        issue("no_feasible_plan_found", "현재 후보·학점·시간 조건과 탐색 범위에서 유효한 계획을 찾지 못했습니다.")
    elif len(plans) < top_k:
        issue("fewer_than_requested_plans", "요청한 수보다 적은 유효한 계획만 찾았습니다. 실제 찾은 안만 제시합니다.")
    return {"schema_version": 1, "target_term": candidate_result.get("target_term"),
            "source_term": candidate_result.get("source_term"), "estimated": candidate_result.get("estimated", False),
            "plans": plans, "issues": issues, "excluded_sections": excluded, "search": stats}
