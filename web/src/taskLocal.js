// 할 일 바로 다루기(9판, 사람 11-13 결정 '할 일 바로 다루기'): 맨 앞으로 · 미루기 · 이 시간에 넣음 · 집중한 시간.
// 서버의 할 일은 그대로 두고 이 기기(localStorage)에만 적는다. ponytail: 다른 기기와는 안 맞는다 — 실사용 뒤 쓰임을 보고 서버 칸으로.
// 날짜는 'YYYY-MM-DD'(한국 시간, density.js dateKey)로 받는다.
const KEY = 'tachyon_task_local';
const empty = () => ({ pin: {}, snooze: {}, fixed: {}, focus: [] });

function read() {
  try {
    return { ...empty(), ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return empty();
  }
}
function write(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // 못 적으면 이번 한 번만
  }
}

// 맨 앞으로 당기기
export function pinTask(id) {
  const s = read();
  s.pin[id] = Date.now();
  write(s);
}

// 미루기: until 날까지 오늘 목록에서 뺀다. 몇 번째 미룸인지 돌려준다(세 번이면 화면이 '안 해도 되나요?'를 묻는다)
export function snoozeTask(id, until) {
  const s = read();
  const n = (s.snooze[id]?.n ?? 0) + 1;
  s.snooze[id] = { until, n };
  delete s.pin[id];
  write(s);
  return n;
}

// 이 시간에 넣음(추천 자리 → 정한 자리). 그날 그 할 일은 '정함'으로 보이고 다시 자리를 잡지 않는다
export function fixTask(id, date, from, to) {
  const s = read();
  s.fixed[id] = { date, from, to };
  write(s);
}
export const fixedOn = (date) => Object.fromEntries(Object.entries(read().fixed).filter(([, f]) => f.date === date));

// 집중한 분을 적는다(그날 몫). 최근 14일만 둔다
export function addFocus(min, date) {
  const s = read();
  s.focus = [...s.focus.filter((f) => f.date >= isoDaysAgo(date, 13)), { date, min }];
  write(s);
}
export function focusWeek(today) {
  const from = isoDaysAgo(today, 6);
  return read().focus.filter((f) => f.date >= from).reduce((sum, f) => sum + f.min, 0);
}
const isoDaysAgo = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) - n * 86400000).toISOString().slice(0, 10);

// 오늘 목록 차례: 미룬 것은 빼고(until이 오늘보다 뒤), 당긴 것은 맨 앞(나중에 당긴 것이 먼저). 나머지는 받은 차례(여유 순) 그대로
export function arrange(tasks, today) {
  const { pin, snooze } = read();
  const shown = tasks.filter((t) => !(snooze[t.id]?.until > today));
  return [...shown.filter((t) => pin[t.id]).sort((a, b) => pin[b.id] - pin[a.id]), ...shown.filter((t) => !pin[t.id])];
}
export const snoozeCount = (id) => read().snooze[id]?.n ?? 0;
