// 주간 달력에서 일정 칸을 어디에 그릴지 계산한다(그리기와 따로 두어 테스트한다).
import { dayIndex, kst, minuteOfDay } from './time.js';

const HOUR = 60 * 60 * 1000;

// 끝 시각을 모르면 한 시간짜리로 그린다(칸에는 '끝 ?'를 붙인다)
export function endOf(ev) {
  return ev.end ? Date.parse(ev.end) : Date.parse(ev.start) + HOUR;
}

// 하루 종일 일정: 한국 시간 0시에 시작하고 길이가 24시간의 배수
export function isAllDay(ev) {
  if (!ev.end) return false;
  const p = kst(ev.start);
  const len = Date.parse(ev.end) - Date.parse(ev.start);
  return p.h === 0 && p.min === 0 && len >= 24 * HOUR && len % (24 * HOUR) === 0;
}

// 하루 안의 일정들을 겹치지 않게 칸으로 나눈다 → [{ ev, col, cols }]
export function layoutDay(events) {
  const items = events
    .map((ev) => ({ ev, s: Date.parse(ev.start), e: endOf(ev) }))
    .sort((a, b) => a.s - b.s || b.e - a.e);
  const out = [];
  let group = [];
  let groupEnd = -Infinity;
  const flush = () => {
    const cols = Math.max(...group.map((g) => g.col)) + 1;
    for (const g of group) out.push({ ev: g.ev, col: g.col, cols });
    group = [];
  };
  for (const it of items) {
    if (group.length && it.s >= groupEnd) {
      flush();
      groupEnd = -Infinity;
    }
    const used = new Set(group.filter((g) => g.e > it.s).map((g) => g.col));
    let col = 0;
    while (used.has(col)) col += 1;
    group.push({ ...it, col });
    groupEnd = Math.max(groupEnd, it.e);
  }
  if (group.length) flush();
  return out;
}

// 그 주의 시간 축: 기본 9시~20시, 일정이 더 이르거나 늦으면 늘린다
export function hourRange(start, events) {
  let first = 9;
  let last = 20;
  for (const ev of events) {
    if (isAllDay(ev) || dayIndex(start, ev.start) < 0) continue;
    first = Math.min(first, Math.floor(minuteOfDay(ev.start) / 60));
    const endMin = minuteOfDay(endOf(ev));
    last = Math.max(last, endMin === 0 ? 24 : Math.ceil(endMin / 60));
  }
  return { first, last };
}
