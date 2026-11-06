"""가상 자료 전용 상태 처리. 모든 호출은 명시적이며 파일·네트워크 I/O 없음."""

from __future__ import annotations

from copy import deepcopy
from dataclasses import asdict, dataclass
from datetime import datetime
from hashlib import sha256
import json
import re

from planner.transcript import normalize_transcript


STATES = {"unknown", "unregistered", "registered", "failure"}
CONFIRMED = {"unregistered", "registered"}


def _time(value):
    if not isinstance(value, str):
        raise ValueError("시간대가 포함된 ISO 시각이 필요합니다.")
    try:
        result = datetime.fromisoformat(value)
    except ValueError:
        raise ValueError("시간대가 포함된 ISO 시각이 필요합니다.") from None
    if result.tzinfo is None:
        raise ValueError("시간대가 포함된 ISO 시각이 필요합니다.")
    return result


def _owner(value):
    if not isinstance(value, str) or not re.fullmatch(r"example-[a-z0-9-]+", value):
        raise ValueError("example-으로 시작하는 가상 사용자 식별자만 받습니다.")
    return value


@dataclass(frozen=True, order=True)
class CourseKey:
    semester: str
    code: str
    section: str

    def __post_init__(self):
        if not isinstance(self.semester, str) or not re.fullmatch(r"[0-9]{4}-[12SW]", self.semester):
            raise ValueError("학기 형식이 잘못되었습니다.")
        for value in (self.code, self.section):
            if not isinstance(value, str) or not value or value != value.strip():
                raise ValueError("과목번호와 분반은 공백 없는 앞뒤의 문자열이어야 합니다.")


@dataclass
class _State:
    selected: bool = False
    override: bool | None = None
    latest: str = "unknown"
    checked_at: str | None = None
    last_confirmed: str | None = None
    confirmed_at: str | None = None
    registration_seen: bool = False


class MockDeliveryError(RuntimeError):
    """가상 전달 실패. 실제 서비스의 오류가 아니다."""


class MockSink:
    """같은 사건 ID를 한 번만 기록하는 메모리 수신함."""

    def __init__(self):
        self._accepted = {}

    @property
    def messages(self):
        return deepcopy(list(self._accepted.values()))

    def accept(self, event, *, fail=None):
        if fail not in (None, "before_accept", "after_accept"):
            raise ValueError("지원하지 않는 모의 실패입니다.")
        if fail == "before_accept":
            raise MockDeliveryError("가상 수신 전 실패")
        self._accepted.setdefault(event["event_id"], deepcopy(event))
        if fail == "after_accept":
            raise MockDeliveryError("가상 수신 후 응답 유실")

    def snapshot(self):
        return {"mock": True, "version": 1, "messages": self.messages}

    @classmethod
    def restore(cls, snapshot):
        if snapshot.get("mock") is not True or snapshot.get("version") != 1:
            raise ValueError("가상 수신함 형식이 잘못되었습니다.")
        sink = cls()
        for event in snapshot["messages"]:
            _validate_event(event)
            sink.accept(event)
        return sink


def _validate_event(event):
    if set(event) != {"event_id", "owner", "key", "kind", "checked_at", "mock"}:
        raise ValueError("가상 사건 형식이 잘못되었습니다.")
    _owner(event["owner"])
    key = CourseKey(**event["key"])
    _time(event["checked_at"])
    if event["mock"] is not True or event["kind"] not in ("first_discovered", "registration_confirmed"):
        raise ValueError("가상 사건 형식이 잘못되었습니다.")
    if event["event_id"] != _event_id(event["owner"], key):
        raise ValueError("사건 식별자가 일치하지 않습니다.")


def _event_id(owner, key):
    value = json.dumps([owner, key.semester, key.code, key.section, "initial_registration"], ensure_ascii=False)
    return sha256(value.encode("utf-8")).hexdigest()


