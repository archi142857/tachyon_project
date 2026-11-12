import { describe, expect, it } from 'vitest';
import { normalizeEvent, popupToEvent } from './api.js';
import { eventToForm, formToEvent, formToPopup, popupToForm } from './components/EventForm.jsx';
import { examplePopup, makeExample } from './example.js';
import { endOf, hourRange, isAllDay, layoutDay } from './layout.js';
import { FEEDS, detectFeed, feedResult, normalizeIcs, resultLine, unsavedErrors } from './setup.js';
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
    expect(slackLabel(2.3)).toBe('여유 2일'); // 서버는 소수로 준다
    expect(slackLabel(0.4)).toBe('빠듯');
    expect(slackLabel(-0.2)).toBe('시간 모자람');
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

  it('붙여 넣은 주소가 어느 캘린더 것인지 알아서 고른다', () => {
    expect(detectFeed(' https://myetl.snu.ac.kr/feeds/calendars/user_EXAMPLE.ics ')).toBe('etl');
    expect(detectFeed('https://calendar.google.com/calendar/ical/example%40gmail.com/private-EXAMPLE/basic.ics')).toBe('google');
    expect(detectFeed('webcal://p01-caldav.icloud.com/published/2/EXAMPLE')).toBe('apple');
    expect(detectFeed('https://calendar.google.com/calendar/ical/example%40gmail.com/public/basic.ics')).toBeNull(); // 공개 주소는 안 받는다
    expect(detectFeed('내일 3시 회의')).toBeNull();
    expect(detectFeed('')).toBeNull();
  });

  it('저장된 주소의 지금 상태 한 줄(GET /api/feeds 모양)', () => {
    expect(feedResult({ kind: 'etl', set: true, count: 3, error: null })).toEqual({ ok: true, text: '항목 3개를 받았어요' });
    expect(feedResult({ kind: 'google', set: true, count: 12, error: null }).text).toBe('일정 12개를 받았어요');
    expect(feedResult({ kind: 'apple', set: true, count: null, error: null }).text).toBe('받는 중이에요');
    expect(feedResult({ kind: 'etl', set: false })).toBeNull();
    // 서버 문장은 그대로(멈춘 주소의 '다시 붙여 주세요'도 error에 들어 있다)
    const dead = '이 캘린더 주소가 더 이상 열리지 않아요. 캘린더에서 주소를 다시 복사해 붙여 주세요';
    expect(feedResult({ kind: 'apple', set: true, count: 5, error: dead, stopped: true })).toEqual({ ok: false, text: dead });
  });

  it('저장·다시 받기 바로 뒤 한 줄(PUT /api/feeds results 모양)', () => {
    expect(resultLine({ kind: 'etl', ok: true, saved: true, same: false, tasks: 2, events: 0, count: 2 })).toEqual({ ok: true, text: '과제 2개를 찾았어요' });
    expect(resultLine({ kind: 'etl', ok: true, saved: true, tasks: 2, events: 3 }).text).toBe('과제 2개, 일정 3개를 찾았어요');
    expect(resultLine({ kind: 'google', ok: true, saved: true, tasks: 0, events: 12 }).text).toBe('일정 12개를 찾았어요');
    expect(resultLine({ kind: 'apple', ok: true, same: true, count: 7 }).text).toBe('일정 7개, 바뀐 것 없어요');
    // 잠깐의 오류: 저장은 됐고 서버 문장 그대로
    const later = '응답이 늦어요 — 저장해 두고 15분 뒤에 다시 받아요';
    expect(resultLine({ kind: 'google', ok: false, saved: true, error: later })).toEqual({ ok: false, text: later });
    // 저장 안 됨·지움은 한 줄 없음(저장 안 된 칸은 오류로 따로)
    expect(resultLine({ kind: 'apple', ok: false, saved: false, error: '주소가 열리지 않아요(404)' })).toBeNull();
    expect(resultLine({ kind: 'etl', ok: true, saved: false, removed: true })).toBeNull();
  });

  it('저장 못 한 칸 → 칸 오류(주소는 남긴다)', () => {
    const results = [
      { kind: 'etl', ok: true, saved: true, tasks: 1, events: 0 },
      { kind: 'apple', ok: false, saved: false, error: '주소가 열리지 않아요(404)' },
      { kind: 'google', ok: true, saved: false, removed: true },
    ];
    expect(unsavedErrors(results)).toEqual({ apple: '주소가 열리지 않아요(404)' });
    expect(unsavedErrors([{ kind: 'etl', ok: true, saved: true, example: true }])).toEqual({});
  });
});

