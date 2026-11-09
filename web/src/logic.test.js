import { describe, expect, it } from 'vitest';
import { normalizeEvent, popupToEvent } from './api.js';
import { eventToForm, formToEvent, formToPopup, popupToForm } from './components/EventForm.jsx';
import { examplePopup, makeExample } from './example.js';
import { endOf, hourRange, isAllDay, layoutDay } from './layout.js';
import { FEEDS, feedResult, normalizeIcs } from './setup.js';
import { CROWDED, dueThisWeek, minutesLabel, readyLabel, slackLabel, topThree } from './tasks.js';
import { fromKst, weekStart } from './time.js';

const now = fromKst(2026, 11, 9, 16, 55); // 예시 시각: 월요일 오후
const iso = (...a) => fromKst(...a).toISOString();

describe('할 일 3개', () => {
  const tasks = [
    { id: 1, title: '예시 A', due: '2026-11-13T23:59:00+09:00', done: 0 },
    { id: 2, title: '예시 B', due: '2026-11-11T23:59:00+09:00', done: 0 },
    { id: 3, title: '예시 C', due: null, done: 0 },
    { id: 4, title: '예시 D', due: '2026-11-10T09:00:00+09:00', done: 1 },
    { id: 5, title: '예시 E', due: '2026-11-12T18:00:00+09:00', done: 0 },
  ];

  it('끝난 것은 빼고 마감 가까운 순, 마감 모르는 것은 뒤', () => {
    expect(topThree(tasks).map((t) => t.id)).toEqual([2, 5, 1]);
  });

  it('이번 주 마감 수와 몰림 기준', () => {
    expect(dueThisWeek(tasks, weekStart(now))).toBe(3);
    expect(CROWDED).toBe(4);
  });

  it('준비 표시(schema: ready 1/0)와 걸리는 시간', () => {
    expect(readyLabel({ ready: 0 })).toBe('수업·자료 뒤');
    expect(readyLabel({ ready: 1, minutes: 60 })).toBe('지금 가능');
    expect(readyLabel({ ready: 1, minutes: null })).toBeNull(); // 밤 정리 전 기본값은 보이지 않는다
    expect(minutesLabel(30)).toBe('약 30분');
    expect(minutesLabel(100)).toBe('약 1.5시간');
    expect(minutesLabel(null)).toBe('시간 ?');
    expect(slackLabel(2)).toBe('여유 2일');
    expect(slackLabel(-1)).toBe('시간 모자람');
    expect(slackLabel(null)).toBeNull();
  });
});

describe('캘린더 주소', () => {
  it('webcal은 https로, 빈칸은 null, http·모양 아닌 것은 거절', () => {
    expect(normalizeIcs('apple', '  webcal://p01-caldav.icloud.com/published/2/EXAMPLE ')).toEqual({ url: 'https://p01-caldav.icloud.com/published/2/EXAMPLE' });
    expect(normalizeIcs('etl', '')).toEqual({ url: null });
    expect(normalizeIcs('etl', 'http://myetl.snu.ac.kr/feeds/calendars/user_EXAMPLE.ics').error).toMatch('https');
    expect(normalizeIcs('etl', '주소 아님').error).toBeTruthy();
  });

  it('칸마다 아는 곳의 주소만 받는다', () => {
    expect(normalizeIcs('etl', 'https://myetl.snu.ac.kr/feeds/calendars/user_EXAMPLE.ics').url).toBeTruthy();
    expect(normalizeIcs('etl', 'https://calendar.google.com/calendar/ical/x/private-y/basic.ics').error).toMatch('eTL');
    expect(normalizeIcs('google', 'https://calendar.google.com/calendar/ical/example%40gmail.com/private-EXAMPLE/basic.ics').url).toBeTruthy();
    expect(normalizeIcs('google', 'https://calendar.google.com/calendar/ical/example%40gmail.com/public/basic.ics').error).toMatch('비공개');
    expect(normalizeIcs('apple', 'https://example.com/published/2/EXAMPLE').error).toMatch('애플');
    expect(FEEDS.map((f) => f.key)).toEqual(['etl', 'google', 'apple']);
  });

  it('저장 결과 한 줄(서버 상태 모양)', () => {
    expect(feedResult({ kind: 'etl', set: true, count: 3, error: null })).toEqual({ ok: true, text: '과제 3개를 찾았어요' });
    expect(feedResult({ kind: 'google', set: true, count: 12, error: null }).text).toBe('일정 12개를 찾았어요');
    expect(feedResult({ kind: 'apple', set: true, count: null, error: '404' })).toEqual({ ok: false, text: '이 주소로 읽지 못했어요 (404)' });
    expect(feedResult({ kind: 'apple', set: true, count: null, error: null }).text).toBe('받는 중이에요');
    expect(feedResult({ kind: 'etl', set: false })).toBeNull();
  });
});

