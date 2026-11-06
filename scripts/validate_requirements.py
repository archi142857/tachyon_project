"""Validate requirement structure and conservative calculation eligibility.

Standard library only. This is a deliberately limited JSON Schema interpreter;
unsupported keywords are errors, never silently ignored. Passing this program
does not establish that a university rule is factually correct.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import re
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SCHEMA = ROOT / "data" / "requirements" / "schema.json"
DEFAULT_DATA = ROOT / "data" / "requirements" / "2025.json"
CODE = re.compile(r"^[A-Z]?[0-9]+\.[0-9]+[A-Z]?$")
# Version 1.0 only: these five rules were individually reviewed for conversion.
# Shape alone cannot prove that a prose note has no unmodelled timing condition.
# Expanding this set requires a fresh rule review and a versioned contract change.
COURSE_LIST_APPROVED_V1 = frozenset({
    "biology-main-R06", "biology-double-R05", "chemical-main-R03",
    "chemical-main-R04", "chemical-main-R05",
})
KEYWORDS = {
    "$ref", "$defs", "$schema", "$id", "title", "description", "type",
    "enum", "const", "properties", "required", "additionalProperties",
    "items", "minItems", "maxItems", "minimum", "maximum", "minLength",
    "pattern", "anyOf",
}
TYPES = {"object", "array", "string", "number", "integer", "boolean", "null"}


def _numeric(value: Any) -> bool:
    return type(value) in (int, float) and math.isfinite(value)


def _is_type(value: Any, kind: str) -> bool:
    if kind == "number":
        return _numeric(value)
    if kind == "integer":
        return _numeric(value) and int(value) == value
    return {
        "object": isinstance(value, dict),
        "array": isinstance(value, list),
        "string": isinstance(value, str),
        "boolean": type(value) is bool,
        "null": value is None,
    }.get(kind, False)


def _equal(left: Any, right: Any) -> bool:
    """JSON equality, with booleans distinct from numeric zero/one."""
    if type(left) is bool or type(right) is bool:
        return type(left) is type(right) and left == right
    if isinstance(left, dict) and isinstance(right, dict):
        return left.keys() == right.keys() and all(_equal(v, right[k]) for k, v in left.items())
    if isinstance(left, list) and isinstance(right, list):
        return len(left) == len(right) and all(_equal(a, b) for a, b in zip(left, right))
    return left == right


def _resolve(root: dict, ref: str) -> Any:
    if not isinstance(ref, str) or not ref.startswith("#/$defs/"):
        raise ValueError("only local #/$defs/ references are supported")
    value: Any = root
    for token in ref[2:].split("/"):
        token = token.replace("~1", "/").replace("~0", "~")
        if not isinstance(value, dict) or token not in value:
            raise ValueError(f"unresolved schema reference: {ref}")
        value = value[token]
    return value


def _schema_errors(schema: Any, root: dict, path: str = "$schema") -> list[str]:
    if isinstance(schema, bool):
        return []
    if not isinstance(schema, dict):
        return [f"{path}: schema must be an object or boolean"]
    errors = [f"{path}: unsupported schema keyword {key!r}" for key in schema if key not in KEYWORDS]
    if "$ref" in schema:
        try:
            _resolve(root, schema["$ref"])
        except ValueError as exc:
            errors.append(f"{path}: {exc}")
    if "type" in schema:
        kinds = schema["type"] if isinstance(schema["type"], list) else [schema["type"]]
        if not kinds or any(not isinstance(k, str) or k not in TYPES for k in kinds):
            errors.append(f"{path}: invalid schema type")
    for key in ("$defs", "properties"):
        if key in schema:
            if not isinstance(schema[key], dict):
                errors.append(f"{path}.{key}: expected object")
            else:
                for name, child in schema[key].items():
                    errors.extend(_schema_errors(child, root, f"{path}.{key}.{name}"))
    for key in ("items", "additionalProperties"):
        if key in schema:
            errors.extend(_schema_errors(schema[key], root, f"{path}.{key}"))
    if "anyOf" in schema:
        if not isinstance(schema["anyOf"], list) or not schema["anyOf"]:
            errors.append(f"{path}.anyOf: expected nonempty array")
        else:
            for i, child in enumerate(schema["anyOf"]):
                errors.extend(_schema_errors(child, root, f"{path}.anyOf[{i}]"))
    if "required" in schema and (
        not isinstance(schema["required"], list)
        or any(not isinstance(key, str) for key in schema["required"])
    ):
        errors.append(f"{path}.required: expected array of strings")
    if "enum" in schema and (not isinstance(schema["enum"], list) or not schema["enum"]):
        errors.append(f"{path}.enum: expected nonempty array")
    for key in ("minItems", "maxItems", "minLength"):
        if key in schema and (type(schema[key]) is not int or schema[key] < 0):
            errors.append(f"{path}.{key}: expected nonnegative integer")
    for key in ("minimum", "maximum"):
        if key in schema and not _numeric(schema[key]):
            errors.append(f"{path}.{key}: expected finite number")
    if "pattern" in schema:
        try:
            if not isinstance(schema["pattern"], str):
                raise TypeError("pattern must be a string")
            re.compile(schema["pattern"])
        except (re.error, TypeError) as exc:
            errors.append(f"{path}.pattern: {exc}")
    return errors


def _check(value: Any, schema: Any, root: dict, path: str = "$", depth: int = 0) -> list[str]:
    if depth > 100:
        return [f"{path}: schema reference nesting limit exceeded"]
    if schema is True:
        return []
    if schema is False:
        return [f"{path}: value is forbidden"]
    errors: list[str] = []
    if "$ref" in schema:
        errors.extend(_check(value, _resolve(root, schema["$ref"]), root, path, depth + 1))
    if "type" in schema:
        kinds = schema["type"] if isinstance(schema["type"], list) else [schema["type"]]
        if not any(_is_type(value, kind) for kind in kinds):
            return errors + [f"{path}: expected type {schema['type']!r}"]
    if "const" in schema and not _equal(value, schema["const"]):
        errors.append(f"{path}: does not match const")
    if "enum" in schema and not any(_equal(value, option) for option in schema["enum"]):
        errors.append(f"{path}: value is not in enum")
    if "anyOf" in schema and not any(not _check(value, child, root, path, depth + 1) for child in schema["anyOf"]):
        errors.append(f"{path}: no anyOf alternative matches")
    if isinstance(value, dict):
        props = schema.get("properties", {})
        for key in schema.get("required", []):
            if key not in value:
                errors.append(f"{path}: missing required property {key!r}")
        for key, child in value.items():
            if key in props:
                errors.extend(_check(child, props[key], root, f"{path}.{key}", depth + 1))
            elif "additionalProperties" in schema:
                errors.extend(_check(child, schema["additionalProperties"], root, f"{path}.{key}", depth + 1))
    if isinstance(value, list):
        for key, fails in (("minItems", lambda n: len(value) < n), ("maxItems", lambda n: len(value) > n)):
            if key in schema and fails(schema[key]):
                errors.append(f"{path}: violates {key}={schema[key]}")
        if "items" in schema:
            for i, child in enumerate(value):
                errors.extend(_check(child, schema["items"], root, f"{path}[{i}]", depth + 1))
    if isinstance(value, str):
        if "minLength" in schema and len(value) < schema["minLength"]:
            errors.append(f"{path}: violates minLength")
        if "pattern" in schema and re.search(schema["pattern"], value) is None:
            errors.append(f"{path}: does not match pattern")
    if _numeric(value):
        if "minimum" in schema and value < schema["minimum"]:
            errors.append(f"{path}: below minimum")
        if "maximum" in schema and value > schema["maximum"]:
            errors.append(f"{path}: above maximum")
    elif type(value) is float and not math.isfinite(value):
        errors.append(f"{path}: nonfinite number is not valid JSON")
    return errors


def _semantics(data: Any) -> list[str]:
    if not isinstance(data, dict) or not isinstance(data.get("sets"), list):
        return ["$: requires a sets array"]
    errors: list[str] = []
    sets = data["sets"]
    expected = [("학사과정 공통 및 조사대상 세 전공 공통 교양", "교양")]
    expected += [(name, kind) for name in ("동물생명공학전공", "생명과학부", "화학생물공학부") for kind in ("주전공", "복수전공")]
    actual = [(s.get("name"), s.get("kind")) for s in sets if isinstance(s, dict)]
    if len(actual) != 7 or sorted(actual, key=str) != sorted(expected, key=str):
        errors.append("$.sets: expected exactly the seven named 2025 requirement sets")
    ids: set[str] = set()

    def check_id(item: dict, path: str) -> None:
        identifier = item.get("id")
        if not isinstance(identifier, str) or not identifier.strip():
            errors.append(f"{path}.id: nonempty id required")
        elif identifier in ids:
            errors.append(f"{path}.id: duplicate id {identifier}")
        else:
            ids.add(identifier)

    for si, group in enumerate(sets):
        if not isinstance(group, dict):
            errors.append(f"$.sets[{si}]: expected object")
            continue
        sp = f"$.sets[{si}]"
        check_id(group, sp)
        for section in ("requirements", "other_conditions"):
            items = group.get(section)
            if not isinstance(items, list):
                errors.append(f"{sp}.{section}: expected array")
                continue
            for ri, item in enumerate(items):
                path = f"{sp}.{section}[{ri}]"
                if not isinstance(item, dict):
                    errors.append(f"{path}: expected object")
                    continue
                check_id(item, path)
                needs = item.get("needs_check")
                draft = item.get("draft_needs_check")
                review = item.get("review", {})
                calc = item.get("calculation", {})
                if type(needs) is not bool or type(draft) is not bool:
                    errors.append(f"{path}: needs_check and draft_needs_check must be boolean")
                if draft is True and needs is not True:
                    errors.append(f"{path}: original draft needs_check must be retained")
                if not isinstance(review, dict) or not isinstance(calc, dict):
                    errors.append(f"{path}: review and calculation must be objects")
                    continue
                if needs is False and (
                    review.get("status") != "confirmed"
                    or not isinstance(item.get("sources"), list) or not item["sources"]
                    or not isinstance(review.get("evidence"), list) or not review["evidence"]
                ):
                    errors.append(f"{path}: needs_check=false requires confirmed review, sources and evidence")
                if calc.get("mode") == "manual_review" and needs is not True:
                    errors.append(f"{path}: manual_review requires needs_check=true")
                if calc.get("mode") not in ("manual_review", "course_list"):
                    errors.append(f"{path}: invalid calculation mode")
                if section == "other_conditions":
                    if calc.get("mode") != "manual_review":
                        errors.append(f"{path}: other_conditions require manual_review")
                    continue
                courses = item.get("courses", [])
                if not isinstance(courses, list):
                    errors.append(f"{path}.courses: expected array")
                    continue
                codes = []
                for ci, course in enumerate(courses):
                    if not isinstance(course, dict):
                        errors.append(f"{path}.courses[{ci}]: expected object")
                        continue
                    code = course.get("code")
                    if not isinstance(code, str) or not CODE.fullmatch(code):
                        errors.append(f"{path}.courses[{ci}].code: invalid course code")
                    elif code in codes:
                        errors.append(f"{path}.courses[{ci}].code: duplicate course code")
                    codes.append(code)
                rule = item.get("rule")
                if rule not in ("all", "min_count", "min_credits"):
                    errors.append(f"{path}: invalid requirement rule")
                if item.get("min_credits") is None and needs is not True:
                    errors.append(f"{path}: unknown min_credits requires needs_check=true")
                for key in ("min_credits", "min_count"):
                    value = item.get(key)
                    if value is not None and (not _numeric(value) or value < 0):
                        errors.append(f"{path}.{key}: expected nonnegative finite number or null")
                count = item.get("min_count")
                if count is not None and (not _numeric(count) or int(count) != count):
                    errors.append(f"{path}.min_count: expected integer or null")
                if _numeric(count) and courses and count > len(courses):
                    errors.append(f"{path}: min_count exceeds available courses")
                if rule == "min_count" and count is None and needs is not True:
                    errors.append(f"{path}: unknown min_count requires needs_check=true")
                if rule == "all" and not courses and not (needs is True and calc.get("mode") == "manual_review"):
                    errors.append(f"{path}: empty all requires manual_review and needs_check=true")
                if calc.get("mode") == "course_list":
                    if data.get("schema_version") != "1.0" or item.get("id") not in COURSE_LIST_APPROVED_V1:
                        errors.append(f"{path}: rule id is not approved for course_list in schema version 1.0")
                    if (not courses or item.get("course_filter") or item.get("prerequisites")
                            or item.get("equivalents") or review.get("status") != "confirmed" or needs is not False):
                        errors.append(f"{path}: course_list is not eligible for automatic calculation")
                    selector = calc.get("selector", {})
                    if not isinstance(selector, dict) or selector.get("kind") != "course_codes" or selector.get("codes") != codes:
                        errors.append(f"{path}: course_list selector must match listed course codes in order")
                elif calc.get("mode") == "manual_review":
                    selector = calc.get("selector", {})
                    if not isinstance(selector, dict) or selector.get("kind") != "manual" or selector.get("codes") != []:
                        errors.append(f"{path}: manual selector must contain no course codes")
    return errors


def validate(data: Any, schema: dict | None = None) -> list[str]:
    """Return structural and semantic errors; do not infer academic correctness."""
    if schema is None:
        try:
            schema = json.loads(DEFAULT_SCHEMA.read_text(encoding="utf-8-sig"))
        except (OSError, ValueError) as exc:
            return [f"schema could not be read: {exc}"]
    schema_errors = _schema_errors(schema, schema)
    if schema_errors:
        return schema_errors
    errors = _check(data, schema, schema)
    if errors:
        return errors
    return _semantics(data)


def verify_provenance(data: dict, base_dir: Path | None = None) -> list[str]:
    """Check the preserved original bytes and all original academic facts.

    This is separate from validate() so in-memory hypothetical fixtures need
    not depend on a filesystem. The CLI always runs both checks.
    """
    base_dir = (base_dir or DEFAULT_DATA.parent).resolve()
    provenance = data.get("provenance", {})
    source_file = provenance.get("source_file") if isinstance(provenance, dict) else None
    if not isinstance(source_file, str):
        return ["provenance: source_file is missing"]
    path = (base_dir / source_file).resolve()
    if not path.is_relative_to(base_dir):
        return ["provenance: source_file escapes the data directory"]
    try:
        raw = path.read_bytes()
        original = json.loads(raw.decode("utf-8-sig"))
    except (OSError, ValueError) as exc:
        return [f"provenance: original could not be read: {exc}"]
    errors: list[str] = []
    if hashlib.sha256(raw).hexdigest() != provenance.get("sha256"):
        errors.append("provenance: original SHA256 mismatch")
    if not isinstance(original, dict) or not isinstance(original.get("sets"), list):
        return errors + ["provenance: original has no sets array"]
    if not _equal(data.get("basis"), original.get("basis")):
        errors.append("provenance: original basis was modified")
    groups = data.get("sets", [])
    if not isinstance(groups, list) or len(groups) != len(original["sets"]):
        return errors + ["provenance: original set count was modified"]
    for si, (group, old_group) in enumerate(zip(groups, original["sets"])):
        if not isinstance(group, dict) or not isinstance(old_group, dict):
            errors.append(f"provenance: invalid set at {si}")
            continue
        for key, value in old_group.items():
            if key not in ("requirements", "other_conditions") and not _equal(group.get(key), value):
                errors.append(f"provenance: /sets/{si}/{key} was modified")
        for section in ("requirements", "other_conditions"):
            items, old_items = group.get(section, []), old_group.get(section, [])
            if not isinstance(items, list) or len(items) != len(old_items):
                errors.append(f"provenance: /sets/{si}/{section} item count was modified")
                continue
            for ri, (item, old_item) in enumerate(zip(items, old_items)):
                pointer = f"/sets/{si}/{section}/{ri}"
                if not isinstance(item, dict) or not isinstance(old_item, dict):
                    errors.append(f"provenance: invalid item at {pointer}")
                    continue
                if item.get("original_pointer") != pointer:
                    errors.append(f"provenance: {pointer} original_pointer mismatch")
                if not _equal(item.get("draft_needs_check"), old_item.get("needs_check")):
                    errors.append(f"provenance: {pointer} draft_needs_check was modified")
                for key, value in old_item.items():
                    if key != "needs_check" and not _equal(item.get(key), value):
                        errors.append(f"provenance: {pointer}/{key} was modified")
    return errors


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="졸업요건 형식 검사; 공식 규정 사실을 자동 검증하지 않습니다.")
    parser.add_argument("path", nargs="?", type=Path, default=DEFAULT_DATA)
    parser.add_argument("--strict-facts", action="store_true", help="확인 필요 항목이 있으면 종료코드2 반환")
    args = parser.parse_args(argv)
    try:
        data = json.loads(args.path.read_text(encoding="utf-8-sig"))
    except (OSError, ValueError) as exc:
        print(f"형식 검사 실패: {exc}")
        return 1
    errors = validate(data)
    if not errors:
        errors.extend(verify_provenance(data, args.path.parent))
    if errors:
        print("형식 검사 실패:")
        for error in errors:
            print(f"- {error}")
        return 1
    count = sum(item["needs_check"] for group in data["sets"] for section in ("requirements", "other_conditions") for item in group[section])
    print(f"형식 검사 통과: {len(data['sets'])}묶음, 확인 필요 {count}항목. 공식 규정 사실 검증 완료를 뜻하지 않습니다.")
    return 2 if args.strict_facts and count else 0


if __name__ == "__main__":
    raise SystemExit(main())
