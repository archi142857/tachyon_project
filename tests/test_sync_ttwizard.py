"""예시 자료만으로 동기화의 내용·누락·실패 경로를 검사한다."""

import copy
import csv
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit

import pytest

from scripts import sync_ttwizard as sync


FIELDS = {
    "course": ["id", "name", "dept", "credit", "cls", "program", "sections"],
    "section": ["no", "instructor", "status", "meetings"],
    "meeting": ["day", "start", "end", "building", "room"],
}
INSTRUCTORS = ["예시_교수_A", "예시_교수_B", "예시_교수_C"]
META_MARKER = "예시_원본_메타_표식"
OUTPUT_META_KEYS = {
    "schema_version", "semester", "source", "source_sha256", "source_courses",
    "source_sections", "undergraduate_courses", "undergraduate_sections", "attribution",
}
POINTS = [str(i) for i in range(1, 135)] + ["919A"]


def course(code="EXAMPLE.001", *, degree="학사", sections=1, title="예시 과목"):
    return [
        code, title, "예시 학부", 3, "전필", degree,
        [
            [
                f"{i + 1:03d}", INSTRUCTORS[i % len(INSTRUCTORS)],
                "폐강대상" if i else "", [[i % 6, 540, 600, "1", "101"]],
            ]
            for i in range(sections)
        ],
    ]


def document(semester="2026-1", courses=None):
    return {
        "fields": copy.deepcopy(FIELDS),
        "courses": courses if courses is not None else [course()],
        "meta": {
            "semester": semester,
            "updated": "2026-11-06T00:00:00Z",
            # 알 수 없는 원본 메모를 그대로 복사하면 이름이 새어 나온다.
            "private_note": META_MARKER,
            "private_nested": {"instructor": INSTRUCTORS[0]},
        },
    }


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")