describe('예시 팝업 흉내(서버 없을 때만, 서버와 같은 모양)', () => {
  it('내일 3시 301동 스터디 → 쓴 말 그대로 제목, 끝은 1시간(11-13 서버 · AI와 같게, 채운 칸은 guessed)', () => {
    expect(examplePopup('내일 3시 301동 스터디', now)).toEqual({ title: '스터디', date: '2026-11-10', time: '15:00', end_time: '16:00', place: '301동', by: 'rule', guessed: ['end_time'] });
    expect(examplePopup('3시 스터디', now)).toMatchObject({ time: '15:00', end_time: '16:00', guessed: ['date', 'end_time'] });
  });

  it('요일·반·오전, 시각을 모르면 ?', () => {
    expect(examplePopup('금요일 오전 10시 반 면담', now)).toMatchObject({ date: '2026-11-13', time: '10:30', title: '면담', place: '?' });
    expect(examplePopup('다음 주 월요일 회의', now)).toMatchObject({ date: '2026-11-16', time: '?', title: '회의' });
  });

  it('할 일 메모는 할 일 팝업(마감은 날짜 말), 일정도 할 일도 아니면 팝업 없음', () => {
    expect(examplePopup('동아리 회비 걷기 물어보기', now)).toEqual({ kind: 'task', title: '동아리 회비 걷기 물어보기', date: '?', time: '?', minutes: 30, by: 'rule' });
    expect(examplePopup('금요일까지 실험 보고서 내기', now)).toEqual({ kind: 'task', title: '실험 보고서 내기', date: '2026-11-13', time: '?', minutes: 30, by: 'rule' });
    // 한 메모에 할 일 여럿은 쉼표로 나눈다(11-12 사람 요청)
    expect(examplePopup('도서관 책 반납, 장학금 서류 내기', now).also).toEqual([{ title: '장학금 서류 내기', minutes: 30 }]);
    expect(examplePopup('앱 아이디어 메모', now)).toBeNull();
    expect(examplePopup('점심 맛있었다', now)).toBeNull();
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
    expect(popupToEvent({ date: '2026-11-10', time: '15:00', end_time: '?' })).toEqual({ start: '2026-11-10T15:00:00+09:00', end: '2026-11-10T16:00:00+09:00' }); // 끝 모르면 1시간(11-13)
    expect(popupToEvent({ date: '2026-11-10', time: '15:00', end_time: '17:00' })).toEqual({ start: '2026-11-10T15:00:00+09:00', end: '2026-11-10T17:00:00+09:00' });
    expect(popupToEvent({ date: '2026-11-10', time: '?', end_time: '?' })).toEqual({ start: '2026-11-10', end: null });
  });
});

describe('고치기 칸', () => {
  it('팝업 ↔ 입력칸: 모르는 칸은 빈칸, 다시 ?', () => {
    const popup = { title: '스터디', date: '2026-11-10', time: '15:00', end_time: '?', place: '?' };
    const form = popupToForm(popup);
    expect(form).toEqual({ title: '스터디', date: '2026-11-10', start: '15:00', end: '', place: '' });
    expect(formToPopup({ ...form, place: ' 301동 ' })).toEqual({ title: '스터디', date: '2026-11-10', time: '15:00', end_time: '16:00', place: '301동' }); // 끝 빈칸 → 1시간(11-13)
  });

  it('일정 ↔ 입력칸: 시작을 비우면 종일, 끝이 비었거나 시작보다 이르면 1시간', () => {
    const form = eventToForm({ title: '스터디', start: '2026-11-10T15:00:00+09:00', end: null, place: '301동' });
    expect(form).toEqual({ title: '스터디', date: '2026-11-10', start: '15:00', end: '', place: '301동' });
    expect(formToEvent({ ...form, end: '17:00' })).toEqual({ title: '스터디', start: '2026-11-10T15:00:00+09:00', end: '2026-11-10T17:00:00+09:00', place: '301동' });
    expect(formToEvent({ ...form, end: '14:00' }).end).toBe('2026-11-10T16:00:00+09:00'); // 시작보다 이른 끝 → 1시간
    // 끝을 비우면 1시간(11-13 사람), 자정을 넘어도 다음 날로
    expect(formToEvent({ ...form, end: '' }).end).toBe('2026-11-10T16:00:00+09:00');
    expect(formToEvent({ ...form, start: '23:30', end: '' }).end).toBe('2026-11-11T00:30:00+09:00');
    expect(formToPopup({ title: '회의', date: '2026-11-10', start: '15:00', end: '', place: '' }).end_time).toBe('16:00');
    expect(formToPopup({ title: '회의', date: '2026-11-10', start: '23:30', end: '', place: '' }).end_time).toBe('?');
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

describe('모임 시간표 후보(meet.js bestTimes)', () => {
  it('지난 칸은 빼고, 되는 사람 많은 순으로 겹치지 않게 3개, 시간 순', async () => {
    const { bestTimes } = await import('./meet.js');
    const at = (h) => `2026-11-12T${String(h).padStart(2, '0')}:00:00+09:00`;
    const slots = [9, 10, 11, 12, 13, 14].map((h) => ({ start: at(h), who: h === 9 ? [1, 2, 3] : h < 12 ? [1, 2] : [1] }));
    const now = Date.parse(at(10)); // 9시는 지남
    const best = bestTimes(slots, { length: 60, slot: 60 }, now);
    expect(best.map((b) => [b.start.slice(11, 16), b.free])).toEqual([
      ['10:00', 2],
      ['11:00', 2],
      ['12:00', 1],
    ]);
  });
});
