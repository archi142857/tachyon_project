"""고정 Research 1.0의 명시 과목목록 대조. 전체 졸업 판정은 하지 않는다."""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from copy import deepcopy
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import sys

from planner.transcript import TranscriptValidationError, normalize_transcript
from scripts.validate_requirements import COURSE_LIST_APPROVED_V1, validate, verify_provenance


DEFAULT_DATA = Path(__file__).resolve().parents[1] / "data" / "requirements" / "2025.json"
RELEASE_SHA256 = "53bfe2612612b45e9a6a443c4846c2238d6a7deb3e5101604b7f60e9e5aff6aa"
SCHEMA_SHA256 = "bd06a52369d3e50af436746ed57989886d6f16d6af7936d86084278c95b3c441"
MESSAGES = {
    "unsupported_entry_year": "2025 입학 연도만 지원합니다. 다른 연도의 요건을 적용하지 않았습니다.",
    "primary_program_unconfirmed": "주전공이 정확히 하나인지 확인이 필요합니다.",
    "unsupported_program": "지원하지 않는 전공명 또는 전공 종류가 있습니다.",
    "duplicate_program": "같은 전공 입력이 반복되어 적용 범위를 확인해야 합니다.",
    "conflicting_program_kind": "같은 전공이 주전공과 복수전공으로 함께 입력됐습니다.",
    "coverage_unconfirmed": "부분 또는 범위 미확인 이수내역입니다. 부족량은 관측값입니다.",
    "multiple_programs_unallocated": "다전공 과목 귀속·공통 인정·실제 승인 정보가 없어 최종 인정은 확인이 필요합니다.",
    "unresolved_course_identity": "과목 연결이 끝나지 않은 행이 있어 누락 여부를 확인해야 합니다.",
    "home_unit_unconfirmed": "주전공 이름만으로 소속·입학경로를 알 수 없습니다. 교양은 참고 묶음입니다.",
    "manual_review": "현재 자료에서 수동 검토로 지정한 항목입니다.",
    "rule_needs_check": "규정 근거 또는 계산 조건의 확인이 남아 있습니다.",
    "unapproved_rule": "이 버전에서 자동 계산을 승인한 항목이 아닙니다.",
    "minimum_unknown": "필수 최소조건이 미확인입니다. null을 0으로 계산하지 않습니다.",
    "empty_course_list": "대조할 과목목록이 없습니다.",
    "course_credit_unknown": "요건 목록의 과목 학점이 미확인입니다.",
    "course_uncertain": "관련 이수 행의 상태·학기·학점·반복 여부에 확인이 필요합니다.",
    "requirement_credit_conflict": "확인된 이수 학점과 규정에 적힌 과목 학점이 다릅니다.",
    "overlap_unresolved": "같은 과목이 여러 요건의 목록에 걸립니다. 중복 인정 근거가 필요합니다.",
    "no_selected_sets": "적용할 수 있는 전공 요건을 선택하지 못했습니다.",
}


class RequirementsValidationError(ValueError):
    """원본 값·파일 내용·임의 필드명을 노출하지 않는 검증 오류."""

    def __init__(self, code, message):
        self.errors = [{"code": code, "path": "requirements", "message": message}]
        super().__init__(json.dumps({"errors": self.errors}, ensure_ascii=False))


def load_requirements(path=DEFAULT_DATA):
    """형식·원본 보존·고정 배포본을 모두 확인한다. 검증 생략 옵션은 없다."""
    path = Path(path)
    try:
        raw = path.read_bytes()
        schema_raw = (path.parent / "schema.json").read_bytes()
        data = json.loads(raw.decode("utf-8-sig"))
        schema = json.loads(schema_raw.decode("utf-8-sig"))
    except (OSError, UnicodeError, ValueError):
        raise RequirementsValidationError("ruleset_read_error", "규정 또는 스키마 파일을 읽을 수 없습니다.") from None
    # Git의 eol=lf와 Windows 작업 사본의 CRLF를 같은 릴리스로 취급한다.
    if hashlib.sha256(schema_raw.replace(b"\r\n", b"\n")).hexdigest() != SCHEMA_SHA256:
        raise RequirementsValidationError("schema_release_mismatch", "고정된 1.0 스키마와 다릅니다.")
    # 고정 버전 밖의 임의 숫자·구조를 검증기에 넘기기 전에 차단한다.
    if hashlib.sha256(raw.replace(b"\r\n", b"\n")).hexdigest() != RELEASE_SHA256:
        raise RequirementsValidationError("ruleset_release_mismatch", "고정된 1.0 자료와 다릅니다. 새 버전 검토가 필요합니다.")
    if validate(data, schema):
        raise RequirementsValidationError("invalid_ruleset", "규정의 형식 또는 자동 계산 조건 검증에 실패했습니다.")
    if verify_provenance(data, path.parent):
        raise RequirementsValidationError("provenance_mismatch", "원본 해시 또는 원본 사실 보존 검사에 실패했습니다.")
    return data