def write_csv(path, headers, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(headers)
        writer.writerows(rows)


def read_csv(path):
    with path.open(encoding="utf-8", newline="") as stream:
        return list(csv.DictReader(stream))


def snapshot(path):
    return {str(p.relative_to(path)): p.read_bytes() for p in path.rglob("*") if p.is_file()}


@pytest.fixture
def source(tmp_path):
    root = tmp_path / "source"
    lecture = course(sections=2)
    unknown = course("EXAMPLE.002", title="예시 미정 수업")
    unknown[6][0][3] = [["", "", "", "", ""]]
    graduate = [course(f"EXAMPLE.G{i}", degree=degree) for i, degree in enumerate(["석사", "박사", "석박사통합"])]
    write_json(root / "data/history/2026-1.json", document(courses=[lecture, unknown, *graduate]))
    write_json(root / "data/history/2026-2.json", document("2026-2"))
    # 계절학기나 다른 원본 파일은 읽지 않는다.
    write_json(root / "data/history/2026-S.json", {"not": "a regular semester"})
    write_json(root / "data/history/2026-W.json", {"not": "a regular semester"})
    write_csv(
        root / "data/travel_slope.csv", ["from", "to", "minutes", "source"],
        [[a, b, f"{1 + ((i * 3 + j * 7) % 60) / 10:.1f}", "예시 보행시간"]
         for i, a in enumerate(POINTS) for j, b in enumerate(POINTS) if a != b],
    )
    write_csv(root / "data/buildings.csv", ["building", "name", "lat", "lon"],
              [[p, f"예시 건물 {p}", 37.45, 126.95] for p in POINTS[:50]])
    write_csv(root / "data/campus_buildings.csv", ["building", "name", "ename", "fac_type", "lat", "lon"],
              [[p, f"예시 교내 {p}", "", "", 37.46, 126.96] for p in POINTS[50:100]]
              + [["UNUSED", "예시 미사용 건물", "", "", 37.46, 126.96]])
    write_csv(root / "data/dorm_buildings.csv", ["building", "name", "kind", "lat", "lon", "travel", "source", "note"],
              [[p, "" if p == "919A" else f"예시 기숙사 {p}", "dorm", 37.47, 126.97, "Y", "예시", ""]
               for p in POINTS[100:]])
    return root


def test_undergraduate_counts_and_instructor_removal(source, tmp_path, capsys):
    output = tmp_path / "output"
    original_files = snapshot(source)
    result = sync.sync(str(source), output, as_of_year=2026)
    assert snapshot(source) == original_files
    for semester in ["2026-1", "2026-2"]:
        original = json.loads((source / f"data/history/{semester}.json").read_text(encoding="utf-8"))
        actual = json.loads((output / f"offerings/{semester}.json").read_text(encoding="utf-8"))
        undergraduates = [c for c in original["courses"] if c[5] == "학사"]
        assert set(actual) == {"meta", "courses"}
        assert set(actual["meta"]) == OUTPUT_META_KEYS
        assert len(actual["courses"]) == len(undergraduates)
        assert sum(len(c[5]) for c in actual["courses"]) == sum(len(c[6]) for c in undergraduates)
        assert actual["courses"] == [c[:5] + [[[s[0], s[2], s[3]] for s in c[6]]] for c in undergraduates]
    assert sorted(p.name for p in (output / "offerings").iterdir()) == ["2026-1.json", "2026-2.json"]
    captured = capsys.readouterr()
    all_output = "\n".join(value.decode("utf-8") for value in snapshot(output).values())
    all_output += captured.out + captured.err + str(result)
    for marker in [*INSTRUCTORS, META_MARKER]:
        assert marker not in all_output
    manifest = json.loads((output / "source_manifest.json").read_text(encoding="utf-8"))
    assert manifest["source_kind"] == "local"
    assert manifest["basis_year"] == 2026
    assert manifest["semesters"] == ["2026-1", "2026-2"]
    assert manifest["counts"]["courses"] == 3
    assert manifest["counts"]["sections"] == 4
    assert manifest["counts"]["walk_rows"] == 135 * 134
    assert manifest["counts"]["buildings"] == 135
    assert manifest["offerings"]["2026-1"] == {"courses": 2, "sections": 3}
    relative = "data/history/2026-1.json"
    assert manifest["inputs"][relative] == hashlib.sha256((source / relative).read_bytes()).hexdigest()
    assert all(not Path(p).is_absolute() for p in manifest["inputs"])


def test_cli_runs_with_local_source(source, tmp_path):
    output = tmp_path / "output"
    completed = subprocess.run(
        [sys.executable, str(Path(sync.__file__).resolve()), "--source", str(source),
         "--output-dir", str(output), "--as-of-year", "2026"],
        capture_output=True, check=False,
    )
    assert completed.returncode == 0
    assert (output / "offerings/2026-1.json").is_file()
    for marker in [*INSTRUCTORS, META_MARKER]:
        assert marker.encode("utf-8") not in completed.stdout + completed.stderr
        assert marker.encode("cp949") not in completed.stdout + completed.stderr


def test_graduate_sunday_does_not_block_undergraduate_sync(source, tmp_path):
    path = source / "data/history/2026-1.json"
    raw = json.loads(path.read_text(encoding="utf-8"))
    for item in raw["courses"]:
        if item[5] != "학사":
            item[6][0][3] = [[6, 540, 600, "1", "101"]]
    write_json(path, raw)
    output = tmp_path / "output"
    sync.sync(str(source), output, as_of_year=2026)
    result = json.loads((output / "offerings/2026-1.json").read_text(encoding="utf-8"))
    assert len(result["courses"]) == 2
    assert all(not c[0].startswith("EXAMPLE.G") for c in result["courses"])


def test_local_source_reference_does_not_expose_absolute_path(source, tmp_path):
    output = tmp_path / "output"
    sync.sync(str(source), output, as_of_year=2026)
    result = json.loads((output / "offerings/2026-1.json").read_text(encoding="utf-8"))
    assert result["meta"]["source"] == "local:data/history/2026-1.json"
    serialized = json.dumps(result, ensure_ascii=False)
    assert str(source.resolve()) not in serialized
    assert source.resolve().as_posix() not in serialized
    assert sync.DEFAULT_SOURCE not in serialized


def test_original_metadata_is_not_copied_even_when_keys_match_output(source, tmp_path, capsys):
    raw = document()
    raw["meta"].update({
        "source": META_MARKER, "attribution": META_MARKER,
        "source_courses": META_MARKER, "undergraduate_courses": INSTRUCTORS[0],
    })
    write_json(source / "data/history/2026-1.json", raw)
    output = tmp_path / "output"
    sync.sync(str(source), output, as_of_year=2026)
    result = json.loads((output / "offerings/2026-1.json").read_text(encoding="utf-8"))
    assert set(result["meta"]) == OUTPUT_META_KEYS
    assert result["meta"]["source_courses"] == 1
    assert result["meta"]["undergraduate_courses"] == 1
    captured = capsys.readouterr()
    all_output = "\n".join(content.decode("utf-8") for content in snapshot(output).values())
    all_output += captured.out + captured.err
    assert META_MARKER not in all_output
    assert all(instructor not in all_output for instructor in INSTRUCTORS)


@pytest.mark.parametrize("title", ["초가나다개론", "가나다", "예시 가나다 과목"])
def test_course_name_is_preserved_when_text_matches_instructor_field(source, tmp_path, title):
    # 가나다는 실제 이름이 아닌, 서로 다른 필드의 동형 문자열 예시다.
    raw = document(courses=[course(title=title)])
    raw["courses"][0][6][0][1] = "가나다"
    write_json(source / "data/history/2026-1.json", raw)
    output = tmp_path / "output"
    sync.sync(str(source), output, as_of_year=2026)
    result = json.loads((output / "offerings/2026-1.json").read_text(encoding="utf-8"))
    assert set(result["meta"]) == OUTPUT_META_KEYS
    assert result["courses"][0][1] == title
    original = raw["courses"][0]
    assert result["courses"] == [original[:5] + [[[s[0], s[2], s[3]] for s in original[6]]]]
    assert all(len(section) == 3 for section in result["courses"][0][5])


def test_complete_directed_walk_and_building_coverage(source, tmp_path):
    output = tmp_path / "output"
    sync.sync(str(source), output, as_of_year=2026)
    walk = read_csv(output / "walk.csv")
    assert len(walk) == 135 * 134
    assert set(walk[0]) == {"from", "to", "minutes"}
    pairs = {(r["from"], r["to"]): float(r["minutes"]) for r in walk}
    assert set(pairs) == {(a, b) for a in POINTS for b in POINTS if a != b}
    assert pairs[("1", "2")] != pairs[("2", "1")]
    buildings = read_csv(output / "buildings.csv")
    assert len(buildings) == 135
    assert set(buildings[0]) == {"building", "name", "lat", "lon"}
    assert {r["building"] for r in buildings} == set(POINTS)
    assert next(r["name"] for r in buildings if r["building"] == "919A") == "919A"
    assert all(-90 <= float(r["lat"]) <= 90 and -180 <= float(r["lon"]) <= 180 for r in buildings)


def remove_dorm_point(source, building="919A"):
    path = source / "data/dorm_buildings.csv"
    rows = read_csv(path)
    write_csv(path, list(rows[0]), [list(r.values()) for r in rows if r["building"] != building])


def test_missing_building_uses_official_fallback_without_extra_columns(source, tmp_path, monkeypatch):
    remove_dorm_point(source)
    write_csv(
        source / "data/buildings_for_magicmap.csv",
        ["building", "name", "lat", "lon", "first_seen", "last_seen", "note"],
        [["919A", "예시 보완 건물", 37.48, 126.98, "2026-1", "2026-2", INSTRUCTORS[0]],
         ["1", "예시 기존 이름을 덮으면 안 됨", 37.49, 126.99, "", "", "예시"]],
    )
    requested = []

    def get(request, timeout=30):
        relative = urlsplit(request.full_url).path.removeprefix("/base/")
        requested.append(relative)
        path = source / relative
        if not path.is_file():
            raise HTTPError(request.full_url, 404, "Not Found", {}, None)
        return io.BytesIO(path.read_bytes())

    monkeypatch.setattr(sync, "urlopen", get)
    output = tmp_path / "output"
    sync.sync("https://example.invalid/base/", output, as_of_year=2026)
    assert requested.count("data/buildings_for_magicmap.csv") == 1
    manifest = json.loads((output / "source_manifest.json").read_text(encoding="utf-8"))
    assert manifest["source_kind"] == "http"
    assert "data/buildings_for_magicmap.csv" in manifest["inputs"]
    buildings = read_csv(output / "buildings.csv")
    assert len(buildings) == 135
    assert set(buildings[0]) == {"building", "name", "lat", "lon"}
    supplemented = next(row for row in buildings if row["building"] == "919A")
    assert supplemented["name"] == "예시 보완 건물"
    assert float(supplemented["lat"]) == 37.48
    assert float(supplemented["lon"]) == 126.98
    original = next(row for row in buildings if row["building"] == "1")
    assert original["name"] == "예시 건물 1"
    assert float(original["lat"]) == 37.45
    assert all(INSTRUCTORS[0] not in content.decode("utf-8") for content in snapshot(output).values())


def test_missing_fallback_preserves_previous_outputs(source, tmp_path):
    output = tmp_path / "output"
    sync.sync(str(source), output, as_of_year=2026)
    before = snapshot(output)
    remove_dorm_point(source)
    with pytest.raises(sync.SyncError):
        sync.sync(str(source), output, as_of_year=2026)
    assert snapshot(output) == before


@pytest.mark.parametrize("field", ["course", "section", "meeting"])
def test_changed_fields_rejected_without_echoing_values(field):
    raw = document()
    raw["fields"][field][0] = INSTRUCTORS[2]
    with pytest.raises(sync.SyncError) as error:
        sync.transform_offering(raw, "2026-1")
    assert INSTRUCTORS[2] not in str(error.value)


@pytest.mark.parametrize("meeting", [
    [-1, 540, 600, "1", "101"], [6, 540, 600, "1", "101"],
    [True, 540, 600, "1", "101"], [0, -1, 600, "1", "101"],
    [0, 540, 1441, "1", "101"], [0, 600, 540, "1", "101"],
    [0, 600, 600, "1", "101"], [0, 540, 600, "1"],
])
def test_invalid_meeting_range_and_shape_rejected(meeting):
    raw = document()
    raw["courses"][0][6][0][3] = [meeting]
    with pytest.raises(sync.SyncError):
        sync.transform_offering(raw, "2026-1")


def test_boundary_and_unknown_meetings_preserved():
    raw = document()
    meetings = [[0, 0, 1, "", ""], [5, 1439, 1440, "919A", ""], ["", "", "", "", ""]]
    raw["courses"][0][6][0][3] = meetings
    assert sync.transform_offering(raw, "2026-1")["courses"][0][5][0][2] == meetings


def test_likelihood_counts_years_per_term_not_sections():
    samples = {
        "2021-1": [course(sections=3)],
        "2022-1": [course(sections=3)],
        "2023-1": [course(sections=1)],
        "2025-1": [course(sections=2)],
        "2026-1": [course(sections=3, title="예시 최신 과목")],
        "2026-2": [course(sections=2)],
    }
    offerings = {semester: sync.transform_offering(document(semester, courses), semester)
                 for semester, courses in samples.items()}
    rows = sync.build_likelihood(offerings, 2026)
    first = next(r for r in rows if str(r["term"]) == "1")
    second = next(r for r in rows if str(r["term"]) == "2")
    assert int(first["years_offered"]) == 4
    assert first["last_offered"] == "2026-1"
    assert int(first["last_sections"]) == 3
    assert first["name"] == "예시 최신 과목"
    assert int(second["years_offered"]) == 1
    assert second["last_offered"] == "2026-2"
    assert int(second["last_sections"]) == 2


def test_likelihood_keeps_old_and_future_courses_without_inflating_frequency():
    samples = {
        "2021-1": [course("EXAMPLE.OLD")],
        "2026-1": [course("EXAMPLE.NOW")],
        "2027-1": [course("EXAMPLE.NOW", sections=2), course("EXAMPLE.NEW")],
    }
    offerings = {semester: sync.transform_offering(document(semester, courses), semester)
                 for semester, courses in samples.items()}
    rows = {r["course_id"]: r for r in sync.build_likelihood(offerings, 2026)}
    assert int(rows["EXAMPLE.OLD"]["years_offered"]) == 0
    assert int(rows["EXAMPLE.NEW"]["years_offered"]) == 0
    assert int(rows["EXAMPLE.NOW"]["years_offered"]) == 1
    assert rows["EXAMPLE.NOW"]["last_offered"] == "2027-1"
    assert int(rows["EXAMPLE.NOW"]["last_sections"]) == 2


@pytest.mark.parametrize("level", ["course", "section"])
def test_changed_positional_record_shape_is_rejected(level):
    raw = document()
    if level == "course":
        raw["courses"][0].append(INSTRUCTORS[1])
    else:
        raw["courses"][0][6][0].append(INSTRUCTORS[1])
    with pytest.raises(sync.SyncError) as error:
        sync.transform_offering(raw, "2026-1")
    assert INSTRUCTORS[1] not in str(error.value)


def test_repeat_sync_is_byte_identical_and_keeps_other_data(source, tmp_path):
    output = tmp_path / "output"
    (output / "requirements").mkdir(parents=True)
    (output / "requirements/2025.json").write_text('{"example":true}', encoding="utf-8")
    (output / "README.md").write_text("예시 자료 설명", encoding="utf-8")
    sync.sync(str(source), output, as_of_year=2026)
    first = snapshot(output)
    sync.sync(str(source), output, as_of_year=2026)
    assert snapshot(output) == first


def test_late_schema_failure_keeps_previous_output(source, tmp_path):
    output = tmp_path / "output"
    sync.sync(str(source), output, as_of_year=2026)
    first = snapshot(output)
    # 뒤의 파일 검증이 실패하면 앞에서 사라진 학기의 산출물도 지우지 않는다.
    (source / "data/history/2026-1.json").unlink()
    broken = document("2027-2")
    broken["fields"]["section"].reverse()
    write_json(source / "data/history/2027-2.json", broken)
    with pytest.raises(sync.SyncError):
        sync.sync(str(source), output, as_of_year=2026)
    assert snapshot(output) == first


@pytest.mark.parametrize("change", ["removed_semester", "year_boundary"])
def test_stale_managed_offerings_removed_but_other_files_preserved(source, tmp_path, change):
    write_json(source / "data/history/2027-1.json", document("2027-1", [course("EXAMPLE.FUTURE")]))
    output = tmp_path / "output"
    sync.sync(str(source), output, as_of_year=2026)
    preserved = {
        "README.md": "예시 자료 설명\n",
        "requirements/2025.json": '{"example":true}\n',
        "offerings/notes.json": '{"example":"메모"}\n',
        "offerings/2026-S.json": '{"example":"별도 계절학기"}\n',
        "offerings/2026-3.json": '{"example":"비관리 파일"}\n',
    }
    for relative, content in preserved.items():
        path = output / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
    write_json(output / "offerings/2019-1.json", {"example": "예전 관리 파일"})
    if change == "removed_semester":
        (source / "data/history/2026-1.json").unlink()
        expected = {"2026-2.json", "2027-1.json"}
        as_of_year = 2026
    else:
        expected = {"2026-1.json", "2026-2.json"}
        as_of_year = 2025
    sync.sync(str(source), output, as_of_year=as_of_year)
    actual = {p.name for p in (output / "offerings").glob("????-[12].json")}
    assert actual == expected
    for relative, content in preserved.items():
        assert (output / relative).read_text(encoding="utf-8") == content
    likelihood = read_csv(output / "likelihood.csv")
    if change == "removed_semester":
        assert not any(r["course_id"] == "EXAMPLE.001" and r["term"] == "1" for r in likelihood)
    else:
        assert not any(r["course_id"] == "EXAMPLE.FUTURE" for r in likelihood)


@pytest.mark.parametrize("mutation", ["missing", "duplicate", "negative", "nan"])
def test_broken_walk_table_rejected(source, tmp_path, mutation):
    path = source / "data/travel_slope.csv"
    rows = read_csv(path)
    if mutation == "missing":
        rows.pop()
    elif mutation == "duplicate":
        rows[-1] = dict(rows[0])
    else:
        rows[0]["minutes"] = "-1" if mutation == "negative" else "nan"
    write_csv(path, ["from", "to", "minutes", "source"], [list(r.values()) for r in rows])
    with pytest.raises(sync.SyncError):
        sync.sync(str(source), tmp_path / "output", as_of_year=2026)
    assert not (tmp_path / "output/walk.csv").exists()


def test_http_downloads_only_allowlisted_inputs_and_skips_404(source, tmp_path, monkeypatch):
    requested = []

    def get(request, timeout=30):
        relative = urlsplit(request.full_url).path.removeprefix("/base/")
        requested.append(relative)
        path = source / relative
        if not path.is_file():
            raise HTTPError(request.full_url, 404, "Not Found", {}, None)
        return io.BytesIO(path.read_bytes())

    monkeypatch.setattr(sync, "urlopen", get)
    output = tmp_path / "output"
    sync.sync("https://example.invalid/base/", output, as_of_year=2026)
    history = {f"data/history/{year}-{term}.json" for year in range(2021, 2028) for term in (1, 2)}
    tables = {f"data/{name}.csv" for name in ("travel_slope", "buildings", "campus_buildings", "dorm_buildings")}
    assert set(requested) == history | tables
    assert len(requested) == len(set(requested))
    assert len(list((output / "offerings").glob("*.json"))) == 2
    result = json.loads((output / "offerings/2026-1.json").read_text(encoding="utf-8"))
    assert result["meta"]["source"] == "https://example.invalid/base/data/history/2026-1.json"


@pytest.mark.parametrize("failure", ["server", "connection"])
def test_http_failure_is_not_treated_as_missing_and_hides_details(tmp_path, monkeypatch, failure):
    def get(request, timeout=30):
        if failure == "server":
            raise HTTPError(request.full_url, 503, INSTRUCTORS[0], {}, None)
        raise URLError(INSTRUCTORS[0])

    monkeypatch.setattr(sync, "urlopen", get)
    with pytest.raises(sync.SyncError) as error:
        sync.sync("https://example.invalid/base/", tmp_path / "output", as_of_year=2026)
    assert INSTRUCTORS[0] not in str(error.value)
    assert not (tmp_path / "output/walk.csv").exists()
