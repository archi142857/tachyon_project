// '같이' 쪽 예시 자료(?example): 서버 10_together.js와 같은 모양을 흉내 낸다. 사람·모임 이름은 모두 지어낸 예시.
// 남에게는 빈/바쁨만 가는 규칙도 같다(일정 이름 없음).
import { bestTimes } from './meet.js';
import { addDays, dayStart, toKstIso } from './time.js';

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
