// 활동 모아보기(11-19 사람 "서울대 비교과나 … 활동 / 행사 안내들을 내가 신청할 수 있거나 관심사에 맞춰서 모아볼 수 있는 섹션").
// 서버(worker/15_activities.js)가 모은 서울대 공개 게시판 활동을 이 기기에서 거른다.
//   신청 가능 = 마감 전 + 대상(학부/대학원 · 학년 · 단과대)이 내 학과 · 학년과 맞음(AI가 본문에서 읽은 칸 — 확실하지 않으면 원문 확인)
//   관심사 = 고른 종류 또는 낱말이 제목 · 태그 · 요약에 있음
//   시간 됨 = 행사 시각이 내 일정과 안 겹침(행사 시각을 모르면 셈하지 않음)
// 사람마다 다른 것(관심사 · 별표 · 숨기기)은 이 기기에만 적는다(서버 표 바꿈 없음 — 폰 · PC는 따로).
import DEPARTMENTS from './departments.json';
import { WEEKDAYS, addDays, dayStartKst, daysUntil, kst } from './time.js';

const KEY = 'tachyon_activities_v1';
const EMPTY = { kinds: [], words: [], star: [], hide: [] };

export function loadPrefs(storage = globalThis.localStorage) {
  try {
    const v = JSON.parse(storage?.getItem(KEY) || 'null');
    return { ...EMPTY, ...(v && typeof v === 'object' ? v : {}) };
  } catch {
    return { ...EMPTY };
  }
}

export function savePrefs(prefs, storage = globalThis.localStorage) {
  try {
    storage?.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* 저장 못 하는 브라우저(사생활 모드) — 이번에만 */
  }
}

/** '바이오, AI  글쓰기' → ['바이오', 'AI', '글쓰기'] (쉼표 · 빈칸으로 나눔, 같은 말 한 번) */
export function parseWords(text) {
  return [...new Set(String(text || '').split(/[,，、\s]+/).map((w) => w.trim()).filter(Boolean))].slice(0, 20);
}

/** 내 학과 → 단과대(첫 설정 학과 목록). 모르면 null */
export function collegeOf(dept) {
  if (!dept) return null;
  const hit = DEPARTMENTS.list.find(([name]) => name === dept) || DEPARTMENTS.list.find(([name]) => dept.includes(name) || name.includes(dept));
  return hit ? hit[1] : null;
}

// 마감 시각(ISO). 날짜만이면 그날 23:59
export function applyEnd(item) {
  const v = item.apply_until;
  if (!v) return null;
  return v.length <= 10 ? `${v}T23:59:00+09:00` : `${v}:00+09:00`;
}

/**
 * 신청할 수 있나 → { ok, why }. me = { dept, year(학년), college }
 * 학부생 앱이라 대학원생만 받는 것은 빼고, 학년 · 단과대 조건은 내 정보가 있을 때만 본다(없으면 통과).
 */
export function fitFor(item, me = {}, now = new Date()) {
  const end = applyEnd(item);
  if (end && new Date(end) < new Date(now)) return { ok: false, why: '마감 지남' };
  if (item.level === '대학원') return { ok: false, why: '대학원생 대상' };
  if (item.years?.length && me.year && !item.years.includes(me.year)) return { ok: false, why: `${yearsText(item.years)} 대상` };
  const college = me.college ?? collegeOf(me.dept);
  if (item.colleges?.length && (college || me.dept)) {
    const mine = [college, me.dept].filter(Boolean);
    const hit = item.colleges.some((c) => mine.some((m) => m.includes(c) || c.includes(m)));
    if (!hit) return { ok: false, why: `${item.colleges.join(' · ')} 대상` };
  }
  return { ok: true, why: null };
}

/** [2, 3, 4] → '2학년 이상', [1] → '1학년', [3, 4] → '3학년 이상', [1, 2] → '1~2학년' */
export function yearsText(years) {
  const ys = [...years].sort((a, b) => a - b);
  if (ys.length === 1) return `${ys[0]}학년`;
  if (ys.at(-1) >= 4 && ys.every((y, i) => i === 0 || y === ys[i - 1] + 1)) return `${ys[0]}학년 이상`;
  return ys.every((y, i) => i === 0 || y === ys[i - 1] + 1) ? `${ys[0]}~${ys.at(-1)}학년` : `${ys.join(' · ')}학년`;
}

/** 관심사에 맞나: 고른 종류이거나, 낱말이 제목 · 태그 · 요약에 있음. 관심사를 안 골랐으면 false */
export function matchesInterest(item, prefs) {
  if (prefs.kinds?.includes(item.kind)) return true;
  if (!prefs.words?.length) return false;
  const hay = [item.title, item.summary, ...(item.tags || [])].join(' ').toLowerCase();
  return prefs.words.some((w) => hay.includes(w.toLowerCase()));
}

// 행사 때 → [시작, 끝] 밀리초. 시각을 모르면 null(종일 · 여러 날은 셈하지 않음)
export function eventSpan(item) {
  if (!item.date || !item.time) return null;
  const start = Date.parse(`${item.date}T${item.time}:00+09:00`);
  const endDay = item.end_date || item.date;
  let end = item.end_time ? Date.parse(`${endDay}T${item.end_time}:00+09:00`) : start + 60 * 60 * 1000;
  if (!(end > start)) end = start + 60 * 60 * 1000;
  return [start, end];
}

