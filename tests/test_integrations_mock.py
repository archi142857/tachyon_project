"""모든 입력은 지어낸 예시. 실제 학생·계정·학교 응답을 사용하지 않는다."""

from copy import deepcopy
import json

import pytest

from integrations.mock import (
    CourseKey, MockAcademicSession, MockDeliveryError, MockSink, MockSyllabusTracker,
    normalize_mock_academic,
)


KEY = CourseKey("2027-1", "EXAMPLE.001", "001")
T0 = "2026-11-07T09:00:00+09:00"
T1 = "2026-11-07T10:00:00+09:00"
T2 = "2026-11-07T11:00:00+09:00"
T3 = "2026-11-07T12:00:00+09:00"


def tracker(*, owner="example-a", enabled=True, keys=(KEY,)):
    result = MockSyllabusTracker(owner, default_enabled=enabled)
    result.refresh_selection(keys)
    return result


def registered_event(result):
    result.observe(KEY, "unregistered", T0)
    result.observe(KEY, "registered", T1)


def test_first_registered_is_baseline_without_notification():
    result = tracker()
    result.observe(KEY, "registered", T0)
    assert result.pending == []
    assert result.view(KEY)["last_confirmed"] == "registered"
    result.observe(KEY, "unregistered", T1)
    result.observe(KEY, "registered", T2)
    assert result.pending == []  # 수정·삭제·재등록 알림은 범위 밖이다.


@pytest.mark.parametrize("first", ["unknown", "failure"])
def test_uncertain_first_attempt_then_registered_is_first_discovery(first):
    result = tracker()
    result.observe(KEY, first, T0)
    result.observe(KEY, "registered", T1)
    assert [e["kind"] for e in result.pending] == ["first_discovered"]


def test_confirmed_unregistered_then_registered_across_failure():
    result = tracker()
    result.observe(KEY, "unregistered", T0)
    result.observe(KEY, "failure", T1)
    view = result.view(KEY)
    assert (view["latest"], view["last_confirmed"], view["confirmed_at"]) == ("failure", "unregistered", T0)
    result.observe(KEY, "registered", T2)
    assert [e["kind"] for e in result.pending] == ["registration_confirmed"]


def test_failure_after_registered_preserves_confirmation_and_dedup():
    result = tracker()
    registered_event(result)
    sink = MockSink()
    result.deliver(sink)
    result.observe(KEY, "failure", T2)
    assert result.view(KEY)["confirmed_at"] == T1
    result.observe(KEY, "registered", T3)
    result.deliver(sink)
    assert len(sink.messages) == 1


@pytest.mark.parametrize("fail", ["before_accept", "after_accept"])
def test_delivery_retry_and_json_restore_do_not_duplicate(fail):
    result = tracker()
    registered_event(result)
    sink = MockSink()
    with pytest.raises(MockDeliveryError):
        result.deliver(sink, fail=fail)
    assert len(result.pending) == 1
    restored = MockSyllabusTracker.restore(json.loads(json.dumps(result.snapshot())), owner="example-a")
    restored_sink = MockSink.restore(json.loads(json.dumps(sink.snapshot())))
    restored.deliver(restored_sink)
    restored.deliver(restored_sink)
    assert restored.pending == []
    assert len(restored_sink.messages) == 1


def test_explicit_off_survives_refresh_remove_readd_and_restore():
    result = tracker()
    result.set_enabled(KEY, False)
    result.refresh_selection([])
    result.refresh_selection([KEY])
    result = MockSyllabusTracker.restore(result.snapshot(), owner="example-a")
    registered_event(result)
    assert result.view(KEY)["enabled"] is False
    assert result.pending == []
    result.set_enabled(KEY, True)
    result.observe(KEY, "registered", T2)
    assert result.pending == []  # 과거 사건을 소급 발송하지 않는다.


@pytest.mark.parametrize("action", ["off", "remove"])
def test_off_or_removal_cancels_pending_retry(action):
    result = tracker()
    registered_event(result)
    if action == "off":
        result.set_enabled(KEY, False)
    else:
        result.refresh_selection([])
    sink = MockSink()
    result.deliver(sink)
    assert sink.messages == []
    assert result.view(KEY)["registration_seen"]


def test_explicit_enable_before_first_registration_allows_alert():
    result = tracker(enabled=False)
    result.observe(KEY, "unregistered", T0)
    result.set_enabled(KEY, True)
    result.observe(KEY, "registered", T1)
    assert len(result.pending) == 1


