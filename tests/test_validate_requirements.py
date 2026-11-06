"""Boundary checks: malformed data must not become a confirmed graduation rule."""

from contextlib import redirect_stdout
import copy
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from scripts import validate_requirements as validator


class SchemaSubsetTests(unittest.TestCase):
    def check(self, value, schema):
        errors = validator._schema_errors(schema, schema)
        return errors or validator._check(value, schema, schema)

    def test_bool_is_not_a_number_or_numeric_enum(self):
        for schema in ({"type": "number"}, {"type": "integer"}, {"enum": [1]}, {"const": 1}):
            with self.subTest(schema=schema):
                self.assertTrue(self.check(True, schema))

    def test_unknown_keyword_rejected_in_unused_definition(self):
        schema = {"$defs": {"hidden": {"format": "uri"}}, "type": "object"}
        self.assertTrue(any("unsupported" in error for error in validator.validate({}, schema)))

    def test_refs_anyof_bounds_and_unknown_properties(self):
        schema = {
            "$defs": {"credits": {"anyOf": [{"type": "null"}, {"type": "number", "minimum": 0, "maximum": 30}]}},
            "type": "object", "required": ["credits"], "additionalProperties": False,
            "properties": {"credits": {"$ref": "#/$defs/credits"}},
        }
        for value in ({"credits": 3}, {"credits": None}):
            self.assertEqual([], self.check(value, schema))
        for value in ({}, {"credits": -1}, {"credits": 31}, {"credits": True}, {"credits": 3, "secret": "x"}):
            with self.subTest(value=value):
                self.assertTrue(self.check(value, schema))

    def test_array_limits_and_item_patterns(self):
        schema = {"type": "array", "minItems": 1, "maxItems": 2, "items": {"type": "string", "minLength": 3, "pattern": r"^[0-9]+\.[0-9]+$"}}
        self.assertEqual([], self.check(["123.456"], schema))
        for value in ([], ["123.456"] * 3, ["123"], [1]):
            self.assertTrue(self.check(value, schema))

    def test_external_unresolved_and_cyclic_refs_fail_safely(self):
        for schema in ({"$ref": "https://example.invalid/schema"}, {"$ref": "#/$defs/missing"}, {"$defs": {"x": {"$ref": "#/$defs/x"}}, "$ref": "#/$defs/x"}):
            self.assertTrue(self.check({}, schema))

    def test_nan_and_infinity_are_rejected(self):
        for value in (float("nan"), float("inf"), -float("inf")):
            self.assertTrue(self.check(value, {"type": "number"}))


class RequirementsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.original = json.loads(validator.DEFAULT_DATA.read_text(encoding="utf-8-sig"))

    def setUp(self):
        self.data = copy.deepcopy(self.original)

    def first(self):
        return self.data["sets"][0]["requirements"][0]

    def assertInvalid(self, fragment=None):
        errors = validator.validate(self.data)
        self.assertTrue(errors, "invalid rule unexpectedly passed")
        if fragment:
            self.assertTrue(any(fragment in error for error in errors), errors)

    def test_checked_in_data_passes_structure(self):
        self.assertEqual([], validator.validate(self.data))

    def test_needs_check_list_matches_all_uncertain_ids(self):
        listing = json.loads((validator.DEFAULT_DATA.parent / "needs_check.json").read_text(encoding="utf-8-sig"))
        actual = [item["id"] for group in self.data["sets"] for section in ("requirements", "other_conditions") for item in group[section] if item["needs_check"]]
        listed = [item["id"] for item in listing["items"]]
        self.assertEqual(len(listed), len(set(listed)), "needs_check list contains duplicate ids")
        self.assertEqual(set(actual), set(listed))

    def test_all_review_records_match_materialized_data(self):
        paths = sorted((validator.DEFAULT_DATA.parent / "reviews").glob("*.json"))
        self.assertEqual(["animal.json", "biology.json", "chemical.json", "common.json"], [p.name for p in paths])
        seen = set()
        for path in paths:
            review_file = json.loads(path.read_text(encoding="utf-8-sig"))
            for group in review_file["sets"]:
                for item in group["items"]:
                    key = (group["set_index"], item["section"], item["index"])
                    self.assertNotIn(key, seen, f"duplicate review position: {key}")
                    seen.add(key)
                    actual = self.data["sets"][key[0]][key[1]][key[2]]["review"]
                    expected = {field: item[field] for field in ("status", "reason", "evidence")}
                    expected["reviewed_on"] = review_file["reviewed_on"]
                    self.assertEqual(expected, actual, f"review mismatch: {path.name} {key}")
        expected_positions = {(si, section, ri) for si, group in enumerate(self.data["sets"]) for section in ("requirements", "other_conditions") for ri in range(len(group[section]))}
        self.assertEqual(90, len(seen))
        self.assertEqual(expected_positions, seen)

    def test_unmodelled_simultaneous_enrolment_cannot_be_made_automatic(self):
        item = next(r for s in self.data["sets"] for r in s["requirements"] if r["id"] == "biology-main-R09")
        item["review"]["status"] = "confirmed"
        item["needs_check"] = False
        item["calculation"]["mode"] = "course_list"
        item["calculation"]["selector"] = {"kind": "course_codes", "codes": [c["code"] for c in item["courses"]]}
        self.assertInvalid("not approved")

    def test_original_facts_and_hash_are_preserved(self):
        self.assertEqual([], validator.verify_provenance(self.data))
        self.first()["min_credits"] = 999
        self.assertTrue(any("was modified" in e for e in validator.verify_provenance(self.data)))

    def test_hash_tampering_is_detected(self):
        self.data["provenance"]["sha256"] = "0" * 64
        self.assertTrue(any("SHA256" in e for e in validator.verify_provenance(self.data)))

    def test_original_pointer_and_draft_flag_are_checked(self):
        self.first()["original_pointer"] = "/sets/6/requirements/0"
        self.first()["draft_needs_check"] = not self.first()["draft_needs_check"]
        errors = validator.verify_provenance(self.data)
        self.assertTrue(any("original_pointer" in e for e in errors))
        self.assertTrue(any("draft_needs_check" in e for e in errors))

    def test_provenance_cannot_escape_directory(self):
        self.data["provenance"]["source_file"] = "../../outside.json"
        self.assertTrue(any("escapes" in e for e in validator.verify_provenance(self.data)))

    def test_seven_bundle_composition_is_required(self):
        self.data["sets"][1]["kind"] = "복수전공"
        self.assertInvalid("seven")

    def test_duplicate_ids_are_rejected(self):
        self.data["sets"][1]["id"] = self.data["sets"][0]["id"]
        self.assertInvalid("duplicate")

    def test_original_uncertainty_cannot_be_silently_cleared(self):
        item = self.first()
        item["draft_needs_check"] = True
        item["needs_check"] = False
        self.assertInvalid()

    def test_missing_source_and_review_evidence_cannot_be_confirmed(self):
        item = self.first()
        item["needs_check"] = False
        item["sources"] = []
        item["review"]["status"] = "confirmed"
        item["review"]["evidence"] = []
        self.assertInvalid()

    def test_manual_condition_cannot_be_marked_ready(self):
        item = self.first()
        item["calculation"]["mode"] = "manual_review"
        item["needs_check"] = False
        self.assertInvalid()

    def test_empty_all_is_not_vacuously_satisfied(self):
        item = self.first()
        item["rule"] = "all"
        item["courses"] = []
        item["needs_check"] = False
        self.assertInvalid()

    def test_unknown_credit_threshold_requires_uncertainty(self):
        item = self.first()
        item["min_credits"] = None
        item["needs_check"] = False
        self.assertInvalid()

    def test_boolean_credit_is_not_one_credit(self):
        self.first()["min_credits"] = True
        self.assertInvalid()

    def test_negative_credit_is_rejected(self):
        self.first()["min_credits"] = -1
        self.assertInvalid()

    def test_duplicate_course_codes_and_impossible_count(self):
        item = next(r for s in self.data["sets"] for r in s["requirements"] if r["courses"])
        item["courses"].append(copy.deepcopy(item["courses"][0]))
        self.assertInvalid("duplicate")
        item["courses"].pop()
        item["rule"] = "min_count"
        item["min_count"] = len(item["courses"]) + 1
        self.assertInvalid("min_count")

    def test_explanatory_text_cannot_be_a_course_code(self):
        item = next(r for s in self.data["sets"] for r in s["requirements"] if r["courses"])
        item["courses"][0]["code"] += " 예외 인정"
        self.assertInvalid()

    def test_year_and_term_outside_range_are_rejected(self):
        item = next(r for s in self.data["sets"] for r in s["requirements"] if r["courses"])
        item["courses"][0]["term"] = 3
        self.assertInvalid()

    def test_free_text_filter_cannot_be_automatic(self):
        item = next(r for s in self.data["sets"] for r in s["requirements"] if r["courses"])
        item["course_filter"] = "학과장 승인 후 인정"
        item["calculation"]["mode"] = "course_list"
        self.assertInvalid()

    def test_relation_cannot_be_automatically_accepted(self):
        item = next(r for s in self.data["sets"] for r in s["requirements"] if r["courses"])
        code = item["courses"][0]["code"]
        item["equivalents"] = [{"course": code, "accepted": ["123.456 조건부 인정"]}]
        item["calculation"]["mode"] = "course_list"
        self.assertInvalid()

    def test_selector_cannot_inject_extra_course(self):
        item = self.first()
        item["calculation"]["mode"] = "manual_review"
        item["calculation"]["selector"] = {"kind": "manual", "codes": ["123.456"]}
        self.assertInvalid()

    def test_cli_separates_structure_and_facts(self):
        with redirect_stdout(io.StringIO()) as output:
            self.assertEqual(0, validator.main([]))
            self.assertEqual(2, validator.main(["--strict-facts"]))
        self.assertIn("사실 검증 완료를 뜻하지", output.getvalue())

    def test_cli_malformed_json_returns_one(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "broken.json"
            path.write_text("{broken", encoding="utf-8")
            with redirect_stdout(io.StringIO()):
                self.assertEqual(1, validator.main([str(path)]))

    def test_missing_schema_is_reported(self):
        with patch.object(validator, "DEFAULT_SCHEMA", Path("does-not-exist-research-schema.json")):
            self.assertTrue(validator.validate(self.data))


if __name__ == "__main__":
    unittest.main()
