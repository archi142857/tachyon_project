"""개인정보 없는 이수내역 정리. 계약은 transcript_format.md 참조."""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from decimal import Decimal
import json
import math
from pathlib import Path
import re
import sys
import unicodedata


MESSAGES = {
    "coverage_unconfirmed": "전체 이수내역인지 확인이 필요합니다.",
    "programs_missing": "적용할 전공 정보가 없습니다.",
    "status_unknown": "취득 완료 또는 수강 중인지 확인이 필요합니다.",
    "term_missing": "이수 학기가 없습니다.",
    "credits_missing": "이수 학점이 없습니다.",
    "category_missing": "학생에게 적용되는 이수구분이 없습니다.",
    "code_not_found": "과목번호를 개설 자료에서 찾지 못했습니다.",
    "name_not_found": "과목명을 개설 자료에서 찾지 못했습니다.",
    "name_ambiguous": "같은 이름으로 연결되는 과목번호가 여러 개입니다.",
    "term_not_in_catalog": "해당 이수 학기의 개설 기록을 확인하지 못했습니다.",
    "name_conflict": "입력 번호의 과목명과 개설 자료의 과목명이 다릅니다.",
    "credits_conflict": "입력 학점과 개설 기록이 다르거나 개설 기록끼리 충돌합니다.",
    "repeated_course": "같은 과목의 반복 기록입니다. 재수강·중복 여부를 확인하세요.",
}
TERM = re.compile(r"[0-9]{4}-[12SW]\Z")
STATUSES = {
    "completed": "completed", "취득 완료": "completed",
    "in_progress": "in_progress", "수강 중": "in_progress",
    "unknown": "unknown", "미확인": "unknown",
}
ROMAN = dict(zip(
    ("I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"),
    map(str, range(1, 13)),
))


class TranscriptValidationError(ValueError):
    """원래 값과 불필요한 필드명을 포함하지 않는 입력 오류."""

    def __init__(self, errors):
        self.errors = errors
        super().__init__(json.dumps({"errors": errors}, ensure_ascii=False))


def _fail(path, message, code="invalid_input"):
    raise TranscriptValidationError([{"code": code, "path": path, "message": message}])


def _text(value, path, *, required=False):
    if value is None:
        value = ""
    if not isinstance(value, str):
        _fail(path, "문자열 또는 null이어야 합니다.")
    value = value.strip()
    if required and not value:
        _fail(path, "비어 있지 않은 문자열이 필요합니다.")
    return value or None


def _credits(value, path, *, required=False):
    if value is None and not required:
        return None
    if (type(value) not in (int, float)
            or (isinstance(value, float) and not math.isfinite(value)) or value < 0):
        _fail(path, "0 이상의 유한 숫자 학점이 필요합니다.")
    return value


def normalize_name(name):
    """괄호 내용은 보존한다. 영단어 끝 I/V/X는 숫자로 바꾸지 않는다."""
    value = unicodedata.normalize("NFKC", name)
    value = re.sub(r"[()\[\]{}]", " ", value).strip()
    value = re.sub(
        r"(?<![A-Za-z])([IVXivx]+)$",
        lambda m: ROMAN.get(m[1].upper(), m[1]), value,
    )
    return re.sub(r"\s+", "", value).casefold()


def _catalog(offerings):
    if not isinstance(offerings, (list, tuple)):
        _fail("offerings", "개설 자료 문서 목록이 필요합니다.")
    records = []
    for i, document in enumerate(offerings):
        path = f"offerings[{i}]"
        if not isinstance(document, dict) or not isinstance(document.get("meta"), dict):
            _fail(path, "meta가 있는 개설 자료 객체가 필요합니다.")
        semester = _text(document["meta"].get("semester"), path + ".meta.semester", required=True)
        if not TERM.fullmatch(semester):
            _fail(path + ".meta.semester", "YYYY-1/2/S/W 형식이 필요합니다.")
        if not isinstance(document.get("courses"), list):
            _fail(path + ".courses", "과목 목록이 필요합니다.")
        for j, course in enumerate(document["courses"]):
            row_path = f"{path}.courses[{j}]"
            if not isinstance(course, list) or len(course) != 6:
                _fail(row_path, "교수 열이 없는 6칸 개설 자료가 필요합니다.")
            code = _text(course[0], row_path + ".code", required=True)
            name = _text(course[1], row_path + ".name", required=True)
            credit = _credits(course[3], row_path + ".credits", required=True)
            records.append((code, normalize_name(name), credit, semester))
    return records