def test_semester_section_and_account_are_distinct():
    keys = [KEY, CourseKey("2027-2", KEY.code, "001"), CourseKey("2027-1", KEY.code, "1")]
    sink = MockSink()
    for owner in ("example-a", "example-b"):
        result = tracker(owner=owner, keys=keys)
        result.observe_batch(keys, {key: "unregistered" for key in keys}, T0)
        result.observe_batch(keys, {key: "registered" for key in keys}, T1)
        result.deliver(sink)
    assert len(sink.messages) == 6
    assert KEY.section == "001"
    with pytest.raises(ValueError):
        MockSyllabusTracker.restore(result.snapshot(), owner="example-a")


def test_missing_batch_result_is_failure_not_unregistered():
    result = tracker()
    result.observe_batch([KEY], {}, T0)
    assert result.view(KEY)["latest"] == "failure"
    assert result.view(KEY)["last_confirmed"] is None
    result.observe_batch([KEY], {KEY: "registered"}, T1)
    assert result.pending[0]["kind"] == "first_discovered"


def test_batch_validation_is_atomic():
    second = CourseKey("2027-1", "EXAMPLE.002", "001")
    result = tracker(keys=[KEY, second])
    before = result.snapshot()
    with pytest.raises(ValueError):
        result.observe_batch([KEY, second], {KEY: "registered", second: "bogus"}, T0)
    assert result.snapshot() == before


def test_stale_and_equal_timestamp_do_not_rollback_state():
    result = tracker()
    result.observe(KEY, "registered", T1)
    assert not result.observe(KEY, "unregistered", T0)
    assert not result.observe(KEY, "failure", "2026-11-07T01:00:00+00:00")
    assert result.view(KEY)["latest"] == "registered"


def test_unselected_observation_is_ignored():
    result = tracker()
    result.refresh_selection([])
    assert not result.observe(KEY, "registered", T0)
    assert result.view(KEY)["checked_at"] is None


@pytest.mark.parametrize("value", ["2026-11-07T09:00:00", "bad", None])
def test_invalid_times_rejected_without_change(value):
    result = tracker()
    before = result.snapshot()
    with pytest.raises(ValueError):
        result.observe(KEY, "registered", value)
    assert result.snapshot() == before


def test_snapshots_and_views_do_not_alias_internal_state():
    result = tracker()
    registered_event(result)
    snapshot = result.snapshot()
    snapshot["states"][0]["registration_seen"] = False
    result.pending[0]["kind"] = "bogus"
    result.view(KEY)["latest"] = "failure"
    assert result.view(KEY)["registration_seen"]
    assert result.pending[0]["kind"] == "registration_confirmed"
    assert result.view(KEY)["latest"] == "registered"


def test_restore_rejects_corrupt_confirmation_and_event():
    result = tracker()
    registered_event(result)
    snapshot = result.snapshot()
    snapshot["states"][0]["confirmed_at"] = T2
    with pytest.raises(ValueError):
        MockSyllabusTracker.restore(snapshot, owner="example-a")
    snapshot = result.snapshot()
    snapshot["pending"][0]["event_id"] = "changed"
    with pytest.raises(ValueError):
        MockSyllabusTracker.restore(snapshot, owner="example-a")


def test_real_sink_and_nonexample_owner_are_rejected():
    with pytest.raises(ValueError):
        MockSyllabusTracker("real-account")
    with pytest.raises(ValueError):
        tracker().deliver(object())
    with pytest.raises(ValueError):
        CourseKey("2027-1", "EXAMPLE.001", 1)


OFFERINGS = [{"meta": {"semester": "2025-1"}, "courses": [
    ["EXAMPLE.001", "예시 기초과목", "예시 전공", 3, "전필", []],
    ["EXAMPLE.002", "예시 수강과목", "예시 전공", 2, "전선", []],
]}]


def envelope():
    return {
        "mock": True, "owner": "example-a", "connection": "active", "checked_at": T0,
        "courses_complete": True, "programs_complete": True,
        "payload": {"schema_version": 1, "entry_year": 2025,
                    "programs": [{"name": "예시 전공", "kind": "주전공"}],
                    "courses": [
                        {"code": "EXAMPLE.001", "name": "예시 기초과목", "credits": 3,
                         "category": "전필", "term": "2025-1", "status": "completed"},
                        {"code": "EXAMPLE.002", "name": "예시 수강과목", "credits": 2,
                         "category": "전선", "term": "2025-1", "status": "in_progress"},
                    ]},
    }