/** 시간 되나: 행사 시각이 내 일정(시각 있는 것)과 안 겹치면 true, 겹치면 false, 모르면 null. 겹친 일정 이름도 */
export function freeAt(item, events = []) {
  const span = eventSpan(item);
  if (!span) return { free: null, clash: null };
  const clash = events.find((e) => {
    if (!e.start || !e.end || /^\d{4}-\d{2}-\d{2}$/.test(e.start)) return false;
    const s = Date.parse(e.start);
    const en = Date.parse(e.end);
    return s < span[1] && en > span[0] && en - s < 20 * 60 * 60 * 1000; // 하루 가까이 덮는 것(종일로 바뀐 일정)은 빼고
  });
  return { free: !clash, clash: clash ? clash.title : null };
}

const md = (ymd) => {
  const p = kst(dayStartKst(ymd));
  return `${p.m}/${p.d}(${WEEKDAYS[p.wd]})`;
};

/** 마감 글: '오늘 13:00까지' · '내일까지' · 'D-3 · 11/30(월) 13:00까지' · '마감 지남' · null(모름) */
export function deadlineText(item, now = new Date()) {
  const end = applyEnd(item);
  if (!end) return null;
  if (new Date(end) < new Date(now)) return '마감 지남';
  const time = item.apply_until.length > 10 ? ` ${item.apply_until.slice(11, 16)}` : '';
  const d = daysUntil(new Date(end), now);
  if (d === 0) return `오늘${time}까지`;
  if (d === 1) return `내일${time}까지`;
  return `D-${d} · ${md(item.apply_until.slice(0, 10))}${time}까지`;
}

/** 행사 때 글: '11/28(토) 19:00–21:00' · '11/20(금) ~ 11/30(월)' · '11/28(토)' · null */
export function whenText(item) {
  if (!item.date) return null;
  if (item.end_date && item.end_date !== item.date) return `${md(item.date)} ~ ${md(item.end_date)}`;
  if (!item.time) return md(item.date);
  return `${md(item.date)} ${item.time}${item.end_time ? `–${item.end_time}` : ''}`;
}

/** 게시판 기간 글(행사 때를 모를 때): '11/17(화) ~ 11/30(월)' */
export function periodText(item) {
  if (!item.from) return item.posted ? `${md(item.posted)} 올림` : null;
  return item.to && item.to !== item.from ? `${md(item.from)} ~ ${md(item.to)}` : md(item.from);
}

/**
 * 보이는 목록. tab = 'all' | 'can'(신청 가능) | 'mine'(관심사) | 'star', kind = 종류 하나 또는 null, free = 시간 되는 것만.
 * 숨긴 것은 빼고(별표 탭에서도), 마감이 가까운 순(서버 순서 그대로)
 */
export function view(items, { tab = 'all', kind = null, free = false } = {}, { prefs = EMPTY, me = {}, events = [], now = new Date() } = {}) {
  const hide = new Set(prefs.hide);
  const star = new Set(prefs.star);
  return items.filter((i) => {
    if (hide.has(i.id)) return false;
    if (kind && i.kind !== kind) return false;
    if (tab === 'can' && !fitFor(i, me, now).ok) return false;
    if (tab === 'mine' && !matchesInterest(i, prefs)) return false;
    if (tab === 'star' && !star.has(i.id)) return false;
    if (free && freeAt(i, events).free !== true) return false;
    return true;
  });
}

/** 별표 · 숨기기 켜고 끄기 → 새 prefs */
export function toggle(prefs, list, id) {
  const set = new Set(prefs[list]);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  return { ...prefs, [list]: [...set] };
}

/** '신청 마감 할 일로' → POST /api/tasks 몸 */
export function taskFor(item) {
  const end = applyEnd(item);
  return end ? { title: `${item.title} 신청`.slice(0, 200), due: item.apply_until.length <= 10 ? item.apply_until : `${item.apply_until}:00+09:00` } : null;
}

/** '일정에 넣기' → POST /api/events 몸. 시각을 모르면 종일(여러 날이면 끝 날짜 다음 날까지) */
export function eventFor(item) {
  if (!item.date) return null;
  const place = item.place && item.place.length <= 200 ? item.place : null;
  const title = item.title.slice(0, 200);
  const span = eventSpan(item);
  if (span) {
    const iso = (ms) => {
      const p = kst(new Date(ms));
      const two = (n) => String(n).padStart(2, '0');
      return `${p.y}-${two(p.m)}-${two(p.d)}T${two(p.h)}:${two(p.min)}:00+09:00`;
    };
    return { title, start: iso(span[0]), end: iso(span[1]), place };
  }
  const last = kst(addDays(dayStartKst(item.end_date || item.date), 1));
  const two = (n) => String(n).padStart(2, '0');
  return { title, start: item.date, end: `${last.y}-${two(last.m)}-${two(last.d)}`, place };
}
