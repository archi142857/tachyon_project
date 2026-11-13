// native.js의 폰 캘린더 쓰기 짝 맞추기(planPush). 폰 플러그인 없이 순수 함수만 본다. 일정은 지어낸 예시다.
import { describe, expect, it } from 'vitest';
import { planPush, pushKey } from './native.js';

const H = 60 * 60 * 1000;
const item = (key, o = {}) => ({ key, title: `예시 ${key}`, start: Date.parse('2026-11-13T15:00:00+09:00'), end: Date.parse('2026-11-13T16:00:00+09:00'), allDay: false, place: null, ...o });
const note = (key) => `Tachyon에서 넣은 일정이에요. 고치거나 지우려면 Tachyon에서 하세요.\ntachyon:${key}`;
const phone = (id, it, o = {}) => ({ id, title: it.title, startDate: it.start, endDate: it.end, isAllDay: it.allDay, location: it.place ?? undefined, notes: note(it.key), calendarName: 'Tachyon', ...o });

describe('폰 Tachyon 캘린더 맞추기', () => {
  it('메모 칸 끝 줄에서 짝 열쇠를 읽는다', () => {
    expect(pushKey(note('event-12'))).toBe('event-12');
    expect(pushKey('tachyon:task-5')).toBe('task-5');
    expect(pushKey('그냥 메모')).toBe(null);
    expect(pushKey(undefined)).toBe(null);
  });

  it('처음: 다 넣는다 · 같으면 그대로 · 없어진 것은 지운다', () => {
    const a = item('event-1');
    const b = item('event-2', { place: '예시 301동' });
    expect(planPush([], [a, b])).toEqual({ add: [a, b], remove: [] });
    expect(planPush([phone('p1', a), phone('p2', b)], [a, b])).toEqual({ add: [], remove: [] });
    expect(planPush([phone('p1', a), phone('p2', b)], [a])).toEqual({ add: [], remove: ['p2'] });
  });

  it('제목·시각·장소가 바뀌면 지우고 다시 넣는다', () => {
    const a = item('event-1');
    const moved = { ...a, start: a.start + H, end: a.end + H };
    expect(planPush([phone('p1', a)], [moved])).toEqual({ add: [moved], remove: ['p1'] });
    const renamed = { ...a, title: '예시 바뀐 이름' };
    expect(planPush([phone('p1', a)], [renamed])).toEqual({ add: [renamed], remove: ['p1'] });
  });

  it('종일 일정: 폰이 그 지역 자정으로 돌려줘도(한국 -9시간) 같은 날이면 그대로', () => {
    const day = item('task-5', { title: '마감 23:59 · 예시 보고서', start: Date.parse('2026-11-13T00:00:00Z'), end: Date.parse('2026-11-14T00:00:00Z'), allDay: true });
    const local = phone('p9', day, { startDate: day.start - 9 * H, endDate: day.end - 9 * H });
    expect(planPush([local], [day])).toEqual({ add: [], remove: [] });
    const nextDay = { ...day, start: day.start + 24 * H, end: day.end + 24 * H };
    expect(planPush([local], [nextDay])).toEqual({ add: [nextDay], remove: ['p9'] });
  });

  it('열쇠가 없거나 겹친 폰 일정은 지운다(사람이 Tachyon 캘린더에 직접 넣은 것 포함)', () => {
    const a = item('event-1');
    const stray = { ...phone('p5', a), notes: '사람이 직접 넣음' };
    expect(planPush([phone('p1', a), phone('p2', a), stray], [a])).toEqual({ add: [], remove: ['p2', 'p5'] });
  });
});

// ── 켜기·맞추기·끄기 흐름: 가짜 폰 캘린더(플러그인)와 가짜 서버 목록으로 ──

import { vi, beforeEach } from 'vitest';

vi.mock('./api.js', () => ({
  getCalendarItems: vi.fn(),
  sendDeviceEvents: vi.fn(async (events) => ({ count: events.length, same: 0 })),
}));

const api = await import('./api.js');
const native = await import('./native.js');

/** 안드로이드 캘린더를 흉내: 캘린더·일정 표, findEvents는 그 캘린더 이름이 없으면 오류(플러그인과 같음) */
function fakeCalendarPlugin({ read = 'granted', write = 'granted' } = {}) {
  let nextId = 100;
  const calendars = [{ id: '1', name: '내 캘린더', displayName: '내 캘린더' }];
  const events = [{ id: 'g1', title: '예시 폰 일정', startDate: 1, endDate: 2, isAllDay: false, calendarId: '1', calendarName: '내 캘린더' }];
  const calls = [];
  return {
    calls,
    events,
    calendars,
    checkPermissions: async () => ({ readCalendar: read, writeCalendar: write }),
    requestPermissions: async () => ({ readCalendar: read, writeCalendar: write }),
    listCalendars: async () => ({ calendars: calendars.map((c) => ({ ...c })) }),
    createCalendar: async ({ name }) => {
      calls.push(['createCalendar', name]);
      const id = String(nextId++);
      calendars.push({ id, name, displayName: name });
      return { id };
    },
    deleteCalendar: async ({ name }) => {
      calls.push(['deleteCalendar', name]);
      const c = calendars.find((x) => x.name === name);
      calendars.splice(calendars.indexOf(c), 1);
      for (let i = events.length - 1; i >= 0; i--) if (events[i].calendarId === c.id) events.splice(i, 1);
    },
    findEvents: async ({ calendarName }) => {
      if (calendarName && !calendars.some((c) => c.name === calendarName)) throw new Error('OS-PLUG-CLDR-0001');
      return { events: events.filter((e) => !calendarName || e.calendarName === calendarName).map((e) => ({ ...e })) };
    },
    createEvent: async (o) => {
      calls.push(['createEvent', o.title]);
      const c = calendars.find((x) => x.id === o.calendarId);
      const id = String(nextId++);
      events.push({ id, title: o.title, startDate: o.startDate, endDate: o.endDate, isAllDay: o.isAllDay, location: o.location, notes: o.notes, calendarId: c.id, calendarName: c.name });
      return { id };
    },
    deleteEvent: async ({ id }) => {
      calls.push(['deleteEvent', id]);
      events.splice(events.findIndex((e) => e.id === id), 1);
    },
  };
}