def test_academic_full_calls_planner_and_excludes_in_progress():
    data = envelope()
    before = deepcopy(data)
    result = normalize_mock_academic(data, OFFERINGS)
    assert result["coverage"] == "complete"
    assert result["transcript"]["summary"]["confirmed_completed_credits"] == 3
    assert result["transcript"]["summary"]["in_progress_credits"] == 2
    assert not result["needs_check"]
    assert data == before


@pytest.mark.parametrize("flags, expected", [((True, False), "partial"), ((False, True), "partial"), ((None, True), "unknown")])
def test_partial_or_unknown_academic_completeness_is_not_promoted(flags, expected):
    data = envelope()
    data["courses_complete"], data["programs_complete"] = flags
    data["payload"]["coverage"] = "complete"
    result = normalize_mock_academic(data, OFFERINGS)
    assert result["coverage"] == expected
    assert result["transcript"]["coverage"] == expected
    assert result["needs_check"]


@pytest.mark.parametrize("connection", ["expired", "failure"])
def test_expiry_or_failure_never_returns_payload_as_fresh(connection):
    data = envelope()
    data["connection"] = connection
    result = normalize_mock_academic(data, OFFERINGS)
    assert result["transcript"] is None
    assert result["coverage"] == "unknown"
    assert result["needs_check"]


def test_login_only_is_not_full_query_and_empty_complete_is_distinct():
    data = envelope()
    data["payload"] = None
    result = normalize_mock_academic(data, OFFERINGS)
    assert result["transcript"] is None
    assert result["coverage"] == "unknown"
    data = envelope()
    data["payload"]["courses"] = []
    result = normalize_mock_academic(data, OFFERINGS)
    assert result["coverage"] == "complete"
    assert result["transcript"]["courses"] == []
    data["courses_complete"] = False
    assert normalize_mock_academic(data, OFFERINGS)["coverage"] == "partial"


def test_academic_unknown_fields_removed_and_mock_marker_required():
    data = envelope()
    data["payload"]["discarded_fixture_field"] = "예시 폐기값"
    result = normalize_mock_academic(data, OFFERINGS)
    assert "예시 폐기값" not in json.dumps(result, ensure_ascii=False)
    data["mock"] = False
    with pytest.raises(ValueError):
        normalize_mock_academic(data, OFFERINGS)


@pytest.mark.parametrize("failure", ["expired", "failure", "login_only"])
def test_academic_session_retains_last_success_separately_on_failure(failure):
    session = MockAcademicSession("example-a")
    session.apply(envelope(), OFFERINGS)
    data = envelope()
    data["checked_at"] = T1
    if failure == "login_only":
        data["payload"] = None
    else:
        data["connection"] = failure
    assert session.apply(data, OFFERINGS)
    result = session.view()
    assert result["latest"]["transcript"] is None
    assert result["latest"]["checked_at"] == T1
    assert result["last_successful"]["checked_at"] == T0
    assert result["last_successful"]["transcript"]["summary"]["confirmed_completed_credits"] == 3


def test_academic_session_does_not_merge_partial_and_prior_full():
    session = MockAcademicSession("example-a")
    session.apply(envelope(), OFFERINGS)
    data = envelope()
    data["checked_at"] = T1
    data["courses_complete"] = False
    data["payload"]["courses"] = []
    session.apply(data, OFFERINGS)
    result = session.view()
    assert result["latest"]["transcript"]["courses"] == []
    assert result["last_successful"]["coverage"] == "partial"
    assert result["last_successful"]["checked_at"] == T1
    data["checked_at"] = T2
    data["courses_complete"] = True
    session.apply(data, OFFERINGS)
    assert session.view()["latest"]["coverage"] == "complete"
    assert session.view()["latest"]["transcript"]["courses"] == []


def test_academic_session_rejects_other_account_and_stale_result():
    session = MockAcademicSession("example-a")
    data = envelope()
    data["checked_at"] = T1
    session.apply(data, OFFERINGS)
    assert not session.apply(envelope(), OFFERINGS)
    data["owner"] = "example-b"
    with pytest.raises(ValueError):
        session.apply(data, OFFERINGS)
    assert session.view()["latest"]["checked_at"] == T1
    session.view()["latest"]["transcript"]["courses"].clear()
    assert len(session.view()["latest"]["transcript"]["courses"]) == 2


def test_academic_session_validation_failure_preserves_previous_result():
    session = MockAcademicSession("example-a")
    session.apply(envelope(), OFFERINGS)
    before = session.view()
    data = envelope()
    data["checked_at"] = T1
    data["payload"]["entry_year"] = False
    with pytest.raises(ValueError):
        session.apply(data, OFFERINGS)
    assert session.view() == before
