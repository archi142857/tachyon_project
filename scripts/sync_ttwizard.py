"""TT Wizard의 허용된 자료만 읽어 교수 정보 없는 자료를 만든다.

이 코드는 TT Wizard의 구현을 복사하지 않고 공개 자료 형식에 맞춰 작성했다.
코드: MIT. 생성하는 data/ 자료: ODbL-1.0 및 원자료별 출처 조건.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import math
import os
import re
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

DEFAULT_SOURCE = r"D:\프로젝트 폴더\코딩\TT Wizard\tt-wizard"
ATTRIBUTION = "TT Wizard 자료: 캠퍼스 마법 지도·© OpenStreetMap 기여자, 국토지리정보원, 서울대 수강편람"
EXPECTED_FIELDS = {
    "course": ["id", "name", "dept", "credit", "cls", "program", "sections"],
    "section": ["no", "instructor", "status", "meetings"],
    "meeting": ["day", "start", "end", "building", "room"],
}
OUTPUT_META_FIELDS = {
    "schema_version", "semester", "source", "source_sha256", "source_courses", "source_sections",
    "undergraduate_courses", "undergraduate_sections", "attribution",
}
CSV_INPUTS = (
    "data/travel_slope.csv",
    "data/buildings.csv",
    "data/dorm_buildings.csv",
    "data/campus_buildings.csv",
)
FALLBACK_BUILDINGS = "data/buildings_for_magicmap.csv"
EXPECTED_POINTS = 135
EXPECTED_WALK_ROWS = EXPECTED_POINTS * (EXPECTED_POINTS - 1)


def _current_year():
    return datetime.now(timezone(timedelta(hours=9))).year


class SyncError(Exception):
    """원본 내용이나 개인정보를 포함하지 않는 동기화 실패."""


def _require(condition, message):
    if not condition:
        raise SyncError(message)


def _is_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


class Source:
    """정해진 강좌·걷는 시간·좌표 파일만 읽는다."""

    def __init__(self, source):
        self.source = str(source)
        self.hashes = {}
        self.remote = self.source.startswith(("http://", "https://"))
        if self.remote:
            parsed = urlsplit(self.source)
            _require(not parsed.username and not parsed.password and not parsed.query and not parsed.fragment,
                     "자료 주소에 인증 정보나 쿼리를 넣을 수 없습니다.")
            self.base = self.source.rstrip("/") + "/"
            self.root = None
        else:
            self.root = Path(source).resolve()
            _require(self.root.is_dir(), "로컬 원본 폴더를 찾을 수 없습니다.")

    def read(self, relative, optional=False):
        allowed = (relative in CSV_INPUTS or relative == FALLBACK_BUILDINGS
                   or re.fullmatch(r"data/history/\d{4}-[12]\.json", relative))
        _require(bool(allowed), "허용되지 않은 원본 파일입니다.")
        if not self.remote:
            target = (self.root / relative).resolve()
            _require(target.is_relative_to(self.root), "원본 폴더 밖 파일은 읽을 수 없습니다.")
            try:
                raw = target.read_bytes()
                self.hashes[relative] = hashlib.sha256(raw).hexdigest()
                return raw
            except FileNotFoundError:
                if optional:
                    return None
                raise SyncError(f"필수 원본 파일이 없습니다: {relative}") from None
            except OSError:
                raise SyncError(f"원본 파일을 읽지 못했습니다: {relative}") from None
        try:
            request = Request(self.base + relative, headers={"User-Agent": "tt-wizard-gpt-sync/1"})
            with urlopen(request, timeout=30) as response:
                raw = response.read()
                self.hashes[relative] = hashlib.sha256(raw).hexdigest()
                return raw
        except HTTPError as exc:
            if optional and exc.code == 404:
                return None
            raise SyncError(f"원본 요청 실패: {relative} (HTTP {exc.code})") from None
        except (URLError, OSError, TimeoutError):
            raise SyncError(f"원본 요청 실패: {relative} (연결 오류)") from None


def _json_document(raw, semester):
    try:
        document = json.loads(raw.decode("utf-8-sig"))
    except (UnicodeError, ValueError):
        raise SyncError(f"강좌 JSON을 읽을 수 없습니다: {semester}") from None
    _require(isinstance(document, dict), f"강좌 JSON 구조가 다릅니다: {semester}")
    return document


def _validate_meeting(meeting):
    _require(isinstance(meeting, list) and len(meeting) == 5, "meeting 열 수가 다릅니다.")
    day, start, end, building, room = meeting
    _require(day == "" or (type(day) is int and 0 <= day <= 5), "요일 범위가 다릅니다.")
    for value in (start, end):
        _require(value == "" or (type(value) is int and 0 <= value <= 1440), "수업 시각 범위가 다릅니다.")
    _require(start == "" or end == "" or start < end, "수업 시작·종료 순서가 다릅니다.")
    _require(isinstance(building, str) and isinstance(room, str), "강의실 열 형식이 다릅니다.")


def transform_offering(document, semester, *, source_sha256="", source_reference=None):
    """엄격히 열을 검사하고 교수·과정 칸과 원본 메타를 버린다."""
    _require(isinstance(document, dict) and document.get("fields") == EXPECTED_FIELDS,
             "TT Wizard fields가 예상 형식과 다릅니다. 동기화를 중단합니다.")
    _require(bool(re.fullmatch(r"\d{4}-[12]", semester)), "정규 학기 이름이 아닙니다.")
    source_courses = document.get("courses")
    _require(isinstance(source_courses, list), "courses는 목록이어야 합니다.")
    source_meta = document.get("meta", {})
    _require(isinstance(source_meta, dict), "meta는 객체여야 합니다.")
    _require(source_meta.get("semester", semester) == semester, "파일명과 원본 학기가 다릅니다.")
    courses = []
    course_keys = set()
    source_sections = 0
    for course in source_courses:
        _require(isinstance(course, list) and len(course) == 7, "course 열 수가 다릅니다.")
        code, name, dept, credit, category, program, sections = course
        _require(all(isinstance(v, str) for v in (code, name, dept, category, program)),
                 "course 문자 열 형식이 다릅니다.")
        _require(bool(code) and bool(name), "교과목번호와 과목명은 비어 있을 수 없습니다.")
        _require(code not in course_keys, "교과목번호가 중복됩니다.")
        course_keys.add(code)
        _require(_is_number(credit) and credit >= 0, "학점 형식이 다릅니다.")
        _require(isinstance(sections, list), "sections는 목록이어야 합니다.")
        converted_sections = []
        section_keys = set()
        for section in sections:
            _require(isinstance(section, list) and len(section) == 4, "section 열 수가 다릅니다.")
            number, instructor, status, meetings = section
            _require(all(isinstance(v, str) for v in (number, instructor, status)),
                     "section 문자 열 형식이 다릅니다.")
            _require(number not in section_keys, "한 과목의 강좌번호가 중복됩니다.")
            section_keys.add(number)
            _require(status in ("", "폐강대상"), "강좌 상태 형식이 다릅니다.")
            _require(isinstance(meetings, list), "meetings는 목록이어야 합니다.")
            for meeting in meetings:
                if program == "학사":
                    _validate_meeting(meeting)
                else:
                    # 제외되는 대학원 수업은 일요일에도 열릴 수 있다.
                    _require(isinstance(meeting, list) and len(meeting) == 5, "meeting 열 수가 다릅니다.")
            converted_sections.append([number, status, [list(m) for m in meetings]])
            source_sections += 1
        if program == "학사":
            courses.append([code, name, dept, credit, category, converted_sections])
    result = {
        "meta": {
            "schema_version": 1,
            "semester": semester,
            "source": source_reference if source_reference is not None else f"local:data/history/{semester}.json",
            "source_sha256": source_sha256,
            "source_courses": len(source_courses),
            "source_sections": source_sections,
            "undergraduate_courses": len(courses),
            "undergraduate_sections": sum(len(c[5]) for c in courses),
            "attribution": ATTRIBUTION,
        },
        "courses": courses,
    }
    _validate_output_offering(result)
    return result


def _validate_output_offering(document):
    """교수 열·원본 메타가 들어갈 수 없는 출력 구조를 확인한다."""
    _require(set(document) == {"meta", "courses"}, "강좌 산출물의 최상위 열이 다릅니다.")
    _require(set(document["meta"]) == OUTPUT_META_FIELDS, "강좌 산출물의 허용 메타가 다릅니다.")
    for course in document["courses"]:
        _require(isinstance(course, list) and len(course) == 6, "강좌 산출물의 course 열 수가 다릅니다.")
        _require(isinstance(course[5], list), "강좌 산출물의 sections 형식이 다릅니다.")
        for section in course[5]:
            _require(isinstance(section, list) and len(section) == 3, "강좌 산출물의 section 열 수가 다릅니다.")
            _require(isinstance(section[2], list), "강좌 산출물의 meetings 형식이 다릅니다.")
            for meeting in section[2]:
                _validate_meeting(meeting)


def _csv_rows(raw, relative, required):
    try:
        reader = csv.DictReader(io.StringIO(raw.decode("utf-8-sig")))
        _require(reader.fieldnames is not None and len(reader.fieldnames) == len(set(reader.fieldnames))
                 and set(required).issubset(reader.fieldnames), f"CSV 열 이름이 다릅니다: {relative}")
        rows = list(reader)
        _require(all(None not in row and all(v is not None for v in row.values()) for row in rows),
                 f"CSV 행의 열 수가 다릅니다: {relative}")
        return rows
    except (UnicodeError, csv.Error):
        raise SyncError(f"CSV를 읽을 수 없습니다: {relative}") from None


def _finite_decimal(value, message):
    try:
        result = float(value)
    except (ValueError, TypeError, OverflowError):
        raise SyncError(message) from None
    _require(math.isfinite(result), message)
    return result


def _walk_table(raw):
    rows = _csv_rows(raw, "data/travel_slope.csv", ["from", "to", "minutes", "source"])
    points, pairs, output = set(), set(), []
    for row in rows:
        start, end, minutes = row["from"], row["to"], row["minutes"]
        _require(bool(start) and bool(end) and start != end, "걷는 시간 표의 지점이 잘못되었습니다.")
        _require((start, end) not in pairs, "걷는 시간 표의 방향쌍이 중복됩니다.")
        _require(_finite_decimal(minutes, "걷는 시간은 유한한 수여야 합니다.") >= 0,
                 "걷는 시간은 음수일 수 없습니다.")
        points.update((start, end))
        pairs.add((start, end))
        output.append({"from": start, "to": end, "minutes": minutes})
    _require(len(points) == EXPECTED_POINTS and len(rows) == EXPECTED_WALK_ROWS,
             "걷는 시간 표는 135개 지점, 18090개 방향쌍이어야 합니다.")
    _require(pairs == {(a, b) for a in points for b in points if a != b},
             "걷는 시간 표에 빠진 방향쌍이 있습니다.")
    return sorted(output, key=lambda row: (row["from"], row["to"])), points


def _building_table(raw_tables, points, origin):
    coordinates, names = {}, {}

    def merge(relative, raw):
        rows = _csv_rows(raw, relative, ["building", "name", "lat", "lon"])
        seen = set()
        for row in rows:
            building = row["building"]
            _require(building not in seen, "좌표 파일 안에서 동 번호가 중복됩니다.")
            seen.add(building)
            if building not in points:
                continue
            if row["name"].strip() and building not in names:
                names[building] = row["name"].strip()
            if building in coordinates or not row["lat"].strip() or not row["lon"].strip():
                continue
            lat = _finite_decimal(row["lat"], "위도는 유한한 수여야 합니다.")
            lon = _finite_decimal(row["lon"], "경도는 유한한 수여야 합니다.")
            _require(-90 <= lat <= 90 and -180 <= lon <= 180, "좌표 범위가 다릅니다.")
            coordinates[building] = (row["lat"], row["lon"])

    for relative in CSV_INPUTS[1:]:
        merge(relative, raw_tables[relative])
    if points != set(coordinates):
        # TT Wizard 웹 내보내기도 사용하는 좌표 전용 보완표다. note 등은 버린다.
        fallback = origin.read(FALLBACK_BUILDINGS, optional=True)
        if fallback is not None:
            merge(FALLBACK_BUILDINGS, fallback)
    missing = sorted(points - set(coordinates))
    labels = [point if re.fullmatch(r"[A-Za-z0-9-]+", point) else "(지점번호 확인 필요)" for point in missing]
    _require(not missing, "좌표가 없는 지점: " + ", ".join(labels))
    return [{"building": point, "name": names.get(point, point),
             "lat": coordinates[point][0], "lon": coordinates[point][1]} for point in sorted(points)]


def build_likelihood(offerings, as_of_year):
    """빈도는 기준연도 포함 5년, 최신 이력은 공개된 모든 학기에서 구한다."""
    records = {}
    for semester in sorted(offerings):
        year, term = (int(part) for part in semester.split("-"))
        for course in offerings[semester]["courses"]:
            code, name, _, _, _, sections = course
            key = (code, term)
            if key not in records:
                records[key] = {"years": set()}
            record = records[key]
            if as_of_year - 4 <= year <= as_of_year:
                record["years"].add(year)
            record.update(name=name, last_offered=semester, last_sections=len(sections))
    return [{"course_id": code, "name": record["name"], "term": term,
             "years_offered": len(record["years"]), "last_offered": record["last_offered"],
             "last_sections": record["last_sections"]}
            for (code, term), record in sorted(records.items())]


def _csv_bytes(rows, fields):
    target = io.StringIO(newline="")
    writer = csv.DictWriter(target, fieldnames=fields, lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    return target.getvalue().encode("utf-8")


def _write_validated(output_dir, files):
    """모든 입력을 검증한 뒤에만 파일을 교체한다."""
    output_dir = Path(output_dir).resolve()
    managed_files = {"walk.csv", "buildings.csv", "likelihood.csv", "source_manifest.json"}

    def checked_path(relative):
        _require(relative in managed_files or bool(re.fullmatch(r"offerings/\d{4}-[12]\.json", relative)),
                 "관리 대상이 아닌 파일에는 쓸 수 없습니다.")
        target = output_dir / relative
        _require(target.resolve().is_relative_to(output_dir) and not target.is_symlink()
                 and not target.parent.is_symlink(), "출력 폴더 밖으로 연결되는 경로는 쓸 수 없습니다.")
        _require(not target.exists() or target.is_file(), "출력 파일 자리에 다른 종류의 경로가 있습니다.")
        return target

    destinations = {relative: checked_path(relative) for relative in files}
    offerings_dir = output_dir / "offerings"
    _require(offerings_dir.resolve().is_relative_to(output_dir) and not offerings_dir.is_symlink(),
             "출력 폴더 밖으로 연결되는 강좌 경로는 쓸 수 없습니다.")
    stale = []
    if offerings_dir.is_dir():
        for path in offerings_dir.iterdir():
            relative = f"offerings/{path.name}"
            if re.fullmatch(r"\d{4}-[12]\.json", path.name) and relative not in files:
                stale.append(checked_path(relative))
    output_dir.parent.mkdir(parents=True, exist_ok=True)
    changed = []
    with tempfile.TemporaryDirectory(prefix=".ttwizard-sync-", dir=output_dir.parent) as temporary:
        staging = Path(temporary)
        for relative, content in files.items():
            destination = destinations[relative]
            if destination.is_file() and destination.read_bytes() == content:
                continue
            candidate = staging / relative
            candidate.parent.mkdir(parents=True, exist_ok=True)
            candidate.write_bytes(content)
            changed.append((candidate, destination))
        backups = {}
        for number, destination in enumerate([d for _, d in changed] + stale):
            backup = staging / "backups" / str(number)
            if destination.exists():
                backup.parent.mkdir(parents=True, exist_ok=True)
                backup.write_bytes(destination.read_bytes())
                backups[destination] = backup
            else:
                backups[destination] = None
        applied = []
        try:
            for candidate, destination in changed:
                destination.parent.mkdir(parents=True, exist_ok=True)
                os.replace(candidate, destination)
                applied.append(destination)
            # 스크립트가 관리하는 정규학기 파일만 정리한다. 설명·요건·예시는 보존한다.
            for destination in stale:
                destination.unlink()
                applied.append(destination)
        except OSError:
            for destination in reversed(applied):
                backup = backups[destination]
                if backup is None:
                    destination.unlink(missing_ok=True)
                else:
                    os.replace(backup, destination)
            raise
    return len(changed) + len(stale)


def sync(source=DEFAULT_SOURCE, output_dir=Path("data"), *, as_of_year=None):
    """원본은 메모리에만 두고 검증한 네 종류의 자료를 출력한다."""
    year = _current_year() if as_of_year is None else as_of_year
    _require(type(year) is int and 2021 <= year <= 2100, "기준연도는 2021~2100이어야 합니다.")
    origin = Source(source)
    destination = Path(output_dir).resolve()
    if origin.root is not None:
        _require(not destination.is_relative_to(origin.root), "TT Wizard 원본 폴더 안에는 출력할 수 없습니다.")
    offerings = {}
    for entry_year in range(2021, year + 2):
        for term in (1, 2):
            semester = f"{entry_year}-{term}"
            relative = f"data/history/{semester}.json"
            raw = origin.read(relative, optional=True)
            if raw is None:
                continue
            document = _json_document(raw, semester)
            reference = origin.base + relative if origin.remote else "local:" + relative
            converted = transform_offering(document, semester, source_sha256=hashlib.sha256(raw).hexdigest(),
                                           source_reference=reference)
            offerings[semester] = converted
    _require(bool(offerings), "2021년부터 내년까지 읽을 수 있는 정규 학기 자료가 없습니다.")
    raw_tables = {relative: origin.read(relative) for relative in CSV_INPUTS}
    walk, points = _walk_table(raw_tables[CSV_INPUTS[0]])
    buildings = _building_table(raw_tables, points, origin)
    likelihood = build_likelihood(offerings, year)
    files = {f"offerings/{semester}.json": (json.dumps(document, ensure_ascii=False,
             separators=(",", ":")) + "\n").encode("utf-8") for semester, document in offerings.items()}
    files["walk.csv"] = _csv_bytes(walk, ["from", "to", "minutes"])
    files["buildings.csv"] = _csv_bytes(buildings, ["building", "name", "lat", "lon"])
    files["likelihood.csv"] = _csv_bytes(likelihood,
        ["course_id", "name", "term", "years_offered", "last_offered", "last_sections"])
    counts = {"semesters": len(offerings), "courses": sum(len(d["courses"]) for d in offerings.values()),
              "sections": sum(d["meta"]["undergraduate_sections"] for d in offerings.values()),
              "walk_rows": len(walk), "buildings": len(buildings), "likelihood_rows": len(likelihood)}
    manifest = {
        "schema_version": 1,
        "basis_year": year,
        "source_kind": "http" if origin.remote else "local",
        "inputs": dict(sorted(origin.hashes.items())),
        "semesters": list(offerings),
        "offerings": {semester: {"courses": len(document["courses"]),
                     "sections": document["meta"]["undergraduate_sections"]}
                      for semester, document in offerings.items()},
        "counts": counts,
    }
    files["source_manifest.json"] = (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    changed = _write_validated(destination, files)
    return {"semesters": list(offerings), "courses": counts["courses"], "sections": counts["sections"],
            "walk_rows": len(walk), "points": len(points), "likelihood_rows": len(likelihood),
            "changed_files": changed, "as_of_year": year}


def main(argv=None):
    parser = argparse.ArgumentParser(description="TT Wizard 공개 자료를 교수 정보 없이 동기화합니다.")
    parser.add_argument("--source", default=DEFAULT_SOURCE, help="원본 URL 또는 로컬 TT Wizard 폴더")
    parser.add_argument("--output-dir", type=Path, default=Path(__file__).resolve().parents[1] / "data",
                        help="출력 data 폴더")
    parser.add_argument("--as-of-year", type=int, default=_current_year(), help="최근 5년 계산의 기준연도(한국 시각)")
    args = parser.parse_args(argv)
    try:
        result = sync(args.source, args.output_dir, as_of_year=args.as_of_year)
    except (SyncError, OSError):
        # traceback에는 원본 값이 섞일 수 있으므로 CLI에서는 오류 종류만 알린다.
        error = sys.exc_info()[1]
        detail = str(error) if isinstance(error, SyncError) else "파일 저장에 실패했습니다."
        print(f"동기화 실패: {detail}", file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
