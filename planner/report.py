"""시간표 JSON·Markdown 및 TT Wizard 링크.

링크 포맷 참고/이식: TT Wizard web/js/app.js (linkPayload/readLinkCode),
commit 693fe91649e3aa6cf0ac244a67d38e259fe62ff2, MIT (저장소 LICENSE 참조).
링크의 세 번째 항목 칸은 색이며 이 프로젝트에서는 null만 사용한다.
교수·학생 식별자·메모를 링크에 넣지 않는다.
"""

from __future__ import annotations

import argparse
import base64
import binascii
from copy import deepcopy
import csv
import html
import json
import math
from pathlib import Path
import re
import sys
from urllib.parse import quote, urlsplit
import zlib

from planner.planning_types import PlanningValidationError
from planner.requirements import DEFAULT_DATA, RequirementsValidationError
from planner.transcript import TranscriptValidationError


LINK_BASE = "https://archi142857.github.io/tt-wizard/"
LINK_MAX = 64 * 1024
DECODED_MAX = 256 * 1024
TERM = re.compile(r"[0-9]{4}-[12SW]\Z")
ATTRIBUTION = "TT Wizard 자료: 캠퍼스 마법 지도·© OpenStreetMap 기여자, 국토지리정보원, 서울대 수강편람"
DAYS = "월화수목금토"


def _fail(code="invalid_report", path="report", message="시간표 결과 형식이 올바르지 않습니다."):
    raise PlanningValidationError(code, path, message)


def _string(value, *, limit=300, empty=False):
    if not isinstance(value, str) or len(value) > limit or (not empty and not value.strip()):
        _fail()
    return value


def _term(value):
    if not isinstance(value, str) or not TERM.fullmatch(value):
        _fail("invalid_term", "semester", "학기 형식이 올바르지 않습니다.")
    return value


def _numeric(value, *, nullable=False):
    if value is None and nullable:
        return None
    if type(value) not in (int, float):
        _fail()
    try:
        if not math.isfinite(value):
            _fail()
    except OverflowError:
        _fail()
    return value


def _validate_link_data(data):
    if not isinstance(data, list) or len(data) != 4 or type(data[0]) is not int or data[0] != 1:
        _fail("invalid_link", "link", "지원하는 시간표 링크 형식이 아닙니다.")
    semester = _term(data[1])
    title = _string(data[2], limit=200, empty=True)
    if not isinstance(data[3], list) or not 1 <= len(data[3]) <= 1000:
        _fail("invalid_link", "link", "시간표 링크의 과목 목록이 올바르지 않습니다.")
    seen, rows = set(), []
    for item in data[3]:
        if not isinstance(item, list) or len(item) != 4 or item[2] is not None:
            _fail("invalid_link", "link", "이 도구의 과목·분반 링크만 복원할 수 있습니다.")
        code, number, _, name = item
        _string(code, limit=128)
        _string(number, limit=32)
        _string(name)
        if code != code.strip() or number != number.strip() or code in seen:
            _fail("invalid_link", "link", "과목·분반 식별자가 비었거나 반복됐습니다.")
        seen.add(code)
        rows.append([code, number, None, name])
    return [1, semester, title, rows]


