// 활동 모아보기 거르기(11-19 사람 "내가 신청할 수 있거나 관심사에 맞춰서 모아볼 수 있는 섹션"). 활동 · 일정은 지어낸 예시다.
import { describe, expect, it } from 'vitest';
import { collegeOf, deadlineText, eventFor, fitFor, freeAt, loadPrefs, matchesInterest, parseWords, savePrefs, taskFor, toggle, view, whenText, yearsText } from './activities.js';
import { fromKst } from './time.js';

const now = fromKst(2026, 11, 19, 13, 0); // 목요일 13:00
const base = { src: 'SNU 캘린더', url: 'https://www.snu.ac.kr/x', from: null, to: null, posted: null, kind: '특강·세미나', tags: [], summary: null, apply_until: null, date: null, time: null, end_time: null, end_date: null, place: null, level: null, years: [], colleges: [], who: null };
const act = (id, more) => ({ ...base, id, title: `예시 ${id}`, ...more });

describe('신청할 수 있나', () => {
  const me = { dept: '식품·동물생명공학부 동물생명공학전공', year: 3 };
  it('내 학과 → 단과대', () => {
    expect(collegeOf(me.dept)).toBe('농업생명과학대학');
    expect(collegeOf(null)).toBe(null);
  });
  it('마감 지남 · 대학원생만 · 학년 · 단과대가 안 맞으면 까닭과 함께 빠진다', () => {
    expect(fitFor(act('a', { apply_until: '2026-11-19T12:00' }), me, now)).toEqual({ ok: false, why: '마감 지남' });
    expect(fitFor(act('a', { apply_until: '2026-11-19' }), me, now).ok).toBe(true); // 날짜만이면 그날 23:59까지
    expect(fitFor(act('b', { level: '대학원' }), me, now).why).toBe('대학원생 대상');
    expect(fitFor(act('c', { years: [1] }), me, now).why).toBe('1학년 대상');
    expect(fitFor(act('d', { years: [2, 3, 4] }), me, now).ok).toBe(true);
    expect(fitFor(act('e', { colleges: ['공과대학'] }), me, now).why).toBe('공과대학 대상');
    expect(fitFor(act('f', { colleges: ['농업생명과학대학'] }), me, now).ok).toBe(true);
    expect(fitFor(act('g', { colleges: ['동물생명공학전공'] }), me, now).ok).toBe(true);
  });
  it('내 학년 · 학과를 모르면 그 조건은 통과(원문에서 확인)', () => {
    expect(fitFor(act('c', { years: [1], colleges: ['공과대학'] }), {}, now).ok).toBe(true);
  });
  it('학년 글', () => {
    expect([[2, 3, 4], [1], [1, 2], [3, 4], [1, 3]].map(yearsText)).toEqual(['2학년 이상', '1학년', '1~2학년', '3학년 이상', '1 · 3학년']);
  });
});

describe('관심사 · 시간', () => {
  it('고른 종류이거나 낱말이 제목 · 태그 · 요약에 있으면', () => {
    const prefs = { kinds: ['장학'], words: parseWords('바이오, ai  글쓰기') };
    expect(prefs.words).toEqual(['바이오', 'ai', '글쓰기']);
    expect(matchesInterest(act('a', { kind: '장학' }), prefs)).toBe(true);
    expect(matchesInterest(act('b', { tags: ['AI', '해커톤'] }), prefs)).toBe(true);
    expect(matchesInterest(act('c', { title: '바이오 산업 특강' }), prefs)).toBe(true);
    expect(matchesInterest(act('d', { title: '연주회' }), prefs)).toBe(false);
    expect(matchesInterest(act('d'), { kinds: [], words: [] })).toBe(false);
  });
  it('행사 시각이 내 일정과 겹치면 false(그 일정 이름), 아니면 true, 시각을 모르면 null', () => {
    const events = [
      { title: '유기화학', start: '2026-11-20T09:30:00+09:00', end: '2026-11-20T10:45:00+09:00' },
      { title: '종일 일정', start: '2026-11-21T00:00:00+09:00', end: '2026-11-22T00:00:00+09:00' },
    ];
    expect(freeAt(act('a', { date: '2026-11-20', time: '10:00', end_time: '11:00' }), events)).toEqual({ free: false, clash: '유기화학' });
    expect(freeAt(act('b', { date: '2026-11-20', time: '11:00' }), events)).toEqual({ free: true, clash: null });
    expect(freeAt(act('c', { date: '2026-11-21', time: '15:00' }), events).free).toBe(true); // 종일은 셈하지 않음
    expect(freeAt(act('d', { date: '2026-11-20' }), events).free).toBe(null);
  });
});

