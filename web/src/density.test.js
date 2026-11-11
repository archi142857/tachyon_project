import { describe, expect, it } from 'vitest';
import { AWAKE, busyMinutes, dateKey, evenness, hoursText, loadOf, planDensity } from './density.js';
import { deadlineLabel, deadlineShort, fromKst, kst, monthGrid, shiftMonth, toKstIso } from './time.js';

// 예시 시각: 2026-11-11(수) 08:00 한국 시간
const now = fromKst(2026, 11, 11, 8, 0);
const at = (d, h, m = 0) => toKstIso(fromKst(2026, 11, d, h, m));
const ev = (d, h1, h2, extra = {}) => ({ id: `${d}-${h1}`, title: '수업', start: at(d, h1), end: at(d, h2), ...extra });

describe('busyMinutes', () => {
  it('겹친 일정은 한 번만, 종일 일정은 빼고, 7시 전은 안 센다', () => {
    const events = [ev(11, 9, 11), ev(11, 10, 12), ev(11, 5, 8), { id: 'a', title: '종일', start: '2026-11-11T00:00:00+09:00', end: '2026-11-12T00:00:00+09:00' }];
    expect(busyMinutes(events, fromKst(2026, 11, 11))).toBe(180 + 60); // 9~12시 + 7~8시
  });
});

describe('planDensity', () => {
  it('할 일은 마감 전 날들에 고르게 나눈다(일정이 없으면 같은 몫)', () => {
    // 6시간짜리, 금(13일) 23:59 마감 → 수·목·금 사흘에 2시간씩
    const days = planDensity({ events: [], tasks: [{ id: 1, title: '보고서', due: at(13, 23, 59), minutes: 360, done: 0 }], now, days: 7 });
    expect(days.slice(0, 3).map((d) => d.taskMin)).toEqual([120, 120, 120]);
    expect(days[3].taskMin).toBe(0);
    expect(days[2].naiveTaskMin).toBe(360); // 몰아서 하면 금요일에 6시간
    expect(dateKey(days[0].date)).toBe('2026-11-11');
  });

  it('일정이 많은 날은 덜 받는다', () => {
    const events = [ev(11, 9, 17)]; // 수요일 8시간 수업
    const days = planDensity({ events, tasks: [{ id: 1, title: '과제', due: at(12, 23, 59), minutes: 240, done: 0 }], now, days: 3 });
    // 수: 일정 480분 → 목에 먼저 채운다. 목이 수와 같아질 때까지 모두 목으로
    expect(days[0].taskMin).toBe(0);
    expect(days[1].taskMin).toBe(240);
  });

  it('정오 전 마감은 전날까지, 지난 할 일은 오늘, 빈 시간이 모자라면 넘침', () => {
    const morning = planDensity({ events: [], tasks: [{ id: 1, title: '퀴즈 준비', due: at(13, 9, 0), minutes: 120, done: 0 }], now, days: 4 });
    expect(morning[2].taskMin).toBe(0); // 금요일 아침 마감 → 금요일엔 안 넣는다
    expect(morning[0].taskMin + morning[1].taskMin).toBe(120);
    const late = planDensity({ events: [], tasks: [{ id: 2, title: '밀린 과제', due: at(10, 23, 59), minutes: 90, done: 0 }], now, days: 3 });
    expect(late[0].taskMin).toBe(90);
    const full = planDensity({ events: [ev(11, 8, 24)], tasks: [{ id: 3, title: '오늘 마감', due: at(11, 23, 0), minutes: 60, done: 0 }], now, days: 2 });
    expect(full[0].over).toBe(60);
    expect(loadOf(full[0])).toBeGreaterThan(0.9);
  });

  it('끝낸 할 일은 빼고, 걸리는 시간을 모르면 1시간으로 센다', () => {
    const days = planDensity({ events: [], tasks: [{ id: 1, title: 'a', due: at(11, 23, 0), minutes: 60, done: 1 }, { id: 2, title: 'b', due: at(11, 23, 0), minutes: null, done: 0 }], now, days: 1 });
    expect(days[0].taskMin).toBe(60);
    expect(days.guessed).toBe(1);
  });

  it('고르게 나누면 몰아서 할 때보다 날마다 차이가 작다', () => {
    const tasks = [
      { id: 1, title: 'a', due: at(13, 23, 59), minutes: 300, done: 0 },
      { id: 2, title: 'b', due: at(15, 23, 59), minutes: 240, done: 0 },
    ];
    const days = planDensity({ events: [ev(12, 9, 15)], tasks, now, days: 7 });
    const e = evenness(days.slice(0, 5));
    expect(e.spread).toBeLessThan(e.naiveSpread);
    expect(AWAKE).toBe(1020);
  });

  it('시간 글', () => {
    expect(hoursText(40)).toBe('40분');
    expect(hoursText(90)).toBe('1.5시간');
    expect(hoursText(250)).toBe('4시간');
  });
});

describe('마감 글', () => {
  it('날짜와 시각을 늘 함께', () => {
    expect(deadlineLabel(null, now)).toBe('마감 ?');
    expect(deadlineLabel(at(11, 23, 59), now)).toBe('마감 오늘 23:59 · 15시간 59분 남음');
    expect(deadlineLabel(at(12, 23, 59), now)).toBe('마감 내일 11/12(목) 23:59');
    expect(deadlineLabel(at(14, 18, 0), now)).toBe('마감 11/14(토) 18:00 · D-3');
    expect(deadlineLabel(at(9, 23, 59), now)).toBe('마감 지남 · 11/9(월) 23:59');
    expect(deadlineShort(at(11, 23, 59), now)).toBe('23:59');
    expect(deadlineShort(at(13, 9, 0), now)).toBe('금 9:00');
    expect(deadlineShort(at(25, 23, 59), now)).toBe('11/25 23:59');
    expect(deadlineShort(at(10, 9, 0), now)).toBe('지남');
  });
});

describe('월 달력', () => {
  it('1일이 든 주 월요일부터 42칸, 달 옮기기', () => {
    const grid = monthGrid(2026, 11);
    expect(grid).toHaveLength(42);
    expect(kst(grid[0])).toMatchObject({ m: 10, d: 26, wd: 0 }); // 2026-11-01은 일요일
    expect(shiftMonth({ y: 2026, m: 12 }, 1)).toEqual({ y: 2027, m: 1 });
    expect(shiftMonth({ y: 2026, m: 1 }, -1)).toEqual({ y: 2025, m: 12 });
  });
});