def encode_timetable_link(plan, semester, title):
    """교수·메모를 넣지 않는 j 형식 링크를 만든다."""
    if not isinstance(plan, dict) or not isinstance(plan.get("sections"), list):
        _fail()
    rows = []
    for section in plan["sections"]:
        if not isinstance(section, dict):
            _fail()
        rows.append([section.get("code"), section.get("number"), None, section.get("name")])
    data = _validate_link_data([1, semester, title, rows])
    raw = json.dumps(data, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")
    code = "j" + base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")
    if len(code) > LINK_MAX:
        _fail("link_too_large", "link", "시간표 링크가 허용 크기를 넘습니다.")
    return LINK_BASE + "#t=" + code


def decode_timetable_link(url):
    """이 프로젝트가 지원하는 TT j/z 링크를 원래 배열로 복원한다."""
    if not isinstance(url, str) or len(url) > LINK_MAX + len(LINK_BASE) + 3:
        _fail("invalid_link", "link", "시간표 링크가 올바르지 않거나 너무 큽니다.")
    try:
        parts = urlsplit(url)
        if (parts.scheme != "https" or parts.netloc != "archi142857.github.io"
                or parts.path != "/tt-wizard/" or parts.query or not parts.fragment.startswith("t=")):
            _fail("invalid_link", "link", "지원하는 TT Wizard 주소가 아닙니다.")
        code = parts.fragment[2:]
        if len(code) > LINK_MAX or not re.fullmatch(r"[jz][A-Za-z0-9_-]+", code):
            _fail("invalid_link", "link", "시간표 링크의 인코딩이 올바르지 않습니다.")
        raw = base64.b64decode(code[1:] + "=" * (-len(code[1:]) % 4), altchars=b"-_", validate=True)
        if code[0] == "z":
            decoder = zlib.decompressobj(wbits=-15)
            raw = decoder.decompress(raw, DECODED_MAX + 1)
            if (len(raw) > DECODED_MAX or decoder.unconsumed_tail or not decoder.eof
                    or decoder.unused_data):
                _fail("invalid_link", "link", "시간표 링크의 압축 내용이 올바르지 않거나 너무 큽니다.")
        if len(raw) > DECODED_MAX:
            _fail("link_too_large", "link", "시간표 링크가 허용 크기를 넘습니다.")
        data = json.loads(raw.decode("utf-8"))
    except (ValueError, UnicodeError, binascii.Error, zlib.error, RecursionError):
        _fail("invalid_link", "link", "시간표 링크를 복원할 수 없습니다.")
    return _validate_link_data(data)


def _messages(values):
    if not isinstance(values, list):
        _fail()
    output = []
    for value in values:
        if isinstance(value, str):
            output.append(_string(value, limit=2000))
        elif isinstance(value, dict):
            output.append({key: _string(value[key], limit=2000, empty=True)
                           for key in ("code", "path", "message", "reason") if key in value})
        else:
            _fail()
    return output


def _json_fields(value, allowed):
    """계산에서 정의한 결과 칸만 전달하며 임의 추가 필드는 제외한다."""
    if not isinstance(value, dict):
        _fail()
    output = {key: deepcopy(value[key]) for key in allowed if key in value}
    try:
        json.dumps(output, ensure_ascii=False, allow_nan=False)
    except (TypeError, ValueError, OverflowError):
        _fail()
    return output


def _clean_plan(plan):
    if not isinstance(plan, dict) or not isinstance(plan.get("sections"), list):
        _fail()
    output = _json_fields(plan, ("id", "credits", "walk_minutes", "shortage_minutes", "cost",
                                "known_walk_minutes", "known_shortage_minutes", "known_cost",
                                "travel_complete", "selection_score"))
    if type(output.get("travel_complete")) is not bool:
        _fail()
    if type(output.get("id")) not in (int, str):
        _fail()
    output["selection_score"] = _json_fields(plan.get("selection_score", {}), ("required_courses", "planned_goals"))
    for field in ("credits", "known_walk_minutes", "known_shortage_minutes", "known_cost"):
        if _numeric(output.get(field)) < 0:
            _fail()
    for field in ("walk_minutes", "shortage_minutes", "cost"):
        value = _numeric(output.get(field), nullable=True)
        if output["travel_complete"] != (value is not None) or (value is not None and value < 0):
            _fail()
    sections, seen = [], set()
    for section in plan["sections"]:
        if not isinstance(section, dict):
            _fail()
        row = {key: _string(section.get(key), limit=300) for key in ("code", "number", "name")}
        if row["code"] in seen:
            _fail("duplicate_course", "report.plans.sections", "같은 과목의 분반이 중복됐습니다.")
        seen.add(row["code"])
        row["credits"] = _numeric(section.get("credits"))
        row["basis"] = _string(section.get("basis", "user_requested"))
        row["prerequisite_status"] = _string(section.get("prerequisite_status", "unknown"))
        if row["prerequisite_status"] != "unknown":
            _fail("unconfirmed_prerequisite", "report.plans.sections", "선수 충족을 확정할 구조화 근거가 없습니다.")
        ids = section.get("requirement_ids", [])
        if not isinstance(ids, list):
            _fail()
        row["requirement_ids"] = [_string(identifier) for identifier in ids]
        raw_sources = section.get("requirement_sources", {})
        if not isinstance(raw_sources, dict):
            _fail()
        row["requirement_sources"] = {}
        for identifier in row["requirement_ids"]:
            sources = raw_sources.get(identifier, [])
            if not isinstance(sources, list):
                _fail()
            clean_sources = []
            for source in sources:
                if not isinstance(source, dict):
                    _fail()
                clean = {key: _string(source.get(key), limit=2000) for key in ("title", "url", "locator")}
                try:
                    url = urlsplit(clean["url"])
                    if url.scheme not in ("http", "https") or not url.netloc or url.username or url.password or any(c.isspace() for c in clean["url"]):
                        _fail()
                except ValueError:
                    _fail()
                clean_sources.append(clean)
            row["requirement_sources"][identifier] = clean_sources
        row["frequency"] = None
        frequency = section.get("frequency")
        if frequency is not None:
            clean = _json_fields(frequency, ("years_offered", "window_years", "observed_years", "missing_years"))
            if type(clean.get("years_offered")) is not int or not 0 <= clean["years_offered"] <= 5:
                _fail()
            for key in ("window_years", "observed_years", "missing_years"):
                if not isinstance(clean.get(key), list) or any(type(year) is not int or not 0 <= year <= 9999 for year in clean[key]):
                    _fail()
            row["frequency"] = clean
        for key, maximum in (("recommended_year", 8), ("recommended_term", 2)):
            value = section.get(key)
            if value is not None and (type(value) is not int or not 1 <= value <= maximum):
                _fail()
            row[key] = value
        row["warnings"] = _messages(section.get("warnings", []))
        if not isinstance(section.get("meetings"), list) or not section["meetings"]:
            _fail()
        row["meetings"] = []
        for meeting in section["meetings"]:
            if not isinstance(meeting, dict):
                _fail()
            day, start, end = (meeting.get(key) for key in ("day", "start", "end"))
            if any(type(v) is not int for v in (day, start, end)) or not (0 <= day <= 5 and 0 <= start < end <= 1440):
                _fail()
            row["meetings"].append({"day": day, "start": start, "end": end,
                                    "building": _string(meeting.get("building", ""), empty=True),
                                    "room": _string(meeting.get("room", ""), empty=True)})
        sections.append(row)
    if not sections:
        _fail()
    output["sections"] = sections
    days = {}
    for section in sections:
        for meeting in section["meetings"]:
            days.setdefault(str(meeting["day"]), []).append({**meeting, "code": section["code"],
                                                           "number": section["number"], "name": section["name"]})
    output["days"] = {day: sorted(rows, key=lambda row: (row["start"], row["end"], row["code"]))
                      for day, rows in sorted(days.items())}
    for rows in output["days"].values():
        if any(a["end"] > b["start"] for a, b in zip(rows, rows[1:])):
            _fail("time_overlap", "report.plans.sections", "시간이 겹친 계획은 보고할 수 없습니다.")
    legs = plan.get("legs", [])
    if not isinstance(legs, list):
        _fail()
    output["legs"] = []
    for leg in legs:
        clean = _json_fields(leg, ("day", "from", "to", "depart", "arrive_by", "minutes", "slack", "shortage", "status"))
        if type(clean.get("day")) is not int or not 0 <= clean["day"] <= 5:
            _fail()
        for key in ("from", "to"):
            clean[key] = _string(clean.get(key) or "", empty=True)
        for key in ("depart", "arrive_by", "minutes", "slack", "shortage"):
            _numeric(clean.get(key), nullable=True)
        if clean.get("status") not in ("known", "unknown_location", "missing_walk_time"):
            _fail()
        if clean["status"] != "known" and any(clean.get(key) is not None for key in ("minutes", "slack", "shortage")):
            _fail()
        output["legs"].append(clean)
    output["warnings"] = _messages(plan.get("warnings", []))
    warning_ids = {warning.get("code") if isinstance(warning, dict) else warning
                   for warning in output["warnings"]}
    for section in sections:
        for warning in section["warnings"]:
            identifier = warning.get("code") if isinstance(warning, dict) else warning
            if identifier not in warning_ids and warning not in output["warnings"]:
                output["warnings"].append(warning)
                warning_ids.add(identifier)
    goals = plan.get("goal_progress", [])
    if not isinstance(goals, list):
        _fail()
    output["goal_progress"] = [_json_fields(goal, ("id", "kind", "status", "count", "credits",
                                                    "required_count", "required_credits", "missing_codes",
                                                    "selected_codes", "planned_codes", "planned_count",
                                                    "planned_credits", "covered", "all_codes", "min_count",
                                                    "min_credits", "satisfied", "remaining_count",
                                                    "remaining_credits")) for goal in goals]
    return output


def _escape(value):
    value = html.escape(str(value), quote=False).replace("\r", " ").replace("\n", " ")
    return re.sub(r"([\\`*_{}\[\]#|])", r"\\\1", value)


def _minute(value):
    if value is None:
        return "—"
    return f"{value // 60:02d}:{value % 60:02d}"


def _amount(value):
    return "확인 필요" if value is None else f"{value:g}"


def _message(value):
    if isinstance(value, dict):
        return value.get("message") or value.get("reason") or value.get("code", "확인 필요")
    return value


def build_report(search_result):
    """검사된 계획만 최대3개 표시한다. 입력 객체를 바꾸지 않는다."""
    if not isinstance(search_result, dict) or not isinstance(search_result.get("plans"), list):
        _fail()
    if len(search_result["plans"]) > 3:
        _fail("too_many_plans", "report.plans", "보고 가능한 계획은 최대3개입니다.")
    target = _term(search_result.get("target_term"))
    source = search_result.get("source_term")
    if source is not None:
        _term(source)
    estimated = search_result.get("estimated")
    if type(estimated) is not bool or (search_result["plans"] and source is None):
        _fail()
    if source is not None and estimated != (target != source):
        _fail("inconsistent_estimate", "report.estimated", "예상 표시와 참조 학기가 일치하지 않습니다.")
    if not isinstance(search_result.get("excluded_sections", []), list):
        _fail()
    output = {"schema_version": 1, "target_term": target, "source_term": source, "estimated": estimated,
              "plans": [], "issues": _messages(search_result.get("issues", [])),
              "excluded_sections": [_json_fields(s, ("code", "number", "reason", "reason_code", "message"))
                                    for s in search_result.get("excluded_sections", [])],
              "search": _json_fields(search_result.get("search", {}),
                                     ("complete", "nodes", "max_nodes", "feasible_count", "evaluated",
                                      "pruned_conflict", "pruned_credits", "candidate_count", "top_k",
                                      "combinations", "returned_count", "valid_count", "considered",
                                      "pruned_credit", "n_candidates", "ranking")),
              "attribution": ATTRIBUTION}
    lines = [f"# {target} 시간표 후보" + (" — 예상" if estimated else ""), "",
             f"찾은 안: {len(search_result['plans'])}개. 실제 수강 신청·졸업 인정은 별도 확인이 필요합니다.", ""]
    if estimated:
        lines += [f"{target}의 확정 편람이 없어 {source or '미확보'} 자료를 참조한 예상입니다. 링크도 참조 학기의 분반을 엽니다.", ""]
    if not search_result["plans"]:
        lines += ["현재 조건에서 제시할 시간표가 없습니다.", ""]
    if output["search"].get("complete") is not True:
        lines += ["탐색을 끝내지 못했습니다. 찾은 안만 표시하며 전체 최적 또는 불가능을 확정하지 않습니다.", ""]
    for index, raw in enumerate(search_result["plans"], 1):
        plan = _clean_plan(raw)
        title = f"{target} {'예상 ' if estimated else ''}시간표 {index}"
        plan["tt_link"] = encode_timetable_link(plan, source, title)
        plan["link_term"] = source
        output["plans"].append(plan)
        lines += [f"## {index}안 — {_amount(plan['credits'])}학점", "",
                  f"[TT Wizard에서 열기]({plan['tt_link']}) · 링크 학기: {source}", ""]
        if plan["travel_complete"]:
            lines += [f"주간 걷기 {_amount(plan['walk_minutes'])}분 · 이동 부족 {_amount(plan['shortage_minutes'])}분 · 비용 {_amount(plan['cost'])}", ""]
        else:
            lines += ["이동 경로가 미확인이라 주간 걷기·부족 시간·비용 총계는 확인 필요입니다.",
                      f"알려진 구간만: 걷기 {_amount(plan['known_walk_minutes'])}분 · 부족 {_amount(plan['known_shortage_minutes'])}분 · 부분 비용 {_amount(plan['known_cost'])}", ""]
        lines += ["| 요일 | 시간 | 과목 · 분반 | 건물 · 강의실 |", "| --- | --- | --- | --- |"]
        for day, meetings in plan["days"].items():
            for meeting in meetings:
                room = (meeting["building"] or "건물 미정") + " · " + (meeting["room"] or "강의실 미정")
                lines.append(f"| {DAYS[int(day)]} | {_minute(meeting['start'])}–{_minute(meeting['end'])} | {_escape(meeting['name'])} · {_escape(meeting['number'])} | {_escape(room)} |")
        lines += ["", "과목 선택 근거:", ""]
        for section in plan["sections"]:
            basis = {"remaining_requirement": "남은 명시 목록", "reference_requirement": "확인 필요 목록의 참고 후보",
                     "user_requested": "사용자 선택"}.get(section["basis"], "확인 필요")
            ids = ", ".join(section["requirement_ids"]) or "연결 요건 없음"
            lines.append(f"- {_escape(section['name'])}: {basis} · {_escape(ids)}")
            for identifier, sources in section["requirement_sources"].items():
                for source_doc in sources:
                    safe_url = quote(source_doc["url"], safe=":/?#[]@!$&'()*+,;=%")
                    lines.append(f"- 근거 문서 ({_escape(identifier)}): [{_escape(source_doc['title'])}](<{safe_url}>) · {_escape(source_doc['locator'])}")
            frequency = section["frequency"]
            if frequency is not None:
                missing = ", ".join(map(str, frequency["missing_years"])) or "없음"
                lines.append(f"- 개설 이력 참고: 목표연도 직전 5년 같은 학기 중 {frequency['years_offered']}년 개설 · 자료 없는 해: {missing}. 개설 확률은 아닙니다.")
            if section["recommended_year"] is not None or section["recommended_term"] is not None:
                lines.append(f"- 권장 시기 참고: {_amount(section['recommended_year'])}학년 · {_amount(section['recommended_term'])}학기. 수강 자격을 확정하지 않습니다.")
        if plan["legs"]:
            lines += ["", "| 요일 | 경로 | 이동 | 여유 | 부족 |", "| --- | --- | ---: | ---: | ---: |"]
            for leg in plan["legs"]:
                day = leg.get("day")
                if type(day) is not int or not 0 <= day <= 5:
                    _fail()
                minutes = _numeric(leg.get("minutes"), nullable=True)
                slack = _numeric(leg.get("slack"), nullable=True)
                shortage = _numeric(leg.get("shortage"), nullable=True)
                route = f"{leg.get('from') or '미정'} → {leg.get('to') or '미정'}"
                qualifier = " · 빠듯함" if shortage is not None and shortage > 0 else ""
                slack_text = "—" if minutes is not None and slack is None else _amount(slack)
                lines.append(f"| {DAYS[day]} | {_escape(route)} | {_amount(minutes)} | {slack_text} | {_amount(shortage)}{qualifier} |")
        if plan["goal_progress"]:
            lines += ["", "계획상 목록 배치(실제 취득·졸업 충족 아님):", ""]
            for goal in plan["goal_progress"]:
                status = {"planned": "계획상 목록 배치", "not_planned": "계획상 목록 미충족",
                          "needs_check": "확인 필요"}.get(goal.get("status"), "계획 대조")
                count, credit = goal.get("count"), goal.get("credits")
                details = f" · {_amount(count)}과목 · {_amount(credit)}학점" if count is not None and credit is not None else ""
                lines.append(f"- {_escape(goal.get('id', '목록'))}: {status}{details}")
        if plan["warnings"]:
            lines += ["", *[f"- {_escape(_message(warning))}" for warning in plan["warnings"]]]
        lines += [""]
    if output["issues"]:
        lines += ["확인 사항·안이 부족한 이유:", "", *[f"- {_escape(_message(issue))}" for issue in output["issues"]], ""]
    if output["excluded_sections"]:
        lines += [f"조건 또는 자료 문제로 제외한 분반: {len(output['excluded_sections'])}개.", ""]
    lines.append(ATTRIBUTION)
    return {"json": output, "markdown": "\n".join(lines) + "\n"}


def recommend_timetables(payload, offerings, walk_rows, *, target_term, preferences=None, requirements_path=DEFAULT_DATA):
    """후보 선정→시간표 탐색→보고를 연결한다."""
    from planner.courses import build_candidates
    from planner.timetable import search_timetables

    candidates = build_candidates(payload, offerings, target_term=target_term, preferences=preferences,
                                  requirements_path=requirements_path)
    return build_report(search_timetables(candidates, walk_rows))


def main(argv=None):
    parser = argparse.ArgumentParser(description="이수내역에서 시간표 후보·이동 보고 생성")
    parser.add_argument("--transcript", required=True, type=Path)
    parser.add_argument("--offerings", required=True, nargs="+", type=Path)
    parser.add_argument("--walk", required=True, type=Path)
    parser.add_argument("--target-term", required=True)
    parser.add_argument("--preferences", type=Path)
    parser.add_argument("--requirements", type=Path, default=DEFAULT_DATA)
    parser.add_argument("--format", choices=("json", "markdown"), default="json")
    args = parser.parse_args(argv)
    try:
        payload = json.loads(args.transcript.read_text(encoding="utf-8-sig"))
        preferences = json.loads(args.preferences.read_text(encoding="utf-8-sig")) if args.preferences else None
        paths = []
        for path in args.offerings:
            paths.extend(sorted(path.glob("*.json")) if path.is_dir() else [path])
        offerings = [json.loads(path.read_text(encoding="utf-8-sig")) for path in paths]
        with args.walk.open(encoding="utf-8-sig", newline="") as stream:
            walks = list(csv.DictReader(stream))
        report = recommend_timetables(payload, offerings, walks, target_term=args.target_term,
                                      preferences=preferences, requirements_path=args.requirements)
    except (PlanningValidationError, TranscriptValidationError, RequirementsValidationError) as exc:
        print(json.dumps({"errors": exc.errors}, ensure_ascii=False), file=sys.stderr)
        return 2
    except (OSError, ValueError, UnicodeError):
        print(json.dumps({"errors": [{"code": "read_error", "path": "$",
                                     "message": "입력 파일을 읽을 수 없습니다."}]}, ensure_ascii=False), file=sys.stderr)
        return 2
    print(json.dumps(report["json"], ensure_ascii=False, allow_nan=False, indent=2) if args.format == "json" else report["markdown"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