class MockSyllabusTracker:
    """한 가상 사용자의 선택 과목·상태·알림 대기열. 자동 반복 실행 없음."""

    def __init__(self, owner, *, default_enabled=False):
        self.owner = _owner(owner)
        if type(default_enabled) is not bool:
            raise ValueError("알림 기본값은 bool이어야 합니다.")
        self.default_enabled = default_enabled
        self._states = {}
        self._pending = {}

    def refresh_selection(self, keys):
        keys = set(keys)
        if any(not isinstance(key, CourseKey) for key in keys):
            raise ValueError("CourseKey 목록이 필요합니다.")
        for key in keys:
            self._states.setdefault(key, _State())
        for key, state in self._states.items():
            state.selected = key in keys
            if not state.selected:
                self._pending.pop(_event_id(self.owner, key), None)

    def set_enabled(self, key, enabled):
        if type(enabled) is not bool:
            raise ValueError("알림 설정은 bool이어야 합니다.")
        state = self._states[key]
        state.override = enabled
        if not enabled:
            self._pending.pop(_event_id(self.owner, key), None)

    def _enabled(self, state):
        return state.selected and (self.default_enabled if state.override is None else state.override)

    def view(self, key):
        state = self._states[key]
        return {"mock": True, "key": asdict(key), **asdict(state), "enabled": self._enabled(state)}

    @property
    def pending(self):
        return deepcopy(list(self._pending.values()))

    def observe(self, key, status, checked_at):
        """명시된 가상 판정만 받는다. 같은 시각/과거/선택 해제 결과는 무시한다."""
        if status not in STATES:
            raise ValueError("등록 상태가 잘못되었습니다.")
        moment = _time(checked_at)
        state = self._states[key]
        if not state.selected or (state.checked_at and moment <= _time(state.checked_at)):
            return False
        had_attempt = state.checked_at is not None
        previous_confirmed = state.last_confirmed
        if status == "registered" and not state.registration_seen:
            # 최초 등록 발견은 off 상태여도 소비한다. 나중에 켜도 과거 알림을 보내지 않는다.
            state.registration_seen = True
            kind = None
            if previous_confirmed == "unregistered":
                kind = "registration_confirmed"
            elif had_attempt:
                kind = "first_discovered"
            if kind and self._enabled(state):
                event_id = _event_id(self.owner, key)
                self._pending[event_id] = {
                    "mock": True, "event_id": event_id, "owner": self.owner,
                    "key": asdict(key), "kind": kind, "checked_at": checked_at,
                }
        state.latest = status
        state.checked_at = checked_at
        if status in CONFIRMED:
            state.last_confirmed = status
            state.confirmed_at = checked_at
        return True

    def observe_batch(self, requested, results, checked_at):
        """결과 누락은 failure. 유효성 오류가 있으면 배치 전체를 적용하지 않는다."""
        requested = list(requested)
        if len(set(requested)) != len(requested) or set(results) - set(requested):
            raise ValueError("조회 대상과 결과 키가 잘못되었습니다.")
        _time(checked_at)
        for key in requested:
            if key not in self._states or results.get(key, "failure") not in STATES:
                raise ValueError("조회 결과 형식이 잘못되었습니다.")
        return {key: self.observe(key, results.get(key, "failure"), checked_at) for key in requested}

    def deliver(self, sink, *, fail=None):
        """가상 수신함에만 전달. 실패하면 재시도를 위해 대기열을 유지한다."""
        if type(sink) is not MockSink:
            raise ValueError("MockSink만 사용할 수 있습니다.")
        for event_id, event in list(self._pending.items()):
            sink.accept(event, fail=fail)
            del self._pending[event_id]

    def snapshot(self):
        return {
            "mock": True, "version": 1, "owner": self.owner,
            "default_enabled": self.default_enabled,
            "states": [{"key": asdict(key), **asdict(state)} for key, state in sorted(self._states.items())],
            "pending": self.pending,
        }

    @classmethod
    def restore(cls, snapshot, *, owner):
        """자체 snapshot의 JSON 왕복 복원. 다른 사용자의 상태는 거부한다."""
        if snapshot.get("mock") is not True or snapshot.get("version") != 1 or snapshot.get("owner") != owner:
            raise ValueError("가상 상태 형식 또는 사용자가 일치하지 않습니다.")
        tracker = cls(owner, default_enabled=snapshot["default_enabled"])
        for raw in snapshot["states"]:
            raw = deepcopy(raw)
            key = CourseKey(**raw.pop("key"))
            state = _State(**raw)
            if (key in tracker._states or type(state.selected) is not bool
                    or (state.override is not None and type(state.override) is not bool)
                    or type(state.registration_seen) is not bool
                    or state.latest not in STATES
                    or state.last_confirmed not in CONFIRMED | {None}):
                raise ValueError("가상 상태 값이 잘못되었습니다.")
            if state.checked_at is not None:
                _time(state.checked_at)
            if (state.last_confirmed is None) != (state.confirmed_at is None):
                raise ValueError("확인 상태와 시각이 일치하지 않습니다.")
            if state.confirmed_at is not None:
                if state.checked_at is None or _time(state.confirmed_at) > _time(state.checked_at):
                    raise ValueError("확인 시각의 순서가 잘못되었습니다.")
            if state.latest in CONFIRMED and (state.last_confirmed != state.latest or state.confirmed_at != state.checked_at):
                raise ValueError("최신 정상 상태와 확인 상태가 일치하지 않습니다.")
            if state.last_confirmed == "registered" and not state.registration_seen:
                raise ValueError("등록 발견 이력이 누락되었습니다.")
            tracker._states[key] = state
        for event in snapshot["pending"]:
            _validate_event(event)
            key = CourseKey(**event["key"])
            state = tracker._states.get(key)
            if event["owner"] != owner or state is None or not tracker._enabled(state) or not state.registration_seen:
                raise ValueError("알림 대기열과 상태가 일치하지 않습니다.")
            tracker._pending[event["event_id"]] = deepcopy(event)
        return tracker


