// 날마다 밀도(11-11 사람: "그 날마다 밀도 고리 만들고 주간 밀도가 일정하게 유지하는 기능이 시각적으로 보이도록").
// 밀도 = 그날 깨어 있는 시간(7시~24시) 가운데 일정 + 할 일에 쓰는 몫.
// 할 일의 걸리는 시간은 오늘부터 마감 전 날들에 고르게 나눈다(물 채우기: 가장 덜 찬 날부터 15분씩, 그날 빈 시간까지만).
// 견주어 보이려고 '마감 날에 몰아서 할 때'(naive)도 같이 센다. 화면에서만 셈하고 저장하지 않는다.
import { endOf, isAllDay } from './layout.js';
import { WAKE } from './slots.js';
import { addDays, dayStart, minuteOfDay } from './time.js';

export const AWAKE = (24 - WAKE) * 60; // 깨어 있는 분(1020)
export const PLAN_DAYS = 42; // 오늘부터 6주까지 나눈다
export const GUESS_MIN = 60; // 걸리는 시간을 아직 모르는 할 일(밤 정리가 채우기 전)은 1시간으로 센다
const STEP = 15;
const DAY = 24 * 60 * 60 * 1000;

export const dateKey = (date) => {
  const d = new Date(dayStart(date).getTime() + 9 * 3600000);
  return d.toISOString().slice(0, 10);
};

// 그날 fromMin(분)부터 자정까지 시간 일정이 차지하는 분(겹친 것은 한 번만)
export function busyMinutes(events, day, fromMin = WAKE * 60) {
  const d0 = dayStart(day).getTime();
  const a = d0 + fromMin * 60000;
  const b = d0 + DAY;
  const spans = events
    .filter((ev) => !isAllDay(ev))
    .map((ev) => [Math.max(a, Date.parse(ev.start)), Math.min(b, endOf(ev))])
    .filter(([s, e]) => e > s)
    .sort((x, y) => x[0] - y[0]);
  let total = 0;
  let cur = null;
  for (const [s, e] of spans) {
    if (!cur || s > cur[1]) {
      if (cur) total += cur[1] - cur[0];
      cur = [s, e];
    } else cur[1] = Math.max(cur[1], e);
  }
  if (cur) total += cur[1] - cur[0];
  return Math.round(total / 60000);
}

// 할 일을 몇째 날(오늘 = 0)까지 할 수 있나: 정오 전 마감이면 전날까지, 지났으면 오늘, 마감 없으면 2주
function lastIndex(task, today, now) {
  if (!task.due) return 13;
  if (Date.parse(task.due) <= now.getTime()) return 0;
  const i = Math.round((dayStart(task.due) - today) / DAY);
  return minuteOfDay(task.due) < 12 * 60 ? Math.max(0, i - 1) : i;
}

// 오늘부터 days일의 밀도. events = 그 기간 일정, tasks = 끝나지 않은 할 일(due·minutes)
// → [{ date, key, eventMin, taskMin, room, over, naiveTaskMin, items: [{ task, min }], today }]
export function planDensity({ events, tasks, now = new Date(), days = PLAN_DAYS }) {
  const nowDate = new Date(now);
  const today = dayStart(nowDate);
  const list = Array.from({ length: days }, (_, i) => {
    const date = addDays(today, i);
    const startMin = i === 0 ? Math.max(WAKE * 60, minuteOfDay(nowDate)) : WAKE * 60;
    return {
      date,
      key: dateKey(date),
      today: i === 0,
      eventMin: busyMinutes(events, date),
      room: Math.max(0, 1440 - startMin - busyMinutes(events, date, startMin)), // 할 일에 쓸 수 있는 빈 분
      taskMin: 0,
      naiveTaskMin: 0,
      over: 0,
      items: [],
    };
  });
  const open = tasks
    .filter((t) => !t.done)
    .map((t) => ({ task: t, minutes: t.minutes > 0 ? t.minutes : GUESS_MIN, guess: !(t.minutes > 0) }))
    .sort((a, b) => (a.task.due ? Date.parse(a.task.due) : Infinity) - (b.task.due ? Date.parse(b.task.due) : Infinity));
  let guessed = 0;
  for (const { task, minutes, guess } of open) {
    if (guess) guessed += 1;
    const hi = Math.min(days - 1, lastIndex(task, today, nowDate));
    if (hi < 0) continue;
    list[hi].naiveTaskMin += minutes; // 몰아서 할 때
    const got = new Map();
    let left = minutes;
    while (left > 0) {
      let best = null;
      for (let i = 0; i <= hi; i += 1) {
        const d = list[i];
        if (d.taskMin >= d.room) continue;
        if (!best || d.eventMin + d.taskMin < best.eventMin + best.taskMin) best = d;
      }
      if (!best) {
        list[hi].over += left; // 마감 전 빈 시간이 모자라다
        break;
      }
      const add = Math.min(STEP, left, best.room - best.taskMin);
      best.taskMin += add;
      got.set(best, (got.get(best) || 0) + add);
      left -= add;
    }
    for (const [d, min] of got) d.items.push({ task, min });
  }
  list.guessed = guessed;
  return list;
}

// 일정만 아는 날(지난날, 또는 6주 밖). past = 지난날이면 고리를 옅게
export function eventOnlyDay(events, date, past = true) {
  return { date, key: dateKey(date), eventMin: busyMinutes(events, date), taskMin: 0, naiveTaskMin: 0, room: 0, over: 0, items: [], past };
}

export const loadOf = (d) => (d.eventMin + d.taskMin + d.over) / AWAKE; // 0~1(넘으면 1보다 큼)
const used = (d) => d.eventMin + d.taskMin + d.over;
const usedNaive = (d) => d.eventMin + d.naiveTaskMin;

// 여러 날이 얼마나 고른가: 하루 평균(분), 가장 많은 날 − 가장 적은 날(분), 몰아서 할 때의 차이
export function evenness(dayList) {
  if (!dayList.length) return { avg: 0, spread: 0, naiveSpread: 0 };
  const a = dayList.map(used);
  const n = dayList.map(usedNaive);
  return {
    avg: Math.round(a.reduce((x, y) => x + y, 0) / a.length),
    spread: Math.max(...a) - Math.min(...a),
    naiveSpread: Math.max(...n) - Math.min(...n),
    max: Math.max(...a),
  };
}

// 240 → '4시간', 90 → '1.5시간', 40 → '40분'
export function hoursText(min) {
  if (min < 60) return `${Math.round(min)}분`;
  const h = Math.round((min / 60) * 2) / 2;
  return `${h}시간`;
}
