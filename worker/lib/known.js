// 아는 일정으로 팝업 채우기. AI를 부르지 않고 코드로만 한다(토큰 0). 쓰는 곳: worker/3_memo_popup.js
//
// 흐름: 팝업 이름에서 내 일정 이름을 찾는다(줄임말도: '공수2' = '공학수학 2')
//   1. 시각을 모르면: 그 이름의 되풀이 일정(수업 등)이 그날이나 같은 요일에 있을 때 그 시각·장소로 채운다 → popup.from
//   2. 메모에 '변경·옮김·미룸' 말이 있으면: 앞으로 올 한 번짜리 일정 가운데 옮길 것을 찾는다 → popup.change
//   3. 시각 없이 '늦은 밤'·'저녁' 같은 시간대만 썼으면: 그날 그 시간대에서 비어 있는 1시간을 고른다 → popup.free (suggestFree)
// 1·2는 가장 닮은 것이 하나로 정해질 때만 쓴다(비기면 건드리지 않는다). 사용자는 팝업에서 보고 고칠 수 있다.

export const CHANGE = /변경|바뀜|바뀌|바꿔|바꿈|옮김|옮기|옮겨|미룸|미뤄|미루|연기됨|연기됐|연기되|당김|당겨/;
const CHANGE_WORDS = new RegExp(`\\s*(?:일정\\s*)?(?:(?:으로|로)\\s+)?\\S*(?:${CHANGE.source})\\S*`, "g");
const REGULAR = 3; // 같은 이름이 이만큼 있으면 되풀이 일정(수업·모임)

const squeeze = (s) => s.replace(/[\s·ㆍ.,()[\]~-]/g, "").toLowerCase();

/** short가 full의 글자를 순서대로 골라 만든 말인가. 첫 글자는 같고 2글자 이상: '공수2' ↔ '공학수학2' */
export function abbreviates(short, full) {
  if (short.length < 2 || short[0] !== full[0]) return false;
  let i = 0;
  for (const ch of full) if (ch === short[i]) i++;
  return i === short.length;
}

const commonPrefix = (a, b) => {
  let n = 0;
  while (n < a.length && a[n] === b[n]) n++;
  return n;
};

/**
 * 메모 낱말들이 일정 이름과 얼마나 닮았나 → [이름을 가리키는 글자 수, 나머지 낱말의 앞 글자 겹침, 이름을 덮은 비율].
 * 낱말을 이어 붙인 것이 이름의 줄임말이면 가리키는 것으로 본다. 안 닮았으면 null.
 * ponytail: 첫 글자가 같아야 해서 '수학 시험' → '공학수학 2'는 못 찾는다. 필요해지면 후보 이름을 AI에게 같이 보낸다.
 */
export function likeness(words, title) {
  const full = squeeze(title);
  const parts = title.split(/\s+/);
  let best = null;
  for (let i = 0; i < words.length; i++) {
    for (let j = words.length; j > i; j--) {
      const run = squeeze(words.slice(i, j).join(""));
      if (!abbreviates(run, full)) continue;
      const rest = [...words.slice(0, i), ...words.slice(j)];
      const overlap = Math.max(0, ...rest.flatMap((w) => parts.map((p) => commonPrefix(w, p))));
      const score = [run.length, overlap >= 2 ? overlap : 0, run.length / full.length];
      if (!best || compare(score, best) > 0) best = score;
      break; // 이 자리에서 가장 긴 것
    }
  }
  return best;
}

const compare = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/** 가장 닮은 것 하나. 1등이 둘이면 null(헷갈리면 안 쓴다) */
function pickOne(words, items, titleOf) {
  const scored = items.map((it) => [likeness(words, titleOf(it)), it]).filter(([s]) => s);
  scored.sort((a, b) => compare(b[0], a[0]));
  if (!scored.length || (scored[1] && compare(scored[0][0], scored[1][0]) === 0)) return null;
  return scored[0][1];
}

const weekday = (date) => new Date(`${date.slice(0, 10)}T00:00:00Z`).getUTCDay();
const dayGap = (a, b) => Math.abs(Date.parse(`${a.slice(0, 10)}T00:00:00Z`) - Date.parse(`${b.slice(0, 10)}T00:00:00Z`));
const clock = (iso) => (iso && iso.length > 10 ? iso.slice(11, 16) : null);

/**
 * @param popup  mergePopup이 만든 팝업 { title, date, time, end_time, place, by }
 * @param text   메모 원문
 * @param events 내 일정 줄들 [{ id, title, start, end, place }] (이미 옮긴 일정은 빼고)
 * @param today  "2026-11-10"
 */