def _input(payload):
    if not isinstance(payload, dict):
        _fail("$", "이수내역 객체가 필요합니다.")
    version = payload.get("schema_version", 1)
    if type(version) is not int or version != 1:
        _fail("schema_version", "지원하는 형식 버전은 1입니다.")
    year = payload.get("entry_year")
    if type(year) is not int or not 1000 <= year <= 9999:
        _fail("entry_year", "입학 연도는 네 자리 정수여야 합니다.")
    programs = payload.get("programs")
    if not isinstance(programs, list):
        _fail("programs", "전공 목록이 필요합니다.")
    clean_programs = []
    for i, program in enumerate(programs):
        if not isinstance(program, dict):
            _fail(f"programs[{i}]", "전공 객체가 필요합니다.")
        clean_programs.append({key: _text(program.get(key), f"programs[{i}].{key}", required=True)
                               for key in ("name", "kind")})
    coverage = payload.get("coverage", "unknown")
    if not isinstance(coverage, str) or coverage not in ("complete", "partial", "unknown"):
        _fail("coverage", "complete, partial, unknown 중 하나여야 합니다.")
    if not isinstance(payload.get("courses"), list):
        _fail("courses", "이수 과목 목록이 필요합니다.")
    courses = []
    for i, course in enumerate(payload["courses"]):
        path = f"courses[{i}]"
        if not isinstance(course, dict):
            _fail(path, "이수 과목 객체가 필요합니다.")
        row = {key: _text(course.get(key), f"{path}.{key}")
               for key in ("code", "name", "category", "term")}
        if not row["code"] and not row["name"]:
            _fail(path, "과목번호 또는 과목명이 필요합니다.")
        if row["term"] and not TERM.fullmatch(row["term"]):
            _fail(path + ".term", "YYYY-1/2/S/W 형식이 필요합니다.")
        row["credits"] = _credits(course.get("credits"), path + ".credits")
        status = _text(course.get("status"), path + ".status")
        row["status"] = STATUSES.get(status, "unknown")
        row.update(row=i, matched_code=None, match_method="unmatched",
                   candidate_codes=[], issues=[])
        courses.append(row)
    return year, clean_programs, coverage, courses


