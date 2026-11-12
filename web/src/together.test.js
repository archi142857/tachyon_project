// 다 같이 빈 시간 예시(11-13 겹쳐 보기): 서버 groupFree와 같은 모양, 내 일정이 있는 칸은 빠진다
import { describe, expect, it } from 'vitest';
import { groupFree, makeTogether } from './togetherExample.js';

describe('예시 groupFree', () => {
  const t = makeTogether(new Date('2026-11-13T09:00:00+09:00'));
  it('30분 칸, 사람 수만, 같은 날 이어진 구간', () => {
    const r = groupFree(t, 201, { from: '2026-11-16', days: 1, mine: [] }); // 월요일
    expect(r.slot).toBe(30);
    expect(r.slots).toHaveLength(32); // 08:00~24:00
    expect(r.known).toBe(3);
    expect(r.together.map((x) => `${x.start.slice(11, 16)}–${x.end.slice(11, 16)}`)).toEqual(['08:00–09:00', '12:00–14:00', '18:00–21:00']);
  });
  it('내 일정(끝 없으면 1시간)이 있는 칸은 다 같이 빈 시간에서 빠지고, 종일 일정은 안 센다', () => {
    const mine = [{ start: '2026-11-16T12:30:00+09:00', end: null }, { start: '2026-11-16', end: null }];
    const r = groupFree(t, 201, { from: '2026-11-16', days: 1, mine });
    expect(r.together.map((x) => `${x.start.slice(11, 16)}–${x.end.slice(11, 16)}`)).toEqual(['08:00–09:00', '12:00–12:30', '13:30–14:00', '18:00–21:00']);
  });
  it('없는 그룹은 404', () => {
    expect(() => groupFree(t, 999, { from: '2026-11-16' })).toThrow('없는 그룹이에요');
  });
});