def _number(value):
    return int(value) if value == value.to_integral_value() else float(value)


def _calculate_course_list(item, rows):
    """목록 안의 산술만 계산한다. 공개 규정 승인/적용 검증을 대신하지 않는다."""
    reasons = []
    courses = item["courses"]
    rule = item["rule"]
    min_credits, min_count = item["min_credits"], item["min_count"]
    if not courses:
        reasons.append("empty_course_list")
    if min_credits is None or (rule == "min_count" and min_count is None):
        reasons.append("minimum_unknown")
    if any(c["credits"] is None for c in courses):
        reasons.append("course_credit_unknown")
    if reasons:
        return None, reasons
    expected = {c["code"]: Decimal(str(c["credits"])) for c in courses}
    counted, ongoing, uncertain = {}, set(), set()
    for row in rows:
        code = row["matched_code"]
        relevant = set(row["candidate_codes"]) | {row["code"], code}
        relevant.intersection_update(expected)
        if not relevant:
            continue
        if row["needs_check"] or row["status"] == "unknown":
            uncertain.update(relevant)
            if "course_uncertain" not in reasons:
                reasons.append("course_uncertain")
            continue
        if code not in expected:
            continue
        if Decimal(str(row["credits"])) != expected[code]:
            uncertain.add(code)
            if "requirement_credit_conflict" not in reasons:
                reasons.append("requirement_credit_conflict")
        elif row["status"] == "in_progress":
            ongoing.add(code)
        elif row["countable_completed"]:
            counted[code] = Decimal(str(row["credits"]))
    # 같은 번호의 다른 행이 불확실하면 그 번호를 확정 관측값에서 제외한다.
    for code in uncertain:
        counted.pop(code, None)
        ongoing.discard(code)
    credit = sum(counted.values(), Decimal(0))
    missing = sorted(set(expected) - counted.keys())
    target_count = max(len(expected) if rule == "all" else 0, min_count or 0)
    deficit_count = max(target_count - len(counted), 0) if rule in ("all", "min_count") or min_count is not None else None
    deficit_credits = max(Decimal(str(min_credits)) - credit, Decimal(0))
    satisfied = (not missing if rule == "all" else True) and (deficit_count in (None, 0)) and deficit_credits == 0
    result = {
        "status": "needs_check" if reasons else ("satisfied" if satisfied else "remaining"),
        "counted_codes": sorted(counted), "count": len(counted), "credits": _number(credit),
        "in_progress_codes": sorted(ongoing), "uncertain_codes": sorted(uncertain),
        "missing_codes": missing if rule == "all" else [],
        "candidate_codes": missing if rule != "all" else [],
        "observed_deficit": {"credits": _number(deficit_credits), "count": deficit_count},
    }
    return result, reasons


def _select_sets(data, transcript):
    programs = transcript["programs"]
    reasons = []
    if transcript["entry_year"] != data["basis"]["entry_year"]:
        return [], ["unsupported_entry_year"]
    available = {(s["name"], s["kind"]): s for s in data["sets"] if s["kind"] != "교양"}
    keys = [(p["name"], p["kind"]) for p in programs]
    if len(set(keys)) != len(keys):
        reasons.append("duplicate_program")
    by_name = defaultdict(set)
    for name, kind in keys:
        by_name[name].add(kind)
    if any(len(kinds) > 1 for kinds in by_name.values()):
        reasons.append("conflicting_program_kind")
    primary = [key for key in keys if key[1] == "주전공"]
    if len(primary) != 1:
        reasons.append("primary_program_unconfirmed")
    if any(key not in available for key in keys):
        reasons.append("unsupported_program")
    selected_ids = {available[key]["id"] for key in keys if key in available}
    if len(primary) == 1 and primary[0] in available:
        selected_ids.add("common")
    return [s for s in data["sets"] if s["id"] in selected_ids], reasons


