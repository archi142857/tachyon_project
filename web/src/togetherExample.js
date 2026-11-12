// '같이' 쪽 예시 자료(?example): 서버 10_together.js와 같은 모양을 흉내 낸다. 사람·모임 이름은 모두 지어낸 예시.
// 남에게는 빈/바쁨만 가는 규칙도 같다(일정 이름 없음).
import { bestTimes } from './meet.js';
import { addDays, dayStart, endOrHour, isDateOnly, kst, toKstIso } from './time.js';

const ME = 1;
const ymd = (d) => toKstIso(d).slice(0, 10);

export function makeTogether(now = new Date()) {
  const today = dayStart(now);
  return {
    friends: [
      { id: 101, name: '예시 친구 1' },
      { id: 102, name: '예시 친구 2' },
    ],
    groups: [{ id: 201, name: '예시 스터디', owner: true, members: [ME, 101, 102] }],
    meets: [{ id: 301, groupId: 201, title: '예시 모임', from: ymd(addDays(today, 1)), to: ymd(addDays(today, 3)), dayStart: '09:00', dayEnd: '18:00', slot: 60, length: 60, createdBy: ME }],
    marks: new Map(), // `${meetId}|${start}` → 'free' | 'busy'
    nextId: 400,
  };
}

const NAMES = { [ME]: '나(예시)', 101: '예시 친구 1', 102: '예시 친구 2' };
const nameOf = (id) => NAMES[id] || `예시 ${id}`;

export function summary(t) {
  return {
    ok: true,
    friends: t.friends,
    groups: t.groups.map((g) => ({ id: g.id, name: g.name, owner: g.owner, members: g.members.length })),
  };
}

export function groupDetail(t, id) {
  const g = t.groups.find((x) => x.id === id);
  if (!g) throw Object.assign(new Error('없는 그룹이에요'), { status: 404 });
  return {
    ok: true,
    group: { id: g.id, name: g.name, owner: g.owner },
    members: g.members.map((m, i) => ({ id: m, name: nameOf(m), owner: i === 0, me: m === ME })),
    meets: t.meets.filter((m) => m.groupId === id).map((m) => ({ id: m.id, title: m.title, from: m.from, to: m.to, length: m.length, mine: m.createdBy === ME })),
  };
}

// 다른 사람의 빈/바쁨: 날짜·시각에 따라 정해진 무늬(지어낸 것)
function otherFree(memberId, dayIdx, hour) {
  if (memberId === 101) return !(hour >= 13 && hour < 15) && !(dayIdx === 1 && hour < 11);
  if (memberId === 102) return hour >= 11 && !(dayIdx === 2 && hour >= 16);
  return true;
}

export function meetView(t, id) {
  const m = t.meets.find((x) => x.id === id);
  if (!m) throw Object.assign(new Error('없는 모임 시간표예요'), { status: 404 });
  const g = t.groups.find((x) => x.id === m.groupId);
  const members = g.members.map((mid) => ({ id: mid, name: nameOf(mid), me: mid === ME, known: true }));
  const [h0] = m.dayStart.split(':').map(Number);
  const [h1] = m.dayEnd.split(':').map(Number);
  const slots = [];
  const days = Math.round((Date.parse(`${m.to}T00:00:00+09:00`) - Date.parse(`${m.from}T00:00:00+09:00`)) / 86400000) + 1;
  for (let d = 0; d < days; d++) {
    const date = ymd(addDays(new Date(`${m.from}T00:00:00+09:00`), d));
    for (let min = h0 * 60; min < h1 * 60; min += m.slot) {
      const start = `${date}T${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}:00+09:00`;
      const mark = t.marks.get(`${m.id}|${start}`) || null;
      const meState = mark || (min >= 12 * 60 && min < 13 * 60 ? 'busy' : 'free'); // 내 달력(예시): 점심은 바쁨
      const who = members.filter((x) => (x.me ? meState === 'free' : otherFree(x.id, d, Math.floor(min / 60)))).map((x) => x.id);
      slots.push({ start, free: who.length, who, me: meState, mark });
    }
  }
  const best = bestTimes(slots, m, Date.now());
  return {
    ok: true,
    meet: { id: m.id, groupId: m.groupId, group: g.name, title: m.title, from: m.from, to: m.to, dayStart: m.dayStart, dayEnd: m.dayEnd, slot: m.slot, length: m.length, canDelete: true },
    members,
    known: members.length,
    unknown: 0,
    slots,
    best: best.map((b) => ({ start: b.start, end: toKstIso(b.end), free: b.free, who: b.who })),
  };
}

// 겹쳐 보기 예시(11-13): 다른 사람의 바쁨 무늬(지어낸 것, 요일 wd 0=월 … 6=일 · 분 min). 점심·저녁에 다 같이 빈 시간이 생기게
function overlayBusy(memberId, wd, min) {
  const weekday = wd <= 4;
  const h = min / 60;
  if (memberId === 101) return (weekday && ((h >= 9 && h < 12) || (h >= 14 && h < 16))) || h >= 21;
  if (memberId === 102) return (weekday && ((h >= 10 && h < 11.5) || (h >= 15.5 && h < 18))) || (wd === 5 && h >= 13 && h < 17) || h >= 22;
  return false;
}

// 내 달력에 겹쳐 그릴 '다 같이 빈 시간'(서버 10_together.js groupFree와 같은 모양, 30분 칸). mine = 내 예시 일정(시각 있는 것만 바쁨)
export function groupFree(t, id, { from, days = 7, start = '08:00', end = '24:00', mine = [] }) {
  const g = t.groups.find((x) => x.id === id);
  if (!g) throw Object.assign(new Error('없는 그룹이에요'), { status: 404 });
  const SLOT = 30;
  const minOf = (hm) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
  const busy = mine.filter((e) => !isDateOnly(e.start)).map((e) => [Date.parse(e.start), Date.parse(endOrHour(e.start, e.end))]);
  const slots = [];
  const spans = [];
  for (let d = 0; d < days; d++) {
    const day0 = Date.parse(`${from}T00:00:00+09:00`) + d * 86400000;
    const wd = kst(new Date(day0)).wd;
    for (let min = minOf(start); min < minOf(end); min += SLOT) {
      const s = day0 + min * 60000;
      const e = s + SLOT * 60000;
      const meFree = !busy.some(([x, y]) => x < e && y > s);
      const free = g.members.filter((mid) => (mid === ME ? meFree : !overlayBusy(mid, wd, min))).length;
      slots.push({ start: toKstIso(new Date(s)), free });
      if (free !== g.members.length) continue;
      const last = spans[spans.length - 1];
      if (last && last.e === s) last.e = e;
      else spans.push({ s, e });
    }
  }
  return {
    ok: true,
    group: { id: g.id, name: g.name },
    from,
    days,
    dayStart: start,
    dayEnd: end,
    slot: SLOT,
    members: g.members.length,
    known: g.members.length,
    slots,
    together: spans.map((x) => ({ start: toKstIso(new Date(x.s)), end: toKstIso(new Date(x.e)) })),
  };
}
