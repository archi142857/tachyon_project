// 오늘 화면(하루 고리 · 오늘 타임라인)이 쓰는 계산. 하루는 0~1440분(한국 시간)으로 다룬다.
// '넣어 본 자리' = 오늘 빈 시간에 할 일을 순서대로 넣어 본 것. 화면에서만 계산하고 저장하지 않는다.
import { endOf, isAllDay } from './layout.js';
import { readPrefs } from './prefs.js';

// 일어나는 시각(시작 질문, prefs.js). 나 창에서 바꾸면 setWake로 바로 바뀐다
export let WAKE = readPrefs().wake;
export const setWake = (h) => (WAKE = h);
const GAP = 10; // 일정 앞뒤로 비워 두는 분, 자리도 10분 단위로 잡는다

// 620 → '10:20'
export const hm = (min) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;

// 그날(day = 한국 시간 0시)에 걸친 시간 일정만 골라 { ev, from, to }(분)로. 자정을 넘는 부분은 자른다
export function dayEvents(events, day) {
  const d = new Date(day).getTime();
  return events
    .filter((ev) => !isAllDay(ev) && Date.parse(ev.start) < d + 1440 * 60000 && endOf(ev) > d)
    .map((ev) => ({ ev, from: Math.max(0, Math.round((Date.parse(ev.start) - d) / 60000)), to: Math.min(1440, Math.round((endOf(ev) - d) / 60000)) }))
    .sort((a, b) => a.from - b.from);
}

// 할 일(순서대로)마다 오늘 넣어 본 자리 [시작 분, 끝 분]. 못 넣으면 null:
// 끝냈거나, 걸리는 시간을 모르거나(밤 정리가 채운다), 수업·자료 뒤에야 할 수 있거나, 오늘 남은 빈 시간이 모자랄 때
// t.window = [from, to](분)가 있으면 그 시간대 안에서 먼저 찾는다(메모 '월요일 오전에 …', 11-15 taskLocal plan):
// 시작이 그 안이고 처음 1시간(짧으면 다)이 그 안이면 된다(서버 lib/known.js suggestFree와 같은 규칙). 없으면 예전처럼 지금 뒤 아무 때나
export function daySlots(tasks, busy, nowMin) {
  const taken = busy.map(({ from, to }) => [from, to]);
  const first = Math.ceil(Math.max(nowMin, WAKE * 60) / GAP) * GAP;
  const place = (minutes, from, to) => {
    let s = Math.ceil(Math.max(first, from) / GAP) * GAP;
    let hit;
    while ((hit = taken.find(([a, b]) => s < b + GAP && s + minutes > a - GAP))) s = Math.ceil((hit[1] + GAP) / GAP) * GAP;
    return s + Math.min(minutes, 60) <= to && s + minutes <= 1440 ? s : null;
  };
  return tasks.map((t) => {
    if (t.done || !t.minutes || t.ready === 0) return null;
    const s = (t.window ? place(t.minutes, t.window[0], t.window[1]) : null) ?? place(t.minutes, first, 1440);
    if (s == null) return null;
    taken.push([s, s + t.minutes]);
    return [s, s + t.minutes];
  });
}

// 지금부터 자정까지, 일정이 없는 분
export function freeMinutes(busy, nowMin) {
  let free = 0;
  let s = nowMin;
  for (const { from, to } of busy) {
    if (from > s) free += from - s;
    s = Math.max(s, to);
  }
  return free + Math.max(0, 1440 - s);
}
