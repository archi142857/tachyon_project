// 하루 고리: 붙어 있는 같은 모양 구간 찾기(사람 11-13 "같은 모양이나 색깔로 연속된 일정이 표시되면 분간이 안 됨")
import { describe, expect, it } from 'vitest';
import { ringRuns } from './components/DayRing.jsx';

const arc = (key, from, to, kind) => ({ key, from, to, kind });

describe('ringRuns', () => {
  it('붙어 있는 수업 둘: 둘째를 다르게 그리고 경계 하나', () => {
    const r = ringRuns([arc('a', 540, 600, 'timetable'), arc('b', 600, 690, 'timetable')]);
    expect([...r.alt]).toEqual(['b']);
    expect(r.cuts).toEqual([600]);
  });
  it('셋이 이어지면 번갈아(가운데만)', () => {
    const r = ringRuns([arc('c', 690, 780, 'timetable'), arc('a', 540, 600, 'timetable'), arc('b', 600, 690, 'timetable')]);
    expect([...r.alt]).toEqual(['b']);
    expect(r.cuts).toEqual([600, 690]);
  });
  it('넣어 본 자리 둘도 같은 규칙', () => {
    const r = ringRuns([arc('t1', 900, 960, 'slot'), arc('t2', 960, 1020, 'slot')]);
    expect([...r.alt]).toEqual(['t2']);
  });
  it('달력 일정과 메모 일정은 같은 □라 이어진 것으로 본다', () => {
    const r = ringRuns([arc('i', 600, 660, 'ics'), arc('m', 660, 720, 'memo')]);
    expect([...r.alt]).toEqual(['m']);
  });
  it('모양이 다르거나 30분 넘게 떨어지거나 많이 겹치면 그대로', () => {
    expect(ringRuns([arc('a', 540, 600, 'timetable'), arc('b', 600, 660, 'ics')]).cuts).toEqual([]);
    expect(ringRuns([arc('a', 540, 600, 'timetable'), arc('b', 631, 660, 'timetable')]).cuts).toEqual([]);
    expect(ringRuns([arc('a', 540, 660, 'timetable'), arc('b', 600, 720, 'timetable')]).cuts).toEqual([]);
  });
  it('쉬는 시간 15분(예시 16:30–17:20, 17:35–18:25, 18:40–19:30)도 붙어 보이니 번갈아, 경계는 틈 가운데', () => {
    const r = ringRuns([arc('a', 990, 1040, 'timetable'), arc('b', 1055, 1105, 'timetable'), arc('c', 1120, 1170, 'timetable')]);
    expect([...r.alt]).toEqual(['b']);
    expect(r.cuts).toEqual([1048, 1113]);
  });
});
