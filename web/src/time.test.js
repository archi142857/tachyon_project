import { describe, expect, it } from 'vitest';
import { addDays, dateInput, dayIndex, dayLabel, dayStartKst, dueLabel, fromKst, hhmm, isDateOnly, isoFromInputs, kst, minuteOfDay, popupTime, timeInput, toKstIso, weekStart, weekTitle } from './time.js';

// 예시 시각: 2026-11-09(월) 16:55 한국 시간
const now = fromKst(2026, 11, 9, 16, 55);

describe('time', () => {
  it('한국 시간으로 읽는다', () => {
    expect(now.toISOString()).toBe('2026-11-09T07:55:00.000Z');
    expect(kst(now)).toEqual({ y: 2026, m: 11, d: 9, wd: 0, h: 16, min: 55 });
  });

  it('주의 시작은 월요일 0시(한국 시간)', () => {
    expect(weekStart(fromKst(2026, 11, 15, 23, 59)).toISOString()).toBe('2026-11-08T15:00:00.000Z');
    expect(weekStart(fromKst(2026, 11, 16, 0, 0)).toISOString()).toBe('2026-11-15T15:00:00.000Z');
  });

  it('주 제목과 달이 바뀌는 주', () => {
    expect(weekTitle(weekStart(now))).toBe('11월 9일 – 15일');
    expect(weekTitle(weekStart(fromKst(2026, 12, 1)))).toBe('11월 30일 – 12월 6일');
  });

  it('주 안에서 며칠째', () => {
    const start = weekStart(now);
    expect(dayIndex(start, fromKst(2026, 11, 10, 15))).toBe(1);
    expect(dayIndex(start, fromKst(2026, 11, 16, 0))).toBe(-1);
    expect(dayIndex(start, addDays(start, -1))).toBe(-1);
  });

  it('시각 글', () => {
    expect(hhmm(fromKst(2026, 11, 10, 9, 5))).toBe('9:05');
    expect(minuteOfDay(fromKst(2026, 11, 10, 15, 30))).toBe(930);
  });

  it('마감 글', () => {
    expect(dueLabel(fromKst(2026, 11, 11, 23, 59), now)).toBe('수 23:59');
    expect(dueLabel(fromKst(2026, 11, 20, 23, 59), now)).toBe('11월 20일');
    expect(dueLabel(fromKst(2026, 11, 8, 23, 59), now)).toBe('마감 지남');
    expect(dueLabel(null, now)).toBe('마감 ?');
  });

  it('팝업 시간 칸: 끝을 모르면 ?', () => {
    expect(popupTime(fromKst(2026, 11, 10, 15).toISOString(), null)).toBe('11월 10일 (화) 15:00 ~ ?');
    expect(popupTime(fromKst(2026, 11, 10, 15).toISOString(), fromKst(2026, 11, 10, 17).toISOString())).toBe('11월 10일 (화) 15:00 ~ 17:00');
    expect(popupTime(null, null)).toBe('?');
  });

  it('입력칸 값과 ISO 사이', () => {
    const iso = fromKst(2026, 11, 10, 9, 5).toISOString();
    expect(dateInput(iso)).toBe('2026-11-10');
    expect(timeInput(iso)).toBe('09:05');
    expect(isoFromInputs('2026-11-10', '09:05')).toBe('2026-11-10T09:05:00+09:00');
    expect(Date.parse(isoFromInputs('2026-11-10', '09:05'))).toBe(Date.parse(iso));
    expect(isoFromInputs('2026-11-10', '')).toBeNull();
  });

  it('서버로 보내는 시각은 +09:00, 종일 일정은 날짜만', () => {
    expect(toKstIso(fromKst(2026, 11, 13, 15))).toBe('2026-11-13T15:00:00+09:00');
    expect(isDateOnly('2026-11-13')).toBe(true);
    expect(isDateOnly('2026-11-13T15:00:00+09:00')).toBe(false);
    expect(dayStartKst('2026-11-13').toISOString()).toBe('2026-11-12T15:00:00.000Z');
  });

  it('채팅 날짜 줄', () => {
    expect(dayLabel(fromKst(2026, 11, 9, 8), now)).toBe('오늘');
    expect(dayLabel(fromKst(2026, 11, 8, 23), now)).toBe('어제');
    expect(dayLabel(fromKst(2026, 11, 7, 12), now)).toBe('11월 7일 (토)');
  });
});