describe('예시 팝업 흉내(서버 없을 때만, 서버와 같은 모양)', () => {
  it('내일 3시 301동 스터디 → 쓴 말 그대로 제목, 끝은 ?', () => {
    expect(examplePopup('내일 3시 301동 스터디', now)).toEqual({ title: '스터디', date: '2026-11-10', time: '15:00', end_time: '?', place: '301동', by: 'rule' });
  });

  it('요일·반·오전, 시각을 모르면 ?', () => {
    expect(examplePopup('금요일 오전 10시 반 면담', now)).toMatchObject({ date: '2026-11-13', time: '10:30', title: '면담', place: '?' });
    expect(examplePopup('다음 주 월요일 회의', now)).toMatchObject({ date: '2026-11-16', time: '?', title: '회의' });
  });

  it('일정처럼 보이지 않으면 팝업 없음', () => {
    expect(examplePopup('동아리 회비 걷기 물어보기', now)).toBeNull();
  });

  it('예시 자료는 이번 주 기준, 시각은 +09:00', () => {
    const ex = makeExample(now);
    expect(ex.events.length).toBeGreaterThan(5);
    expect(ex.events[0].start).toBe('2026-11-09T10:00:00+09:00');
    expect(ex.user.setup_done).toBe(false);
  });
});

describe('서버 모양 다루기', () => {
  it('종일 일정(날짜만)은 그날 0시~다음 날 0시로', () => {
    const ev = normalizeEvent({ id: 1, title: '예시 시험 기간', start: '2026-11-13', end: null });
    expect(ev).toMatchObject({ start: '2026-11-13T00:00:00+09:00', end: '2026-11-14T00:00:00+09:00', all_day: true });
    expect(isAllDay(ev)).toBe(true);
    expect(normalizeEvent({ start: '2026-11-13T15:00:00+09:00', end: null }).all_day).toBeUndefined();
  });

  it('팝업 칸 → 일정 시작·끝(서버 toStartEnd와 같은 규칙)', () => {
    expect(popupToEvent({ date: '2026-11-10', time: '15:00', end_time: '?' })).toEqual({ start: '2026-11-10T15:00:00+09:00', end: null });
    expect(popupToEvent({ date: '2026-11-10', time: '15:00', end_time: '17:00' })).toEqual({ start: '2026-11-10T15:00:00+09:00', end: '2026-11-10T17:00:00+09:00' });
    expect(popupToEvent({ date: '2026-11-10', time: '?', end_time: '?' })).toEqual({ start: '2026-11-10', end: null });
  });
});

describe('고치기 칸', () => {
  it('팝업 ↔ 입력칸: 모르는 칸은 빈칸, 다시 ?', () => {
    const popup = { title: '스터디', date: '2026-11-10', time: '15:00', end_time: '?', place: '?' };
    const form = popupToForm(popup);
    expect(form).toEqual({ title: '스터디', date: '2026-11-10', start: '15:00', end: '', place: '' });
    expect(formToPopup({ ...form, place: ' 301동 ' })).toEqual({ title: '스터디', date: '2026-11-10', time: '15:00', end_time: '?', place: '301동' });
  });

  it('일정 ↔ 입력칸: 시작을 비우면 종일, 끝이 시작보다 이르면 없음', () => {
    const form = eventToForm({ title: '스터디', start: '2026-11-10T15:00:00+09:00', end: null, place: '301동' });
    expect(form).toEqual({ title: '스터디', date: '2026-11-10', start: '15:00', end: '', place: '301동' });
    expect(formToEvent({ ...form, end: '17:00' })).toEqual({ title: '스터디', start: '2026-11-10T15:00:00+09:00', end: '2026-11-10T17:00:00+09:00', place: '301동' });
    expect(formToEvent({ ...form, end: '14:00' }).end).toBeNull();
    expect(formToEvent({ ...form, start: '' })).toEqual({ title: '스터디', start: '2026-11-10', end: null, place: '301동' });
    expect(eventToForm(normalizeEvent({ title: '예시', start: '2026-11-13', end: null, place: null })).start).toBe('');
  });
});

describe('달력 칸 배치', () => {
  const ev = (id, h1, h2) => ({ id, title: String(id), start: iso(2026, 11, 10, h1), end: h2 == null ? null : iso(2026, 11, 10, h2) });

  it('겹치는 일정은 나란히, 안 겹치면 한 칸', () => {
    const out = layoutDay([ev('a', 9, 11), ev('b', 10, 12), ev('c', 13, 14)]);
    const by = Object.fromEntries(out.map((o) => [o.ev.id, o]));
    expect([by.a.col, by.a.cols]).toEqual([0, 2]);
    expect([by.b.col, by.b.cols]).toEqual([1, 2]);
    expect([by.c.col, by.c.cols]).toEqual([0, 1]);
  });

  it('끝을 모르면 한 시간짜리로 그린다', () => {
    expect(endOf(ev('a', 15, null)) - Date.parse(iso(2026, 11, 10, 15))).toBe(3600000);
  });

  it('시간 축은 기본 9~20시, 일정 따라 늘어난다', () => {
    const start = weekStart(now);
    expect(hourRange(start, [ev('a', 10, 11)])).toEqual({ first: 9, last: 20 });
    expect(hourRange(start, [ev('a', 7, 8), ev('b', 21, 23)])).toEqual({ first: 7, last: 23 });
  });
});