def evaluate_requirements(payload, offerings, *, requirements_path=DEFAULT_DATA):
    """v1 입력을 재정리한 뒤 고정 1.0의 선택 요건과 대조한다."""
    data = load_requirements(requirements_path)
    transcript = normalize_transcript(payload, offerings)
    selected, global_reasons = _select_sets(data, transcript)
    if transcript["coverage"] != "complete":
        global_reasons.append("coverage_unconfirmed")
    programs = {(p["name"], p["kind"]) for p in transcript["programs"]}
    if len(programs) > 1 or any(kind != "주전공" for _, kind in programs):
        global_reasons.append("multiple_programs_unallocated")
    if any(r["matched_code"] is None for r in transcript["courses"]):
        global_reasons.append("unresolved_course_identity")
    if not selected:
        global_reasons.append("no_selected_sets")

    # 명시 목록끼리의 충돌만 찾는다. 문장형 필터를 인정 관계로 파싱하지 않는다.
    membership = defaultdict(set)
    for group in selected:
        for item in group["requirements"]:
            for course in item["courses"]:
                membership[course["code"]].add(item["id"])
    overlap = {code for code, ids in membership.items() if len(ids) > 1}
    completed_codes = {r["matched_code"] for r in transcript["courses"] if r["countable_completed"]}

    groups = []
    for group in selected:
        items = []
        for section in ("requirements", "other_conditions"):
            for item in group[section]:
                reasons = list(global_reasons)
                if group["id"] == "common":
                    reasons.append("home_unit_unconfirmed")
                calculation = None
                if item["needs_check"]:
                    reasons.append("rule_needs_check")
                if item["calculation"]["mode"] == "manual_review":
                    reasons.append("manual_review")
                elif item["id"] not in COURSE_LIST_APPROVED_V1:
                    reasons.append("unapproved_rule")
                elif not item["needs_check"]:
                    calculation, calculation_reasons = _calculate_course_list(item, transcript["courses"])
                    reasons.extend(calculation_reasons)
                    if set(item["calculation"]["selector"]["codes"]) & overlap & completed_codes:
                        reasons.append("overlap_unresolved")
                reasons = list(dict.fromkeys(reasons))
                status = "needs_check" if reasons or calculation is None else calculation["status"]
                remaining = None
                if status != "needs_check":
                    remaining = {**calculation["observed_deficit"], "required_codes": calculation["missing_codes"]}
                items.append({
                    "id": item["id"], "name": item["name"], "section": section,
                    "rule": item.get("rule"), "status": status, "needs_check": status == "needs_check",
                    "min_credits": item.get("min_credits"), "min_count": item.get("min_count"),
                    "reasons": [{"code": code, "message": MESSAGES[code]} for code in reasons],
                    "sources": deepcopy(item["sources"]), "evidence": deepcopy(item["review"]["evidence"]),
                    "original_pointer": item["original_pointer"], "review_status": item["review"]["status"],
                    "calculation_mode": item["calculation"]["mode"],
                    "review_reason": item["review"].get("reason", ""),
                    "calculation_reason": item["calculation"]["reason"],
                    "note": item.get("note", item.get("detail", "")),
                    "calculation": calculation, "remaining": remaining,
                })
        groups.append({
            **{key: group[key] for key in ("id", "name", "kind", "unit", "applies_to", "total_credits")},
            "total_credits_status": "needs_check", "items": items,
        })
    counts = Counter(item["status"] for group in groups for item in group["items"])
    return {
        "schema_version": 1, "evaluation_scope": "approved_course_lists_only",
        "graduation_status": "not_evaluated",
        "ruleset": {"schema_version": data["schema_version"], "sha256": RELEASE_SHA256,
                    "source_sha256": data["provenance"]["sha256"], "basis": deepcopy(data["basis"])},
        **{key: transcript[key] for key in ("entry_year", "programs", "coverage")},
        "transcript_summary": transcript["summary"], "transcript_issues": transcript["issues"],
        "issues": [{"code": code, "message": MESSAGES[code]} for code in global_reasons],
        "sets": groups,
        "summary": {s: counts[s] for s in ("satisfied", "remaining", "needs_check")},
        # 전체 졸업 판정을 하지 않으므로 요건목록이 비어도 확인 필요를 유지한다.
        "needs_check": True,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description="Research 1.0 명시 목록 대조")
    parser.add_argument("transcript", type=Path)
    parser.add_argument("--offerings", nargs="+", type=Path, required=True)
    parser.add_argument("--requirements", type=Path, default=DEFAULT_DATA)
    parser.add_argument("--case")
    args = parser.parse_args(argv)
    try:
        payload = json.loads(args.transcript.read_text(encoding="utf-8-sig"))
        if args.case:
            if not isinstance(payload, dict) or args.case not in payload:
                raise RequirementsValidationError("case_not_found", "가상 사례를 찾지 못했습니다.")
            payload = payload[args.case]
        paths = []
        for path in args.offerings:
            paths.extend(sorted(path.glob("*.json")) if path.is_dir() else [path])
        offerings = [json.loads(path.read_text(encoding="utf-8-sig")) for path in paths]
        result = evaluate_requirements(payload, offerings, requirements_path=args.requirements)
    except (TranscriptValidationError, RequirementsValidationError) as exc:
        print(json.dumps({"errors": exc.errors}, ensure_ascii=False), file=sys.stderr)
        return 2
    except (OSError, ValueError, UnicodeError):
        print(json.dumps({"errors": [{"code": "read_error", "path": "$",
                                     "message": "입력 JSON 파일을 읽을 수 없습니다."}]}, ensure_ascii=False), file=sys.stderr)
        return 2
    print(json.dumps(result, ensure_ascii=False, allow_nan=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