export function useKnown(popup, text, events, today) {
  const moving = CHANGE.test(text);
  const out = { ...popup };
  if (moving) out.title = popup.title.replace(CHANGE_WORDS, "").trim() || popup.title;
  const words = out.title.split(/\s+/).filter(Boolean);
  if (out.title === "?" || !events.length) return out;

  const byTitle = new Map();
  for (const e of events) byTitle.set(e.title, [...(byTitle.get(e.title) ?? []), e]);
  const regular = [...byTitle.keys()].filter((t) => byTitle.get(t).length >= REGULAR);

  // 1. 되풀이 일정(수업)이 그날, 없으면 같은 요일에 있으면 그 시각·장소
  const name = pickOne(words, regular, (t) => t);
  if (name && out.time === "?") {
    const sameWeekday = byTitle.get(name).filter((e) => clock(e.start) && weekday(e.start) === weekday(out.date));
    const one = sameWeekday.sort((a, b) => dayGap(a.start, out.date) - dayGap(b.start, out.date))[0];
    if (one) {
      out.time = clock(one.start);
      out.end_time = clock(one.end) ?? "?";
      if (out.place === "?" && one.place) out.place = one.place;
      out.from = name;
    }
  }

  // 2. 옮길 일정: 앞으로 올 한 번짜리 일정
  if (moving) {
    const once = events.filter((e) => byTitle.get(e.title).length < REGULAR && e.start >= today);
    const target = pickOne(words, once, (e) => e.title);
    if (target) {
      out.change = { id: target.id, title: target.title, start: target.start };
      if (out.time === "?" && clock(target.start)) {
        out.time = clock(target.start); // 수업 날이 아니면 옛 시각 그대로
        out.end_time = clock(target.end) ?? "?";
      }
      if (out.place === "?" && target.place) out.place = target.place;
    }
  }
  return out;
}

// 시간대 말 → [시작 분, 끝 분]. 앞의 것이 먼저다('늦은 밤'이 '밤'보다 먼저). 낱말로 떨어져 있을 때만('밤샘'·'낮잠'은 아님)
// ponytail: '새벽'은 사람마다 0시도 5시도 되어서 뺐다(종일로 남는다). 길이는 늘 1시간, 30분 칸.
const word = (w) => new RegExp(`(?<![가-힣])(?:${w})(?=에|쯤|\\s|$)`);
const PARTS = [
  [word("늦은\\s*밤|밤\\s*늦게|심야|한밤중?"), 22 * 60, 24 * 60],
  [word("아침"), 8 * 60, 10 * 60],
  [word("오전"), 9 * 60, 12 * 60],
  [word("점심"), 12 * 60, 14 * 60],
  [word("낮"), 13 * 60, 17 * 60],
  [word("오후"), 13 * 60, 18 * 60],
  [word("저녁"), 18 * 60, 21 * 60],
  [word("밤"), 20 * 60, 24 * 60],
];
const SLOT = 60;
const hhmm = (min) => (min >= 1440 ? "23:59" : `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`);

/**
 * 시각을 모르는 팝업 + 메모의 시간대 말 → 그 시간대에서 내 일정과 안 겹치는 가장 이른 1시간. 없으면 그대로(종일).
 * @param busy   그날 걸친 내 일정 [{ start, end }] (종일 일정은 막지 않는다, 끝을 모르면 1시간으로 본다)
 * @param nowIso "2026-11-10T21:40:00+09:00" — 오늘이면 지금 뒤에서만 고른다
 */
export function suggestFree(popup, text, busy, nowIso) {
  if (popup.time !== "?") return popup;
  const hit = PARTS.map(([re, from, to]) => [re.exec(text), from, to]).find(([m]) => m);
  if (!hit) return popup;
  const [[said], from, to] = hit;
  const day0 = Date.parse(`${popup.date}T00:00:00+09:00`);
  const spans = busy
    .filter((e) => e.start.length > 10)
    .map((e) => [(Date.parse(e.start) - day0) / 60000, e.end ? (Date.parse(e.end) - day0) / 60000 : (Date.parse(e.start) - day0) / 60000 + SLOT]);
  const nowMin = popup.date === nowIso.slice(0, 10) ? Number(nowIso.slice(11, 13)) * 60 + Number(nowIso.slice(14, 16)) : 0;
  for (let t = Math.max(from, Math.ceil(nowMin / 30) * 30); t + SLOT <= to; t += 30) {
    if (spans.some(([s, e]) => s < t + SLOT && e > t)) continue;
    const title = popup.title.replace(new RegExp(`${said}(?:에|쯤에?)?\\s*`), "").trim() || popup.title; // AI 없이 뽑은 이름에 남은 '늦은 밤에'
    return { ...popup, title, time: hhmm(t), end_time: hhmm(t + SLOT), free: said };
  }
  return popup;
}
