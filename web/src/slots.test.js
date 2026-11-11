import { describe, expect, it } from 'vitest';
import { dayEvents, daySlots, freeMinutes, hm } from './slots.js';
import { fromKst, toKstIso } from './time.js';

const day = fromKst(2026, 11, 11);
const at = (h, min = 0, d = 11) => toKstIso(fromKst(2026, 11, d, h, min));
const ev = (start, end) => ({ id: start, title: '수업', start, end });

describe('오늘 넣어 본 자리', () => {
  const busy = dayEvents([ev(at(13), at(14, 15)), ev(at(10), at(11, 15)), ev(at(9, 0, 12), at(10, 0, 12)), ev(at(23), at(1, 0, 12))], day);

  it('오늘 일정만 시작 순서로, 자정을 넘으면 자른다', () => {
    expect(busy.map((b) => [b.from, b.to])).toEqual([[600, 675], [780, 855], [1380, 1440]]);
  });

  it('일정과 10분 띄우고, 앞 할 일이 잡은 자리를 비켜 간다', () => {
    const tasks = [{ minutes: 60, ready: 1 }, { minutes: 120, ready: 1 }, { minutes: 30, ready: 1 }];
    // 9:00부터: 60분은 9:00–10:00(10시 수업과 붙어 있어 안 됨) → 11:30–12:30, 120분은 14:30–16:30, 30분은 9:00–9:30
    expect(daySlots(tasks, busy, 9 * 60).map((s) => s && s.map(hm))).toEqual([['11:30', '12:30'], ['14:30', '16:30'], ['9:00', '9:30']]);
  });

  it('못 넣는 할 일은 null', () => {
    const tasks = [{ minutes: null, ready: 1 }, { minutes: 60, ready: 0 }, { minutes: 60, ready: 1, done: 1 }, { minutes: 600, ready: 1 }];
    expect(daySlots(tasks, busy, 20 * 60)).toEqual([null, null, null, null]);
  });

  it('일어나기 전에는 넣지 않는다', () => {
    expect(daySlots([{ minutes: 30, ready: 1 }], [], 3 * 60)).toEqual([[420, 450]]);
  });

  it('남은 빈 시간', () => {
    expect(freeMinutes(busy, 12 * 60)).toBe(60 + 525);
    expect(freeMinutes(busy, 13 * 60 + 30)).toBe(525);
  });
});