def normalize_transcript(payload, offerings):
    """정리된 새 dict를 반환한다. 원본 저장·성적 추론·졸업요건 판정은 하지 않는다."""
    year, programs, coverage, courses = _input(payload)
    records = _catalog(offerings)
    by_code, by_name = defaultdict(list), defaultdict(list)
    for record in records:
        by_code[record[0]].append(record)
        by_name[record[1]].append(record)
    issues = []

    def issue(code, path, row=None):
        issues.append({"code": code, "path": path, "message": MESSAGES[code]})
        if row is not None:
            row["issues"].append(code)

    if coverage != "complete":
        issue("coverage_unconfirmed", "coverage")
    if not programs:
        issue("programs_missing", "programs")
    for row in courses:
        path = f"courses[{row['row']}]"
        if row["status"] == "unknown":
            issue("status_unknown", path + ".status", row)
        for key in ("term", "credits", "category"):
            if row[key] is None:
                issue(key + "_missing", path + "." + key, row)
        if row["code"]:
            candidates = by_code.get(row["code"], [])
            method = "code"
        else:
            candidates = by_name.get(normalize_name(row["name"]), [])
            method = "name"
        in_term = [c for c in candidates if c[3] == row["term"]]
        selected = in_term or candidates
        codes = sorted({c[0] for c in selected})
        row["candidate_codes"] = codes
        if not codes:
            issue("code_not_found" if method == "code" else "name_not_found", path, row)
        elif len(codes) > 1:
            row["match_method"] = "ambiguous"
            issue("name_ambiguous", path, row)
        else:
            row["matched_code"] = codes[0]
            row["match_method"] = method
            # 이름으로 후보를 좁힌 뒤에도 같은 번호의 전체 기록에서 충돌을 검사한다.
            all_code = by_code[codes[0]]
            same_term = [c for c in all_code if c[3] == row["term"]]
            selected = same_term or all_code
            if row["term"] and not same_term:
                issue("term_not_in_catalog", path + ".term", row)
            if row["name"] and normalize_name(row["name"]) not in {c[1] for c in selected}:
                issue("name_conflict", path + ".name", row)
            credits = {Decimal(str(c[2])) for c in selected}
            if len(credits) != 1 or (row["credits"] is not None
                                    and Decimal(str(row["credits"])) not in credits):
                issue("credits_conflict", path + ".credits", row)

    repeated = defaultdict(list)
    for row in courses:
        code = row["matched_code"] or row["code"]
        key = ("code", code) if code else ("name", normalize_name(row["name"]))
        repeated[key].append(row)
    for rows in repeated.values():
        if len(rows) > 1:
            for row in rows:
                issue("repeated_course", f"courses[{row['row']}]", row)
    for row in courses:
        row["needs_check"] = bool(row["issues"])
        row["countable_completed"] = row["status"] == "completed" and not row["needs_check"]

    def total(status):
        value = sum((Decimal(str(r["credits"])) for r in courses
                     if r["status"] == status and not r["needs_check"]), Decimal(0))
        return int(value) if value == value.to_integral_value() else float(value)

    counts = Counter(r["status"] for r in courses)
    return {
        "schema_version": 1, "entry_year": year, "programs": programs,
        "coverage": coverage, "courses": courses,
        "summary": {
            "course_count": len(courses),
            "status_counts": {s: counts[s] for s in ("completed", "in_progress", "unknown")},
            "confirmed_completed_credits": total("completed"),
            "in_progress_credits": total("in_progress"),
            "held_completed_rows": sum(r["status"] == "completed" and r["needs_check"] for r in courses),
        },
        "issues": issues, "needs_check": bool(issues),
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description="개인정보 없는 이수내역 JSON 정리")
    parser.add_argument("transcript", type=Path)
    parser.add_argument("--offerings", type=Path, nargs="+", required=True)
    parser.add_argument("--case", help="가상 예시 묶음의 사례 키")
    args = parser.parse_args(argv)
    try:
        payload = json.loads(args.transcript.read_text(encoding="utf-8-sig"))
        if args.case:
            if not isinstance(payload, dict) or args.case not in payload:
                _fail("case", "예시 묶음에서 사례를 찾지 못했습니다.")
            payload = payload[args.case]
        paths = []
        for path in args.offerings:
            paths.extend(sorted(path.glob("*.json")) if path.is_dir() else [path])
        offerings = [json.loads(path.read_text(encoding="utf-8-sig")) for path in paths]
        result = normalize_transcript(payload, offerings)
    except TranscriptValidationError as exc:
        print(json.dumps({"errors": exc.errors}, ensure_ascii=False), file=sys.stderr)
        return 2
    except (OSError, UnicodeError, ValueError):
        print(json.dumps({"errors": [{"code": "read_error", "path": "$",
                                     "message": "입력 또는 개설 JSON 파일을 읽을 수 없습니다."}]},
                         ensure_ascii=False), file=sys.stderr)
        return 2
    print(json.dumps(result, ensure_ascii=False, allow_nan=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
