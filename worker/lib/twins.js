// 겹친 일정 합치기 (담당: 서버 세션)
//
// 같은 일을 여러 캘린더(eTL 수업 · 폰 캘린더 · eTL 공지 · 메모)가 따로 가져와 달력에 두세 번 보이던 것을 하나로 보여 준다
// (11-19 사람 "달력 중복되는게 너무 많은데, 알아서 통합해줘"). DB는 지우지 않는다 — 캘린더 수집이 다시 넣어도 그대로 합쳐진다.
// 같은 일 = 같은 날 + 제목이 같은 일(공백 · 기호를 빼고 한쪽이 다른 쪽을 품거나 두 글자 조각이 60 % 이상 겹침) +
//   시각 일정끼리는 시작이 30분 안, 종일끼리는 같은 날, 하루짜리 종일 + 그날 시각 일정은 시각 일정으로.
// 남는 것: 시각 일정 > 여기서 고칠 수 있는 것(메모 · 시간표 · 공지) > eTL > 구글 등 > 폰. 제목은 가장 자세한(긴) 것, 장소 · 끝은 빈칸을 다른 것에서.
// ponytail: 합친 것을 고치거나 지우면 남는 것 하나만 바뀐다 — 시각 · 제목이 달라지면 가려 있던 다른 캘린더 것이 다시 보인다.
//   자주 그러면 합친 id들을 화면에 넘겨 같이 고치기.

const RANK = { etl: 1, google: 2, apple: 2, naver: 2, device: 3 };
const WINDOW_MS = 30 * 60000;

const key = (t) => String(t ?? '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const pairs = (s) => Array.from({ length: Math.max(s.length - 1, 0) }, (_, i) => s.slice(i, i + 2));
const allDay = (e) => e.start.length === 10;
const nextDay = (d) => new Date(Date.parse(`${d}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
const oneDay = (e) => !e.end || e.end <= nextDay(e.start);

/** 두 제목이 같은 일을 가리키나 */
export function sameTitle(a, b) {
  const [x, y] = [key(a), key(b)];
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (short.length >= 2 && long.includes(short)) return true;
  const p = pairs(x);
  const q = pairs(y);
  const n = p.length + q.length;
  if (!p.length || !q.length) return false;
  let hit = 0;
  for (const g of p) {
    const i = q.indexOf(g);
    if (i >= 0) hit++, q.splice(i, 1);
  }
  return (2 * hit) / n >= 0.6;
}

function sameTime(a, b) {
  if (allDay(a) && allDay(b)) return a.start === b.start;
  if (allDay(a) || allDay(b)) {
    const [d, t] = allDay(a) ? [a, b] : [b, a];
    return oneDay(d) && t.start.startsWith(d.start);
  }
  return Math.abs(Date.parse(a.start) - Date.parse(b.start)) <= WINDOW_MS;
}

const better = (a, b) => allDay(a) - allDay(b) || (RANK[a.source] ?? 0) - (RANK[b.source] ?? 0) || a.id - b.id;

function merge(group) {
  if (group.length === 1) return group[0];
  const all = [...group].sort(better);
  const [keep] = all;
  const title = all.reduce((t, e) => (key(e.title).length > key(t).length ? e.title : t), keep.title);
  const end = keep.end ?? (allDay(keep) ? null : (all.find((e) => !allDay(e) && e.end > keep.start)?.end ?? null));
  return {
    ...keep,
    title,
    end,
    place: all.find((e) => e.place)?.place ?? null,
    important: all.some((e) => e.important) ? 1 : 0,
    remind: all.find((e) => e.remind != null)?.remind ?? null,
  };
}

/** 일정 목록(start · id 순) → 겹친 것을 하나로 합친 목록(start · id 순). 행 모양은 그대로 */
export function mergeTwins(events) {
  const days = new Map();
  for (const e of events) {
    const d = e.start.slice(0, 10);
    if (!days.has(d)) days.set(d, []);
    const groups = days.get(d);
    const g = groups.find((g) => g.some((m) => sameTime(m, e) && sameTitle(m.title, e.title)));
    if (g) g.push(e);
    else groups.push([e]);
  }
  return [...days.values()]
    .flat()
    .map(merge)
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.id - b.id));
}