describe('폰 캘린더에 쓰기 흐름(가짜 플러그인)', () => {
  let store;
  beforeEach(() => {
    store = new Map();
    globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  });

  it('켜면 Tachyon 캘린더를 만들고 넣고, 다시 맞추면 바뀐 것만, 끄면 그 캘린더만 지운다', async () => {
    const cal = fakeCalendarPlugin();
    globalThis.window = { Capacitor: { Plugins: { Calendar: cal } } };
    const a = item('event-1', { place: '예시 301동' });
    const b = item('task-2', { title: '마감 23:59 · 예시 보고서', start: Date.parse('2026-11-13T00:00:00Z'), end: Date.parse('2026-11-14T00:00:00Z'), allDay: true });
    api.getCalendarItems.mockResolvedValue({ items: [a, b] });

    expect(native.pushOn()).toBe(false);
    expect(await native.pushToDevice()).toBe(null); // 끈 상태면 아무것도 안 한다
    expect(await native.turnPushOn()).toEqual({ added: 2, removed: 0, total: 2 });
    expect(native.pushOn()).toBe(true);
    expect(cal.calls.filter(([f]) => f === 'createCalendar')).toEqual([['createCalendar', 'Tachyon']]);
    expect(cal.events.filter((e) => e.calendarName === 'Tachyon').map((e) => e.title)).toEqual([a.title, b.title]);

    // 그대로면 아무것도 안 바꾼다
    cal.calls.length = 0;
    expect(await native.pushToDevice()).toEqual({ added: 0, removed: 0, total: 2 });
    expect(cal.calls).toEqual([]);

    // 하나가 옮겨지고 하나가 없어지면: 지우고 다시 넣기
    const moved = { ...a, start: a.start + 3600000, end: a.end + 3600000 };
    api.getCalendarItems.mockResolvedValue({ items: [moved] });
    expect(await native.pushToDevice()).toEqual({ added: 1, removed: 2, total: 1 });

    // 폰 → 서버로 보낼 때는 Tachyon 캘린더를 뺀다
    await native.syncDevice();
    expect(api.sendDeviceEvents).toHaveBeenLastCalledWith([{ id: 'g1', title: '예시 폰 일정', start: 1, end: 2, allDay: false, place: undefined }]);

    // 끄면 Tachyon 캘린더만 지운다
    await native.turnPushOff();
    expect(native.pushOn()).toBe(false);
    expect(cal.calendars.map((c) => c.name)).toEqual(['내 캘린더']);
    expect(cal.events.map((e) => e.id)).toEqual(['g1']);
  });

  it('쓰기 권한을 안 주면 켜지지 않는다', async () => {
    const cal = fakeCalendarPlugin({ write: 'denied' });
    globalThis.window = { Capacitor: { Plugins: { Calendar: cal } } };
    expect(await native.turnPushOn()).toBe(null);
    expect(native.pushOn()).toBe(false);
    expect(cal.calls).toEqual([]);
  });
});

// 아침 알림(morningList): 일어나는 시각 정각, 7번, 첫 아침만 할 일 이름. 할 일 이름은 지어낸 예시다.
import { morningList } from './native.js';

describe('morningList', () => {
  it('일어나는 시각이 지났으면 내일부터, 첫 아침만 할 일 3개', () => {
    const now = new Date(2026, 10, 14, 9, 30);
    const list = morningList(['보고서 쓰기', '예매', '연락', '넷째'], 7, now);
    expect(list).toHaveLength(7);
    expect(list[0].schedule.at).toEqual(new Date(2026, 10, 15, 7, 0));
    expect(list[6].schedule.at).toEqual(new Date(2026, 10, 21, 7, 0));
    expect(list[0].body).toBe('오늘 할 일: 보고서 쓰기 · 예매 · 연락');
    expect(list[1].body).toBe('오늘 일정과 할 일을 확인해요');
    expect(new Set(list.map((n) => n.id)).size).toBe(7);
  });

  it('아직 안 지났으면 오늘부터, 할 일이 없으면 짧은 말', () => {
    const list = morningList([], 8, new Date(2026, 10, 14, 2, 30));
    expect(list[0].schedule.at).toEqual(new Date(2026, 10, 14, 8, 0));
    expect(list[0].body).toBe('오늘 일정과 할 일을 확인해요');
  });
});
