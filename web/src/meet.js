// 모임 시간표 후보 고르기(서버 10_together.js bestTimes와 같은 규칙): 모임 길이만큼 같은 날 이어진 칸 가운데
// 처음부터 끝까지 되는 사람이 많은 순으로, 겹치지 않게 3개까지, 시간 순. 지금보다 앞선 칸은 빼고 고른다.
export function bestTimes(slots, meet, nowMs = Date.now()) {
  const len = Math.max(1, Math.round(meet.length / meet.slot));
  const runs = [];
  for (let i = 0; i + len <= slots.length; i++) {
    const part = slots.slice(i, i + len);
    const day = part[0].start.slice(0, 10);
    if (part.some((s) => s.start.slice(0, 10) !== day)) continue;
    if (Date.parse(part[0].start) < nowMs) continue;
    if (part.some((s, k) => k && Date.parse(s.start) - Date.parse(part[k - 1].start) !== meet.slot * 60000)) continue;
    const who = part.reduce((acc, s) => acc.filter((w) => s.who.includes(w)), part[0].who);
    if (who.length) runs.push({ i, start: part[0].start, end: new Date(Date.parse(part[0].start) + meet.length * 60000), free: who.length, who });
  }
  runs.sort((a, b) => b.free - a.free || a.i - b.i);
  const best = [];
  for (const r of runs) {
    if (best.length >= 3) break;
    if (best.some((b) => Math.abs(b.i - r.i) < len)) continue;
    best.push(r);
  }
  return best.sort((a, b) => a.i - b.i);
}