def normalize_mock_academic(envelope, offerings):
    """가상 조회 결과를 Planner v1로 연결한다. 로그인만으로 전체 조회를 인정하지 않는다."""
    if not isinstance(envelope, dict) or envelope.get("mock") is not True:
        raise ValueError("mock=true인 가상 조회 결과만 받습니다.")
    _owner(envelope.get("owner"))
    connection = envelope.get("connection")
    if connection not in ("active", "expired", "failure"):
        raise ValueError("연결 상태가 잘못되었습니다.")
    _time(envelope.get("checked_at"))
    base = {"mock": True, "connection": connection, "checked_at": envelope["checked_at"],
            "coverage": "unknown", "transcript": None, "needs_check": True}
    if connection != "active" or envelope.get("payload") is None:
        return base
    flags = [envelope.get(field) for field in ("courses_complete", "programs_complete")]
    if any(flag is not None and type(flag) is not bool for flag in flags):
        raise ValueError("조회 완료 표시는 bool 또는 null이어야 합니다.")
    coverage = "complete" if all(flag is True for flag in flags) else "partial" if False in flags else "unknown"
    payload = deepcopy(envelope["payload"])
    if not isinstance(payload, dict):
        raise ValueError("가상 이수내역 객체가 필요합니다.")
    payload["coverage"] = coverage
    normalized = normalize_transcript(payload, offerings)
    return {**base, "coverage": coverage, "transcript": normalized, "needs_check": normalized["needs_check"]}


class MockAcademicSession:
    """한 가상 사용자의 최신 조회 결과와 마지막 성공 자료를 분리해 보관한다."""

    def __init__(self, owner):
        self.owner = _owner(owner)
        self._latest = None
        self._last_successful = None

    def apply(self, envelope, offerings):
        if not isinstance(envelope, dict) or envelope.get("owner") != self.owner:
            raise ValueError("가상 조회 사용자와 세션이 일치하지 않습니다.")
        moment = _time(envelope.get("checked_at"))
        if self._latest and moment <= _time(self._latest["checked_at"]):
            return False
        # 정리에 실패하면 이전 두 결과 모두 유지한다.
        result = normalize_mock_academic(envelope, offerings)
        self._latest = result
        if result["transcript"] is not None:
            self._last_successful = deepcopy(result)
        return True

    def view(self):
        return {
            "mock": True, "owner": self.owner,
            "latest": deepcopy(self._latest),
            "last_successful": deepcopy(self._last_successful),
        }