describe('글 · 보기', () => {
  it('마감 글 · 행사 때 글', () => {
    expect(deadlineText(act('a', { apply_until: '2026-11-19T18:00' }), now)).toBe('오늘 18:00까지');
    expect(deadlineText(act('a', { apply_until: '2026-11-20' }), now)).toBe('내일까지');
    expect(deadlineText(act('a', { apply_until: '2026-11-30T13:00' }), now)).toBe('D-11 · 11/30(월) 13:00까지');
    expect(deadlineText(act('a', { apply_until: '2026-11-18' }), now)).toBe('마감 지남');
    expect(deadlineText(act('a'), now)).toBe(null);
    expect(whenText(act('b', { date: '2026-11-28', time: '19:00', end_time: '21:00' }))).toBe('11/28(토) 19:00–21:00');
    expect(whenText(act('b', { date: '2026-11-20', end_date: '2026-11-30' }))).toBe('11/20(금) ~ 11/30(월)');
  });
  it('탭 · 종류 · 시간 됨 · 숨기기 · 별표', () => {
    const items = [act('a', { kind: '장학' }), act('b', { level: '대학원' }), act('c', { kind: '공모전·대회', date: '2026-11-20', time: '10:00' }), act('d')];
    let prefs = { kinds: ['장학'], words: [], star: [], hide: [] };
    const ctx = { prefs, me: {}, events: [{ title: '유기화학', start: '2026-11-20T09:30:00+09:00', end: '2026-11-20T10:45:00+09:00' }], now };
    expect(view(items, { tab: 'can' }, ctx).map((i) => i.id)).toEqual(['a', 'c', 'd']);
    expect(view(items, { tab: 'mine' }, ctx).map((i) => i.id)).toEqual(['a']);
    expect(view(items, { kind: '공모전·대회' }, ctx).map((i) => i.id)).toEqual(['c']);
    expect(view(items, { free: true }, ctx).map((i) => i.id)).toEqual([]);
    prefs = toggle(toggle(prefs, 'hide', 'a'), 'star', 'd');
    expect(view(items, {}, { ...ctx, prefs }).map((i) => i.id)).toEqual(['b', 'c', 'd']);
    expect(view(items, { tab: 'star' }, { ...ctx, prefs }).map((i) => i.id)).toEqual(['d']);
    expect(toggle(prefs, 'star', 'd').star).toEqual([]);
  });
  it('할 일 · 일정 몸: 마감 시각까지, 시각 모르는 행사는 종일(끝은 다음 날)', () => {
    expect(taskFor(act('a', { title: '예시 멘토 모집', apply_until: '2026-11-30T13:00' }))).toEqual({ title: '예시 멘토 모집 신청', due: '2026-11-30T13:00:00+09:00' });
    expect(taskFor(act('a', { apply_until: '2026-11-30' })).due).toBe('2026-11-30');
    expect(taskFor(act('a'))).toBe(null);
    expect(eventFor(act('b', { title: '예시 특강', date: '2026-11-28', time: '19:00', end_time: '21:00', place: '예시관' }))).toEqual({ title: '예시 특강', start: '2026-11-28T19:00:00+09:00', end: '2026-11-28T21:00:00+09:00', place: '예시관' });
    expect(eventFor(act('b', { title: '예시 캠프', date: '2026-11-30', end_date: '2026-12-02' }))).toEqual({ title: '예시 캠프', start: '2026-11-30', end: '2026-12-03', place: null });
    expect(eventFor(act('b'))).toBe(null);
  });
  it('이 기기에 적기 · 읽기(깨진 값은 빈 값)', () => {
    const mem = new Map();
    const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
    savePrefs({ kinds: ['봉사'], words: ['AI'], star: ['e1'], hide: [] }, storage);
    expect(loadPrefs(storage).kinds).toEqual(['봉사']);
    mem.set('tachyon_activities_v1', '{깨짐');
    expect(loadPrefs(storage)).toEqual({ kinds: [], words: [], star: [], hide: [] });
  });
});
