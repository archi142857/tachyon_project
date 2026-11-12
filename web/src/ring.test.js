// 하루 고리: 붙어 보이는 구간 가르기(사람 11-13 "같은 모양이나 색깔로 연속된 일정이 표시되면 분간이 안 됨", 디자인 '11-13' ④)
import { describe, expect, it } from 'vitest';
import { ringRuns } from './components/DayRing.jsx';

const arc = (key, from, to, kind) => ({ key, from, to, kind });

describe('ringRuns', () => {
  it('붙어 있는 수업 둘: 뒤 시작에 금, 둘째를 뒤집어 그림', () => {
    const r = ringRuns([arc('a', 540, 600, 'timetable'), arc('b', 600, 690, 'timetable')]);
    expect(r.seps).toEqual([600]);
    expect([...r.alt]).toEqual(['b']);
  });
  it('쉬는 시간 15분(예시 16:30–17:20, 17:35–18:25, 18:40–19:30)도 붙어 보이니 금 둘, 번갈아(가운데만)', () => {
    const r = ringRuns([arc('c', 1120, 1170, 'timetable'), arc('a', 990, 1040, 'timetable'), arc('b', 1055, 1105, 'timetable')]);
    expect(r.seps).toEqual([1055, 1120]);
    expect([...r.alt]).toEqual(['b']);
  });
  it('넣어 본 자리 둘도 같은 규칙', () => {
    const r = ringRuns([arc('t1', 1180, 1300, 'slot'), arc('t2', 1310, 1430, 'slot')]);
    expect(r.seps).toEqual([1310]);
    expect([...r.alt]).toEqual(['t2']);
  });
  it('모양이 달라도 금은 긋고(디자인 규칙 하나), 뒤집기는 같은 모양끼리만', () => {
    const r = ringRuns([arc('a', 540, 600, 'timetable'), arc('b', 600, 660, 'ics')]);
    expect(r.seps).toEqual([600]);
    expect([...r.alt]).toEqual([]);
  });
  it('달력 일정과 메모 일정은 같은 □라 이어진 것으로 본다', () => {
    expect([...ringRuns([arc('i', 600, 660, 'ics'), arc('m', 660, 720, 'memo')]).alt]).toEqual(['m']);
  });
  it('30분 넘게 떨어지면 그대로', () => {
    const r = ringRuns([arc('a', 540, 600, 'timetable'), arc('b', 630, 660, 'timetable')]);
    expect(r.seps).toEqual([]);
    expect([...r.alt]).toEqual([]);
  });
  it('겹치면 앞 구간이 끝나는 곳에 금, 안에 다 들어간 구간은 건너뜀', () => {
    expect(ringRuns([arc('a', 540, 660, 'ics'), arc('b', 600, 720, 'ics')]).seps).toEqual([660]);
    const r = ringRuns([arc('a', 540, 720, 'ics'), arc('m', 600, 630, 'memo'), arc('c', 730, 780, 'ics')]);
    expect(r.seps).toEqual([730]);
    expect([...r.alt]).toEqual(['c']);
  });
});
